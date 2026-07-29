import {
  createAuthAdapter,
  createR2ObjectClient,
  createR2OgImageStorage,
  createR2ProfileIconStorage,
} from '@web-comic-library/auth';
import {
  createPostgresFoundation,
  createPostgresIdentity,
  createPostgresLibrary,
  createPostgresVolumeLibrary,
  createPostgresCatalog,
  createPostgresCatalogAdmin,
  createPostgresFollow,
  createPostgresNotification,
  createPostgresWebPushSubscription,
  createPostgresEmailDigest,
  createPostgresExtensionToken,
  createPostgresFavoriteImport,
  createPostgresSourcePolicy,
  createPostgresSessionAssurance,
  createPostgresSocial,
  createPostgresModeration,
  createPostgresAccountData,
  createPostgresJobQueue,
} from '@web-comic-library/db';

import { createApp, createCatalogAdminController, createModerationController } from './app';

const port = Number(process.env.PORT ?? '3001');
const databaseUrl = process.env.DATABASE_URL;
const authSecret = process.env.BETTER_AUTH_SECRET;
const baseUrl = process.env.BETTER_AUTH_URL;
const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
const r2AccessKeyId = process.env.R2_ACCESS_KEY_ID;
const r2Bucket = process.env.R2_BUCKET;
const r2Endpoint = process.env.R2_ENDPOINT;
const r2PublicBaseUrl = process.env.R2_PUBLIC_BASE_URL;
const r2SecretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

if (!databaseUrl || !authSecret || !baseUrl || !googleClientId || !googleClientSecret) {
  throw new Error(
    'DATABASE_URL, BETTER_AUTH_SECRET, BETTER_AUTH_URL, GOOGLE_CLIENT_ID, and GOOGLE_CLIENT_SECRET are required',
  );
}

if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
  throw new Error('PORT must be an integer between 1 and 65535');
}

const r2Values = [r2AccessKeyId, r2Bucket, r2Endpoint, r2PublicBaseUrl, r2SecretAccessKey];
if (r2Values.some((value) => value) && r2Values.some((value) => !value)) {
  throw new Error('all R2 profile icon variables must be configured together');
}

const identity = createPostgresIdentity(databaseUrl);
const foundation = createPostgresFoundation(databaseUrl);
const library = createPostgresLibrary(databaseUrl, foundation);
const volumeLibrary = createPostgresVolumeLibrary(databaseUrl, foundation);
const catalog = createPostgresCatalog(databaseUrl);
const catalogAdmin = createPostgresCatalogAdmin(databaseUrl, foundation);
const sourcePolicies = createPostgresSourcePolicy(databaseUrl);
const follow = createPostgresFollow(databaseUrl, foundation);
const notifications = createPostgresNotification(databaseUrl, foundation);
const webPushSubscriptions = createPostgresWebPushSubscription(databaseUrl, foundation);
const emailDigests = createPostgresEmailDigest(databaseUrl, foundation);
const extensionTokens = createPostgresExtensionToken(databaseUrl, foundation);
const favoriteImports = createPostgresFavoriteImport(databaseUrl, foundation);
const sessionAssurances = createPostgresSessionAssurance(databaseUrl);
const social = createPostgresSocial(databaseUrl, foundation);
const moderation = createPostgresModeration(databaseUrl, foundation);
const accountData = createPostgresAccountData(databaseUrl, foundation);
const jobs = createPostgresJobQueue(databaseUrl);
const auth = createAuthAdapter({
  baseUrl,
  databaseUrl,
  googleClientId,
  googleClientSecret,
  secret: authSecret,
  trustedOrigins: [baseUrl],
});
const profileIconStorage =
  r2AccessKeyId && r2Bucket && r2Endpoint && r2PublicBaseUrl && r2SecretAccessKey
    ? createR2ProfileIconStorage({
        client: createR2ObjectClient({
          accessKeyId: r2AccessKeyId,
          bucket: r2Bucket,
          endpoint: r2Endpoint,
          secretAccessKey: r2SecretAccessKey,
        }),
        publicBaseUrl: r2PublicBaseUrl,
      })
    : null;
const ogImageStorage =
  r2AccessKeyId && r2Bucket && r2Endpoint && r2PublicBaseUrl && r2SecretAccessKey
    ? createR2OgImageStorage({
        client: createR2ObjectClient({
          accessKeyId: r2AccessKeyId,
          bucket: r2Bucket,
          endpoint: r2Endpoint,
          secretAccessKey: r2SecretAccessKey,
        }),
        publicBaseUrl: r2PublicBaseUrl,
      })
    : null;
const app = createApp({
  auth,
  catalog,
  catalogAdmin: createCatalogAdminController(foundation, catalogAdmin),
  moderation: createModerationController(foundation, moderation),
  accountData,
  jobs,
  follow,
  notifications,
  emailDigests,
  extensionTokens,
  favoriteImports,
  favoriteImportSources: sourcePolicies,
  resendWebhookSecret: process.env.RESEND_WEBHOOK_SECRET ?? null,
  webPushPublicKey: process.env.VAPID_PUBLIC_KEY ?? null,
  webPushSubscriptions,
  identity,
  library,
  volumeLibrary,
  profileIconStorage,
  ogImageStorage,
  sourcePolicies,
  sessionAssurances,
  social,
  transactions: foundation,
  webOrigin: new URL(baseUrl).origin,
  async resolveSession(request) {
    const token = await auth.sessionToken(request);
    return token ? identity.findSessionIdentity(token) : null;
  },
  async resolveCatalogAdmin(request) {
    const token = await auth.sessionToken(request);
    return token ? identity.findCatalogAdminActor(token) : null;
  },
});
const server = Bun.serve({ fetch: app.fetch, port });
let stopping = false;

const stop = (): void => {
  if (stopping) {
    return;
  }

  stopping = true;
  void Promise.all([
    server.stop(),
    auth.close(),
    foundation.close(),
    identity.close(),
    library.close(),
    volumeLibrary.close(),
    catalog.close(),
    catalogAdmin.close(),
    follow.close(),
    notifications.close(),
    emailDigests.close(),
    extensionTokens.close(),
    favoriteImports.close(),
    webPushSubscriptions.close(),
    sourcePolicies.close(),
    sessionAssurances.close(),
    social.close(),
    moderation.close(),
    accountData.close(),
    jobs.close(),
  ]).then(() => process.exit(0));
};

process.once('SIGINT', stop);
process.once('SIGTERM', stop);
console.log(`API listening on ${server.url}`);
