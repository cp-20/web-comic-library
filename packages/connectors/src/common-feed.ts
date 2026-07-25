import type {
  Connector,
  DiscoveryBatch,
  DiscoveryContext,
  PublicationCandidate,
  PublicationEntryCandidate,
  PublicationRef,
} from '@web-comic-library/application';
import type { PublicationEntryKind } from '@web-comic-library/domain';
import { load } from 'cheerio';
import * as v from 'valibot';

import type { ConnectorHttpClient } from './http-client';
import { ConnectorValidationError, validateConnectorValue } from './validation';

export type CommonFeedSiteConfig = Readonly<{
  allowedHosts: readonly string[];
  baseUrl: string;
  feedUrl: string;
  key: 'comic-days' | 'shonen-jump-plus' | 'tonari-no-young-jump';
  name: string;
}>;

export const commonFeedSiteConfigs = {
  comicDays: {
    allowedHosts: ['comic-days.com'],
    baseUrl: 'https://comic-days.com/',
    feedUrl: 'https://comic-days.com/atom',
    key: 'comic-days',
    name: 'コミックDAYS',
  },
  shonenJumpPlus: {
    allowedHosts: ['shonenjumpplus.com'],
    baseUrl: 'https://shonenjumpplus.com/',
    feedUrl: 'https://shonenjumpplus.com/atom',
    key: 'shonen-jump-plus',
    name: '少年ジャンプ＋',
  },
  tonariNoYoungJump: {
    allowedHosts: ['tonarinoyj.jp'],
    baseUrl: 'https://tonarinoyj.jp/',
    feedUrl: 'https://tonarinoyj.jp/atom',
    key: 'tonari-no-young-jump',
    name: 'となりのヤングジャンプ',
  },
} as const satisfies Record<string, CommonFeedSiteConfig>;

export type CommonFeedDiscoveryEntry = Readonly<{
  author: string;
  externalKey: string;
  title: string;
  updatedAt: Date;
  url: string;
}>;

export type CommonAtomFeed = Readonly<{
  entries: readonly CommonFeedDiscoveryEntry[];
  updatedAt: Date;
}>;

export type CommonFeedEpisodePage = Readonly<{
  author: string;
  episodeTitle: string;
  seriesFeedUrl: string;
  workTitle: string;
}>;

export type CommonSeriesFeed = Readonly<{
  entries: readonly PublicationEntryCandidate[];
}>;

type CommonFeedCheckpoint = Readonly<{
  externalKeys: string[];
  updatedAt: string;
}>;

type HttpReader = Pick<ConnectorHttpClient, 'get'>;

const textSchema = v.pipe(v.string(), v.trim(), v.minLength(1));
const checkpointSchema = v.object({
  externalKeys: v.array(textSchema),
  updatedAt: textSchema,
});
const utf8 = new TextDecoder('utf-8', { fatal: true });

const isAllowedProtocol = (url: URL): boolean => {
  return (
    url.protocol === 'https:' ||
    (url.protocol === 'http:' && (url.hostname === '127.0.0.1' || url.hostname === 'localhost'))
  );
};

const requireDate = (value: string): Date => {
  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) {
    throw new ConnectorValidationError(1);
  }

  return date;
};

const normalizeSiteUrl = (
  value: string,
  config: CommonFeedSiteConfig,
  pathPattern: RegExp,
): string => {
  let url: URL;

  try {
    url = new URL(value, config.baseUrl);
  } catch {
    throw new ConnectorValidationError(1);
  }

  if (
    !isAllowedProtocol(url) ||
    !config.allowedHosts.includes(url.host.toLowerCase()) ||
    !pathPattern.test(url.pathname)
  ) {
    throw new ConnectorValidationError(1);
  }

  url.hash = '';
  url.search = '';
  return url.href;
};

const requireText = (value: string | undefined): string => {
  return validateConnectorValue(textSchema, value);
};

const requireSingleText = (html: ReturnType<typeof load>, selector: string): string => {
  const elements = html(selector);

  if (elements.length !== 1) {
    throw new ConnectorValidationError(1);
  }

  return requireText(elements.first().text());
};

