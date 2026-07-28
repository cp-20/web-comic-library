import { describe, expect, test } from 'bun:test';

import type {
  CatalogAuditRecord,
  AccountDataRepository,
  CatalogQueryPort,
  CatalogReviewItem,
  EmailDigestSettingsRepository,
  FollowRepository,
  LibraryRepository,
  NotificationRepository,
  ProfileIconStorage,
  SessionAssuranceRepository,
  SocialRepository,
  SourcePolicyQueryPort,
  TransactionPort,
  JobQueuePort,
  VolumeLibraryRepository,
  WebPushSubscriptionRepository,
} from '@web-comic-library/application';
import { TransactionContext } from '@web-comic-library/application';
import type { AuthAdapter } from '@web-comic-library/auth';
import type { ReviewActivity } from '@web-comic-library/domain';
import { hc } from 'hono/client';

import {
  app,
  createApp,
  type ApiType,
  type CatalogAdminController,
  type ModerationController,
} from './app';

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

describe('account data and HTTP security', () => {
  test('queues a private export, rejects cookie CSRF, rate limits reports, and sends security headers', async () => {
    const repository: AccountDataRepository = {
      async buildDataExport() {
        return { profile: { displayName: 'reader' } };
      },
      async createDataExport(_context, input) {
        return { expiresAt: input.expiresAt, id: input.id, payload: null, status: 'queued' };
      },
      async findDataExport(_userUuid, id) {
        return {
          expiresAt: new Date('2026-08-01T00:00:00Z'),
          id,
          payload: { profile: { displayName: 'reader' } },
          status: 'ready',
        };
      },
      async markDataExportReady() {
        return true;
      },
      async purgeDueAccounts() {
        return [];
      },
      async purgeExpiredDataExports() {},
      async requestAccountDeletion() {},
    };
    const jobs: JobQueuePort = {
      async enqueue() {
        return 'queued';
      },
    };
    const transactions: TransactionPort = {
      async transaction<T>(operation: (context: TransactionContext) => Promise<T>): Promise<T> {
        return operation(new TransactionContext());
      },
    };
    const protectedApp = createApp({
      accountData: repository,
      jobs,
      transactions,
      async resolveSession() {
        return {
          accountStatus: 'active',
          assurance: 'none',
          email: 'reader@example.com',
          userUuid: '11111111-1111-4111-8111-111111111111',
        };
      },
    });
    const csrfRejected = await protectedApp.request('/api/settings/data-exports', {
      headers: { cookie: 'session=value' },
      method: 'POST',
    });
    expect(csrfRejected.status).toBe(403);
    const exportResponse = await protectedApp.request('/api/settings/data-exports', {
      method: 'POST',
    });
    expect(exportResponse.status).toBe(202);
    expect(exportResponse.headers.get('content-security-policy')).toContain(
      "frame-ancestors 'none'",
    );
    const body: Readonly<{ downloadUrl: string }> = await exportResponse.json();
    const downloaded = await protectedApp.request(body.downloadUrl);
    expect(downloaded.status).toBe(200);
    expect(await downloaded.json()).toEqual({ profile: { displayName: 'reader' } });

    const reports = Array.from({ length: 6 }, () =>
      protectedApp.request('/api/reports', {
        body: JSON.stringify({
          reason: 'plain text',
          targetId: 'activity-1',
          targetKind: 'activity',
        }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      }),
    );
    const results = await Promise.all(reports);
    expect(results[5]?.status).toBe(429);
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

  test('rejects unauthenticated, non-administrator, and weak-session callers', async () => {
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

    const weakAdmin = createApp({
      catalogAdmin: controller,
      async resolveCatalogAdmin() {
        return { assurance: 'none', id: 'admin-1', role: 'administrator' };
      },
    });
    expect((await weakAdmin.request('/api/admin/catalog/review-items')).status).toBe(403);
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

describe('moderation RPC', () => {
  const report = {
    createdAt: new Date('2026-07-27T00:00:00Z'),
    id: '11111111-1111-4111-8111-111111111111',
    reason: 'plain text report',
    reporterUserUuid: 'reporter-1',
    status: 'open' as const,
    targetId: 'activity-1',
    targetKind: 'activity' as const,
    updatedAt: new Date('2026-07-27T00:00:00Z'),
  };
  const controller: ModerationController = {
    async block() {
      return true;
    },
    async listActions() {
      return [];
    },
    async listReports() {
      return { items: [report] };
    },
    async moderate(input) {
      return {
        action: input.action,
        actorUserUuid: input.actor.id,
        after: {},
        before: {},
        createdAt: new Date('2026-07-27T00:00:00Z'),
        id: 'action-1',
        reason: input.reason,
        reportId: input.reportId,
        targetId: input.targetId,
        targetKind: input.targetKind,
      };
    },
    async mute() {
      return true;
    },
    async report(input) {
      return { ...report, ...input };
    },
    async unblock() {
      return true;
    },
    async unmute() {
      return true;
    },
  };

  test('allows a moderator to inspect and hide a report but reserves suspension and restoration for administrators', async () => {
    const moderatorApp = createApp({
      moderation: controller,
      async resolveCatalogAdmin() {
        return { assurance: 'none', id: 'moderator-1', role: 'moderator' };
      },
    });
    expect((await moderatorApp.request('/api/admin/moderation/reports')).status).toBe(200);
    const hidden = await moderatorApp.request(
      `/api/admin/moderation/reports/${report.id}/actions`,
      {
        body: JSON.stringify({
          action: 'hide',
          reason: 'policy violation',
          targetId: 'activity-1',
          targetKind: 'activity',
        }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      },
    );
    expect(hidden.status).toBe(200);
    const suspended = await moderatorApp.request(
      `/api/admin/moderation/reports/${report.id}/actions`,
      {
        body: JSON.stringify({
          action: 'suspend',
          reason: 'repeat violation',
          targetId: 'profile-1',
          targetKind: 'profile',
        }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      },
    );
    expect(suspended.status).toBe(403);
    const restored = await moderatorApp.request(
      `/api/admin/moderation/reports/${report.id}/actions`,
      {
        body: JSON.stringify({
          action: 'restore',
          reason: 'restoration request',
          targetId: 'profile-1',
          targetKind: 'profile',
        }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      },
    );
    expect(restored.status).toBe(403);
  });

  test('rejects regular users and accepts an authenticated plain text report', async () => {
    const regularApp = createApp({
      moderation: controller,
      async resolveCatalogAdmin() {
        return { assurance: 'none', id: 'reader-1', role: 'user' };
      },
      async resolveSession() {
        return {
          accountStatus: 'active',
          assurance: 'none',
          email: 'reader@example.test',
          userUuid: 'reporter-1',
        };
      },
    });
    expect((await regularApp.request('/api/admin/moderation/reports')).status).toBe(403);
    const submitted = await regularApp.request('/api/reports', {
      body: JSON.stringify({
        reason: 'plain text report',
        targetId: 'activity-1',
        targetKind: 'activity',
      }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });
    expect(submitted.status).toBe(201);
    expect(await submitted.json()).toMatchObject({ reporterUserUuid: 'reporter-1' });
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
    async resolveCollectableSourceId() {
      return null;
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
    async isBlockedEitherDirection() {
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
        return {
          accountStatus: 'disabled',
          assurance: 'none',
          email: 'reader@example.com',
          userUuid: 'reader',
        };
      },
    });
    expect((await privateApp.request('/api/profiles/reader-01')).status).toBe(404);
    expect((await privateApp.request('/api/session')).status).toBe(401);
  });

  test('requires a session to update a profile and uses Hono RPC input validation', async () => {
    const protectedApp = createApp({
      identity,
      async resolveSession() {
        return {
          accountStatus: 'active',
          assurance: 'none',
          email: 'reader@example.com',
          userUuid: 'reader',
        };
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
      async isBlockedEitherDirection() {
        return false;
      },
      async saveProfile(input: typeof profile) {
        saved = input;
        return input;
      },
    };
    const session = {
      accountStatus: 'active' as const,
      assurance: 'none' as const,
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
        return {
          accountStatus: 'active',
          assurance: 'none',
          email: 'reader@example.com',
          userUuid: 'reader',
        };
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
  test('starts Google login, rejects the removed magic-link route, and signs out', async () => {
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
      async sessionToken() {
        return null;
      },
    };
    const protectedApp = createApp({ auth });
    const client = hc<typeof protectedApp>('http://api.test', { fetch: protectedApp.request });

    expect((await client.api.login.google.$post()).status).toBe(200);
    expect((await protectedApp.request('/api/login/magic-link', { method: 'POST' })).status).toBe(
      404,
    );
    expect(
      (
        await protectedApp.request('/api/logout', {
          headers: { cookie: 'session=value' },
          method: 'POST',
        })
      ).status,
    ).toBe(200);

    expect(requests.map((request) => new URL(request.url).pathname)).toEqual([
      '/api/auth/sign-in/social',
      '/api/auth/sign-out',
    ]);
    expect(await requests[0]?.json()).toEqual({
      callbackURL: '/settings/profile',
      provider: 'google',
    });
    expect(requests[1]?.headers.get('cookie')).toBe('session=value');
  });

  test('enrolls and verifies TOTP only through the RPC routes, without exposing a session token', async () => {
    const requests: Request[] = [];
    const recordedTokens: string[] = [];
    const assurances: SessionAssuranceRepository = {
      async recordTwoFactorAssurance(sessionToken) {
        recordedTokens.push(sessionToken);
        return true;
      },
    };
    const auth: AuthAdapter = {
      async close() {},
      async handler(request) {
        requests.push(request);
        const path = new URL(request.url).pathname;
        if (path === '/api/auth/two-factor/enable') {
          return new Response(
            JSON.stringify({ backupCodes: ['backup-1'], totpURI: 'otpauth://totp/reader' }),
            { headers: { 'content-type': 'application/json' }, status: 200 },
          );
        }
        if (path === '/api/auth/two-factor/verify-totp') {
          return new Response(JSON.stringify({ token: 'session-token' }), {
            headers: {
              'content-type': 'application/json',
              'set-cookie': 'better-auth.session_token=rotated; HttpOnly; SameSite=Lax',
            },
            status: 200,
          });
        }
        return new Response(null, { status: 404 });
      },
      async sessionToken() {
        return 'verified-session';
      },
    };
    const protectedApp = createApp({ auth, sessionAssurances: assurances });
    const client = hc<typeof protectedApp>('http://api.test', { fetch: protectedApp.request });

    const enrollment = await client.api.settings['two-factor'].enable.$post({
      json: { issuer: 'Web Comic Library' },
    });
    expect(enrollment.status).toBe(200);
    expect(await enrollment.json()).toEqual({
      backupCodes: ['backup-1'],
      totpURI: 'otpauth://totp/reader',
    });

    const verified = await client.api.settings['two-factor'].verify.$post({
      json: { code: '123456' },
    });
    expect(verified.status).toBe(200);
    expect(await verified.json()).toEqual({ status: 'verified' });
    expect(verified.headers.get('set-cookie')).toContain('better-auth.session_token=rotated');
    expect(recordedTokens).toEqual(['verified-session']);
    expect(requests.map((request) => new URL(request.url).pathname)).toEqual([
      '/api/auth/two-factor/enable',
      '/api/auth/two-factor/verify-totp',
    ]);
    expect(await requests[0]?.json()).toEqual({ issuer: 'Web Comic Library' });
    expect(await requests[1]?.json()).toEqual({ code: '123456' });
    expect((await protectedApp.request('/api/auth/two-factor/verify-totp')).status).toBe(404);
  });

  test('fails closed when an authenticated TOTP verification cannot be recorded', async () => {
    const auth: AuthAdapter = {
      async close() {},
      async handler() {
        return new Response(JSON.stringify({ token: 'session-token' }), {
          headers: {
            'content-type': 'application/json',
            'set-cookie': 'better-auth.session_token=rotated; HttpOnly; SameSite=Lax',
          },
          status: 200,
        });
      },
      async sessionToken() {
        return 'verified-session';
      },
    };
    const protectedApp = createApp({
      auth,
      sessionAssurances: {
        async recordTwoFactorAssurance() {
          return false;
        },
      },
    });
    const client = hc<typeof protectedApp>('http://api.test', { fetch: protectedApp.request });
    const response = await client.api.settings['two-factor'].verify.$post({
      json: { code: '123456' },
    });

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'assurance_unavailable' });
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
        return {
          accountStatus: 'active',
          assurance: 'none',
          email: 'reader@example.com',
          userUuid: 'reader',
        };
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
        return {
          accountStatus: 'active',
          assurance: 'none',
          email: 'reader@example.com',
          userUuid: 'reader',
        };
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

describe('notification RPC', () => {
  test('requires an active session and scopes listing and read commands to the caller', async () => {
    const calls: string[] = [];
    const notifications: NotificationRepository = {
      async findFollowSettings() {
        return null;
      },
      async findNotificationPreference() {
        return null;
      },
      async findReleaseEvent() {
        return null;
      },
      async listNotifications(userUuid) {
        calls.push(`list:${userUuid}`);
        return { items: [], nextCursor: null };
      },
      async listSourcePreferences() {
        return [];
      },
      async listSubscriptionPublicationIds() {
        return [];
      },
      async listWorkFollowSettings() {
        return [];
      },
      async markAllNotificationsRead(_context, userUuid) {
        calls.push(`all:${userUuid}`);
      },
      async markNotificationRead(_context, userUuid, notificationId) {
        calls.push(`read:${userUuid}:${notificationId}`);
        return true;
      },
      async replaceSourcePreferences() {
        return [];
      },
      async replaceSubscriptionPublications() {
        return [];
      },
      async saveFollowSettings() {},
      async saveNotification() {
        return false;
      },
      async saveNotificationPreference(_context, preference) {
        calls.push(`preference:${preference.userUuid}:${preference.kind}:${preference.enabled}`);
      },
      async unreadNotificationCount(userUuid) {
        calls.push(`unread:${userUuid}`);
        return 0;
      },
    };
    const transactions: TransactionPort = {
      async transaction<T>(operation: (context: TransactionContext) => Promise<T>): Promise<T> {
        return operation(new TransactionContext());
      },
    };
    const unauthenticated = createApp({ notifications, transactions });
    expect((await unauthenticated.request('/api/notifications')).status).toBe(401);
    const protectedApp = createApp({
      notifications,
      transactions,
      async resolveSession() {
        return {
          accountStatus: 'active',
          assurance: 'none',
          email: 'reader@example.com',
          userUuid: 'reader',
        };
      },
    });
    const client = hc<typeof protectedApp>('http://api.test', { fetch: protectedApp.request });
    expect((await client.api.notifications.$get({ query: {} })).status).toBe(200);
    expect((await client.api.notifications['read-all'].$post()).status).toBe(200);
    const notificationId = 'c92dcb09-ccff-4f7c-8a4f-8f28780df7ad';
    expect(
      (await client.api.notifications[':id'].read.$post({ param: { id: notificationId } })).status,
    ).toBe(200);
    expect(
      (
        await client.api.settings['notification-preferences'].$put({
          json: { channel: 'in_app', enabled: false, kind: 'new_episode' },
        })
      ).status,
    ).toBe(200);
    expect(calls).toEqual([
      'list:reader',
      'unread:reader',
      'all:reader',
      `read:reader:${notificationId}`,
      'preference:reader:new_episode:false',
    ]);
  });
});

describe('web push subscription RPC', () => {
  test('requires the active session and scopes registration and removal to it', async () => {
    const calls: string[] = [];
    const subscriptions: WebPushSubscriptionRepository = {
      async deactivateWebPushSubscription(_context, userUuid, endpoint) {
        calls.push(`remove:${userUuid}:${endpoint}`);
        return true;
      },
      async saveWebPushSubscription(_context, subscription) {
        calls.push(`save:${subscription.userUuid}:${subscription.endpoint}`);
      },
    };
    const transactions: TransactionPort = {
      async transaction<T>(operation: (context: TransactionContext) => Promise<T>): Promise<T> {
        return operation(new TransactionContext());
      },
    };
    const protectedApp = createApp({
      transactions,
      webPushPublicKey: 'public-key',
      webPushSubscriptions: subscriptions,
      async resolveSession() {
        return {
          accountStatus: 'active',
          assurance: 'none',
          email: 'reader@example.com',
          userUuid: 'reader',
        };
      },
    });
    const client = hc<typeof protectedApp>('http://api.test', { fetch: protectedApp.request });
    expect((await client.api.push.config.$get()).status).toBe(200);
    expect(
      (
        await client.api.settings['push-subscriptions'].$put({
          json: { auth: 'auth', endpoint: 'https://push.example.test/subscription', p256dh: 'key' },
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await client.api.settings['push-subscriptions'].$delete({
          json: { endpoint: 'https://push.example.test/subscription' },
        })
      ).status,
    ).toBe(200);
    expect(calls).toEqual([
      'save:reader:https://push.example.test/subscription',
      'remove:reader:https://push.example.test/subscription',
    ]);
  });
});

describe('email digest RPC', () => {
  test('requires the active session and scopes settings and unsubscribe to it', async () => {
    const calls: string[] = [];
    const digests: EmailDigestSettingsRepository = {
      async recordEmailDigestFeedback() {},
      async saveEmailDigestSettings(_context, settings) {
        calls.push(
          `save:${settings.userUuid}:${settings.enabled}:${settings.timezone}:${settings.sendTime}`,
        );
      },
      async unsubscribeEmailDigest(_context, userUuid) {
        calls.push(`unsubscribe:${userUuid}`);
      },
    };
    const transactions: TransactionPort = {
      async transaction<T>(operation: (context: TransactionContext) => Promise<T>): Promise<T> {
        return operation(new TransactionContext());
      },
    };
    const unauthenticated = createApp({ emailDigests: digests, transactions });
    expect(
      (
        await unauthenticated.request('/api/settings/email-digest', {
          body: JSON.stringify({ enabled: true, sendTime: '09:00', timezone: 'Asia/Tokyo' }),
          headers: { 'content-type': 'application/json' },
          method: 'PUT',
        })
      ).status,
    ).toBe(401);
    const protectedApp = createApp({
      emailDigests: digests,
      transactions,
      async resolveSession() {
        return {
          accountStatus: 'active',
          assurance: 'none',
          email: 'reader@example.com',
          userUuid: 'reader',
        };
      },
    });
    const client = hc<typeof protectedApp>('http://api.test', { fetch: protectedApp.request });
    expect(
      (
        await client.api.settings['email-digest'].$put({
          json: { enabled: true, sendTime: '09:00', timezone: 'Asia/Tokyo' },
        })
      ).status,
    ).toBe(200);
    expect((await client.api.settings['email-digest'].unsubscribe.$post()).status).toBe(200);
    expect(calls).toEqual(['save:reader:true:Asia/Tokyo:09:00', 'unsubscribe:reader']);
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
        return {
          accountStatus: 'active',
          assurance: 'none',
          email: 'reader@example.com',
          userUuid: 'reader',
        };
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

describe('review RPC', () => {
  test('uses Hono RPC to omit a spoiler body until reveal and reject duplicate reactions', async () => {
    const reviews = new Map<string, ReviewActivity>();
    const social: SocialRepository = {
      async createReadingActivity() {
        throw new Error('not used');
      },
      async createReviewActivity(_context, input) {
        const review: ReviewActivity = {
          ...input,
          createdAt: new Date('2026-07-27T00:00:00Z'),
          id: '11111111-1111-4111-8111-111111111111',
          kind: 'review',
          updatedAt: new Date('2026-07-27T00:00:00Z'),
        };
        reviews.set(review.id, review);
        return review;
      },
      async deleteFollow() {},
      async deleteReaction() {
        return false;
      },
      async deleteReviewActivity() {
        return false;
      },
      async findFollow() {
        return null;
      },
      async findFollowTarget() {
        return null;
      },
      async findPublicActivityShare() {
        return null;
      },
      async findReviewActivity(id) {
        return reviews.get(id) ?? null;
      },
      async findUserUuidByPublicId() {
        return null;
      },
      async isBlockedEitherDirection() {
        return false;
      },
      async listFollowers() {
        return [];
      },
      async listFollowing() {
        return [];
      },
      async listReviewActivities() {
        return [...reviews.values()].map((review) => ({ reactionCount: 0, review }));
      },
      async listReviewReadState() {
        return { readContentUnitIds: [], readVolumeEditionIds: [] };
      },
      async listTimeline() {
        return { items: [], nextCursor: null };
      },
      async saveFollow(_context, follow) {
        return follow;
      },
      async saveReaction() {
        return false;
      },
      async updateReviewActivity() {
        return null;
      },
    };
    const transactions: TransactionPort = {
      async transaction<T>(operation: (context: TransactionContext) => Promise<T>): Promise<T> {
        return operation(new TransactionContext());
      },
    };
    const protectedApp = createApp({
      social,
      transactions,
      async resolveSession() {
        return {
          accountStatus: 'active',
          assurance: 'none',
          email: 'reader@example.com',
          userUuid: 'reader',
        };
      },
    });
    const client = hc<typeof protectedApp>('http://api.test', { fetch: protectedApp.request });
    const workId = '22222222-2222-4222-8222-222222222222';
    const contentUnitId = '33333333-3333-4333-8333-333333333333';
    const created = await client.api.reviews.$post({
      json: {
        body: 'spoiler text',
        contentUnitId,
        spoiler: true,
        visibility: 'public',
        volumeEditionId: null,
        workId,
      },
    });
    expect(created.status).toBe(201);
    const publicApp = createApp({ social });
    const publicClient = hc<typeof publicApp>('http://api.test', { fetch: publicApp.request });
    const listed = await publicClient.api.catalog.works[':workId'].reviews.$get({
      param: { workId },
      query: { contentUnitId },
    });
    expect(await listed.json()).toEqual({
      reviews: [
        expect.objectContaining({ id: '11111111-1111-4111-8111-111111111111', state: 'hidden' }),
      ],
    });
    expect(
      (
        await client.api.reviews[':id'].reveal.$post({
          param: { id: '11111111-1111-4111-8111-111111111111' },
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await client.api.reviews[':id'].reactions.$post({
          param: { id: '11111111-1111-4111-8111-111111111111' },
        })
      ).status,
    ).toBe(200);
  });
});
