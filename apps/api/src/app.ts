import { vValidator } from '@hono/valibot-validator';
import { sentry } from '@sentry/hono/bun';
import type {
  CatalogAdminRepository,
  CatalogAuditRecord,
  CatalogRedirect,
  CatalogReviewItem,
  MergeContentUnitsCommand,
  MergeWorksCommand,
  ProfileIconStorage,
  SplitContentUnitCommand,
  SplitWorkCommand,
  TransactionPort,
  IdentityRepository,
  LibraryRepository,
  VolumeLibraryRepository,
  CatalogQueryPort,
  FollowRepository,
  NotificationRepository,
  WebPushSubscriptionRepository,
  EmailDigestSettingsRepository,
  ExtensionTokenRepository,
  FavoriteImportRepository,
  SessionAssuranceRepository,
  SessionIdentity,
  SourcePolicyQueryPort,
} from '@web-comic-library/application';
import {
  findVisibleProfile,
  findPublicWork,
  isActiveSession,
  mergeContentUnits,
  markContentRead,
  markContentReadThrough,
  markPublicationRead,
  mergeWorks,
  resolveCatalogReviewItem,
  splitContentUnit,
  splitWork,
  setReadingStatus,
  setUserVolumeRecord,
  setFollowSettings,
  setSourcePreferences,
  readAllNotifications,
  readNotification,
  setNotificationPreference,
  searchPublicWorks,
  unmarkContentRead,
  submitVolumeContentMappingCorrection,
  uploadProfileIcon,
  updateProfile,
  registerWebPushSubscription,
  unregisterWebPushSubscription,
  setEmailDigestSettings,
  unsubscribeEmailDigest,
  recordEmailDigestFeedback,
  exchangeExtensionPairingCode,
  issueExtensionPairingCode,
  revokeExtensionToken,
  authenticateExtensionToken,
  applyFavoriteImport,
  createFavoriteImport,
  discardFavoriteImport,
  getFavoriteImport,
  recordTwoFactorAssurance,
  FavoriteImportSourceRejectedError,
  resolveFavoriteImportSources,
} from '@web-comic-library/application';
import type { AuthAdapter } from '@web-comic-library/auth';
import {
  catalogRedirectParamsSchema,
  catalogWorkParamsSchema,
  catalogReviewItemParamsSchema,
  mergeContentUnitsRequestSchema,
  mergeWorksRequestSchema,
  magicLinkRequestSchema,
  markContentReadRequestSchema,
  markContentReadThroughRequestSchema,
  markPublicationReadRequestSchema,
  splitContentUnitRequestSchema,
  splitWorkRequestSchema,
  setReadingStatusRequestSchema,
  setFollowSettingsRequestSchema,
  setSourcePreferencesRequestSchema,
  notificationListQuerySchema,
  notificationParamsSchema,
  setNotificationPreferenceRequestSchema,
  setUserVolumeRecordRequestSchema,
  submitVolumeContentMappingCorrectionRequestSchema,
  unmarkContentReadRequestSchema,
  profileParamsSchema,
  twoFactorEnableRequestSchema,
  twoFactorEnableResponseSchema,
  twoFactorVerifyRequestSchema,
  twoFactorVerifyResponseSchema,
  searchCatalogWorksQuerySchema,
  updateProfileRequestSchema,
  webPushSubscriptionRequestSchema,
  webPushUnsubscribeRequestSchema,
  emailDigestSettingsRequestSchema,
  exchangeExtensionPairingCodeRequestSchema,
  revokeExtensionTokenParamsSchema,
  applyFavoriteImportRequestSchema,
  createFavoriteImportRequestSchema,
  favoriteImportParamsSchema,
} from '@web-comic-library/contracts';
import type { CatalogAdminActor } from '@web-comic-library/domain';
import { verifyResendEmailFeedback } from '@web-comic-library/notifications';
import { Hono } from 'hono';
import { safeParse } from 'valibot';

import { apiMetrics, apiRequestDuration, apiRequests } from './metrics';

export interface CatalogAdminController {
  findAuditRecords(): Promise<readonly CatalogAuditRecord[]>;
  findRedirect(resource: CatalogRedirect['resource'], id: string): Promise<CatalogRedirect | null>;
  listReviewItems(): Promise<readonly CatalogReviewItem[]>;
  mergeContentUnits(
    actor: CatalogAdminActor,
    input: Omit<MergeContentUnitsCommand, 'actor'>,
  ): Promise<CatalogAuditRecord>;
  mergeWorks(
    actor: CatalogAdminActor,
    input: Omit<MergeWorksCommand, 'actor'>,
  ): Promise<CatalogAuditRecord>;
  resolveReviewItem(actor: CatalogAdminActor, itemId: string): Promise<CatalogReviewItem>;
  splitContentUnit(
    actor: CatalogAdminActor,
    input: Omit<SplitContentUnitCommand, 'actor'>,
  ): Promise<CatalogAuditRecord>;
  splitWork(
    actor: CatalogAdminActor,
    input: Omit<SplitWorkCommand, 'actor'>,
  ): Promise<CatalogAuditRecord>;
}

