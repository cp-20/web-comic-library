import type { BibliographyProviderPort } from '@web-comic-library/application';
import type { BibliographyProviderRecord } from '@web-comic-library/domain';
import { load } from 'cheerio';
import * as v from 'valibot';

import { ConnectorValidationError } from './validation';

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const text = v.pipe(v.string(), v.trim(), v.minLength(1));
const optionalText = v.optional(v.nullable(text));
const contributorSchema = v.object({ PersonName: optionalText });
const openBdItemSchema = v.nullable(
  v.object({
    hanmoto: v.optional(v.object({ cover: optionalText, coverLicenseUrl: optionalText })),
    onix: v.object({
      DescriptiveDetail: v.object({
        Contributor: v.optional(v.array(contributorSchema)),
        TitleDetail: v.object({ TitleText: optionalText }),
      }),
      ProductIdentifier: v.object({ IDValue: optionalText }),
      PublishingDetail: v.optional(
        v.object({
          Publisher: v.optional(v.object({ PublisherName: optionalText })),
          PublishingDate: v.optional(
            v.array(v.object({ Date: optionalText, PublishingDateRole: optionalText })),
          ),
        }),
      ),
    }),
  }),
);
const openBdResponseSchema = v.array(openBdItemSchema);

const openBdTermsUrl = 'https://openbd.jp/terms/';
const ndlTermsUrl = 'https://ndlsearch.ndl.go.jp/help/api';

const requireHttps = (value: string): string => {
  if (new URL(value).protocol !== 'https:') throw new ConnectorValidationError(1);
  return value;
};

const dateFromOpenBd = (
  dates:
    | readonly {
        Date?: string | null | undefined;
        PublishingDateRole?: string | null | undefined;
      }[]
    | undefined,
): string | null => {
  const date =
    dates?.find((item) => item.PublishingDateRole === '01')?.Date ?? dates?.[0]?.Date ?? null;
  return date && /^\d{4}-\d{2}-\d{2}$/u.test(date) ? date : null;
};

export const parseOpenBdResponse = (
  input: unknown,
  isbn: string,
  fetchedAt: Date,
): BibliographyProviderRecord => {
  const result = v.safeParse(openBdResponseSchema, input);
  if (!result.success) throw new ConnectorValidationError(result.issues.length);
  const item = result.output[0];
  const sourceUrl = `https://api.openbd.jp/v1/get?isbn=${encodeURIComponent(isbn)}`;
  if (!item)
    return {
      authors: null,
      cover: null,
      fetchedAt,
      found: false,
      isbn,
      provider: 'openbd',
      publishedAt: null,
      publisher: null,
      sourceUrl,
      termsUrl: openBdTermsUrl,
      title: null,
    };
  const cover =
    item.hanmoto?.cover && item.hanmoto.coverLicenseUrl
      ? {
          licenseUrl: requireHttps(item.hanmoto.coverLicenseUrl),
          url: requireHttps(item.hanmoto.cover),
        }
      : null;
  return {
    authors:
      item.onix.DescriptiveDetail.Contributor?.flatMap((contributor) =>
        contributor.PersonName ? [contributor.PersonName] : [],
      ) ?? null,
    cover,
    fetchedAt,
    found: true,
    isbn,
    provider: 'openbd',
    publishedAt: dateFromOpenBd(item.onix.PublishingDetail?.PublishingDate),
    publisher: item.onix.PublishingDetail?.Publisher?.PublisherName ?? null,
    sourceUrl,
    termsUrl: openBdTermsUrl,
    title: item.onix.DescriptiveDetail.TitleDetail.TitleText ?? null,
  };
};

export const parseNdlSruResponse = (
  xml: string,
  isbn: string,
  fetchedAt: Date,
): BibliographyProviderRecord => {
  const document = load(xml, { xmlMode: true });
  const sourceUrl = `https://ndlsearch.ndl.go.jp/api/sru?operation=searchRetrieve&recordSchema=dcndl&query=${encodeURIComponent(`isbn="${isbn}"`)}`;
  const count = Number(document('numberOfRecords').first().text());
  if (!Number.isSafeInteger(count) || count < 0) throw new ConnectorValidationError(1);
  if (count === 0)
    return {
      authors: null,
      cover: null,
      fetchedAt,
      found: false,
      isbn,
      provider: 'ndl',
      publishedAt: null,
      publisher: null,
      sourceUrl,
      termsUrl: ndlTermsUrl,
      title: null,
    };
  const textOf = (selector: string): string | null =>
    document(selector).first().text().trim() || null;
  const issued = textOf('dcterms\\:issued, issued');
  return {
    authors: document('dc\\:creator, creator')
      .toArray()
      .map((node) => document(node).text().trim())
      .filter(Boolean),
    cover: null,
    fetchedAt,
    found: true,
    isbn,
    provider: 'ndl',
    publishedAt: issued && /^\d{4}-\d{2}-\d{2}$/u.test(issued) ? issued : null,
    publisher: textOf('dc\\:publisher, publisher'),
    sourceUrl,
    termsUrl: ndlTermsUrl,
    title: textOf('dc\\:title, title'),
  };
};

abstract class HttpBibliographyProvider implements BibliographyProviderPort {
  readonly #fetch: Fetcher;
  constructor(fetcher: Fetcher = fetch) {
    this.#fetch = fetcher;
  }
  protected async get(url: string, accept: string): Promise<{ body: string; fetchedAt: Date }> {
    const response = await this.#fetch(url, {
      headers: { Accept: accept },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`bibliography provider returned HTTP ${response.status}`);
    return { body: await response.text(), fetchedAt: new Date() };
  }
  abstract lookup(isbn: string): Promise<BibliographyProviderRecord>;
}

export class OpenBdBibliographyProvider extends HttpBibliographyProvider {
  async lookup(isbn: string): Promise<BibliographyProviderRecord> {
    const url = `https://api.openbd.jp/v1/get?isbn=${encodeURIComponent(isbn)}`;
    const response = await this.get(url, 'application/json');
    const body: unknown = JSON.parse(response.body);
    return parseOpenBdResponse(body, isbn, response.fetchedAt);
  }
}

export class NdlBibliographyProvider extends HttpBibliographyProvider {
  async lookup(isbn: string): Promise<BibliographyProviderRecord> {
    const query = encodeURIComponent(`isbn="${isbn}"`);
    const url = `https://ndlsearch.ndl.go.jp/api/sru?operation=searchRetrieve&version=1.2&recordSchema=dcndl&recordPacking=xml&maximumRecords=1&query=${query}`;
    const response = await this.get(url, 'application/xml, text/xml');
    return parseNdlSruResponse(response.body, isbn, response.fetchedAt);
  }
}

export const createOpenBdBibliographyProvider = (fetcher?: Fetcher): OpenBdBibliographyProvider =>
  new OpenBdBibliographyProvider(fetcher);
export const createNdlBibliographyProvider = (fetcher?: Fetcher): NdlBibliographyProvider =>
  new NdlBibliographyProvider(fetcher);
