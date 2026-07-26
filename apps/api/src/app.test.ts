import { describe, expect, test } from 'bun:test';

import type { CatalogAuditRecord, CatalogReviewItem } from '@web-comic-library/application';
import { hc } from 'hono/client';

import { app, createApp, type ApiType, type CatalogAdminController } from './app';

describe('health endpoint', () => {
  test('is callable through Hono RPC', async () => {
    const client = hc<ApiType>('http://api.test', {
      fetch: app.request,
    });
    const response = await client.api.health.$get();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
  });

  test('exposes Prometheus metrics without request data labels', async () => {
    const client = hc<ApiType>('http://api.test', { fetch: app.request });
    const response = await client.metrics.$get();
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain('web_comic_library_api_requests_total');
    expect(body).not.toContain('url=');
  });
});

describe('catalog administration RPC', () => {
  const audit: CatalogAuditRecord = {
    after: { canonicalWorkId: 'work-target' },
    before: { sourceWorkId: 'work-source' },
    createdAt: new Date('2026-07-27T00:00:00Z'),
    id: 'audit-1',
    operation: 'merge_work',
    operatorId: 'admin-1',
    reason: 'duplicate',
  };
  const review: CatalogReviewItem = {
    createdAt: new Date('2026-07-27T00:00:00Z'),
    id: 'review-1',
    kind: 'parse_failure',
    payload: { runId: 'run-1' },
    resolvedAt: null,
    resolvedBy: null,
    sourceId: 'source-1',
    status: 'open',
  };
  const controller: CatalogAdminController = {
    async findAuditRecords(): Promise<readonly CatalogAuditRecord[]> {
      return [audit];
    },
    async findRedirect() {
      return { canonicalId: 'work-target', resource: 'work' };
    },
    async listReviewItems(): Promise<readonly CatalogReviewItem[]> {
      return [review];
    },
    async mergeContentUnits() {
      return audit;
    },
    async mergeWorks() {
      return audit;
    },
    async resolveReviewItem() {
      return {
        ...review,
        resolvedAt: new Date('2026-07-27T00:01:00Z'),
        resolvedBy: 'admin-1',
        status: 'resolved',
      };
    },
    async splitContentUnit() {
      return audit;
    },
    async splitWork() {
      return audit;
    },
  };

  test('rejects unauthenticated and non-administrator callers', async () => {
    const unauthenticated = createApp();
    const noSession = await unauthenticated.request('/api/admin/catalog/review-items');
    expect(noSession.status).toBe(401);

    const nonAdmin = createApp({
      catalogAdmin: controller,
      async resolveCatalogAdmin() {
        return { assurance: 'passkey', id: 'user-1', role: 'user' };
      },
    });
    const response = await nonAdmin.request('/api/admin/catalog/review-items');
    expect(response.status).toBe(403);
  });

  test('validates and dispatches an administrator command through Hono RPC', async () => {
    const protectedApp = createApp({
      catalogAdmin: controller,
      async resolveCatalogAdmin() {
        return { assurance: 'two_factor', id: 'admin-1', role: 'administrator' };
      },
    });
    const client = hc<typeof protectedApp>('http://api.test', { fetch: protectedApp.request });
    const response = await client.api.admin.catalog.works.merge.$post({
      json: {
        reason: 'duplicate',
        sourceWorkId: 'work-source',
        targetWorkId: 'work-target',
      },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ id: 'audit-1', operation: 'merge_work' });

    const invalid = await client.api.admin.catalog.works.merge.$post({
      json: {
        reason: '',
        sourceWorkId: 'work-source',
        targetWorkId: 'work-target',
      },
    });
    expect(invalid.status).toBe(400);
  });

  test('redirects retired public catalog IDs without requiring administration access', async () => {
    const redirectingApp = createApp({
      catalogAdmin: controller,
      async resolveCatalogAdmin() {
        return null;
      },
    });
    const response = await redirectingApp.request('/api/catalog/redirects/work/work-source');

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('/works/work-target');
  });
});
