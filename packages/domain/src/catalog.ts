export const serialStatuses = ['ongoing', 'hiatus', 'completed', 'unknown'] as const;

export type SerialStatus = (typeof serialStatuses)[number];

export const workAliasKinds = ['alternate', 'former', 'reading'] as const;

export type WorkAliasKind = (typeof workAliasKinds)[number];

export const publicationKinds = ['official', 'user_submission', 'unknown'] as const;

export type PublicationKind = (typeof publicationKinds)[number];

export const publicationEntryKinds = [
  'regular',
  'extra',
  'republication',
  'announcement',
  'unknown',
] as const;

export type PublicationEntryKind = (typeof publicationEntryKinds)[number];

export type Work = Readonly<{
  id: string;
  retiredAt: Date | null;
  serialStatus: SerialStatus;
  title: string;
}>;

export type WorkAlias = Readonly<{
  id: string;
  kind: WorkAliasKind;
  value: string;
  workId: string;
}>;

export type Creator = Readonly<{
  id: string;
  name: string;
}>;

export type WorkCreator = Readonly<{
  creatorId: string;
  position: number;
  role: string;
  workId: string;
}>;

export type Source = Readonly<{
  baseUrl: string;
  id: string;
  key: string;
  name: string;
}>;

export type Publication = Readonly<{
  externalId: string | null;
  id: string;
  kind: PublicationKind;
  normalizedUrl: string;
  retiredAt: Date | null;
  sourceId: string;
  title: string;
  workId: string;
}>;

export type ContentUnit = Readonly<{
  id: string;
  position: number;
  retiredAt: Date | null;
  title: string;
  workId: string;
}>;

export type PublicationEntry = Readonly<{
  externalId: string | null;
  id: string;
  kind: PublicationEntryKind;
  normalizedUrl: string;
  position: number;
  publishedAt: Date | null;
  publicationId: string;
  retiredAt: Date | null;
  title: string;
  workId: string;
}>;

export type EntryContentMapping = Readonly<{
  confirmed: boolean;
  contentUnitId: string;
  publicationEntryId: string;
  workId: string;
}>;

const requireText = (value: string, field: string): string => {
  const trimmed = value.trim();

  if (!trimmed) {
    throw new Error(`${field} must not be empty`);
  }

  return trimmed;
};

const requirePosition = (value: number): number => {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error('position must be a non-negative safe integer');
  }

  return value;
};

const requireHttpUrl = (value: string, field: string): string => {
  const parsed = new URL(value);

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`${field} must use HTTP or HTTPS`);
  }

  return value;
};

export const createWork = (input: Work): Work => {
  return { ...input, title: requireText(input.title, 'title') };
};

export const createWorkAlias = (input: WorkAlias): WorkAlias => {
  return { ...input, value: requireText(input.value, 'value') };
};

export const createCreator = (input: Creator): Creator => {
  return { ...input, name: requireText(input.name, 'name') };
};

export const createWorkCreator = (input: WorkCreator): WorkCreator => {
  return {
    ...input,
    position: requirePosition(input.position),
    role: requireText(input.role, 'role'),
  };
};

export const createSource = (input: Source): Source => {
  return {
    ...input,
    baseUrl: requireHttpUrl(input.baseUrl, 'baseUrl'),
    key: requireText(input.key, 'key'),
    name: requireText(input.name, 'name'),
  };
};

export const createPublication = (input: Publication): Publication => {
  return {
    ...input,
    externalId: input.externalId === null ? null : requireText(input.externalId, 'externalId'),
    normalizedUrl: requireHttpUrl(input.normalizedUrl, 'normalizedUrl'),
    title: requireText(input.title, 'title'),
  };
};

export const createContentUnit = (input: ContentUnit): ContentUnit => {
  return {
    ...input,
    position: requirePosition(input.position),
    title: requireText(input.title, 'title'),
  };
};

export const createPublicationEntry = (input: PublicationEntry): PublicationEntry => {
  return {
    ...input,
    externalId: input.externalId === null ? null : requireText(input.externalId, 'externalId'),
    normalizedUrl: requireHttpUrl(input.normalizedUrl, 'normalizedUrl'),
    position: requirePosition(input.position),
    title: requireText(input.title, 'title'),
  };
};

export const createEntryContentMapping = (
  entry: Pick<PublicationEntry, 'id' | 'workId'>,
  contentUnit: Pick<ContentUnit, 'id' | 'workId'>,
  confirmed: boolean,
): EntryContentMapping => {
  if (entry.workId !== contentUnit.workId) {
    throw new Error('publication entry and content unit must belong to the same work');
  }

  return {
    confirmed,
    contentUnitId: contentUnit.id,
    publicationEntryId: entry.id,
    workId: entry.workId,
  };
};

export const isCatchUpEntryKind = (kind: PublicationEntryKind): boolean => {
  return kind === 'regular' || kind === 'extra';
};
