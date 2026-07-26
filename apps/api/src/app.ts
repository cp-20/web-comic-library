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
  SessionIdentity,
} from '@web-comic-library/application';
import {
  findVisibleProfile,
  isActiveSession,
  mergeContentUnits,
  mergeWorks,
  resolveCatalogReviewItem,
  splitContentUnit,
  splitWork,
  uploadProfileIcon,
  updateProfile,
} from '@web-comic-library/application';
import type { AuthAdapter } from '@web-comic-library/auth';
import {
  catalogRedirectParamsSchema,
  catalogReviewItemParamsSchema,
  mergeContentUnitsRequestSchema,
  mergeWorksRequestSchema,
  magicLinkRequestSchema,
  splitContentUnitRequestSchema,
  splitWorkRequestSchema,
  profileParamsSchema,
  updateProfileRequestSchema,
} from '@web-comic-library/contracts';
import type { CatalogAdminActor } from '@web-comic-library/domain';
import { Hono } from 'hono';

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
  identity: IdentityRepository | null;
  profileIconStorage: ProfileIconStorage | null;
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
  identity: null,
  profileIconStorage: null,
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

export const createApp = (overrides: Partial<ApiDependencies> = {}) => {
  const dependencies: ApiDependencies = { ...unauthenticatedDependencies, ...overrides };
  const baseApp = new Hono();

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
    });

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
    .all('/api/auth/*', async (context) => {
      const auth = dependencies.auth;
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