export const classifyCommonFeedEntry = (title: string): PublicationEntryKind => {
  const normalized = title.normalize('NFKC').toLowerCase();

  if (/(?:番外編|特別編|おまけ|特別読切|読切|extra|エクストラ)/u.test(normalized)) {
    return 'extra';
  }

  if (/(?:第\s*)?\d+(?:[-.]\d+)?\s*(?:話|歩目|回|巡目|打)/u.test(normalized)) {
    return 'regular';
  }

  return 'unknown';
};

export const parseCommonAtomFeed = (xml: string, config: CommonFeedSiteConfig): CommonAtomFeed => {
  const document = load(xml, { xml: true });
  const feed = document('feed');

  if (feed.length !== 1) {
    throw new ConnectorValidationError(1);
  }

  const updatedAt = requireDate(requireText(feed.children('updated').first().text()));
  const entries = feed
    .children('entry')
    .toArray()
    .map((element): CommonFeedDiscoveryEntry => {
      const entry = document(element);
      const title = requireText(entry.children('title').first().text());
      const updated = requireDate(requireText(entry.children('updated').first().text()));
      const author = requireText(entry.children('author').children('name').first().text());
      const href = requireText(entry.children('link').not('[rel]').first().attr('href'));
      const url = normalizeSiteUrl(href, config, /^\/episode\/\d+\/?$/u);

      return {
        author,
        externalKey: url,
        title,
        updatedAt: updated,
        url,
      };
    });

  if (entries.length === 0) {
    throw new ConnectorValidationError(1);
  }

  return { entries, updatedAt };
};

export const parseCommonEpisodePage = (
  html: string,
  config: CommonFeedSiteConfig,
): CommonFeedEpisodePage => {
  const document = load(html);
  const rssLinks = document('a[href*="/rss/series/"]');

  if (rssLinks.length !== 1) {
    throw new ConnectorValidationError(1);
  }

  return {
    author: requireSingleText(document, 'h2.series-header-author'),
    episodeTitle: requireSingleText(document, 'h1.episode-header-title'),
    seriesFeedUrl: normalizeSiteUrl(
      requireText(rssLinks.first().attr('href')),
      config,
      /^\/rss\/series\/\d+\/?$/u,
    ),
    workTitle: requireSingleText(document, 'h1.series-header-title'),
  };
};

export const parseCommonSeriesFeed = (
  xml: string,
  config: CommonFeedSiteConfig,
): CommonSeriesFeed => {
  const document = load(xml, { xml: true });
  const channel = document('rss > channel');

  if (channel.length !== 1) {
    throw new ConnectorValidationError(1);
  }

  const entries = channel
    .children('item')
    .toArray()
    .map((element): PublicationEntryCandidate => {
      const item = document(element);
      const title = requireText(item.children('title').first().text());
      const url = normalizeSiteUrl(
        requireText(item.children('link').first().text()),
        config,
        /^\/episode\/\d+\/?$/u,
      );
      requireText(item.children('author').first().text());

      return {
        externalId: url,
        kind: classifyCommonFeedEntry(title),
        publishedAt: requireDate(requireText(item.children('pubDate').first().text())),
        title,
        url,
      };
    });

  if (entries.length === 0) {
    throw new ConnectorValidationError(1);
  }

  return { entries };
};

const readCheckpoint = (value: DiscoveryContext['checkpoint']): CommonFeedCheckpoint | null => {
  if (value === null) {
    return null;
  }

  const checkpoint = validateConnectorValue(checkpointSchema, value);
  requireDate(checkpoint.updatedAt);
  return checkpoint;
};

const selectNewEntries = (
  feed: CommonAtomFeed,
  checkpoint: CommonFeedCheckpoint | null,
): readonly CommonFeedDiscoveryEntry[] => {
  if (!checkpoint) {
    return feed.entries;
  }

  const updatedAt = requireDate(checkpoint.updatedAt).getTime();
  const externalKeys = new Set(checkpoint.externalKeys);

  return feed.entries.filter((entry) => {
    const entryUpdatedAt = entry.updatedAt.getTime();
    return (
      entryUpdatedAt > updatedAt ||
      (entryUpdatedAt === updatedAt && !externalKeys.has(entry.externalKey))
    );
  });
};

const createCheckpoint = (feed: CommonAtomFeed): CommonFeedCheckpoint => {
  const latestTime = Math.max(...feed.entries.map((entry) => entry.updatedAt.getTime()));

  return {
    externalKeys: feed.entries
      .filter((entry) => entry.updatedAt.getTime() === latestTime)
      .map((entry) => entry.externalKey),
    updatedAt: new Date(latestTime).toISOString(),
  };
};

