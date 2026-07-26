export const bibliographyProviders = ['openbd', 'ndl', 'publisher'] as const;

export type BibliographyProvider = (typeof bibliographyProviders)[number];

export const bibliographyFields = [
  'title',
  'authors',
  'publisher',
  'published_at',
  'cover',
] as const;

export type BibliographyField = (typeof bibliographyFields)[number];

export const volumePublicationStatuses = ['active', 'withdrawn'] as const;

export type VolumePublicationStatus = (typeof volumePublicationStatuses)[number];

export const volumeContentMappingStatuses = ['confirmed', 'unconfirmed', 'rejected'] as const;

export type VolumeContentMappingStatus = (typeof volumeContentMappingStatuses)[number];

export type VolumeIdentifier =
  | Readonly<{ isbn: string; kind: 'isbn' }>
  | Readonly<{ kind: 'publisher_product'; publisherProductId: string }>;

export type LicensedCover = Readonly<{
  licenseUrl: string;
  url: string;
}>;

export type BibliographyProviderRecord = Readonly<{
  authors: readonly string[] | null;
  cover: LicensedCover | null;
  fetchedAt: Date;
  found: boolean;
  isbn: string;
  provider: Exclude<BibliographyProvider, 'publisher'>;
  publishedAt: string | null;
  publisher: string | null;
  sourceUrl: string;
  termsUrl: string;
  title: string | null;
}>;

export type ResolvedBibliographyField<Value> = Readonly<{
  fetchedAt: Date;
  provider: BibliographyProvider;
  termsUrl: string;
  value: Value;
}>;

export type ResolvedBibliography = Readonly<{
  authors: ResolvedBibliographyField<readonly string[]>;
  cover: ResolvedBibliographyField<LicensedCover> | null;
  publishedAt: ResolvedBibliographyField<string> | null;
  publisher: ResolvedBibliographyField<string> | null;
  title: ResolvedBibliographyField<string>;
}>;

export type VolumeEdition = Readonly<{
  authors: readonly string[];
  cover: LicensedCover | null;
  id: string;
  isbn: string | null;
  publicationStatus: VolumePublicationStatus;
  publishedAt: string | null;
  publisher: string | null;
  publisherProductId: string | null;
  retiredAt: Date | null;
  title: string;
  workId: string;
}>;

export type VolumeContentMapping = Readonly<{
  contentUnitId: string;
  status: VolumeContentMappingStatus;
  volumeEditionId: string;
  workId: string;
}>;

const requireText = (value: string, field: string): string => {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${field} must not be empty`);
  return trimmed;
};

const requireHttpsUrl = (value: string, field: string): string => {
  const parsed = new URL(value);
  if (parsed.protocol !== 'https:') throw new Error(`${field} must use HTTPS`);
  return value;
};

const isbn13CheckDigit = (digits: string): number => {
  const sum = [...digits].reduce((total, digit, index) => {
    const value = Number(digit);
    return total + value * (index % 2 === 0 ? 1 : 3);
  }, 0);
  return (10 - (sum % 10)) % 10;
};

const isValidIsbn10 = (digits: string): boolean => {
  const sum = [...digits].reduce((total, digit, index) => {
    const value = digit === 'X' ? 10 : Number(digit);
    return total + value * (10 - index);
  }, 0);
  return sum % 11 === 0;
};

export const normalizeIsbn = (input: string): string => {
  const compact = input.replace(/[\s-]/gu, '').toUpperCase();

  if (/^97[89]\d{10}$/u.test(compact)) {
    if (isbn13CheckDigit(compact.slice(0, 12)) !== Number(compact[12])) {
      throw new Error('ISBN-13 check digit is invalid');
    }
    return compact;
  }

  if (/^\d{9}[\dX]$/u.test(compact)) {
    if (!isValidIsbn10(compact)) throw new Error('ISBN-10 check digit is invalid');
    const isbn13Base = `978${compact.slice(0, 9)}`;
    return `${isbn13Base}${isbn13CheckDigit(isbn13Base)}`;
  }

  throw new Error('ISBN must be ISBN-10 or ISBN-13');
};

export const createVolumeIdentifier = (input: VolumeIdentifier): VolumeIdentifier => {
  if (input.kind === 'isbn') return { isbn: normalizeIsbn(input.isbn), kind: 'isbn' };
  return {
    kind: 'publisher_product',
    publisherProductId: requireText(input.publisherProductId, 'publisher product ID'),
  };
};

const resolveTextField = (
  records: readonly BibliographyProviderRecord[],
  field: 'publishedAt' | 'publisher' | 'title',
): ResolvedBibliographyField<string> | null => {
  for (const provider of ['openbd', 'ndl'] as const) {
    const record = records.find((candidate) => candidate.provider === provider && candidate.found);
    const value = record?.[field];
    if (record && typeof value === 'string' && value.trim()) {
      return {
        fetchedAt: record.fetchedAt,
        provider,
        termsUrl: record.termsUrl,
        value: value.trim(),
      };
    }
  }
  return null;
};

export const resolveBibliography = (
  records: readonly BibliographyProviderRecord[],
): ResolvedBibliography => {
  const title = resolveTextField(records, 'title');
  if (!title) throw new Error('bibliography title is required from a provider');

  let authors: ResolvedBibliographyField<readonly string[]> | null = null;
  let cover: ResolvedBibliographyField<LicensedCover> | null = null;
  for (const provider of ['openbd', 'ndl'] as const) {
    const record = records.find((candidate) => candidate.provider === provider && candidate.found);
    if (!record) continue;
    if (!authors && record.authors !== null && record.authors.length > 0) {
      authors = {
        fetchedAt: record.fetchedAt,
        provider,
        termsUrl: record.termsUrl,
        value: record.authors.map((author) => requireText(author, 'author')),
      };
    }
    if (!cover && record.cover !== null) {
      cover = {
        fetchedAt: record.fetchedAt,
        provider,
        termsUrl: record.termsUrl,
        value: {
          licenseUrl: requireHttpsUrl(record.cover.licenseUrl, 'cover license URL'),
          url: requireHttpsUrl(record.cover.url, 'cover URL'),
        },
      };
    }
  }

  return {
    authors: authors ?? {
      fetchedAt: title.fetchedAt,
      provider: title.provider,
      termsUrl: title.termsUrl,
      value: [],
    },
    cover,
    publishedAt: resolveTextField(records, 'publishedAt'),
    publisher: resolveTextField(records, 'publisher'),
    title,
  };
};

export const createVolumeEdition = (input: VolumeEdition): VolumeEdition => {
  if (input.isbn === null && input.publisherProductId === null) {
    throw new Error('volume edition requires an ISBN or publisher product ID');
  }
  return {
    ...input,
    authors: input.authors.map((author) => requireText(author, 'author')),
    isbn: input.isbn === null ? null : normalizeIsbn(input.isbn),
    publisherProductId:
      input.publisherProductId === null
        ? null
        : requireText(input.publisherProductId, 'publisher product ID'),
    title: requireText(input.title, 'title'),
  };
};

export const createVolumeContentMapping = (input: VolumeContentMapping): VolumeContentMapping => {
  if (!input.volumeEditionId || !input.contentUnitId || !input.workId) {
    throw new Error('volume content mapping identifiers must not be empty');
  }
  return input;
};
