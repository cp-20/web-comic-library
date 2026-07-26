import {
  createAuthAdapter,
  createR2ObjectClient,
  createR2ProfileIconStorage,
  readSessionToken,
} from '@web-comic-library/auth';
import {
  createPostgresFoundation,
  createPostgresIdentity,
  createPostgresLibrary,
  createPostgresVolumeLibrary,
  createPostgresCatalog,
  createPostgresFollow,
  createPostgresNotification,
  createPostgresWebPushSubscription,
  createPostgresSourcePolicy,
} from '@web-comic-library/db';

import { createApp } from './app';

const port = Number(process.env.PORT ?? '3001');
const databaseUrl = process.env.DATABASE_URL;
const authSecret = process.env.BETTER_AUTH_SECRET;
const baseUrl = process.env.BETTER_AUTH_URL;
const magicLinkDeliveryUrl = process.env.MAGIC_LINK_DELIVERY_URL;
const r2AccessKeyId = process.env.R2_ACCESS_KEY_ID;
const r2Bucket = process.env.R2_BUCKET;
const r2Endpoint = process.env.R2_ENDPOINT;
const r2PublicBaseUrl = process.env.R2_PUBLIC_BASE_URL;
const r2SecretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

if (!databaseUrl || !authSecret || !baseUrl || !magicLinkDeliveryUrl) {
  throw new Error(
    'DATABASE_URL, BETTER_AUTH_SECRET, BETTER_AUTH_URL, and MAGIC_LINK_DELIVERY_URL are required',
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
const sourcePolicies = createPostgresSourcePolicy(databaseUrl);
const follow = createPostgresFollow(databaseUrl, foundation);
const notifications = createPostgresNotification(databaseUrl, foundation);
const webPushSubscriptions = createPostgresWebPushSubscription(databaseUrl, foundation);
const auth = createAuthAdapter(
  {
    baseUrl,
    databaseUrl,
    googleClientId: process.env.GOOGLE_CLIENT_ID ?? null,
    googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? null,
    secret: authSecret,
    trustedOrigins: [baseUrl],
  },
  {
    async send(message): Promise<void> {
      const response = await fetch(magicLinkDeliveryUrl, {
        body: JSON.stringify(message),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });
      if (!response.ok) throw new Error('magic link delivery failed');
    },
  },
);
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
const app = createApp({
  auth,
  catalog,
  follow,
  notifications,
  webPushPublicKey: process.env.VAPID_PUBLIC_KEY ?? null,
  webPushSubscriptions,
  identity,
  library,
  volumeLibrary,
  profileIconStorage,
  sourcePolicies,
  transactions: foundation,
  async resolveSession(request) {
    const token = readSessionToken(request);
    return token ? identity.findSessionIdentity(token) : null;
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
    follow.close(),
    notifications.close(),
    webPushSubscriptions.close(),
    sourcePolicies.close(),
  ]).then(() => process.exit(0));
};

process.once('SIGINT', stop);
process.once('SIGTERM', stop);
console.log(`API listening on ${server.url}`);
