import type {
  Connector,
  DiscoveryBatch,
  DiscoveryContext,
  PublicationCandidate,
  PublicationEntryCandidate,
  PublicationRef,
} from '@web-comic-library/application';
import type { PublicationKind, SerialStatus } from '@web-comic-library/domain';
import { load } from 'cheerio';
import * as v from 'valibot';

import { ConnectorHttpError, type ConnectorHttpClient } from './http-client';
import { ConnectorValidationError, validateConnectorValue } from './validation';

export type NiconicoConfig = Readonly<{
  allowedHosts: readonly string[];
  baseUrl: string;
  createdListUrl: string;
  maxUpdatedPages: number;
  updatedListUrl: string;
}>;

export const niconicoConfig: NiconicoConfig = {
  allowedHosts: ['manga.nicovideo.jp'],
  baseUrl: 'https://manga.nicovideo.jp/',
  createdListUrl: 'https://manga.nicovideo.jp/manga/list?sort=manga_created',
  maxUpdatedPages: 10,
  updatedListUrl: 'https://manga.nicovideo.jp/manga/list?sort=manga_updated',
};

export type NiconicoListItem = Readonly<{
  author: string;
  createdAt: Date;
  externalId: string;
  serialStatusText: string;
  title: string;
  updatedAt: Date;
  url: string;
}>;

export type NiconicoListPage = Readonly<{
  items: readonly NiconicoListItem[];
  nextPage: number | null;
}>;

export type NiconicoPublicationCandidate = PublicationCandidate &
  Readonly<{
    nextCheckAt: Date;
    serialStatus: SerialStatus;
  }>;

export type NiconicoCrawlQueue = 'backfill' | 'normal';

export type NiconicoClassificationEvidence = Readonly<{
  evidenceUrl: string | null;
  kind: PublicationKind;
}>;

export class NiconicoExcludedPublicationError extends Error {
  constructor() {
    super('niconico publication is not publicly collectible');
    this.name = 'NiconicoExcludedPublicationError';
  }
}

type HttpReader = Pick<ConnectorHttpClient, 'get'>;

type UpdatedCheckpoint = Readonly<{
  mode: 'updated';
  page: number;
  watermark: string;
}>;

type BackfillCheckpoint = Readonly<{
  complete: boolean;
  lastExternalId: string | null;
  mode: 'backfill';
  page: number;
}>;

const dayMs = 24 * 60 * 60 * 1_000;
const textSchema = v.pipe(v.string(), v.trim(), v.minLength(1));
const updatedCheckpointSchema = v.object({
  mode: v.literal('updated'),
  page: v.pipe(v.number(), v.integer(), v.minValue(1)),
  watermark: textSchema,
});
const backfillCheckpointSchema = v.object({
  complete: v.boolean(),
  lastExternalId: v.nullable(textSchema),
  mode: v.literal('backfill'),
  page: v.pipe(v.number(), v.integer(), v.minValue(1)),
});
const utf8 = new TextDecoder('utf-8', { fatal: true });

const isAllowedProtocol = (url: URL): boolean => {
  return (
    url.protocol === 'https:' ||
    (url.protocol === 'http:' && (url.hostname === '127.0.0.1' || url.hostname === 'localhost'))
  );
};

const requireText = (value: string | undefined): string => {
  return validateConnectorValue(textSchema, value);
};

const normalizeNiconicoUrl = (value: string, config: NiconicoConfig, pathPattern: RegExp): URL => {
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
  return url;
};

const normalizeComicUrl = (
  value: string,
  config: NiconicoConfig,
): Readonly<{ externalId: string; url: string }> => {
  const url = normalizeNiconicoUrl(value, config, /^\/comic\/\d+\/?$/u);
  const externalId = url.pathname.match(/^\/comic\/(\d+)\/?$/u)?.[1];

  if (!externalId) {
    throw new ConnectorValidationError(1);
  }

  url.search = '';
  return { externalId, url: url.href };
};

