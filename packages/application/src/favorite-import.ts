import type {
  FavoriteImportBatch,
  FavoriteImportCandidate,
  FavoriteImportSettings,
  FollowMode,
  ReadingStatus,
} from '@web-comic-library/domain';
import { createLibraryEntry, transitionReadingStatus } from '@web-comic-library/domain';

import type { FollowRepository } from './follow';
import type { LibraryRepository } from './library';
import type { TransactionContext, TransactionPort } from './persistence';
import type { SourcePolicyQueryPort } from './source-policy';

export type FavoriteImportInput = Readonly<{
  canonicalUrl: string;
  externalWorkId: string | null;
  sourceId: string;
  title: string;
}>;

export type FavoriteImportSourceInput = Readonly<{
  canonicalUrl: string;
  externalWorkId: string | null;
  sourceKey: string;
  title: string;
}>;

export class FavoriteImportSourceRejectedError extends Error {
  constructor() {
    super('favorite import source is not collectable');
    this.name = 'FavoriteImportSourceRejectedError';
  }
}

export type FavoriteImportSelection = Readonly<{
  candidateId: string;
  followMode?: FollowMode | undefined;
  readingStatus?: ReadingStatus | null | undefined;
}>;

export interface FavoriteImportRepository {
  claimBatch(
    context: TransactionContext,
    batchId: string,
    now: Date,
    userUuid: string,
  ): Promise<boolean>;
  createBatch(context: TransactionContext, batch: FavoriteImportBatch): Promise<void>;
  createCandidates(
    context: TransactionContext,
    batchId: string,
    candidates: readonly FavoriteImportInput[],
  ): Promise<void>;
  discardBatch(
    context: TransactionContext,
    batchId: string,
    now: Date,
    userUuid: string,
  ): Promise<boolean>;
  findBatch(batchId: string, userUuid: string): Promise<FavoriteImportBatch | null>;
  listCandidates(batchId: string): Promise<readonly FavoriteImportCandidate[]>;
}

export type FavoriteImportReadModel = Readonly<{
  batch: FavoriteImportBatch;
  candidates: readonly FavoriteImportCandidate[];
}>;

const normalizeCanonicalUrl = (value: string): string => {
  const url = new URL(value);
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('canonical URL must use HTTP or HTTPS');
  }
  if (url.search || url.hash) {
    throw new Error('canonical URL must not include a query or fragment');
  }
  return url.href;
};

const normalizeInput = (input: FavoriteImportInput): FavoriteImportInput => {
  const sourceId = input.sourceId.trim();
  const title = input.title.trim();
  const externalWorkId = input.externalWorkId?.trim() || null;
  if (!sourceId || !title) throw new Error('favorite import fields are required');
  return {
    canonicalUrl: normalizeCanonicalUrl(input.canonicalUrl),
    externalWorkId,
    sourceId,
    title,
  };
};

const validateInputs = (inputs: readonly FavoriteImportInput[]): readonly FavoriteImportInput[] => {
  if (inputs.length === 0) throw new Error('at least one favorite is required');
  const values = inputs.map(normalizeInput);
  const keys = new Set<string>();
  for (const value of values) {
    const key = `${value.sourceId}\u0000${value.canonicalUrl}`;
    if (keys.has(key)) throw new Error('favorite imports must be unique per source and URL');
    keys.add(key);
  }
  return values;
};

export const resolveFavoriteImportSources = async (
  policies: Pick<SourcePolicyQueryPort, 'resolveCollectableSourceId'>,
  inputs: readonly FavoriteImportSourceInput[],
): Promise<readonly FavoriteImportInput[]> => {
  return Promise.all(
    inputs.map(async (input): Promise<FavoriteImportInput> => {
      const { sourceKey: inputSourceKey, ...favorite } = input;
      const sourceKey = inputSourceKey.trim();
      if (!sourceKey) throw new FavoriteImportSourceRejectedError();
      const sourceId = await policies.resolveCollectableSourceId(sourceKey);
      if (sourceId === null) throw new FavoriteImportSourceRejectedError();
      return { ...favorite, sourceId };
    }),
  );
};

const activeBatch = (batch: FavoriteImportBatch, now: Date): boolean =>
  batch.expiresAt > now && batch.confirmedAt === null && batch.discardedAt === null;

export const createFavoriteImport = async (
  transactions: TransactionPort,
  repository: FavoriteImportRepository,
  input: Readonly<{ favorites: readonly FavoriteImportInput[]; userUuid: string }>,
  now = new Date(),
): Promise<FavoriteImportBatch> => {
  const favorites = validateInputs(input.favorites);
  const batch: FavoriteImportBatch = {
    confirmedAt: null,
    createdAt: now,
    discardedAt: null,
    expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
    id: crypto.randomUUID(),
    userUuid: input.userUuid,
  };
  await transactions.transaction(async (context) => {
    await repository.createBatch(context, batch);
    await repository.createCandidates(context, batch.id, favorites);
  });
  return batch;
};