export type ApiDependencies = Readonly<{
  auth: AuthAdapter | null;
  catalogAdmin: CatalogAdminController | null;
  catalog: CatalogQueryPort | null;
  follow: FollowRepository | null;
  notifications: NotificationRepository | null;
  webPushSubscriptions: WebPushSubscriptionRepository | null;
  webPushPublicKey: string | null;
  emailDigests: EmailDigestSettingsRepository | null;
  extensionTokens: ExtensionTokenRepository | null;
  favoriteImports: FavoriteImportRepository | null;
  favoriteImportSources: Pick<SourcePolicyQueryPort, 'resolveCollectableSourceId'> | null;
  resendWebhookSecret: string | null;
  identity: IdentityRepository | null;
  library: LibraryRepository | null;
  volumeLibrary: VolumeLibraryRepository | null;
  sourcePolicies: SourcePolicyQueryPort | null;
  sessionAssurances: SessionAssuranceRepository | null;
  profileIconStorage: ProfileIconStorage | null;
  transactions: TransactionPort | null;
  resolveSession(request: Request): Promise<SessionIdentity | null>;
  resolveCatalogAdmin(request: Request): Promise<CatalogAdminActor | null>;
}>;

type ApiEnvironment = Readonly<{
  Variables: {
    catalogAdminActor: CatalogAdminActor | null;
  };
}>;

const unauthenticatedDependencies: ApiDependencies = {
  auth: null,
  catalogAdmin: null,
  catalog: null,
  follow: null,
  notifications: null,
  webPushSubscriptions: null,
  webPushPublicKey: null,
  emailDigests: null,
  extensionTokens: null,
  favoriteImports: null,
  favoriteImportSources: null,
  resendWebhookSecret: null,
  identity: null,
  library: null,
  volumeLibrary: null,
  sourcePolicies: null,
  sessionAssurances: null,
  profileIconStorage: null,
  transactions: null,
  async resolveSession(): Promise<SessionIdentity | null> {
    return null;
  },
  async resolveCatalogAdmin(): Promise<CatalogAdminActor | null> {
    return null;
  },
};

export const createCatalogAdminController = (
  transactions: TransactionPort,
  repository: CatalogAdminRepository,
): CatalogAdminController => ({
  async findAuditRecords(): Promise<readonly CatalogAuditRecord[]> {
    return repository.findAuditRecords(50);
  },
  async findRedirect(resource, id): Promise<CatalogRedirect | null> {
    return repository.findRedirect(resource, id);
  },
  async listReviewItems(): Promise<readonly CatalogReviewItem[]> {
    return repository.listReviewItems();
  },
  async mergeContentUnits(actor, input): Promise<CatalogAuditRecord> {
    return mergeContentUnits(transactions, repository, { ...input, actor });
  },
  async mergeWorks(actor, input): Promise<CatalogAuditRecord> {
    return mergeWorks(transactions, repository, { ...input, actor });
  },
  async resolveReviewItem(actor, itemId): Promise<CatalogReviewItem> {
    return resolveCatalogReviewItem(transactions, repository, actor, itemId);
  },
  async splitContentUnit(actor, input): Promise<CatalogAuditRecord> {
    return splitContentUnit(transactions, repository, { ...input, actor });
  },
  async splitWork(actor, input): Promise<CatalogAuditRecord> {
    return splitWork(transactions, repository, { ...input, actor });
  },
});

const unauthorized = (actor: CatalogAdminActor | null): 401 | 403 => (actor ? 403 : 401);

const canonicalCatalogPath = (redirect: CatalogRedirect): string => {
  return redirect.resource === 'work'
    ? `/works/${redirect.canonicalId}`
    : `/content-units/${redirect.canonicalId}`;
};

const readBearerToken = (request: Request): string | null => {
  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) return null;
  const token = authorization.slice('Bearer '.length).trim();
  return token || null;
};

const forwardAuthRequest = (
  context: { req: { header(name: string): string | undefined; url: string } },
  path: string,
  body: unknown,
): Request => {
  const headers = new Headers({
    'content-type': 'application/json',
    origin: new URL(context.req.url).origin,
  });
  const cookie = context.req.header('cookie');
  if (cookie) headers.set('cookie', cookie);
  return new Request(new URL(path, context.req.url), {
    body: JSON.stringify(body),
    headers,
    method: 'POST',
  });
};

const responseHeaders = (response: Response): Record<string, string | string[]> => {
  const headers: Record<string, string | string[]> = {};
  for (const [name, value] of response.headers) {
    if (name !== 'content-length' && name !== 'content-type' && name !== 'set-cookie') {
      headers[name] = value;
    }
  }
  const setCookies = response.headers.getSetCookie();
  if (setCookies.length > 0) headers['set-cookie'] = setCookies;
  return headers;
};

const responseSessionCookie = (response: Response): string | null => {
  const cookie = response.headers
    .getSetCookie()
    .find((value) => /^(?:__Secure-)?better-auth\.session_token=/u.test(value));
  return cookie?.split(';')[0] ?? null;
};

const toCatalogSearchQuery = (
  input: Readonly<{
    kind?: 'official' | 'user_submission' | undefined;
    q?: string | undefined;
    sort?: 'recent' | 'popular' | 'new' | undefined;
    source?: string | undefined;
    status?: 'ongoing' | 'hiatus' | 'completed' | 'unknown' | undefined;
  }>,
) => ({
  kind: input.kind ?? null,
  query: input.q ?? null,
  sort: input.sort ?? 'recent',
  sourceKey: input.source ?? null,
  status: input.status ?? null,
});