const normalizeWatchUrl = (
  value: string,
  config: NiconicoConfig,
): Readonly<{ externalId: string; url: string }> => {
  const url = normalizeNiconicoUrl(value, config, /^\/watch\/mg\d+\/?$/u);
  const externalId = url.pathname.match(/^\/watch\/(mg\d+)\/?$/u)?.[1];

  if (!externalId) {
    throw new ConnectorValidationError(1);
  }

  url.search = '';
  return { externalId, url: url.href };
};

const parseJapaneseListDate = (value: string, suffix: '更新' | '開始'): Date => {
  const normalized = value.normalize('NFKC').replaceAll('\u00a0', ' ').trim();
  const match = normalized.match(new RegExp(`^(\\d{4})/(\\d{2})/(\\d{2})\\s+${suffix}$`, 'u'));

  if (!match) {
    throw new ConnectorValidationError(1);
  }

  const [, year, month, day] = match;
  const yearNumber = Number(year);
  const monthNumber = Number(month);
  const dayNumber = Number(day);
  const calendarDate = new Date(Date.UTC(yearNumber, monthNumber - 1, dayNumber));

  if (
    calendarDate.getUTCFullYear() !== yearNumber ||
    calendarDate.getUTCMonth() + 1 !== monthNumber ||
    calendarDate.getUTCDate() !== dayNumber
  ) {
    throw new ConnectorValidationError(1);
  }

  return new Date(calendarDate.getTime() - 9 * 60 * 60 * 1_000);
};

const nextPageNumber = (
  document: ReturnType<typeof load>,
  config: NiconicoConfig,
): number | null => {
  const hrefs = document('a[href*="page="]')
    .filter((_, element) => document(element).text().trim() === '次へ')
    .map((_, element) => document(element).attr('href'))
    .toArray()
    .filter((href): href is string => href !== undefined);
  const uniqueHrefs = [...new Set(hrefs)];

  if (uniqueHrefs.length === 0) {
    return null;
  }

  if (uniqueHrefs.length !== 1) {
    throw new ConnectorValidationError(1);
  }

  const url = normalizeNiconicoUrl(uniqueHrefs[0] ?? '', config, /^\/manga\/list\/?$/u);
  const page = Number(url.searchParams.get('page'));

  if (!Number.isSafeInteger(page) || page < 2) {
    throw new ConnectorValidationError(1);
  }

  return page;
};

export const parseNiconicoListPage = (html: string, config: NiconicoConfig): NiconicoListPage => {
  const document = load(html);
  const items = document('li.mg_item.item')
    .toArray()
    .map((element): NiconicoListItem => {
      const item = document(element);
      const link = item.find('.mg_title .title a').first();
      const comic = normalizeComicUrl(requireText(link.attr('href')), config);

      return {
        author: requireText(item.find('.mg_author').first().text()).replace(/^作者:\s*/u, ''),
        createdAt: parseJapaneseListDate(
          requireText(item.find('.date.created').first().text()),
          '開始',
        ),
        externalId: comic.externalId,
        serialStatusText: requireText(item.find('.serial_status').first().text()),
        title: requireText(link.text()),
        updatedAt: parseJapaneseListDate(
          requireText(item.find('.date.updated').first().text()),
          '更新',
        ),
        url: comic.url,
      };
    });

  if (items.length === 0) {
    throw new ConnectorValidationError(1);
  }

  if (new Set(items.map((item) => item.externalId)).size !== items.length) {
    throw new ConnectorValidationError(1);
  }

  return { items, nextPage: nextPageNumber(document, config) };
};

