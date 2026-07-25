import { describe, expect, test } from 'bun:test';

import { readConnectorFixture } from './fixture';
import { ConnectorHttpClient } from './http-client';
import {
  NiconicoConnector,
  NiconicoExcludedPublicationError,
  classifyNiconicoPublication,
  niconicoConfig,
  niconicoRecheckSchedule,
  parseNiconicoListPage,
  parseNiconicoPublicationPage,
  selectNiconicoCrawlQueue,
} from './niconico';
import { ConnectorValidationError } from './validation';

describe('niconico fixture parsers', () => {
  test('extracts list metadata and 45 public episodes without duplicates', async () => {
    const [listFixture, publicationFixture] = await Promise.all([
      readConnectorFixture('niconico-list-page-1.html'),
      readConnectorFixture('niconico-publication.html'),
    ]);
    const page = parseNiconicoListPage(listFixture, niconicoConfig);
    const item = page.items[0];

    if (!item) {
      throw new Error('fixture list item is required');
    }

    const candidate = parseNiconicoPublicationPage(
      publicationFixture,
      niconicoConfig,
      item,
      new Map(),
      new Date('2026-07-25T00:00:00Z'),
    );

    expect(page.nextPage).toBe(2);
    expect(item).toMatchObject({
      author: '作者100',
      externalId: '100',
      serialStatusText: '46話 無料',
      title: '作品100',
      url: 'https://manga.nicovideo.jp/comic/100',
    });
    expect(candidate).toMatchObject({
      authors: ['作者100'],
      externalId: '100',
      kind: 'official',
      kindEvidence: 'https://manga.nicovideo.jp/official/nicomanga',
      serialStatus: 'ongoing',
      title: '作品100',
    });
    expect(candidate.entries).toHaveLength(45);
    expect(new Set(candidate.entries.map((entry) => entry.externalId)).size).toBe(45);
    expect(candidate.entries[0]).toMatchObject({
      externalId: 'mg1001',
      kind: 'regular',
      url: 'https://manga.nicovideo.jp/watch/mg1001',
    });
    expect(candidate.entries.at(-1)).toMatchObject({
      externalId: 'mg1045',
      kind: 'extra',
    });
  });

  test('uses only explicit evidence for official and user-submission classification', async () => {
    const publicationFixture = await readConnectorFixture('niconico-publication.html');
    const unknownFixture = publicationFixture.replace(
      '<a href="/official/nicomanga">ニコニコ漫画（公式）</a>',
      '<a href="/manga/">青年マンガ</a>',
    );

    expect(
      classifyNiconicoPublication(publicationFixture, niconicoConfig, '100', new Map()),
    ).toEqual({
      evidenceUrl: 'https://manga.nicovideo.jp/official/nicomanga',
      kind: 'official',
    });
    expect(classifyNiconicoPublication(unknownFixture, niconicoConfig, '100', new Map())).toEqual({
      evidenceUrl: null,
      kind: 'unknown',
    });
    expect(
      classifyNiconicoPublication(
        unknownFixture,
        niconicoConfig,
        '100',
        new Map([['100', 'https://evidence.example/reviews/100']]),
      ),
    ).toEqual({
      evidenceUrl: 'https://evidence.example/reviews/100',
      kind: 'user_submission',
    });
  });

  test('fails closed on missing list fields, changed episode links, and access gates', async () => {
    const [listFixture, publicationFixture] = await Promise.all([
      readConnectorFixture('niconico-list-page-1.html'),
      readConnectorFixture('niconico-publication.html'),
    ]);
    const item = parseNiconicoListPage(listFixture, niconicoConfig).items[0];

    if (!item) {
      throw new Error('fixture list item is required');
    }

    expect(() =>
      parseNiconicoListPage(listFixture.replace('date updated', 'date changed'), niconicoConfig),
    ).toThrow(ConnectorValidationError);
    expect(() =>
      parseNiconicoListPage(
        listFixture.replace('2026/07/25 更新', '2026/02/31 更新'),
        niconicoConfig,
      ),
    ).toThrow(ConnectorValidationError);
    expect(() =>
      parseNiconicoPublicationPage(
        publicationFixture.replace('/watch/mg1001', '/viewer/mg1001'),
        niconicoConfig,
        item,
        new Map(),
        new Date('2026-07-25T00:00:00Z'),
      ),
    ).toThrow(ConnectorValidationError);
    expect(() =>
      parseNiconicoPublicationPage(
        publicationFixture.replace('<body>', '<body><div class="age-gate"></div>'),
        niconicoConfig,
        item,
        new Map(),
        new Date('2026-07-25T00:00:00Z'),
      ),
    ).toThrow(NiconicoExcludedPublicationError);
  });
});

