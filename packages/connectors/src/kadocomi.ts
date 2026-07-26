import type {
  Connector,
  DiscoveryBatch,
  DiscoveryContext,
  PublicationCandidate,
  PublicationEntryCandidate,
  PublicationRef,
} from '@web-comic-library/application';
import type { PublicationEntryKind, SerialStatus } from '@web-comic-library/domain';
import { load } from 'cheerio';
import * as v from 'valibot';

import type { ConnectorHttpClient } from './http-client';
import { ConnectorValidationError, validateConnectorValue } from './validation';

export type KadocomiConfig = Readonly<{
  allowedHosts: readonly string[];
  baseUrl: string;
}>;

export const kadocomiConfig: KadocomiConfig = {
  allowedHosts: ['comic-walker.com'],
  baseUrl: 'https://comic-walker.com/',
};

export const kadocomiRatingLevels = ['all', 'adult', 'r18'] as const;

export type KadocomiAuthor = Readonly<{
  name: string;
  role: string;
}>;

export type KadocomiEpisode = Readonly<{
  code: string;
  isActive: boolean;
  title: string;
  type: string;
  updatedAt: Date | null;
}>;

export type KadocomiPublicationCandidate = PublicationCandidate &
  Readonly<{
    authorDetails: readonly KadocomiAuthor[];
    nextUpdateAt: Date | null;
    nextUpdateDateText: string | null;
    serialStatus: SerialStatus;
  }>;

type HttpReader = Pick<ConnectorHttpClient, 'get'>;

type KadocomiEpisodeInput = Readonly<{
  code: string;
  isActive: boolean;
  title: string;
  type: string;
  updateDate: string | null;
}>;

type KadocomiEpisodeCollection = Readonly<{
  result: readonly KadocomiEpisodeInput[];
  total: number;
}>;

type KadocomiWorkData = Readonly<{
  firstEpisodes: KadocomiEpisodeCollection;
  latestEpisodes: KadocomiEpisodeCollection;
  work: Readonly<{
    authors: readonly KadocomiAuthor[];
    code: string;
    nextUpdateDateText: string | null;
    ratingLevel: string;
    serializationStatus: string;
    title: string;
  }>;
}>;

const textSchema = v.pipe(v.string(), v.trim(), v.minLength(1));
const codeSchema = v.pipe(textSchema, v.regex(/^[A-Za-z0-9_]+$/u));
const ratingLevelSchema = v.picklist(kadocomiRatingLevels);
const authorSchema = v.object({
  name: textSchema,
  role: textSchema,
});
const episodeSchema = v.object({
  code: codeSchema,
  isActive: v.boolean(),
  title: textSchema,
  type: textSchema,
  updateDate: v.nullable(textSchema),
});
const episodeCollectionSchema = v.object({
  result: v.array(episodeSchema),
  total: v.pipe(v.number(), v.integer(), v.minValue(0)),
});
const workDataSchema = v.object({
  firstEpisodes: episodeCollectionSchema,
  latestEpisodes: episodeCollectionSchema,
  work: v.object({
    authors: v.array(authorSchema),
    code: codeSchema,
    nextUpdateDateText: v.nullable(textSchema),
    ratingLevel: ratingLevelSchema,
    serializationStatus: textSchema,
    title: textSchema,
  }),
});
const nextDataSchema = v.object({
  props: v.object({
    pageProps: v.object({
      dehydratedState: v.object({
        queries: v.array(
          v.object({
            state: v.object({
              data: v.unknown(),
            }),
          }),
        ),
      }),
    }),
  }),
});
const utf8 = new TextDecoder('utf-8', { fatal: true });

const isAllowedProtocol = (url: URL): boolean => {
  return (
    url.protocol === 'https:' ||
    (url.protocol === 'http:' && (url.hostname === '127.0.0.1' || url.hostname === 'localhost'))
  );
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};

const hasWorkDataShape = (value: unknown): boolean => {
  if (!isRecord(value)) {
    return false;
  }

  return 'work' in value && 'firstEpisodes' in value && 'latestEpisodes' in value;
};

const requireText = (value: string | undefined): string => {
  return validateConnectorValue(textSchema, value);
};