export const classifyNiconicoPublication = (
  html: string,
  config: NiconicoConfig,
  externalId: string,
  confirmedUserSubmissions: ReadonlyMap<string, string>,
): NiconicoClassificationEvidence => {
  const document = load(html);
  const officialHrefs = document('ul.sg_pankuzu a[href^="/official/"]')
    .map((_, element) => document(element).attr('href'))
    .toArray()
    .filter((href): href is string => href !== undefined);
  const uniqueOfficialHrefs = [...new Set(officialHrefs)];

  if (uniqueOfficialHrefs.length > 1) {
    throw new ConnectorValidationError(1);
  }

  if (uniqueOfficialHrefs[0]) {
    const evidence = normalizeNiconicoUrl(
      uniqueOfficialHrefs[0],
      config,
      /^\/official\/[a-zA-Z0-9_-]+\/?$/u,
    );
    evidence.search = '';
    return { evidenceUrl: evidence.href, kind: 'official' };
  }

  const confirmedEvidence = confirmedUserSubmissions.get(externalId);

  if (confirmedEvidence) {
    let evidence: URL;

    try {
      evidence = new URL(confirmedEvidence);
    } catch {
      throw new ConnectorValidationError(1);
    }

    if (evidence.protocol !== 'https:' && evidence.protocol !== 'http:') {
      throw new ConnectorValidationError(1);
    }

    return { evidenceUrl: evidence.href, kind: 'user_submission' };
  }

  return { evidenceUrl: null, kind: 'unknown' };
};

const isUnavailableEpisode = (status: string): boolean => {
  return /(?:公開終了|非公開|有料|ログイン|購入|年齢制限)/u.test(status.normalize('NFKC'));
};

const classifyNiconicoEntry = (title: string): PublicationEntryCandidate['kind'] => {
  const normalized = title.normalize('NFKC').toLowerCase();

  if (/(?:番外編|特別編|おまけ|読切|extra|エクストラ)/u.test(normalized)) {
    return 'extra';
  }

  if (/(?:第\s*)?\d+(?:[-.]\d+)?\s*(?:話|回)/u.test(normalized)) {
    return 'regular';
  }

  return 'unknown';
};

export const niconicoRecheckSchedule = (
  updatedAt: Date,
  serialStatusText: string,
  now: Date,
): Readonly<{ nextCheckAt: Date; serialStatus: SerialStatus }> => {
  const ageMs = Math.max(0, now.getTime() - updatedAt.getTime());

  if (/完結/u.test(serialStatusText)) {
    return {
      nextCheckAt: new Date(now.getTime() + 90 * dayMs),
      serialStatus: 'completed',
    };
  }

  if (ageMs >= 180 * dayMs) {
    return {
      nextCheckAt: new Date(now.getTime() + 30 * dayMs),
      serialStatus: 'hiatus',
    };
  }

  return {
    nextCheckAt: new Date(now.getTime() + dayMs),
    serialStatus: 'ongoing',
  };
};

export const parseNiconicoPublicationPage = (
  html: string,
  config: NiconicoConfig,
  listItem: NiconicoListItem,
  confirmedUserSubmissions: ReadonlyMap<string, string>,
  now: Date,
): NiconicoPublicationCandidate => {
  const document = load(html);

  if (
    document(
      '.age_auth, .age-gate, .adult-confirmation, [data-restriction="age"], [data-restriction="login"]',
    ).length > 0
  ) {
    throw new NiconicoExcludedPublicationError();
  }

  const title = requireText(document('div.main_title h1').first().text());
  const author = requireText(document('div.main_title div.author h3').first().text()).replace(
    /^作者:\s*/u,
    '',
  );
  const episodeElements = document('li.episode_item');

  if (episodeElements.length === 0) {
    throw new ConnectorValidationError(1);
  }

  const entries = episodeElements.toArray().flatMap((element): PublicationEntryCandidate[] => {
    const episode = document(element);
    const status = requireText(episode.find('.status').first().text());

    if (isUnavailableEpisode(status)) {
      return [];
    }

    const link = episode.find('div.description div.title a').first();
    const titleValue = requireText(link.text());
    const watch = normalizeWatchUrl(requireText(link.attr('href')), config);

    return [
      {
        externalId: watch.externalId,
        kind: classifyNiconicoEntry(titleValue),
        publishedAt: null,
        title: titleValue,
        url: watch.url,
      },
    ];
  });

  if (entries.length === 0) {
    throw new NiconicoExcludedPublicationError();
  }

  if (new Set(entries.map((entry) => entry.externalId)).size !== entries.length) {
    throw new ConnectorValidationError(1);
  }

  const classification = classifyNiconicoPublication(
    html,
    config,
    listItem.externalId,
    confirmedUserSubmissions,
  );
  const schedule = niconicoRecheckSchedule(listItem.updatedAt, listItem.serialStatusText, now);

  return {
    ageRatingValue: null,
    authors: [author],
    entries,
    externalId: listItem.externalId,
    kind: classification.kind,
    kindEvidence: classification.evidenceUrl,
    nextCheckAt: schedule.nextCheckAt,
    serialStatus: schedule.serialStatus,
    sourceId: '',
    title,
    updatedAt: listItem.updatedAt,
    url: listItem.url,
  };
};

