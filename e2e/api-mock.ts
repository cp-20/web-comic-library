import type { Page, Route } from '@playwright/test';

type Json = Readonly<Record<string, unknown>>;

const json = async (route: Route, body: Json, status = 200): Promise<void> => {
  await route.fulfill({ contentType: 'application/json', body: JSON.stringify(body), status });
};

export const mockApi = async (page: Page): Promise<void> => {
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;

    if (path === '/api/catalog/works' && request.method() === 'GET') {
      await json(route, {
        works: [
          {
            latestUpdatedAt: '2026-07-28T00:00:00.000Z',
            work: {
              creators: [{ id: 'creator-1', name: '作者' }],
              id: 'work-1',
              serialStatus: 'ongoing',
              title: 'テスト作品',
            },
          },
        ],
      });
      return;
    }
    if (path === '/api/catalog/works/work-1' && request.method() === 'GET') {
      await json(route, {
        work: {
          creators: [{ id: 'creator-1', name: '作者', role: 'writer' }],
          publications: [],
          serialStatus: 'ongoing',
          title: 'テスト作品',
          volumes: [],
        },
      });
      return;
    }
    if (path === '/api/catalog/works/work-1/reviews' && request.method() === 'GET') {
      await json(route, {
        reviews: [
          {
            contentUnitId: 'content-1',
            createdAt: '2026-07-28T00:00:00.000Z',
            id: 'review-1',
            reactionCount: 0,
            spoiler: true,
            state: 'hidden',
            volumeEditionId: null,
          },
        ],
      });
      return;
    }
    if (
      path.startsWith('/api/reviews/') &&
      path.endsWith('/reveal') &&
      request.method() === 'POST'
    ) {
      await json(route, { body: '明示操作後だけ表示する感想本文' });
      return;
    }
    if (path === '/api/library/volumes' && request.method() === 'GET') {
      await json(route, { records: [] });
      return;
    }
    if (path === '/api/settings/follows/users' && request.method() === 'GET') {
      await json(route, { followers: [], following: [] });
      return;
    }
    if (path === '/api/profiles/reader-2' && request.method() === 'GET') {
      await json(route, { displayName: '別の読者', userId: 'reader-2' });
      return;
    }
    if (path === '/api/profiles/reader-2/block' && request.method() === 'POST') {
      await json(route, {});
      return;
    }
    if (path === '/api/reports' && request.method() === 'POST') {
      await json(route, { id: 'report-1' }, 201);
      return;
    }
    if (path === '/api/activities/activity-public/share' && request.method() === 'GET') {
      await json(route, {
        activity: {
          createdAt: '2026-07-28T00:00:00.000Z',
          kind: 'reading_status',
          status: 'reading',
          userId: 'reader-2',
          userName: '別の読者',
          workId: 'work-1',
          workTitle: 'テスト作品',
        },
      });
      return;
    }
    if (path === '/api/activities/activity-private/share' && request.method() === 'GET') {
      await json(route, { error: 'not_found' }, 404);
      return;
    }
    if (path === '/api/timeline' && request.method() === 'GET') {
      await json(route, {
        items: [
          {
            createdAt: '2026-07-28T00:00:00.000Z',
            id: 'activity-public',
            kind: 'reading_status',
            status: 'reading',
            userUuid: 'reader-2',
            workId: 'work-1',
          },
        ],
        nextCursor: null,
      });
      return;
    }
    if (path === '/api/admin/moderation/reports' && request.method() === 'GET') {
      await json(route, {
        items: [
          {
            id: 'report-1',
            reason: '公開範囲違反',
            status: 'open',
            targetId: 'activity-public',
            targetKind: 'activity',
          },
        ],
      });
      return;
    }
    if (
      path.startsWith('/api/admin/moderation/reports/') &&
      path.endsWith('/actions') &&
      request.method() === 'POST'
    ) {
      await json(route, { id: 'action-1' }, 201);
      return;
    }
    await json(route, {});
  });
};
