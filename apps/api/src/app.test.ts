import { describe, expect, test } from 'bun:test';

import type {
  CatalogAuditRecord,
  CatalogQueryPort,
  CatalogReviewItem,
  FollowRepository,
  LibraryRepository,
  ProfileIconStorage,
  SourcePolicyQueryPort,
  TransactionPort,
  VolumeLibraryRepository,
} from '@web-comic-library/application';
import { TransactionContext } from '@web-comic-library/application';
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

describe('public catalog RPC', () => {
  const publicWork = {
    aliases: ['よみかた'],
    contentUnits: [{ id: 'content-1', position: 0, title: '第1話' }],
    creators: [{ id: 'creator-1', name: '作者', position: 0, role: '漫画' }],
    id: 'work-1',
    publications: [
      {
        ageRatingValue: 'all',
        entries: [
          {
            catchUpEligible: true,
            externalId: 'entry-1',
            id: 'entry-1',
            kind: 'regular' as const,
            mappings: [{ confirmed: true, contentUnitId: 'content-1' }],
            normalizedUrl: 'https://reader.example/entry-1',
            position: 0,
            publishedAt: new Date('2026-07-27T00:00:00Z'),
            title: '第1話',
          },
        ],
        externalId: 'public-1',
        id: 'publication-public',
        kind: 'official' as const,
        normalizedUrl: 'https://reader.example/work-1',
        purchaseUrl: null,
        sourceId: 'source-1',
        sourceKey: 'reader',
        sourceName: '公式掲載先',
        title: '公式掲載',
      },
      {
        ageRatingValue: 'r18',
        entries: [],
        externalId: 'private-1',
        id: 'publication-private',
        kind: 'official' as const,
        normalizedUrl: 'https://private.example/work-1',
        purchaseUrl: null,
        sourceId: 'source-2',
        sourceKey: 'private',
        sourceName: '非公開掲載先',
        title: '非公開掲載',
      },
    ],
    serialStatus: 'ongoing' as const,
    title: '検索作品',
    volumes: [],
  };
  const catalog: CatalogQueryPort = {
    async findWork(workId) {
      return workId === publicWork.id ? publicWork : null;
    },
    async listCatchUpEntries() {
      return [];
    },
    async searchWorkIds(query) {
      return query.query === '検索作品' ? [publicWork.id] : [];
    },
  };
  const policies: SourcePolicyQueryPort = {
    async canCollect() {
      return true;
    },
    async classifyAgeRating() {
      return 'public';
    },
    async findLatestPolicy() {
      return null;
    },
    async listPublicPublicationIds() {
      return ['publication-public'];
    },
  };

  test('searches and returns only policy-approved publications through Hono RPC', async () => {
    const publicApp = createApp({ catalog, sourcePolicies: policies });
    const client = hc<typeof publicApp>('http://api.test', { fetch: publicApp.request });
    const search = await client.api.catalog.works.$get({
      query: { q: '検索作品', sort: 'recent' },
    });

    expect(search.status).toBe(200);
    expect(search.headers.get('cache-control')).toContain('s-maxage');
    expect(await search.json()).toMatchObject({
      works: [{ work: { id: 'work-1', publications: [{ id: 'publication-public' }] } }],
    });

    const detail = await client.api.catalog.works[':workId'].$get({
      param: { workId: publicWork.id },
    });
    expect(detail.status).toBe(200);
    expect(await detail.json()).toMatchObject({
      work: { id: publicWork.id, publications: [{ id: 'publication-public' }] },
    });
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

describe('library RPC', () => {
  test('requires an active session and sends reading commands through Hono RPC', async () => {
    const calls: string[] = [];
    const library: LibraryRepository = {
      async deleteContentReadRecords(_context, _userUuid, ids) {
        calls.push(`delete-content:${ids.join(',')}`);
      },
      async deletePublicationReadRecords(_context, _userUuid, ids) {
        calls.push(`delete-entry:${ids.join(',')}`);
      },
      async findLibraryEntry() {
        return null;
      },
      async findWorkReadModel() {
        return {
          catchUpContentUnitIds: ['unit-1'],
          contentUnits: [{ id: 'unit-1', position: 1 }],
          mappings: [{ confirmed: true, contentUnitId: 'unit-1', publicationEntryId: 'entry-1' }],
          publicationEntryIds: ['entry-1'],
          workId: 'work-1',
        };
      },
      async listReadContentUnitIds() {
        return [];
      },
      async saveContentReadRecords(_context, records) {
        calls.push(`content:${records.map((record) => record.contentUnitId).join(',')}`);
      },
      async saveLibraryEntry(_context, entry) {
        calls.push(`status:${entry.status}`);
      },
      async savePublicationReadRecords(_context, records) {
        calls.push(`entry:${records.map((record) => record.publicationEntryId).join(',')}`);
      },
    };
    const transactions: TransactionPort = {
      async transaction<T>(operation: (context: TransactionContext) => Promise<T>): Promise<T> {
        return operation(new TransactionContext());
      },
    };
    const protectedApp = createApp({
      library,
      transactions,
      async resolveSession() {
        return { accountStatus: 'active', email: 'reader@example.com', userUuid: 'reader' };
      },
    });
    const client = hc<typeof protectedApp>('http://api.test', { fetch: protectedApp.request });
    expect(
      (
        await client.api.library.status.$post({
          json: { status: 'reading', visibility: 'private', workId: 'work-1' },
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await client.api.library.reads.$post({
          json: { contentUnitIds: ['unit-1'], visibility: null, workId: 'work-1' },
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await client.api.library.reads.$delete({
          json: { contentUnitIds: ['unit-1'], workId: 'work-1' },
        })
      ).status,
    ).toBe(200);
    expect(calls).toEqual([
      'status:reading',
      'content:unit-1',
      'entry:entry-1',
      'delete-content:unit-1',
      'delete-entry:entry-1',
    ]);
  });
});

describe('volume library RPC', () => {
  test('requires an active session and keeps volume commands scoped to the caller', async () => {
    const calls: string[] = [];
    const volumeLibrary: VolumeLibraryRepository = {
      async findVolumeReadModel() {
        return {
          contentUnitIds: ['unit-1'],
          entryMappings: [],
          volumeEditionId: 'volume-1',
          volumeMappings: [],
          workId: 'work-1',
        };
      },
      async listUserVolumeRecords(userUuid) {
        calls.push(`list:${userUuid}`);
        return [];
      },
      async saveContentReadRecords() {},
      async savePublicationReadRecords() {},
      async saveUserVolumeRecord(_context, record) {
        calls.push(`record:${record.userUuid}:${record.ownsPaper}:${record.ownsDigital}`);
      },
      async saveVolumeContentMappingCorrection(_context, correction) {
        calls.push(`correction:${correction.userUuid}:${correction.contentUnitId}`);
      },
    };
    const transactions: TransactionPort = {
      async transaction<T>(operation: (context: TransactionContext) => Promise<T>): Promise<T> {
        return operation(new TransactionContext());
      },
    };
    const unauthenticated = createApp({ transactions, volumeLibrary });
    expect((await unauthenticated.request('/api/library/volumes')).status).toBe(401);

    const protectedApp = createApp({
      transactions,
      volumeLibrary,
      async resolveSession() {
        return { accountStatus: 'active', email: 'reader@example.com', userUuid: 'reader' };
      },
    });
    const client = hc<typeof protectedApp>('http://api.test', { fetch: protectedApp.request });
    expect((await client.api.library.volumes.$get()).status).toBe(200);
    expect(
      (
        await client.api.library.volumes.records.$put({
          json: {
            memoContentUnitId: 'unit-1',
            ownsDigital: true,
            ownsPaper: true,
            status: 'read',
            visibility: 'private',
            volumeEditionId: 'volume-1',
          },
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await client.api.library.volumes['mapping-corrections'].$post({
          json: {
            contentUnitId: 'unit-1',
            rationale: '巻の収録話を確認しました。',
            suggestedStatus: 'confirmed',
            volumeEditionId: 'volume-1',
          },
        })
      ).status,
    ).toBe(200);
    expect(calls).toEqual(['list:reader', 'record:reader:true:true', 'correction:reader:unit-1']);
  });
});

describe('follow settings RPC', () => {
  test('requires an active session and replaces only the caller settings through Hono RPC', async () => {
    const calls: string[] = [];
    const follow: FollowRepository = {
      async findFollowSettings() {
        return null;
      },
      async listSourcePreferences() {
        return [];
      },
      async listSubscriptionPublicationIds() {
        return [];
      },
      async replaceSourcePreferences(_context, userUuid, sourceIds) {
        calls.push(`sources:${userUuid}:${sourceIds.join(',')}`);
        return sourceIds.map((sourceId, position) => ({ position, sourceId, userUuid }));
      },
      async replaceSubscriptionPublications(_context, userUuid, workId, publicationIds) {
        calls.push(`publications:${userUuid}:${workId}:${publicationIds.join(',')}`);
        return publicationIds.map((publicationId) => ({ publicationId, userUuid, workId }));
      },
      async saveFollowSettings(_context, settings) {
        calls.push(`mode:${settings.userUuid}:${settings.workId}:${settings.mode}`);
      },
    };
    const transactions: TransactionPort = {
      async transaction<T>(operation: (context: TransactionContext) => Promise<T>): Promise<T> {
        return operation(new TransactionContext());
      },
    };
    const unauthenticated = createApp({ follow, transactions });
    expect(
      (
        await unauthenticated.request('/api/settings/source-preferences', {
          body: JSON.stringify({ sourceIds: [] }),
          headers: { 'content-type': 'application/json' },
          method: 'PUT',
        })
      ).status,
    ).toBe(401);

    const protectedApp = createApp({
      follow,
      transactions,
      async resolveSession() {
        return { accountStatus: 'active', email: 'reader@example.com', userUuid: 'reader' };
      },
    });
    const client = hc<typeof protectedApp>('http://api.test', { fetch: protectedApp.request });
    expect(
      (
        await client.api.settings['source-preferences'].$put({
          json: { sourceIds: ['source-b', 'source-a'] },
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await client.api.settings.follows.$put({
          json: {
            mode: 'selected_publications',
            publicationIds: ['publication-1'],
            workId: 'work-1',
          },
        })
      ).status,
    ).toBe(200);
    expect(calls).toEqual([
      'sources:reader:source-b,source-a',
      'mode:reader:work-1:selected_publications',
      'publications:reader:work-1:publication-1',
    ]);
  });
});
