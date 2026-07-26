import { describe, expect, test } from 'bun:test';

import type {
  CatalogAuditRecord,
  CatalogReviewItem,
  ProfileIconStorage,
} from '@web-comic-library/application';
import type { AuthAdapter } from '@web-comic-library/auth';
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

describe('profile and session RPC', () => {
  const profile = {
    accountStatus: 'active' as const,
    bio: null,
    displayName: 'Reader',
    iconUrl: null,
    userId: 'reader-01',
    userUuid: 'reader',
    visibility: null,
  };
  const identity = {
    async findProfileByPublicId() {
      return profile;
    },
    async findProfileByUserUuid() {
      return profile;
    },
    async isFollower() {
      return false;
    },
    async saveProfile(input: typeof profile) {
      return input;
    },
  };

  test('keeps an unset profile private and rejects inactive sessions', async () => {
    const privateApp = createApp({
      identity,
      async resolveSession() {
        return { accountStatus: 'disabled', email: 'reader@example.com', userUuid: 'reader' };
      },
    });
    expect((await privateApp.request('/api/profiles/reader-01')).status).toBe(404);
    expect((await privateApp.request('/api/session')).status).toBe(401);
  });

  test('requires a session to update a profile and uses Hono RPC input validation', async () => {
    const protectedApp = createApp({
      identity,
      async resolveSession() {
        return { accountStatus: 'active', email: 'reader@example.com', userUuid: 'reader' };
      },
    });
    const client = hc<typeof protectedApp>('http://api.test', { fetch: protectedApp.request });
    const response = await client.api.settings.profile.$put({
      json: {
        bio: 'profile',
        displayName: 'Reader',
        userId: 'reader-01',
        visibility: 'public',
      },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ userId: 'reader-01', visibility: 'public' });
  });

  test('keeps a newly registered account private until its first visibility choice is saved', async () => {
    let saved: typeof profile | null = null;
    const unconfiguredIdentity = {
      async findProfileByPublicId() {
        return saved;
      },
      async findProfileByUserUuid() {
        return saved;
      },
      async isFollower() {
        return false;
      },
      async saveProfile(input: typeof profile) {
        saved = input;
        return input;
      },
    };
    const session = {
      accountStatus: 'active' as const,
      email: 'reader@example.com',
      userUuid: 'reader',
    };
    const accountApp = createApp({
      identity: unconfiguredIdentity,
      async resolveSession() {
        return session;
      },
    });
    const client = hc<typeof accountApp>('http://api.test', { fetch: accountApp.request });
    expect((await accountApp.request('/api/profiles/reader-01')).status).toBe(404);
    const choice = await client.api.settings.profile.$put({
      json: { bio: null, displayName: 'Reader', userId: 'reader-01', visibility: 'private' },
    });
    expect(choice.status).toBe(200);
    expect((await accountApp.request('/api/profiles/reader-01')).status).toBe(200);
    const visitorApp = createApp({ identity: unconfiguredIdentity });
    expect((await visitorApp.request('/api/profiles/reader-01')).status).toBe(404);
  });

  test('stores a validated profile icon only for an active configured account', async () => {
    const storage: ProfileIconStorage = {
      async put(userUuid, contentType, bytes) {
        expect(userUuid).toBe('reader');
        expect(contentType).toBe('image/png');
        expect(bytes.byteLength).toBeGreaterThan(0);
        return 'https://assets.example/profile-icons/reader.png';
      },
    };
    const protectedApp = createApp({
      identity,
      profileIconStorage: storage,
      async resolveSession() {
        return { accountStatus: 'active', email: 'reader@example.com', userUuid: 'reader' };
      },
    });
    const png = new Uint8Array([
      137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 73, 68, 65, 84, 0, 0, 0, 0, 0, 0, 0, 0, 73, 69, 78, 68, 0, 0, 0,
      0,
    ]);
    const form = new FormData();
    form.set('icon', new File([png], 'profile.png', { type: 'image/png' }));
    const response = await protectedApp.request('/api/settings/profile/icon', {
      body: form,
      method: 'POST',
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      iconUrl: 'https://assets.example/profile-icons/reader.png',
    });
  });
});

describe('authentication RPC', () => {
  test('starts magic-link and Google login through the injected auth adapter, and signs out', async () => {
    const requests: Request[] = [];
    const auth: AuthAdapter = {
      async close() {},
      async handler(request) {
        requests.push(request);
        return new Response(
          JSON.stringify({ redirect: true, url: 'https://accounts.example/authorize' }),
          {
            headers: { 'content-type': 'application/json' },
            status: 200,
          },
        );
      },
    };
    const protectedApp = createApp({ auth });
    const client = hc<typeof protectedApp>('http://api.test', { fetch: protectedApp.request });

    expect(
      (await client.api.login['magic-link'].$post({ json: { email: 'reader@example.com' } }))
        .status,
    ).toBe(200);
    expect((await client.api.login.google.$post()).status).toBe(200);
    expect(
      (
        await protectedApp.request('/api/logout', {
          headers: { cookie: 'session=value' },
          method: 'POST',
        })
      ).status,
    ).toBe(200);

    expect(requests.map((request) => new URL(request.url).pathname)).toEqual([
      '/api/auth/sign-in/magic-link',
      '/api/auth/sign-in/social',
      '/api/auth/sign-out',
    ]);
    expect(await requests[0]?.json()).toEqual({
      callbackURL: '/settings/profile',
      email: 'reader@example.com',
    });
    expect(await requests[1]?.json()).toEqual({
      callbackURL: '/settings/profile',
      provider: 'google',
    });
    expect(requests[2]?.headers.get('cookie')).toBe('session=value');
  });
});
