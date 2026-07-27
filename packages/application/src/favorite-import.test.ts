import { expect, test } from 'bun:test';

import type { FavoriteImportCandidate } from '@web-comic-library/domain';

import {
  applyFavoriteImport,
  createFavoriteImport,
  FavoriteImportSourceRejectedError,
  type FavoriteImportRepository,
  resolveFavoriteImportSources,
} from './favorite-import';
import type { FollowRepository } from './follow';
import type { LibraryRepository } from './library';
import { TransactionContext, type TransactionPort } from './persistence';

const transactions: TransactionPort = {
  async transaction<T>(operation: (context: TransactionContext) => Promise<T>): Promise<T> {
    return operation(new TransactionContext());
  },
};

test('resolves only collectable source keys before an import batch is created', async () => {
  const policies = {
    async resolveCollectableSourceId(sourceKey: string): Promise<string | null> {
      return sourceKey === 'shonen-jump-plus' ? 'source-uuid' : null;
    },
  };
  const resolved = await resolveFavoriteImportSources(policies, [
    {
      canonicalUrl: 'https://shonenjumpplus.com/works/1',
      externalWorkId: '1',
      sourceKey: 'shonen-jump-plus',
      title: '作品',
    },
  ]);
  expect(resolved).toEqual([
    {
      canonicalUrl: 'https://shonenjumpplus.com/works/1',
      externalWorkId: '1',
      sourceId: 'source-uuid',
      title: '作品',
    },
  ]);
  await expect(
    resolveFavoriteImportSources(policies, [
      {
        canonicalUrl: 'https://example.test/works/1',
        externalWorkId: '1',
        sourceKey: 'disabled',
        title: '拒否作品',
      },
    ]),
  ).rejects.toBeInstanceOf(FavoriteImportSourceRejectedError);
});

test('normalizes only query-free canonical URLs and applies confirmed exact matches idempotently', async () => {
  let batch = null as Awaited<ReturnType<FavoriteImportRepository['findBatch']>>;
  const candidates: FavoriteImportCandidate[] = [];
  const savedLibrary: string[] = [];
  const savedFollow: string[] = [];
  const repository: FavoriteImportRepository = {
    async claimBatch(_context, batchId, _now, userUuid) {
      if (!batch || batch.id !== batchId || batch.userUuid !== userUuid || batch.confirmedAt)
        return false;
      batch = { ...batch, confirmedAt: new Date() };
      return true;
    },
    async createBatch(_context, value) {
      batch = value;
    },
    async createCandidates(_context, batchId, values) {
      candidates.push(
        ...values.map((value, index) => ({
          alternativeWorkIds: [],
          batchId,
          canonicalUrl: value.canonicalUrl,
          externalWorkId: value.externalWorkId,
          id: `candidate-${index}`,
          matchKind: index === 0 ? ('exact' as const) : ('unmatched' as const),
          matchedPublicationId: index === 0 ? 'publication-1' : null,
          matchedWorkId: index === 0 ? 'work-1' : null,
          sourceId: value.sourceId,
          title: value.title,
          titleMatchWorkIds: index === 1 ? ['work-by-title'] : [],
        })),
      );
    },
    async discardBatch() {
      return false;
    },
    async findBatch() {
      return batch;
    },
    async listCandidates() {
      return candidates;
    },
  };
  const library: LibraryRepository = {
    async deleteContentReadRecords() {},
    async deletePublicationReadRecords() {},
    async findLibraryEntry() {
      return null;
    },
    async findWorkReadModel() {
      return null;
    },
    async listReadContentUnitIds() {
      return [];
    },
    async saveContentReadRecords() {},
    async saveLibraryEntry(_context, entry) {
      savedLibrary.push(`${entry.workId}:${entry.status}`);
    },
    async savePublicationReadRecords() {},
  };
  const follow: FollowRepository = {
    async findFollowSettings() {
      return null;
    },
    async listSourcePreferences() {
      return [];
    },
    async listSubscriptionPublicationIds() {
      return [];
    },
    async replaceSourcePreferences() {
      return [];
    },
    async replaceSubscriptionPublications(_context, _userUuid, workId, publicationIds) {
      savedFollow.push(`${workId}:${publicationIds.join(',')}`);
      return [];
    },
    async saveFollowSettings(_context, settings) {
      savedFollow.push(`${settings.workId}:${settings.mode}`);
    },
  };
  const now = new Date('2026-07-27T00:00:00.000Z');
  const created = await createFavoriteImport(
    transactions,
    repository,
    {
      favorites: [
        {
          canonicalUrl: 'https://reader.example/works/1',
          externalWorkId: 'work-1',
          sourceId: 'source-1',
          title: '作品1',
        },
        {
          canonicalUrl: 'https://reader.example/works/unknown',
          externalWorkId: null,
          sourceId: 'source-1',
          title: '同名作品',
        },
      ],
      userUuid: 'reader',
    },
    now,
  );
  expect(created.expiresAt).toEqual(new Date('2026-07-28T00:00:00.000Z'));
  expect(candidates[1]?.titleMatchWorkIds).toEqual(['work-by-title']);

  expect(
    await applyFavoriteImport(
      transactions,
      { favorites: repository, follow, library },
      {
        batchId: created.id,
        defaults: { followMode: 'selected_publications', readingStatus: 'reading' },
        selections: [{ candidateId: 'candidate-0' }],
        userUuid: 'reader',
      },
      now,
    ),
  ).toBe('applied');
  expect(savedLibrary).toEqual(['work-1:reading']);
  expect(savedFollow).toEqual(['work-1:selected_publications', 'work-1:publication-1']);
  expect(
    await applyFavoriteImport(
      transactions,
      { favorites: repository, follow, library },
      {
        batchId: created.id,
        defaults: { followMode: 'all_publications', readingStatus: null },
        selections: [],
        userUuid: 'reader',
      },
      now,
    ),
  ).toBe('expired');
  await expect(
    createFavoriteImport(
      transactions,
      repository,
      {
        favorites: [
          {
            canonicalUrl: 'https://reader.example/works/1?tracking=1',
            externalWorkId: 'work-1',
            sourceId: 'source-1',
            title: '作品1',
          },
        ],
        userUuid: 'reader',
      },
      now,
    ),
  ).rejects.toThrow('query');
});
