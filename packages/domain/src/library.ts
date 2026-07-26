import type { Visibility } from './identity';

export const readingStatuses = [
  'want_to_read',
  'reading',
  'paused',
  'dropped',
  'completed',
] as const;

export type ReadingStatus = (typeof readingStatuses)[number];

export type LibraryEntry = Readonly<{
  status: ReadingStatus;
  userUuid: string;
  visibility: Visibility | null;
  workId: string;
}>;

export type ReadingStatusHistory = Readonly<{
  changedAt: Date;
  status: ReadingStatus;
  userUuid: string;
  workId: string;
}>;

export type ContentReadRecord = Readonly<{
  contentUnitId: string;
  readAt: Date;
  userUuid: string;
  visibility: Visibility | null;
  workId: string;
}>;

export type PublicationReadRecord = Readonly<{
  publicationEntryId: string;
  readAt: Date;
  userUuid: string;
  visibility: Visibility | null;
  workId: string;
}>;

export const createLibraryEntry = (
  userUuid: string,
  workId: string,
  status: ReadingStatus,
  visibility: Visibility | null,
): LibraryEntry => {
  if (!readingStatuses.includes(status)) throw new Error('reading status is invalid');
  if (!userUuid.trim() || !workId.trim())
    throw new Error('library entry identity must not be empty');
  return { status, userUuid, visibility, workId };
};

export const transitionReadingStatus = (
  entry: LibraryEntry | null,
  status: ReadingStatus,
  changedAt: Date,
): Readonly<{ entry: LibraryEntry; history: ReadingStatusHistory }> => {
  if (!(changedAt instanceof Date) || Number.isNaN(changedAt.valueOf())) {
    throw new Error('reading status change time must be valid');
  }
  if (!readingStatuses.includes(status)) throw new Error('reading status is invalid');
  if (entry === null) throw new Error('library entry must exist before changing status');
  if (entry.userUuid.trim() === '' || entry.workId.trim() === '') {
    throw new Error('library entry identity must not be empty');
  }
  const { userUuid, workId } = entry;
  const next = { ...entry, status };
  return { entry: next, history: { changedAt, status, userUuid, workId } };
};

export const isCaughtUp = (
  eligibleContentUnitIds: readonly string[],
  readContentUnitIds: readonly string[],
): boolean =>
  eligibleContentUnitIds.length > 0 &&
  eligibleContentUnitIds.every((id) => readContentUnitIds.includes(id));