export const createApp = (overrides: Partial<ApiDependencies> = {}) => {
  const dependencies: ApiDependencies = { ...unauthenticatedDependencies, ...overrides };
  const baseApp = new Hono();

  baseApp.post('/api/webhooks/resend', async (context) => {
    const repository = dependencies.emailDigests;
    const secret = dependencies.resendWebhookSecret;
    const transactions = dependencies.transactions;
    if (!repository || !secret || !transactions) return context.json({ error: 'unavailable' }, 503);
    const payload = await context.req.raw.text();
    const feedback = verifyResendEmailFeedback(
      payload,
      {
        id: context.req.header('svix-id') ?? null,
        signature: context.req.header('svix-signature') ?? null,
        timestamp: context.req.header('svix-timestamp') ?? null,
      },
      secret,
    );
    if (!feedback) return context.json({ error: 'invalid_webhook' }, 400);
    await recordEmailDigestFeedback(transactions, repository, feedback);
    return context.body(null, 204);
  });

  baseApp.use(
    sentry(baseApp, {
      dataCollection: {
        cookies: false,
        databaseQueryData: false,
        frameContextLines: 0,
        genAI: { inputs: false, outputs: false },
        graphQL: { document: false, variables: false },
        httpBodies: [],
        httpHeaders: { request: false, response: false },
        stackFrameVariables: false,
        urlQueryParams: false,
        userInfo: false,
      },
      dsn: process.env.SENTRY_DSN,
    }),
  );

  baseApp.use(async (context, next) => {
    if (context.req.path === '/metrics') {
      await next();
      return;
    }

    const stopTimer = apiRequestDuration.startTimer({
      method: context.req.method,
    });
    try {
      await next();
    } finally {
      const status = String(context.res.status);
      apiRequests.inc({ method: context.req.method, status });
      stopTimer({ status });
    }
  });

  const admin = new Hono<ApiEnvironment>().use('/api/admin/*', async (context, next) => {
    const actor = await dependencies.resolveCatalogAdmin(context.req.raw);
    context.set('catalogAdminActor', actor);
    await next();
  });

  const identityRoutes = new Hono()
    .get('/api/session', async (context) => {
      const session = await dependencies.resolveSession(context.req.raw);
      return isActiveSession(session)
        ? context.json({ email: session.email, userUuid: session.userUuid }, 200)
        : context.json({ error: 'unauthenticated' }, 401);
    })
    .get('/api/profiles/:userId', vValidator('param', profileParamsSchema), async (context) => {
      const repository = dependencies.identity;
      if (!repository) return context.json({ error: 'unavailable' }, 503);
      const session = await dependencies.resolveSession(context.req.raw);
      const profile = await findVisibleProfile(repository, context.req.valid('param').userId, {
        userUuid: isActiveSession(session) ? session.userUuid : null,
      });
      return profile ? context.json(profile, 200) : context.json({ error: 'not_found' }, 404);
    })
    .put(
      '/api/settings/profile',
      vValidator('json', updateProfileRequestSchema),
      async (context) => {
        const repository = dependencies.identity;
        const session = await dependencies.resolveSession(context.req.raw);
        if (!isActiveSession(session)) return context.json({ error: 'unauthenticated' }, 401);
        if (!repository) return context.json({ error: 'unavailable' }, 503);
        const input = context.req.valid('json');
        const current = await repository.findProfileByUserUuid(session.userUuid);
        const profile = await updateProfile(repository, {
          accountStatus: current?.accountStatus ?? 'active',
          bio: input.bio,
          displayName: input.displayName,
          iconUrl: current?.iconUrl ?? null,
          userId: input.userId,
          userUuid: session.userUuid,
          visibility: input.visibility,
        });
        return context.json(profile, 200);
      },
    )
    .post('/api/settings/profile/icon', async (context) => {
      const repository = dependencies.identity;
      const storage = dependencies.profileIconStorage;
      const session = await dependencies.resolveSession(context.req.raw);
      if (!isActiveSession(session)) return context.json({ error: 'unauthenticated' }, 401);
      if (!repository || !storage) return context.json({ error: 'unavailable' }, 503);
      const profile = await repository.findProfileByUserUuid(session.userUuid);
      if (!profile) return context.json({ error: 'profile_required' }, 409);
      const icon = (await context.req.raw.formData()).get('icon');
      if (!(icon instanceof File)) return context.json({ error: 'invalid_icon' }, 400);
      try {
        const iconUrl = await uploadProfileIcon(storage, session.userUuid, {
          bytes: new Uint8Array(await icon.arrayBuffer()),
          contentType: icon.type,
        });
        return context.json(await updateProfile(repository, { ...profile, iconUrl }), 200);
      } catch {
        return context.json({ error: 'invalid_icon' }, 400);
      }
    })
    .put(
      '/api/settings/source-preferences',
      vValidator('json', setSourcePreferencesRequestSchema),
      async (context) => {
        const session = await dependencies.resolveSession(context.req.raw);
        const repository = dependencies.follow;
        const transactions = dependencies.transactions;
        if (!isActiveSession(session)) return context.json({ error: 'unauthenticated' }, 401);
        if (!repository || !transactions) return context.json({ error: 'unavailable' }, 503);
        return context.json(
          {
            preferences: await setSourcePreferences(
              transactions,
              repository,
              session.userUuid,
              context.req.valid('json').sourceIds,
            ),
          },
          200,
        );
      },
    )
    .put(
      '/api/settings/follows',
      vValidator('json', setFollowSettingsRequestSchema),
      async (context) => {
        const session = await dependencies.resolveSession(context.req.raw);
        const repository = dependencies.follow;
        const transactions = dependencies.transactions;
        if (!isActiveSession(session)) return context.json({ error: 'unauthenticated' }, 401);
        if (!repository || !transactions) return context.json({ error: 'unavailable' }, 503);
        const input = context.req.valid('json');
        await setFollowSettings(transactions, repository, {
          ...input,
          userUuid: session.userUuid,
        });
        return context.json({ status: 'ok' as const }, 200);
      },
    )
    .put(
      '/api/settings/notification-preferences',
      vValidator('json', setNotificationPreferenceRequestSchema),
      async (context) => {
        const session = await dependencies.resolveSession(context.req.raw);
        const repository = dependencies.notifications;
        const transactions = dependencies.transactions;
        if (!isActiveSession(session)) return context.json({ error: 'unauthenticated' }, 401);
        if (!repository || !transactions) return context.json({ error: 'unavailable' }, 503);
        await setNotificationPreference(transactions, repository, {
          ...context.req.valid('json'),
          userUuid: session.userUuid,
        });
        return context.json({ status: 'ok' as const }, 200);
      },
    )
    .put(
      '/api/settings/email-digest',
      vValidator('json', emailDigestSettingsRequestSchema),
      async (context) => {
        const session = await dependencies.resolveSession(context.req.raw);
        const repository = dependencies.emailDigests;
        const transactions = dependencies.transactions;
        if (!isActiveSession(session)) return context.json({ error: 'unauthenticated' }, 401);
        if (!repository || !transactions) return context.json({ error: 'unavailable' }, 503);
        await setEmailDigestSettings(transactions, repository, {
          ...context.req.valid('json'),
          userUuid: session.userUuid,
        });
        return context.json({ status: 'ok' as const }, 200);
      },
    )
    .post('/api/settings/email-digest/unsubscribe', async (context) => {
      const session = await dependencies.resolveSession(context.req.raw);
      const repository = dependencies.emailDigests;
      const transactions = dependencies.transactions;
      if (!isActiveSession(session)) return context.json({ error: 'unauthenticated' }, 401);
      if (!repository || !transactions) return context.json({ error: 'unavailable' }, 503);
      await unsubscribeEmailDigest(transactions, repository, session.userUuid);
      return context.json({ status: 'ok' as const }, 200);
    })
    .get('/api/push/config', async (context) => {
      const session = await dependencies.resolveSession(context.req.raw);
      if (!isActiveSession(session)) return context.json({ error: 'unauthenticated' }, 401);
      return dependencies.webPushPublicKey
        ? context.json({ publicKey: dependencies.webPushPublicKey }, 200)
        : context.json({ error: 'unavailable' }, 503);
    })
    .put(
      '/api/settings/push-subscriptions',
      vValidator('json', webPushSubscriptionRequestSchema),
      async (context) => {
        const session = await dependencies.resolveSession(context.req.raw);
        const repository = dependencies.webPushSubscriptions;
        const transactions = dependencies.transactions;
        if (!isActiveSession(session)) return context.json({ error: 'unauthenticated' }, 401);
        if (!repository || !transactions) return context.json({ error: 'unavailable' }, 503);
        await registerWebPushSubscription(transactions, repository, {
          ...context.req.valid('json'),
          userUuid: session.userUuid,
        });
        return context.json({ status: 'ok' as const }, 200);
      },
    )
    .delete(
      '/api/settings/push-subscriptions',
      vValidator('json', webPushUnsubscribeRequestSchema),
      async (context) => {
        const session = await dependencies.resolveSession(context.req.raw);
        const repository = dependencies.webPushSubscriptions;
        const transactions = dependencies.transactions;
        if (!isActiveSession(session)) return context.json({ error: 'unauthenticated' }, 401);
        if (!repository || !transactions) return context.json({ error: 'unavailable' }, 503);
        const removed = await unregisterWebPushSubscription(
          transactions,
          repository,
          session.userUuid,
          context.req.valid('json').endpoint,
        );
        return context.json({ status: removed ? ('ok' as const) : ('not_found' as const) }, 200);
      },
    )
    .get(
      '/api/notifications',
      vValidator('query', notificationListQuerySchema),
      async (context) => {
        const session = await dependencies.resolveSession(context.req.raw);
        const repository = dependencies.notifications;
        if (!isActiveSession(session)) return context.json({ error: 'unauthenticated' }, 401);
        if (!repository) return context.json({ error: 'unavailable' }, 503);
        const query = context.req.valid('query');
        const limit = query.limit === undefined ? 30 : Number(query.limit);
        if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
          return context.json({ error: 'invalid_limit' }, 400);
        }
        return context.json(
          {
            page: await repository.listNotifications(session.userUuid, query.cursor ?? null, limit),
            unreadCount: await repository.unreadNotificationCount(session.userUuid),
          },
          200,
        );
      },
    )
    .post('/api/notifications/read-all', async (context) => {
      const session = await dependencies.resolveSession(context.req.raw);
      const repository = dependencies.notifications;
      const transactions = dependencies.transactions;
      if (!isActiveSession(session)) return context.json({ error: 'unauthenticated' }, 401);
      if (!repository || !transactions) return context.json({ error: 'unavailable' }, 503);
      await readAllNotifications(transactions, repository, session.userUuid);
      return context.json({ status: 'ok' as const }, 200);
    })
    .post(
      '/api/notifications/:id/read',
      vValidator('param', notificationParamsSchema),
      async (context) => {
        const session = await dependencies.resolveSession(context.req.raw);
        const repository = dependencies.notifications;
        const transactions = dependencies.transactions;
        if (!isActiveSession(session)) return context.json({ error: 'unauthenticated' }, 401);
        if (!repository || !transactions) return context.json({ error: 'unavailable' }, 503);
        const changed = await readNotification(
          transactions,
          repository,
          session.userUuid,
          context.req.valid('param').id,
        );
        return context.json({ status: changed ? ('ok' as const) : ('not_found' as const) }, 200);
      },
    )
    .get('/api/library/volumes', async (context) => {
      const session = await dependencies.resolveSession(context.req.raw);
      const repository = dependencies.volumeLibrary;
      if (!isActiveSession(session)) return context.json({ error: 'unauthenticated' }, 401);
      if (!repository) return context.json({ error: 'unavailable' }, 503);
      return context.json(
        { records: await repository.listUserVolumeRecords(session.userUuid) },
        200,
      );
    })
    .put(
      '/api/library/volumes/records',
      vValidator('json', setUserVolumeRecordRequestSchema),
      async (context) => {
        const session = await dependencies.resolveSession(context.req.raw);
        const repository = dependencies.volumeLibrary;
        const transactions = dependencies.transactions;
        if (!isActiveSession(session)) return context.json({ error: 'unauthenticated' }, 401);
        if (!repository || !transactions) return context.json({ error: 'unavailable' }, 503);
        return context.json(
          await setUserVolumeRecord(transactions, repository, {
            ...context.req.valid('json'),
            userUuid: session.userUuid,
          }),
          200,
        );
      },
    )
    .post(
      '/api/library/volumes/mapping-corrections',
      vValidator('json', submitVolumeContentMappingCorrectionRequestSchema),
      async (context) => {
        const session = await dependencies.resolveSession(context.req.raw);
        const repository = dependencies.volumeLibrary;
        const transactions = dependencies.transactions;
        if (!isActiveSession(session)) return context.json({ error: 'unauthenticated' }, 401);
        if (!repository || !transactions) return context.json({ error: 'unavailable' }, 503);
        await submitVolumeContentMappingCorrection(transactions, repository, {
          ...context.req.valid('json'),
          userUuid: session.userUuid,
        });
        return context.json({ status: 'queued' as const }, 200);
      },
    )
    .post(
      '/api/library/status',
      vValidator('json', setReadingStatusRequestSchema),
      async (context) => {
        const session = await dependencies.resolveSession(context.req.raw);
        const repository = dependencies.library;
        const transactions = dependencies.transactions;
        if (!isActiveSession(session)) return context.json({ error: 'unauthenticated' }, 401);
        if (!repository || !transactions) return context.json({ error: 'unavailable' }, 503);
        return context.json(
          await setReadingStatus(transactions, repository, {
            ...context.req.valid('json'),
            userUuid: session.userUuid,
          }),
          200,
        );
      },
    )
    .post(
      '/api/library/reads',
      vValidator('json', markContentReadRequestSchema),
      async (context) => {
        const session = await dependencies.resolveSession(context.req.raw);
        const repository = dependencies.library;
        const transactions = dependencies.transactions;
        if (!isActiveSession(session)) return context.json({ error: 'unauthenticated' }, 401);
        if (!repository || !transactions) return context.json({ error: 'unavailable' }, 503);
        await markContentRead(transactions, repository, {
          ...context.req.valid('json'),
          userUuid: session.userUuid,
        });
        return context.json({ status: 'ok' as const }, 200);
      },
    )
    .post(
      '/api/library/reads/through',
      vValidator('json', markContentReadThroughRequestSchema),
      async (context) => {
        const session = await dependencies.resolveSession(context.req.raw);
        const repository = dependencies.library;
        const transactions = dependencies.transactions;
        if (!isActiveSession(session)) return context.json({ error: 'unauthenticated' }, 401);
        if (!repository || !transactions) return context.json({ error: 'unavailable' }, 503);
        await markContentReadThrough(transactions, repository, {
          ...context.req.valid('json'),
          userUuid: session.userUuid,
        });
        return context.json({ status: 'ok' as const }, 200);
      },
    )
    .post(
      '/api/library/publication-reads',
      vValidator('json', markPublicationReadRequestSchema),
      async (context) => {
        const session = await dependencies.resolveSession(context.req.raw);
        const repository = dependencies.library;
        const transactions = dependencies.transactions;
        if (!isActiveSession(session)) return context.json({ error: 'unauthenticated' }, 401);
        if (!repository || !transactions) return context.json({ error: 'unavailable' }, 503);
        await markPublicationRead(transactions, repository, {
          ...context.req.valid('json'),
          userUuid: session.userUuid,
        });
        return context.json({ status: 'ok' as const }, 200);
      },
    )
    .delete(
      '/api/library/reads',
      vValidator('json', unmarkContentReadRequestSchema),
      async (context) => {
        const session = await dependencies.resolveSession(context.req.raw);
        const repository = dependencies.library;
        const transactions = dependencies.transactions;
        if (!isActiveSession(session)) return context.json({ error: 'unauthenticated' }, 401);
        if (!repository || !transactions) return context.json({ error: 'unavailable' }, 503);
        await unmarkContentRead(transactions, repository, {
          ...context.req.valid('json'),
          userUuid: session.userUuid,
        });
        return context.json({ status: 'ok' as const }, 200);
      },
    );

  const extensionRoutes = new Hono()
    .post('/api/extension/pairing-codes', async (context) => {
      const session = await dependencies.resolveSession(context.req.raw);
      const repository = dependencies.extensionTokens;
      const transactions = dependencies.transactions;
      if (!isActiveSession(session)) return context.json({ error: 'unauthenticated' }, 401);
      if (!repository || !transactions) return context.json({ error: 'unavailable' }, 503);
      return context.json(
        await issueExtensionPairingCode(transactions, repository, session.userUuid),
        201,
      );
    })
    .post(
      '/api/extension/pairing-codes/exchange',
      vValidator('json', exchangeExtensionPairingCodeRequestSchema),
      async (context) => {
        const repository = dependencies.extensionTokens;
        const transactions = dependencies.transactions;
        if (!repository || !transactions) return context.json({ error: 'unavailable' }, 503);
        const token = await exchangeExtensionPairingCode(
          transactions,
          repository,
          context.req.valid('json'),
        );
        return token
          ? context.json(token, 201)
          : context.json({ error: 'invalid_pairing_code' }, 401);
      },
    )
    .delete(
      '/api/extension/tokens/:tokenId',
      vValidator('param', revokeExtensionTokenParamsSchema),
      async (context) => {
        const session = await dependencies.resolveSession(context.req.raw);
        const repository = dependencies.extensionTokens;
        const transactions = dependencies.transactions;
        if (!isActiveSession(session)) return context.json({ error: 'unauthenticated' }, 401);
        if (!repository || !transactions) return context.json({ error: 'unavailable' }, 503);
        const revoked = await revokeExtensionToken(
          transactions,
          repository,
          session.userUuid,
          context.req.valid('param').tokenId,
        );
        return context.json({ status: revoked ? ('ok' as const) : ('not_found' as const) }, 200);
      },
    );

  const favoriteImportRoutes = new Hono()
    .post(
      '/api/extension/favorite-imports',
      vValidator('json', createFavoriteImportRequestSchema),
      async (context) => {
        const token = readBearerToken(context.req.raw);
        const extensionTokens = dependencies.extensionTokens;
        const favorites = dependencies.favoriteImports;
        const favoriteImportSources = dependencies.favoriteImportSources;
        const transactions = dependencies.transactions;
        if (!token) return context.json({ error: 'unauthenticated' }, 401);
        if (!extensionTokens || !favorites || !favoriteImportSources || !transactions)
          return context.json({ error: 'unavailable' }, 503);
        const userUuid = await authenticateExtensionToken(extensionTokens, token);
        if (!userUuid) return context.json({ error: 'unauthenticated' }, 401);
        let resolvedFavorites;
        try {
          resolvedFavorites = await resolveFavoriteImportSources(
            favoriteImportSources,
            context.req.valid('json').favorites,
          );
        } catch (error) {
          if (error instanceof FavoriteImportSourceRejectedError)
            return context.json({ error: 'source_not_collectable' }, 403);
          throw error;
        }
        const batch = await createFavoriteImport(transactions, favorites, {
          favorites: resolvedFavorites,
          userUuid,
        });
        return context.json(
          {
            batchId: batch.id,
            confirmationUrl: new URL(`/settings/extension/imports/${batch.id}`, context.req.url)
              .href,
            expiresAt: batch.expiresAt,
          },
          201,
        );
      },
    )
    .get(
      '/api/favorite-imports/:batchId',
      vValidator('param', favoriteImportParamsSchema),
      async (context) => {
        const session = await dependencies.resolveSession(context.req.raw);
        const repository = dependencies.favoriteImports;
        if (!isActiveSession(session)) return context.json({ error: 'unauthenticated' }, 401);
        if (!repository) return context.json({ error: 'unavailable' }, 503);
        const result = await getFavoriteImport(
          repository,
          context.req.valid('param').batchId,
          session.userUuid,
        );
        return result ? context.json(result, 200) : context.json({ error: 'not_found' }, 404);
      },
    )
    .post(
      '/api/favorite-imports/:batchId/apply',
      vValidator('param', favoriteImportParamsSchema),
      vValidator('json', applyFavoriteImportRequestSchema),
      async (context) => {
        const session = await dependencies.resolveSession(context.req.raw);
        const favorites = dependencies.favoriteImports;
        const library = dependencies.library;
        const follow = dependencies.follow;
        const transactions = dependencies.transactions;
        if (!isActiveSession(session)) return context.json({ error: 'unauthenticated' }, 401);
        if (!favorites || !library || !follow || !transactions)
          return context.json({ error: 'unavailable' }, 503);
        const body = context.req.valid('json');
        const result = await applyFavoriteImport(
          transactions,
          { favorites, follow, library },
          {
            batchId: context.req.valid('param').batchId,
            defaults: body.defaults,
            selections: body.selections,
            userUuid: session.userUuid,
          },
        );
        if (result === 'not_found') return context.json({ error: 'not_found' }, 404);
        if (result === 'expired') return context.json({ error: 'expired' }, 410);
        return context.json({ status: 'applied' as const }, 200);
      },
    )
    .post(
      '/api/favorite-imports/:batchId/discard',
      vValidator('param', favoriteImportParamsSchema),
      async (context) => {
        const session = await dependencies.resolveSession(context.req.raw);
        const repository = dependencies.favoriteImports;
        const transactions = dependencies.transactions;
        if (!isActiveSession(session)) return context.json({ error: 'unauthenticated' }, 401);
        if (!repository || !transactions) return context.json({ error: 'unavailable' }, 503);
        const result = await discardFavoriteImport(
          transactions,
          repository,
          context.req.valid('param').batchId,
          session.userUuid,
        );
        return result === 'discarded'
          ? context.json({ status: 'discarded' as const }, 200)
          : context.json({ error: 'not_found' }, 404);
      },
    );

  const catalogRoutes = admin
    .get('/api/admin/catalog/review-items', async (context) => {
      const actor = context.get('catalogAdminActor');
      const controller = dependencies.catalogAdmin;
      if (!actor || actor.role !== 'administrator')
        return context.json({ error: 'forbidden' }, unauthorized(actor));
      if (!controller) return context.json({ error: 'unavailable' }, 503);
      return context.json({ items: await controller.listReviewItems() }, 200);
    })
    .get('/api/admin/catalog/audits', async (context) => {
      const actor = context.get('catalogAdminActor');
      const controller = dependencies.catalogAdmin;
      if (!actor || actor.role !== 'administrator')
        return context.json({ error: 'forbidden' }, unauthorized(actor));
      if (!controller) return context.json({ error: 'unavailable' }, 503);
      return context.json({ audits: await controller.findAuditRecords() }, 200);
    })
    .get(
      '/api/admin/catalog/redirects/:resource/:id',
      vValidator('param', catalogRedirectParamsSchema),
      async (context) => {
        const actor = context.get('catalogAdminActor');
        const controller = dependencies.catalogAdmin;
        if (!actor || actor.role !== 'administrator')
          return context.json({ error: 'forbidden' }, unauthorized(actor));
        if (!controller) return context.json({ error: 'unavailable' }, 503);
        const input = context.req.valid('param');
        const redirect = await controller.findRedirect(input.resource, input.id);
        return redirect ? context.json(redirect, 200) : context.json({ error: 'not_found' }, 404);
      },
    )
    .post(
      '/api/admin/catalog/works/merge',
      vValidator('json', mergeWorksRequestSchema),
      async (context) => {
        const actor = context.get('catalogAdminActor');
        const controller = dependencies.catalogAdmin;
        if (!actor || actor.role !== 'administrator')
          return context.json({ error: 'forbidden' }, unauthorized(actor));
        if (!controller) return context.json({ error: 'unavailable' }, 503);
        return context.json(await controller.mergeWorks(actor, context.req.valid('json')), 200);
      },
    )
    .post(
      '/api/admin/catalog/content-units/merge',
      vValidator('json', mergeContentUnitsRequestSchema),
      async (context) => {
        const actor = context.get('catalogAdminActor');
        const controller = dependencies.catalogAdmin;
        if (!actor || actor.role !== 'administrator')
          return context.json({ error: 'forbidden' }, unauthorized(actor));
        if (!controller) return context.json({ error: 'unavailable' }, 503);
        return context.json(
          await controller.mergeContentUnits(actor, context.req.valid('json')),
          200,
        );
      },
    )
    .post(
      '/api/admin/catalog/works/split',
      vValidator('json', splitWorkRequestSchema),
      async (context) => {
        const actor = context.get('catalogAdminActor');
        const controller = dependencies.catalogAdmin;
        if (!actor || actor.role !== 'administrator')
          return context.json({ error: 'forbidden' }, unauthorized(actor));
        if (!controller) return context.json({ error: 'unavailable' }, 503);
        return context.json(await controller.splitWork(actor, context.req.valid('json')), 200);
      },
    )
    .post(
      '/api/admin/catalog/content-units/split',
      vValidator('json', splitContentUnitRequestSchema),
      async (context) => {
        const actor = context.get('catalogAdminActor');
        const controller = dependencies.catalogAdmin;
        if (!actor || actor.role !== 'administrator')
          return context.json({ error: 'forbidden' }, unauthorized(actor));
        if (!controller) return context.json({ error: 'unavailable' }, 503);
        return context.json(
          await controller.splitContentUnit(actor, context.req.valid('json')),
          200,
        );
      },
    )
    .post(
      '/api/admin/catalog/review-items/:id/resolve',
      vValidator('param', catalogReviewItemParamsSchema),
      async (context) => {
        const actor = context.get('catalogAdminActor');
        const controller = dependencies.catalogAdmin;
        if (!actor || actor.role !== 'administrator')
          return context.json({ error: 'forbidden' }, unauthorized(actor));
        if (!controller) return context.json({ error: 'unavailable' }, 503);
        return context.json(
          await controller.resolveReviewItem(actor, context.req.valid('param').id),
          200,
        );
      },
    );

  const publicCatalogRoutes = new Hono()
    .get(
      '/api/catalog/works',
      vValidator('query', searchCatalogWorksQuerySchema),
      async (context) => {
        const catalog = dependencies.catalog;
        const policies = dependencies.sourcePolicies;
        if (!catalog || !policies) return context.json({ error: 'unavailable' }, 503);
        const works = await searchPublicWorks(
          catalog,
          policies,
          toCatalogSearchQuery(context.req.valid('query')),
        );
        return context.json({ works }, 200, {
          'cache-control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=600',
        });
      },
    )
    .get(
      '/api/catalog/works/:workId',
      vValidator('param', catalogWorkParamsSchema),
      async (context) => {
        const catalog = dependencies.catalog;
        const policies = dependencies.sourcePolicies;
        if (!catalog || !policies) return context.json({ error: 'unavailable' }, 503);
        const work = await findPublicWork(catalog, policies, context.req.valid('param').workId);
        return work
          ? context.json({ work }, 200, {
              'cache-control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=600',
            })
          : context.json({ error: 'not_found' }, 404);
      },
    );

  return baseApp
    .post('/api/login/magic-link', vValidator('json', magicLinkRequestSchema), async (context) => {
      const auth = dependencies.auth;
      if (!auth) return context.json({ error: 'unavailable' }, 503);
      return auth.handler(
        new Request(new URL('/api/auth/sign-in/magic-link', context.req.url), {
          body: JSON.stringify({
            callbackURL: '/settings/profile',
            email: context.req.valid('json').email,
          }),
          headers: {
            'content-type': 'application/json',
            origin: new URL(context.req.url).origin,
          },
          method: 'POST',
        }),
      );
    })
    .post('/api/login/google', async (context) => {
      const auth = dependencies.auth;
      if (!auth) return context.json({ error: 'unavailable' }, 503);
      return auth.handler(
        new Request(new URL('/api/auth/sign-in/social', context.req.url), {
          body: JSON.stringify({ callbackURL: '/settings/profile', provider: 'google' }),
          headers: {
            'content-type': 'application/json',
            origin: new URL(context.req.url).origin,
          },
          method: 'POST',
        }),
      );
    })
    .post('/api/logout', async (context) => {
      const auth = dependencies.auth;
      if (!auth) return context.json({ error: 'unavailable' }, 503);
      const headers = new Headers({ origin: new URL(context.req.url).origin });
      const cookie = context.req.header('cookie');
      if (cookie) headers.set('cookie', cookie);
      return auth.handler(
        new Request(new URL('/api/auth/sign-out', context.req.url), { headers, method: 'POST' }),
      );
    })
    .post(
      '/api/settings/two-factor/enable',
      vValidator('json', twoFactorEnableRequestSchema),
      async (context) => {
        const auth = dependencies.auth;
        if (!auth) return context.json({ error: 'unavailable' }, 503);
        const response = await auth.handler(
          forwardAuthRequest(context, '/api/auth/two-factor/enable', context.req.valid('json')),
        );
        if (!response.ok) return response;
        const result = safeParse(twoFactorEnableResponseSchema, await response.clone().json());
        return result.success
          ? context.json(result.output, 200, responseHeaders(response))
          : context.json({ error: 'invalid_auth_response' }, 502);
      },
    )
    .post(
      '/api/settings/two-factor/verify',
      vValidator('json', twoFactorVerifyRequestSchema),
      async (context) => {
        const auth = dependencies.auth;
        const assurances = dependencies.sessionAssurances;
        if (!auth || !assurances) return context.json({ error: 'unavailable' }, 503);
        const response = await auth.handler(
          forwardAuthRequest(
            context,
            '/api/auth/two-factor/verify-totp',
            context.req.valid('json'),
          ),
        );
        if (!response.ok) return response;
        const result = safeParse(twoFactorVerifyResponseSchema, await response.clone().json());
        if (!result.success) return context.json({ error: 'invalid_auth_response' }, 502);
        const cookie = responseSessionCookie(response);
        if (!cookie) return context.json({ error: 'invalid_auth_response' }, 502);
        const sessionToken = await auth.sessionToken(
          new Request(context.req.url, { headers: { cookie } }),
        );
        if (!sessionToken) return context.json({ error: 'invalid_auth_response' }, 502);
        const recorded = await recordTwoFactorAssurance(assurances, sessionToken);
        return recorded
          ? context.json({ status: 'verified' as const }, 200, responseHeaders(response))
          : context.json({ error: 'assurance_unavailable' }, 503);
      },
    )
    .all('/api/auth/*', async (context) => {
      const auth = dependencies.auth;
      if (
        context.req.path === '/api/auth/two-factor/enable' ||
        context.req.path === '/api/auth/two-factor/verify-totp'
      ) {
        return context.json({ error: 'not_found' }, 404);
      }
      return auth ? auth.handler(context.req.raw) : context.json({ error: 'unavailable' }, 503);
    })
    .get(
      '/api/catalog/redirects/:resource/:id',
      vValidator('param', catalogRedirectParamsSchema),
      async (context) => {
        const controller = dependencies.catalogAdmin;
        if (!controller) return context.json({ error: 'not_found' }, 404);
        const input = context.req.valid('param');
        const redirect = await controller.findRedirect(input.resource, input.id);
        return redirect
          ? context.redirect(canonicalCatalogPath(redirect), 302)
          : context.json({ error: 'not_found' }, 404);
      },
    )
    .route('/', identityRoutes)
    .route('/', extensionRoutes)
    .route('/', favoriteImportRoutes)
    .route('/', publicCatalogRoutes)
    .route('/', catalogRoutes)
    .get('/api/health', (context) => context.json({ status: 'ok' as const }, 200))
    .get('/metrics', async (context) => {
      return context.body(await apiMetrics.metrics(), 200, {
        'content-type': apiMetrics.contentType,
      });
    });
};

export const app = createApp();

export type ApiType = typeof app;
