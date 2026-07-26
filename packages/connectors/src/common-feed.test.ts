import { describe, expect, test } from 'bun:test';

import {
  CommonFeedConnector,
  commonFeedSiteConfigs,
  parseCommonAtomFeed,
  parseCommonEpisodePage,
  parseCommonSeriesFeed,
} from './common-feed';
import { readConnectorFixture } from './fixture';
import { ConnectorHttpClient } from './http-client';
import { ConnectorValidationError } from './validation';

const sites = [
  {
    author: '作者A',
    episodeTitle: '第8話',
    config: commonFeedSiteConfigs.shonenJumpPlus,
    episode: 'https://shonenjumpplus.com/episode/1008',
    prefix: 'shonen-jump-plus',
    title: '作品A',
  },
  {
    author: '作者B',
    episodeTitle: '第92話',
    config: commonFeedSiteConfigs.comicDays,
    episode: 'https://comic-days.com/episode/2092',
    prefix: 'comic-days',
    title: '作品B',
  },
  {
    author: '作者C',
    episodeTitle: '第59話',
    config: commonFeedSiteConfigs.tonariNoYoungJump,
    episode: 'https://tonarinoyj.jp/episode/3059',
    prefix: 'tonari-no-young-jump',
    title: '作品C',
  },
] as const;

describe('common feed fixture parsers', () => {
  for (const site of sites) {
    test(`extracts ${site.config.name} Atom, episode HTML, and series RSS`, async () => {
      const [atomFixture, episodeFixture, seriesFixture] = await Promise.all([
        readConnectorFixture(`${site.prefix}-atom.xml`),
        readConnectorFixture(`${site.prefix}-episode.html`),
        readConnectorFixture(`${site.prefix}-series.xml`),
      ]);
      const atom = parseCommonAtomFeed(atomFixture, site.config);
      const repeated = parseCommonAtomFeed(atomFixture, site.config);
      const page = parseCommonEpisodePage(episodeFixture, site.config);
      const series = parseCommonSeriesFeed(seriesFixture, site.config);

      expect(atom.entries[0]).toMatchObject({
        author: site.author,
        externalKey: site.episode,
        url: site.episode,
      });
      expect(repeated.entries[0]?.externalKey).toBe(atom.entries[0]?.externalKey);
      expect(page).toMatchObject({
        author: site.author,
        episodeTitle: site.episodeTitle,
        workTitle: site.title,
      });
      expect(series.entries.map((entry) => entry.kind)).toEqual(['regular', 'extra', 'unknown']);
      expect(series.entries[0]).toMatchObject({
        externalId: site.episode,
        title: expect.stringContaining(site.episodeTitle),
        url: site.episode,
      });
      expect(series.entries[0]?.publishedAt).toBeInstanceOf(Date);
    });
  }

  test('fails closed when required markup, timestamps, or episode URLs change', async () => {
    const [atomFixture, episodeFixture, seriesFixture] = await Promise.all([
      readConnectorFixture('shonen-jump-plus-atom.xml'),
      readConnectorFixture('shonen-jump-plus-episode.html'),
      readConnectorFixture('shonen-jump-plus-series.xml'),
    ]);
    const config = commonFeedSiteConfigs.shonenJumpPlus;

    expect(() =>
      parseCommonEpisodePage(
        episodeFixture.replace('series-header-title', 'changed-series-title'),
        config,
      ),
    ).toThrow(ConnectorValidationError);
    expect(() =>
      parseCommonAtomFeed(atomFixture.replace('2026-07-24T15:00:00Z', 'not-a-date'), config),
    ).toThrow(ConnectorValidationError);
    expect(() =>
      parseCommonSeriesFeed(
        seriesFixture.replace('https://shonenjumpplus.com/episode/1008', 'https://example.com/1'),
        config,
      ),
    ).toThrow(ConnectorValidationError);
    expect(
      parseCommonAtomFeed(
        atomFixture.replace('/episode/1008', '/episode/1008?utm_source=fixture#viewer'),
        config,
      ).entries[0]?.externalKey,
    ).toBe('https://shonenjumpplus.com/episode/1008');
  });
});

test('common feed connector follows Atom to series RSS without requesting images', async () => {
  const requests: string[] = [];
  let origin = '';
  const server = Bun.serve({
    port: 0,
    fetch(request) {
      const path = new URL(request.url).pathname;
      requests.push(path);

      if (path === '/atom') {
        return new Response(
          `<feed xmlns="http://www.w3.org/2005/Atom">
            <updated>2026-07-25T00:00:00Z</updated>
            <entry>
              <title>第1話</title>
              <link href="${origin}/episode/1"/>
              <updated>2026-07-25T00:00:00Z</updated>
              <author><name>作者</name></author>
            </entry>
          </feed>`,
          { headers: { 'content-type': 'application/atom+xml' } },
        );
      }

      if (path === '/episode/1') {
        return new Response(
          `<h1 class="episode-header-title">第1話</h1>
           <a href="/rss/series/9">RSSフィード</a>
           <h1 class="series-header-title">作品</h1>
           <h2 class="series-header-author">作者</h2>
           <img src="${origin}/episode/1/page.jpg">`,
          { headers: { 'content-type': 'text/html' } },
        );
      }

      if (path === '/rss/series/9') {
        return new Response(
          `<rss version="2.0"><channel><item>
            <title>第1話</title>
            <link>${origin}/episode/1</link>
            <pubDate>Sat, 25 Jul 2026 00:00:00 +0000</pubDate>
            <author>作者</author>
          </item></channel></rss>`,
          { headers: { 'content-type': 'application/rss+xml' } },
        );
      }

      return new Response('not found', { status: 404 });
    },
  });
  origin = server.url.origin;
  const config = {
    allowedHosts: [server.url.host],
    baseUrl: `${origin}/`,
    feedUrl: `${origin}/atom`,
    key: 'shonen-jump-plus',
    name: 'fixture',
  } as const;
  const connector = new CommonFeedConnector(
    config,
    new ConnectorHttpClient({
      allowedHosts: config.allowedHosts,
      jitterMs: 0,
      maxAttempts: 1,
      minIntervalMs: 0,
    }),
  );

  try {
    const sourceId = crypto.randomUUID();
    const first = await connector.discover({ checkpoint: null, sourceId });
    const second = await connector.discover({
      checkpoint: first.checkpoint,
      sourceId,
    });

    expect(first.candidates).toHaveLength(1);
    expect(first.candidates[0]).toMatchObject({
      authors: ['作者'],
      entries: [
        {
          externalId: `${origin}/episode/1`,
          kind: 'regular',
          title: '第1話',
          url: `${origin}/episode/1`,
        },
      ],
      externalId: `${origin}/rss/series/9`,
      kind: 'official',
      title: '作品',
      url: `${origin}/rss/series/9`,
    });
    expect(second.candidates).toEqual([]);
    expect(requests).toEqual(['/atom', '/episode/1', '/rss/series/9', '/atom']);
    expect(requests.some((path) => path.endsWith('.jpg'))).toBe(false);
  } finally {
    server.stop(true);
  }
});