export const selectNiconicoCrawlQueue = (
  normalPending: boolean,
  backfillPending: boolean,
): NiconicoCrawlQueue | null => {
  if (normalPending) {
    return 'normal';
  }

  return backfillPending ? 'backfill' : null;
};

const readUpdatedCheckpoint = (
  checkpoint: DiscoveryContext['checkpoint'],
): UpdatedCheckpoint | null => {
  if (checkpoint === null) {
    return null;
  }

  return validateConnectorValue(updatedCheckpointSchema, checkpoint);
};

const readBackfillCheckpoint = (checkpoint: DiscoveryContext['checkpoint']): BackfillCheckpoint => {
  if (checkpoint === null) {
    return { complete: false, lastExternalId: null, mode: 'backfill', page: 1 };
  }

  return validateConnectorValue(backfillCheckpointSchema, checkpoint);
};

export class NiconicoConnector implements Connector {
  readonly #config: NiconicoConfig;
  readonly #confirmedUserSubmissions: ReadonlyMap<string, string>;
  readonly #http: HttpReader;
  readonly #now: () => Date;

  constructor(
    config: NiconicoConfig,
    http: HttpReader,
    options: Readonly<{
      confirmedUserSubmissions?: ReadonlyMap<string, string>;
      now?: () => Date;
    }> = {},
  ) {
    for (const value of [config.baseUrl, config.updatedListUrl, config.createdListUrl]) {
      normalizeNiconicoUrl(value, config, /^\/(?:manga\/list\/?)?$/u);
    }

    if (!Number.isSafeInteger(config.maxUpdatedPages) || config.maxUpdatedPages < 1) {
      throw new Error('maxUpdatedPages must be a positive safe integer');
    }

    this.#config = config;
    this.#confirmedUserSubmissions = options.confirmedUserSubmissions ?? new Map();
    this.#http = http;
    this.#now = options.now ?? (() => new Date());
  }

  async discover(context: DiscoveryContext): Promise<DiscoveryBatch> {
    const checkpoint = readUpdatedCheckpoint(context.checkpoint);
    const discovered: NiconicoListItem[] = [];
    let pageNumber = 1;
    let firstExternalId: string | null = null;
    let foundWatermark = checkpoint === null;

    for (let scanned = 0; scanned < this.#config.maxUpdatedPages; scanned += 1) {
      // oxlint-disable-next-line no-await-in-loop -- Pagination must preserve the remote ordering.
      const page = await this.#fetchList(this.#config.updatedListUrl, pageNumber, context.sourceId);
      firstExternalId ??= page.items[0]?.externalId ?? null;

      for (const item of page.items) {
        if (checkpoint && item.externalId === checkpoint.watermark) {
          foundWatermark = true;
          break;
        }

        discovered.push(item);
      }

      if (foundWatermark || checkpoint === null) {
        break;
      }

      if (page.nextPage === null) {
        break;
      }

      pageNumber = page.nextPage;
    }

    if (!firstExternalId || !foundWatermark) {
      throw new ConnectorValidationError(1);
    }

    return {
      candidates: await this.#fetchCandidates(context.sourceId, discovered),
      checkpoint: { mode: 'updated', page: 1, watermark: firstExternalId },
    };
  }

