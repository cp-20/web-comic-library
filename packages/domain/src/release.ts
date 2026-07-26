export const releaseEventKinds = [
  'announcement',
  'availability_changed',
  'extra',
  'new_episode',
  'new_volume',
  'republication',
] as const;

export type ReleaseEventKind = (typeof releaseEventKinds)[number];

export type ReleaseEvent = Readonly<{
  id: string;
  idempotencyKey: string;
  kind: ReleaseEventKind;
  notificationSuppressed: boolean;
  occurredAt: Date;
  publicationEntryId: string;
  sourceId: string;
}>;

export type WorkMatchCandidate = Readonly<{
  authors: readonly string[];
  kind: 'official' | 'unknown' | 'user_submission';
  title: string;
}>;

export type EntryMatchCandidate = Readonly<{
  kind: 'announcement' | 'extra' | 'regular' | 'republication' | 'unknown';
  title: string;
}>;

export type EpisodeIdentity = Readonly<{
  branch: string | null;
  number: number;
}>;

const requireText = (value: string, field: string): string => {
  const normalized = value.normalize('NFKC').replace(/\s+/gu, ' ').trim();

  if (!normalized) {
    throw new Error(field + ' must not be empty');
  }

  return normalized;
};

export const normalizeComparableText = (value: string): string => {
  return requireText(value, 'value').toLocaleLowerCase('ja-JP');
};

export const normalizeAuthorNames = (authors: readonly string[]): readonly string[] => {
  const normalized = [...new Set(authors.map((author) => normalizeComparableText(author)))];
  return normalized.toSorted();
};

export const canAutomaticallyMergeWorks = (
  left: WorkMatchCandidate,
  right: WorkMatchCandidate,
): boolean => {
  if (
    left.kind !== right.kind ||
    normalizeComparableText(left.title) !== normalizeComparableText(right.title)
  ) {
    return false;
  }

  const leftAuthors = normalizeAuthorNames(left.authors);
  const rightAuthors = normalizeAuthorNames(right.authors);

  return (
    leftAuthors.length > 0 &&
    leftAuthors.length === rightAuthors.length &&
    leftAuthors.every((author, index) => author === rightAuthors[index])
  );
};

const splitMarker = /(?:前編|後編|前半|後半|分割|part\s*\d+|[①-⑳])/iu;
const episodePattern =
  /(?:第\s*)?(\d+)\s*(?:話|回|話目)\s*(?:[（(]?\s*(\d+)\s*[)）]?|([①-⑳]))?\s*$/iu;

export const parseEpisodeIdentity = (title: string): EpisodeIdentity | null => {
  if (splitMarker.test(title)) {
    return null;
  }

  const normalized = normalizeComparableText(title);

  if (splitMarker.test(normalized)) {
    return null;
  }

  const match = normalized.match(episodePattern);

  if (!match) {
    return null;
  }

  const number = Number(match[1]);

  if (!Number.isSafeInteger(number) || number < 1) {
    return null;
  }

  const branch = match[2] ?? match[3] ?? null;
  return { branch, number };
};

export const canAutomaticallyMapEntries = (
  left: EntryMatchCandidate,
  right: EntryMatchCandidate,
): boolean => {
  if (normalizeComparableText(left.title) !== normalizeComparableText(right.title)) {
    return false;
  }

  const leftIdentity = parseEpisodeIdentity(left.title);
  const rightIdentity = parseEpisodeIdentity(right.title);

  return (
    leftIdentity !== null &&
    rightIdentity !== null &&
    leftIdentity.number === rightIdentity.number &&
    leftIdentity.branch === rightIdentity.branch
  );
};

export const releaseEventKindForEntry = (
  kind: EntryMatchCandidate['kind'],
  title: string,
): ReleaseEventKind | null => {
  if (kind === 'regular') return 'new_episode';
  if (kind === 'extra') return 'extra';
  if (kind === 'republication') return 'republication';
  if (kind !== 'announcement') return null;

  return /(?:単行本|新刊)/u.test(title.normalize('NFKC')) ? 'new_volume' : 'announcement';
};

export const createReleaseEvent = (input: ReleaseEvent): ReleaseEvent => {
  if (!releaseEventKinds.includes(input.kind)) {
    throw new Error('kind must be a supported release event kind');
  }

  if (!Number.isFinite(input.occurredAt.getTime())) {
    throw new Error('occurredAt must be a valid date');
  }

  return {
    ...input,
    idempotencyKey: requireText(input.idempotencyKey, 'idempotencyKey'),
    publicationEntryId: requireText(input.publicationEntryId, 'publicationEntryId'),
    sourceId: requireText(input.sourceId, 'sourceId'),
  };
};