test('niconico recheck schedule distinguishes active, hiatus, and completed works', () => {
  const now = new Date('2026-07-25T00:00:00Z');

  expect(niconicoRecheckSchedule(new Date('2026-07-24T00:00:00Z'), '3話 無料', now)).toEqual({
    nextCheckAt: new Date('2026-07-26T00:00:00Z'),
    serialStatus: 'ongoing',
  });
  expect(niconicoRecheckSchedule(new Date('2025-07-01T00:00:00Z'), '3話 無料', now)).toEqual({
    nextCheckAt: new Date('2026-08-24T00:00:00Z'),
    serialStatus: 'hiatus',
  });
  expect(niconicoRecheckSchedule(new Date('2026-07-24T00:00:00Z'), '完結 3話', now)).toEqual({
    nextCheckAt: new Date('2026-10-23T00:00:00Z'),
    serialStatus: 'completed',
  });
});

test('normal crawl reaches its watermark and backfill resumes behind normal work', async () => {
  const [pageOne, pageTwo] = await Promise.all([
    readConnectorFixture('niconico-list-page-1.html'),
    readConnectorFixture('niconico-list-page-2.html'),
  ]);
  const requests: string[] = [];
  let origin = '';
  const server = Bun.serve({
    port: 0,
    fetch(request) {
      const url = new URL(request.url);
      requests.push(`${url.pathname}?${url.searchParams.toString()}`);

      if (url.pathname === '/manga/list') {
        return new Response(url.searchParams.get('page') === '2' ? pageTwo : pageOne, {
          headers: { 'content-type': 'text/html' },
        });
      }

      const comicId = url.pathname.match(/^\/comic\/(\d+)$/u)?.[1];

      if (comicId) {
        if (comicId === '103') {
          return new Response('deleted', { status: 404 });
        }

        return new Response(
          `<ul class="sg_pankuzu"><li><a href="/manga/">マンガ</a></li></ul>
           <div class="main_title"><h1>作品${comicId}</h1><div class="author"><h3>作者:作者${comicId}</h3></div></div>
           <ul><li class="episode_item"><div class="description"><div class="title"><a href="/watch/mg${comicId}01">第1話</a></div></div><span class="status">9 ページ</span></li></ul>
           <img src="${origin}/image/${comicId}.jpg">`,
          { headers: { 'content-type': 'text/html' } },
        );
      }

      return new Response('not found', { status: 404 });
    },
  });
  origin = server.url.origin;
  const config = {
    allowedHosts: [server.url.host],
    baseUrl: `${origin}/`,
    createdListUrl: `${origin}/manga/list?sort=manga_created`,
    maxUpdatedPages: 3,
    updatedListUrl: `${origin}/manga/list?sort=manga_updated`,
  };
  const connector = new NiconicoConnector(
    config,
    new ConnectorHttpClient({
      allowedHosts: config.allowedHosts,
      jitterMs: 0,
      maxAttempts: 1,
      minIntervalMs: 0,
    }),
    { now: () => new Date('2026-07-25T00:00:00Z') },
  );
  const sourceId = crypto.randomUUID();

  try {
    const normal = await connector.discover({
      checkpoint: { mode: 'updated', page: 1, watermark: '102' },
      sourceId,
    });

    expect(normal.candidates.map((candidate) => candidate.externalId)).toEqual(['100', '101']);
    expect(normal.checkpoint).toEqual({ mode: 'updated', page: 1, watermark: '100' });
    expect(requests.some((request) => request.startsWith('/comic/102?'))).toBe(false);
    const repeated = await connector.discover({
      checkpoint: normal.checkpoint,
      sourceId,
    });
    expect(repeated.candidates).toEqual([]);
    await expect(
      connector.discover({
        checkpoint: { mode: 'updated', page: 1, watermark: '999' },
        sourceId,
      }),
    ).rejects.toBeInstanceOf(ConnectorValidationError);

    const firstBackfill = await connector.discoverBackfill({ checkpoint: null, sourceId });
    const resumedBackfill = await connector.discoverBackfill({
      checkpoint: firstBackfill.checkpoint,
      sourceId,
    });
    const completedBackfill = await connector.discoverBackfill({
      checkpoint: resumedBackfill.checkpoint,
      sourceId,
    });

    expect(firstBackfill.candidates.map((candidate) => candidate.externalId)).toEqual([
      '100',
      '101',
    ]);
    expect(resumedBackfill.candidates.map((candidate) => candidate.externalId)).toEqual(['102']);
    expect(completedBackfill.candidates).toEqual([]);
    expect(selectNiconicoCrawlQueue(true, true)).toBe('normal');
    expect(selectNiconicoCrawlQueue(false, true)).toBe('backfill');
    expect(requests.some((request) => request.includes('/image/'))).toBe(false);
  } finally {
    server.stop(true);
  }
});