  async discoverBackfill(context: DiscoveryContext): Promise<DiscoveryBatch> {
    const checkpoint = readBackfillCheckpoint(context.checkpoint);

    if (checkpoint.complete) {
      return { candidates: [], checkpoint };
    }

    let pageNumber = checkpoint.page;
    let page = await this.#fetchList(this.#config.createdListUrl, pageNumber, context.sourceId);
    let startIndex = 0;

    if (checkpoint.lastExternalId) {
      const lastIndex = page.items.findIndex(
        (item) => item.externalId === checkpoint.lastExternalId,
      );

      if (lastIndex < 0) {
        throw new ConnectorValidationError(1);
      }

      startIndex = lastIndex + 1;

      if (startIndex === page.items.length && page.nextPage !== null) {
        pageNumber = page.nextPage;
        page = await this.#fetchList(this.#config.createdListUrl, pageNumber, context.sourceId);
        startIndex = 0;
      }
    }

    const items = page.items.slice(startIndex);
    const lastExternalId = items.at(-1)?.externalId ?? checkpoint.lastExternalId;
    const complete = page.nextPage === null && startIndex + items.length === page.items.length;

    return {
      candidates: await this.#fetchCandidates(context.sourceId, items),
      checkpoint: {
        complete,
        lastExternalId,
        mode: 'backfill',
        page: pageNumber,
      },
    };
  }

  async fetchPublication(reference: PublicationRef): Promise<NiconicoPublicationCandidate> {
    const comic = normalizeComicUrl(reference.url, this.#config);
    const listItem: NiconicoListItem = {
      author: '',
      createdAt: new Date(0),
      externalId: comic.externalId,
      serialStatusText: '',
      title: '',
      updatedAt: this.#now(),
      url: comic.url,
    };
    return this.#fetchCandidate(listItem, reference.sourceId);
  }

  async #fetchCandidates(
    sourceId: string,
    items: readonly NiconicoListItem[],
  ): Promise<readonly NiconicoPublicationCandidate[]> {
    const candidates: NiconicoPublicationCandidate[] = [];

    for (const item of items) {
      try {
        // oxlint-disable-next-line no-await-in-loop -- The host scheduler deliberately serializes requests.
        const candidate = await this.#fetchCandidate(item, sourceId);
        candidates.push(candidate);
      } catch (error) {
        if (
          error instanceof NiconicoExcludedPublicationError ||
          (error instanceof ConnectorHttpError &&
            (error.status === 401 || error.status === 403 || error.status === 404))
        ) {
          continue;
        }

        throw error;
      }
    }

    return candidates;
  }

  async #fetchCandidate(
    item: NiconicoListItem,
    sourceId: string,
  ): Promise<NiconicoPublicationCandidate> {
    const html = await this.#fetchText(sourceId, item.url);
    const candidate = parseNiconicoPublicationPage(
      html,
      this.#config,
      item,
      this.#confirmedUserSubmissions,
      this.#now(),
    );
    return { ...candidate, sourceId };
  }

  async #fetchList(listUrl: string, page: number, sourceId: string): Promise<NiconicoListPage> {
    const url = new URL(listUrl);
    url.searchParams.set('page', String(page));
    return parseNiconicoListPage(await this.#fetchText(sourceId, url.href), this.#config);
  }

  async #fetchText(sourceId: string, url: string): Promise<string> {
    const result = await this.#http.get({
      acceptedContentTypes: ['text/html'],
      sourceId,
      state: null,
      url,
    });

    if (result.status !== 'modified') {
      throw new Error('a stateless niconico request cannot be not modified');
    }

    try {
      return utf8.decode(result.body);
    } catch {
      throw new ConnectorValidationError(1);
    }
  }
}

export const createNiconicoConnector = (
  config: NiconicoConfig,
  http: HttpReader,
  options?: Readonly<{
    confirmedUserSubmissions?: ReadonlyMap<string, string>;
    now?: () => Date;
  }>,
): NiconicoConnector => {
  return new NiconicoConnector(config, http, options);
};