export class CommonFeedConnector implements Connector {
  readonly #config: CommonFeedSiteConfig;
  readonly #http: HttpReader;

  constructor(config: CommonFeedSiteConfig, http: HttpReader) {
    const baseUrl = new URL(config.baseUrl);
    const feedUrl = new URL(config.feedUrl);

    if (
      !isAllowedProtocol(baseUrl) ||
      !isAllowedProtocol(feedUrl) ||
      !config.allowedHosts.includes(baseUrl.host.toLowerCase()) ||
      !config.allowedHosts.includes(feedUrl.host.toLowerCase())
    ) {
      throw new Error('common feed site URLs must use an allowed HTTPS host');
    }

    this.#config = config;
    this.#http = http;
  }

  async discover(context: DiscoveryContext): Promise<DiscoveryBatch> {
    const atom = parseCommonAtomFeed(
      await this.#fetchText(context.sourceId, this.#config.feedUrl, [
        'application/atom+xml',
        'application/xml',
        'text/xml',
      ]),
      this.#config,
    );
    const entries = selectNewEntries(atom, readCheckpoint(context.checkpoint));
    const pages = new Map<string, CommonFeedEpisodePage>();
    const candidates = new Map<string, PublicationCandidate>();

    for (const entry of entries) {
      // oxlint-disable-next-line no-await-in-loop -- The host scheduler deliberately serializes requests.
      const page = await this.#fetchEpisodePage(context.sourceId, entry.url);
      pages.set(page.seriesFeedUrl, page);
    }

    for (const page of pages.values()) {
      // oxlint-disable-next-line no-await-in-loop -- The host scheduler deliberately serializes requests.
      const candidate = await this.#fetchSeriesCandidate(context.sourceId, page);
      candidates.set(page.seriesFeedUrl, candidate);
    }

    return {
      candidates: [...candidates.values()],
      checkpoint: createCheckpoint(atom),
    };
  }

  async fetchPublication(reference: PublicationRef): Promise<PublicationCandidate> {
    const episodeUrl = normalizeSiteUrl(reference.url, this.#config, /^\/episode\/\d+\/?$/u);
    const page = await this.#fetchEpisodePage(reference.sourceId, episodeUrl);
    return this.#fetchSeriesCandidate(reference.sourceId, page);
  }

  async #fetchEpisodePage(sourceId: string, episodeUrl: string): Promise<CommonFeedEpisodePage> {
    return parseCommonEpisodePage(
      await this.#fetchText(sourceId, episodeUrl, ['text/html']),
      this.#config,
    );
  }

  async #fetchSeriesCandidate(
    sourceId: string,
    page: CommonFeedEpisodePage,
  ): Promise<PublicationCandidate> {
    const history = parseCommonSeriesFeed(
      await this.#fetchText(sourceId, page.seriesFeedUrl, [
        'application/rss+xml',
        'application/xml',
        'text/xml',
      ]),
      this.#config,
    );

    return {
      ageRatingValue: null,
      authors: [page.author],
      entries: history.entries,
      externalId: page.seriesFeedUrl,
      kind: 'official',
      kindEvidence: this.#config.feedUrl,
      sourceId,
      title: page.workTitle,
      updatedAt:
        history.entries.length === 0
          ? null
          : new Date(
              Math.max(
                ...history.entries.map((entry) => entry.publishedAt?.getTime() ?? Number.MIN_VALUE),
              ),
            ),
      url: page.seriesFeedUrl,
    };
  }

  async #fetchText(
    sourceId: string,
    url: string,
    acceptedContentTypes: readonly string[],
  ): Promise<string> {
    const result = await this.#http.get({
      acceptedContentTypes,
      sourceId,
      state: null,
      url,
    });

    if (result.status !== 'modified') {
      throw new Error('a stateless common feed request cannot be not modified');
    }

    try {
      return utf8.decode(result.body);
    } catch {
      throw new ConnectorValidationError(1);
    }
  }
}

export const createCommonFeedConnector = (
  config: CommonFeedSiteConfig,
  http: HttpReader,
): CommonFeedConnector => {
  return new CommonFeedConnector(config, http);
};
