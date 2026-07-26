import { vValidator } from '@hono/valibot-validator';
import { sentry } from '@sentry/hono/bun';
import type {
  CatalogAdminRepository,
  CatalogAuditRecord,
  CatalogRedirect,
  CatalogReviewItem,
  MergeContentUnitsCommand,
  MergeWorksCommand,
  SplitContentUnitCommand,
  SplitWorkCommand,
  TransactionPort,
} from '@web-comic-library/application';
import {
  mergeContentUnits,
  mergeWorks,
  resolveCatalogReviewItem,
  splitContentUnit,
  splitWork,
} from '@web-comic-library/application';
import {
  catalogRedirectParamsSchema,
  catalogReviewItemParamsSchema,
  mergeContentUnitsRequestSchema,
  mergeWorksRequestSchema,
  splitContentUnitRequestSchema,
  splitWorkRequestSchema,
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
  catalogAdmin: CatalogAdminController | null;
  resolveCatalogAdmin(request: Request): Promise<CatalogAdminActor | null>;
}>;

type ApiEnvironment = Readonly<{
  Variables: {
    catalogAdminActor: CatalogAdminActor | null;
  };
}>;

const unauthenticatedDependencies: ApiDependencies = {
  catalogAdmin: null,
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

export const createApp = (dependencies: ApiDependencies = unauthenticatedDependencies) => {
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
