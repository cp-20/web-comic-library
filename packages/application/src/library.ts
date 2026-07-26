import type {
  ContentReadRecord,
  LibraryEntry,
  PublicationReadRecord,
  ReadingStatus,
  Visibility,
} from '@web-comic-library/domain';
import { createLibraryEntry, isCaughtUp, transitionReadingStatus } from '@web-comic-library/domain';

import type { TransactionContext, TransactionPort } from './persistence';

export type ReadMapping = Readonly<{
  confirmed: boolean;
  contentUnitId: string;
  publicationEntryId: string;
}>;

export type LibraryWorkReadModel = Readonly<{
  catchUpContentUnitIds: readonly string[];
  contentUnits: readonly Readonly<{ id: string; position: number }>[];
  mappings: readonly ReadMapping[];
  publicationEntryIds: readonly string[];
  workId: string;
}>;

export interface LibraryRepository {
  deleteContentReadRecords(
    context: TransactionContext,
    userUuid: string,
    contentUnitIds: readonly string[],
  ): Promise<void>;
  deletePublicationReadRecords(
    context: TransactionContext,
    userUuid: string,
    publicationEntryIds: readonly string[],
  ): Promise<void>;
  findLibraryEntry(userUuid: string, workId: string): Promise<LibraryEntry | null>;
  findWorkReadModel(workId: string): Promise<LibraryWorkReadModel | null>;
  listReadContentUnitIds(userUuid: string, workId: string): Promise<readonly string[]>;
  saveContentReadRecords(
    context: TransactionContext,
    records: readonly ContentReadRecord[],
  ): Promise<void>;
  saveLibraryEntry(
    context: TransactionContext,
    entry: LibraryEntry,
    changedAt: Date,
  ): Promise<void>;
  savePublicationReadRecords(
    context: TransactionContext,
    records: readonly PublicationReadRecord[],
  ): Promise<void>;
}

export const setReadingStatus = async (
  transactions: TransactionPort,
  repository: LibraryRepository,
  input: Readonly<{
    status: ReadingStatus;
    userUuid: string;
    visibility: Visibility | null;
    workId: string;
  }>,
  now: Date = new Date(),
): Promise<LibraryEntry> => {
  const current = await repository.findLibraryEntry(input.userUuid, input.workId);
  const entry =
    current ?? createLibraryEntry(input.userUuid, input.workId, input.status, input.visibility);
  const next = current === null ? entry : transitionReadingStatus(current, input.status, now).entry;
  await transactions.transaction((context) => repository.saveLibraryEntry(context, next, now));
  return next;
};

export const markContentRead = async (
  transactions: TransactionPort,
  repository: LibraryRepository,
  input: Readonly<{
    contentUnitIds: readonly string[];
    userUuid: string;
    visibility: Visibility | null;
    workId: string;
  }>,
  now: Date = new Date(),
): Promise<void> => {
  const work = await repository.findWorkReadModel(input.workId);
  if (!work || work.workId !== input.workId) throw new Error('work is unavailable');
  const ids = [...new Set(input.contentUnitIds)];
  if (ids.length === 0 || ids.some((id) => !id.trim()))
    throw new Error('content unit IDs are required');
  if (ids.some((id) => !work.contentUnits.some((unit) => unit.id === id))) {
    throw new Error('content unit does not belong to work');
  }
  const records: ContentReadRecord[] = ids.map((contentUnitId) => ({
    ...input,
    contentUnitId,
    readAt: now,
  }));
  const publicationRecords: PublicationReadRecord[] = work.mappings
    .filter((mapping) => mapping.confirmed && ids.includes(mapping.contentUnitId))
    .map((mapping) => ({
      publicationEntryId: mapping.publicationEntryId,
      readAt: now,
      userUuid: input.userUuid,
      visibility: input.visibility,
      workId: input.workId,
    }));
  await transactions.transaction(async (context) => {
    await repository.saveContentReadRecords(context, records);
    await repository.savePublicationReadRecords(context, publicationRecords);
  });
};

export const calculateCatchUp = async (
  repository: LibraryRepository,
  userUuid: string,
  workId: string,
): Promise<boolean> => {
  const work = await repository.findWorkReadModel(workId);
  if (!work) return false;
  return isCaughtUp(
    work.catchUpContentUnitIds,
    await repository.listReadContentUnitIds(userUuid, workId),
  );
};

export const markContentReadThrough = async (
  transactions: TransactionPort,
  repository: LibraryRepository,
  input: Readonly<{
    contentUnitId: string;
    userUuid: string;
    visibility: Visibility | null;
    workId: string;
  }>,
  now: Date = new Date(),
): Promise<void> => {
  const work = await repository.findWorkReadModel(input.workId);
  const target = work?.contentUnits.find((unit) => unit.id === input.contentUnitId);
  if (!work || !target) throw new Error('content unit is unavailable');
  return markContentRead(
    transactions,
    repository,
    {
      contentUnitIds: work.contentUnits
        .filter((unit) => unit.position <= target.position)
        .map((unit) => unit.id),
      userUuid: input.userUuid,
      visibility: input.visibility,
      workId: input.workId,
    },
    now,
  );
};

export const unmarkContentRead = async (
  transactions: TransactionPort,
  repository: LibraryRepository,
  input: Readonly<{ contentUnitIds: readonly string[]; userUuid: string; workId: string }>,
): Promise<void> => {
  const work = await repository.findWorkReadModel(input.workId);
  if (!work) throw new Error('work is unavailable');
  const ids = [...new Set(input.contentUnitIds)];
  if (ids.length === 0) throw new Error('content unit IDs are required');
  const entryIds = work.mappings
    .filter((mapping) => mapping.confirmed && ids.includes(mapping.contentUnitId))
    .map((mapping) => mapping.publicationEntryId);
  await transactions.transaction(async (context) => {
    await repository.deleteContentReadRecords(context, input.userUuid, ids);
    await repository.deletePublicationReadRecords(context, input.userUuid, entryIds);
  });
};

export const markPublicationRead = async (
  transactions: TransactionPort,
  repository: LibraryRepository,
  input: Readonly<{
    publicationEntryId: string;
    userUuid: string;
    visibility: Visibility | null;
    workId: string;
  }>,
  now: Date = new Date(),
): Promise<void> => {
  const work = await repository.findWorkReadModel(input.workId);
  if (!work || !work.publicationEntryIds.includes(input.publicationEntryId)) {
    throw new Error('publication entry is unavailable');
  }
  await transactions.transaction((context) =>
    repository.savePublicationReadRecords(context, [{ ...input, readAt: now }]),
  );
};