const normalizeKadocomiUrl = (value: string, config: KadocomiConfig): URL => {
  let url: URL;

  try {
    url = new URL(value, config.baseUrl);
  } catch {
    throw new ConnectorValidationError(1);
  }

  if (
    !isAllowedProtocol(url) ||
    !config.allowedHosts.includes(url.host.toLowerCase()) ||
    !/^\/detail\/[A-Za-z0-9_]+(?:\/episodes\/[A-Za-z0-9_]+)?\/?$/u.test(url.pathname)
  ) {
    throw new ConnectorValidationError(1);
  }

  url.hash = '';
  url.search = '';
  return url;
};

const workUrl = (code: string, config: KadocomiConfig): string => {
  const url = new URL(config.baseUrl);
  url.pathname = '/detail/' + code;
  return normalizeKadocomiUrl(url.href, config).href;
};

const parseDate = (value: string): Date | null => {
  const normalized = value.normalize('NFKC').trim();
  const japaneseDate = normalized.match(/^(\d{4})\/(\d{2})\/(\d{2})$/u);

  if (japaneseDate) {
    const [, year, month, day] = japaneseDate;
    const yearNumber = Number(year);
    const monthNumber = Number(month);
    const dayNumber = Number(day);
    const date = new Date(Date.UTC(yearNumber, monthNumber - 1, dayNumber));

    if (
      date.getUTCFullYear() !== yearNumber ||
      date.getUTCMonth() + 1 !== monthNumber ||
      date.getUTCDate() !== dayNumber
    ) {
      throw new ConnectorValidationError(1);
    }

    return date;
  }

  const date = new Date(normalized);
  return Number.isFinite(date.getTime()) ? date : null;
};

const toSerialStatus = (value: string): SerialStatus => {
  switch (value) {
    case 'ongoing':
      return 'ongoing';
    case 'completed':
      return 'completed';
    case 'hiatus':
      return 'hiatus';
    default:
      return 'unknown';
  }
};

export const classifyKadocomiEntry = (type: string): PublicationEntryKind => {
  switch (type) {
    case 'normal':
      return 'regular';
    case 'extra':
      return 'extra';
    case 'comic':
    case 'comics':
    case 'announcement':
    case 'illustration':
    case 'promotion':
      return 'announcement';
    default:
      return 'unknown';
  }
};

const episodeEquals = (left: KadocomiEpisodeInput, right: KadocomiEpisodeInput): boolean => {
  return (
    left.code === right.code &&
    left.isActive === right.isActive &&
    left.title === right.title &&
    left.type === right.type &&
    left.updateDate === right.updateDate
  );
};

const collectEpisodes = (data: KadocomiWorkData): readonly KadocomiEpisodeInput[] => {
  const collections = [data.firstEpisodes, data.latestEpisodes];
  const episodes = new Map<string, KadocomiEpisodeInput>();

  for (const collection of collections) {
    if (collection.total !== collection.result.length) {
      throw new ConnectorValidationError(1);
    }

    for (const episode of collection.result) {
      const previous = episodes.get(episode.code);

      if (previous && !episodeEquals(previous, episode)) {
        throw new ConnectorValidationError(1);
      }

      episodes.set(episode.code, episode);
    }
  }

  if (episodes.size === 0) {
    throw new ConnectorValidationError(1);
  }

  return [...episodes.values()];
};

const findWorkData = (json: string): KadocomiWorkData => {
  let parsed: unknown;

  try {
    parsed = JSON.parse(json);
  } catch {
    throw new ConnectorValidationError(1);
  }

  const nextData = validateConnectorValue(nextDataSchema, parsed);
  const matches = nextData.props.pageProps.dehydratedState.queries
    .map((query) => query.state.data)
    .filter(hasWorkDataShape)
    .map((value) => validateConnectorValue(workDataSchema, value));

  if (matches.length !== 1) {
    throw new ConnectorValidationError(1);
  }

  const workData = matches[0];

  if (!workData) {
    throw new ConnectorValidationError(1);
  }

  return workData;
};