export const getFavoriteImport = async (
  repository: FavoriteImportRepository,
  batchId: string,
  userUuid: string,
): Promise<FavoriteImportReadModel | null> => {
  const batch = await repository.findBatch(batchId, userUuid);
  if (!batch) return null;
  return { batch, candidates: await repository.listCandidates(batch.id) };
};

type WorkSelection = Readonly<{
  followMode: FollowMode;
  publicationIds: readonly string[];
  readingStatus: ReadingStatus | null;
  workId: string;
}>;

const collectSelections = (
  candidates: readonly FavoriteImportCandidate[],
  defaults: FavoriteImportSettings,
  selections: readonly FavoriteImportSelection[],
): readonly WorkSelection[] => {
  const candidatesById = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const selectedIds = new Set<string>();
  const works = new Map<string, WorkSelection>();
  for (const selection of selections) {
    if (selectedIds.has(selection.candidateId))
      throw new Error('candidate selection must be unique');
    selectedIds.add(selection.candidateId);
    const candidate = candidatesById.get(selection.candidateId);
    if (
      !candidate ||
      candidate.matchKind !== 'exact' ||
      candidate.matchedWorkId === null ||
      candidate.matchedPublicationId === null
    ) {
      throw new Error('only exact matches can be imported');
    }
    const settings = {
      followMode: selection.followMode ?? defaults.followMode,
      readingStatus:
        selection.readingStatus === undefined ? defaults.readingStatus : selection.readingStatus,
    };
    const existing = works.get(candidate.matchedWorkId);
    if (!existing) {
      works.set(candidate.matchedWorkId, {
        followMode: settings.followMode,
        publicationIds: [candidate.matchedPublicationId],
        readingStatus: settings.readingStatus,
        workId: candidate.matchedWorkId,
      });
      continue;
    }
    if (
      existing.followMode !== settings.followMode ||
      existing.readingStatus !== settings.readingStatus
    ) {
      throw new Error('duplicate work selections must use the same settings');
    }
    works.set(candidate.matchedWorkId, {
      ...existing,
      publicationIds: [...new Set([...existing.publicationIds, candidate.matchedPublicationId])],
    });
  }
  return [...works.values()];
};

export const applyFavoriteImport = async (
  transactions: TransactionPort,
  repositories: Readonly<{
    favorites: FavoriteImportRepository;
    follow: FollowRepository;
    library: LibraryRepository;
  }>,
  input: Readonly<{
    batchId: string;
    defaults: FavoriteImportSettings;
    selections: readonly FavoriteImportSelection[];
    userUuid: string;
  }>,
  now = new Date(),
): Promise<'applied' | 'expired' | 'not_found'> => {
  const batch = await repositories.favorites.findBatch(input.batchId, input.userUuid);
  if (!batch) return 'not_found';
  if (!activeBatch(batch, now)) return 'expired';
  const candidates = await repositories.favorites.listCandidates(batch.id);
  const selections = collectSelections(candidates, input.defaults, input.selections);
  const claimed = await transactions.transaction(async (context) => {
    if (!(await repositories.favorites.claimBatch(context, batch.id, now, input.userUuid)))
      return false;
    await Promise.all(
      selections.map(async (selection) => {
        if (selection.readingStatus !== null) {
          const current = await repositories.library.findLibraryEntry(
            input.userUuid,
            selection.workId,
          );
          const entry =
            current ??
            createLibraryEntry(input.userUuid, selection.workId, selection.readingStatus, null);
          const next =
            current === null
              ? entry
              : transitionReadingStatus(current, selection.readingStatus, now).entry;
          await repositories.library.saveLibraryEntry(context, next, now);
        }
        await repositories.follow.saveFollowSettings(context, {
          mode: selection.followMode,
          userUuid: input.userUuid,
          workId: selection.workId,
        });
        await repositories.follow.replaceSubscriptionPublications(
          context,
          input.userUuid,
          selection.workId,
          selection.followMode === 'selected_publications' ? selection.publicationIds : [],
        );
      }),
    );
    return true;
  });
  return claimed ? 'applied' : 'expired';
};

export const discardFavoriteImport = async (
  transactions: TransactionPort,
  repository: FavoriteImportRepository,
  batchId: string,
  userUuid: string,
  now = new Date(),
): Promise<'discarded' | 'not_found'> => {
  const discarded = await transactions.transaction((context) =>
    repository.discardBatch(context, batchId, now, userUuid),
  );
  return discarded ? 'discarded' : 'not_found';
};