const toCandidate = (
  data: KadocomiWorkData,
  config: KadocomiConfig,
): KadocomiPublicationCandidate => {
  const episodes = collectEpisodes(data);
  const entries = episodes.flatMap((episode): PublicationEntryCandidate[] => {
    if (!episode.isActive) {
      return [];
    }

    return [
      {
        externalId: episode.code,
        kind: classifyKadocomiEntry(episode.type),
        publishedAt: episode.updateDate === null ? null : parseDate(episode.updateDate),
        title: episode.title,
        url: workUrl(data.work.code, config) + '/episodes/' + episode.code,
      },
    ];
  });
  const updatedAt = entries
    .map((entry) => entry.publishedAt)
    .filter((date): date is Date => date !== null)
    .reduce<Date | null>(
      (latest, date) => (latest === null || latest.getTime() < date.getTime() ? date : latest),
      null,
    );

  return {
    ageRatingValue: data.work.ratingLevel,
    authorDetails: data.work.authors,
    authors: data.work.authors.map((author) => author.name),
    entries,
    externalId: data.work.code,
    kind: 'official',
    kindEvidence: new URL(config.baseUrl).href,
    nextUpdateAt:
      data.work.nextUpdateDateText === null ? null : parseDate(data.work.nextUpdateDateText),
    nextUpdateDateText: data.work.nextUpdateDateText,
    serialStatus: toSerialStatus(data.work.serializationStatus),
    sourceId: '',
    title: data.work.title,
    updatedAt,
    url: workUrl(data.work.code, config),
  };
};

export const parseKadocomiHtmlFallback = (
  html: string,
  config: KadocomiConfig,
): KadocomiPublicationCandidate => {
  const document = load(html);
  const canonical = normalizeKadocomiUrl(
    requireText(document('link[rel="canonical"]').first().attr('href')),
    config,
  );
  const title = requireText(document('meta[property="og:title"]').first().attr('content')).split(
    '｜',
  )[0];

  return {
    ageRatingValue: null,
    authorDetails: [],
    authors: [],
    entries: [],
    externalId: canonical.pathname.split('/')[2] ?? null,
    kind: 'official',
    kindEvidence: new URL(config.baseUrl).href,
    nextUpdateAt: null,
    nextUpdateDateText: null,
    serialStatus: 'unknown',
    sourceId: '',
    title: requireText(title),
    updatedAt: null,
    url: canonical.href,
  };
};

export const parseKadocomiPublicationPage = (
  html: string,
  config: KadocomiConfig,
): KadocomiPublicationCandidate => {
  const document = load(html);
  const scripts = document('script#__NEXT_DATA__');

  if (scripts.length === 0) {
    return parseKadocomiHtmlFallback(html, config);
  }

  if (scripts.length !== 1) {
    throw new ConnectorValidationError(1);
  }

  return toCandidate(findWorkData(requireText(scripts.first().text())), config);
};

export class KadocomiConnector implements Connector {
  readonly #config: KadocomiConfig;
  readonly #http: HttpReader;

  constructor(config: KadocomiConfig, http: HttpReader) {
    const baseUrl = new URL(config.baseUrl);

    if (
      !isAllowedProtocol(baseUrl) ||
      !config.allowedHosts.includes(baseUrl.host.toLowerCase()) ||
      baseUrl.pathname !== '/'
    ) {
      throw new Error('Kadocomi config must use an allowed root URL');
    }

    this.#config = config;
    this.#http = http;
  }

  async discover(_context: DiscoveryContext): Promise<DiscoveryBatch> {
    return { candidates: [], checkpoint: { mode: 'reference-only' } };
  }

  async fetchPublication(reference: PublicationRef): Promise<KadocomiPublicationCandidate> {
    const url = normalizeKadocomiUrl(reference.url, this.#config);
    const result = await this.#http.get({
      acceptedContentTypes: ['text/html'],
      sourceId: reference.sourceId,
      state: null,
      url: url.href,
    });

    if (result.status !== 'modified') {
      throw new Error('a stateless kadocomi request cannot be not modified');
    }

    let html: string;

    try {
      html = utf8.decode(result.body);
    } catch {
      throw new ConnectorValidationError(1);
    }

    const candidate = parseKadocomiPublicationPage(html, this.#config);

    if (candidate.externalId !== reference.externalId && reference.externalId !== null) {
      throw new ConnectorValidationError(1);
    }

    return { ...candidate, sourceId: reference.sourceId };
  }
}

export const createKadocomiConnector = (
  config: KadocomiConfig,
  http: HttpReader,
): KadocomiConnector => {
  return new KadocomiConnector(config, http);
};
