import { expect, test } from 'bun:test';

import type { LibraryRepository } from './library';
import {
  calculateCatchUp,
  markContentRead,
  markContentReadThrough,
  setReadingStatus,
  unmarkContentRead,
} from './library';
import { TransactionContext, type TransactionPort } from './persistence';

const transactions: TransactionPort = {
  async transaction<T>(operation: (context: TransactionContext) => Promise<T>): Promise<T> {
    return operation(new TransactionContext());
  },
};

test('records only confirmed mapped publication entries with logical content reads', async () => {
  const savedContent: string[] = [];
  const savedEntries: string[] = [];
  const deletedContent: string[] = [];
  const deletedEntries: string[] = [];
  const repository: LibraryRepository = {
    async deleteContentReadRecords(_context, _userUuid, contentUnitIds) {
      deletedContent.push(...contentUnitIds);
    },
    async deletePublicationReadRecords(_context, _userUuid, publicationEntryIds) {
      deletedEntries.push(...publicationEntryIds);
    },
    async findLibraryEntry() {
      return null;
    },
    async findWorkReadModel() {
      return {
        catchUpContentUnitIds: ['unit-1', 'unit-2'],
        contentUnits: [
          { id: 'unit-1', position: 1 },
          { id: 'unit-2', position: 2 },
        ],
        mappings: [
          { confirmed: true, contentUnitId: 'unit-1', publicationEntryId: 'entry-a' },
          { confirmed: false, contentUnitId: 'unit-1', publicationEntryId: 'entry-b' },
        ],
        publicationEntryIds: ['entry-a', 'entry-b'],
        workId: 'work-1',
      };
    },
    async listReadContentUnitIds() {
      return ['unit-1', 'unit-2'];
    },
    async saveContentReadRecords(_context, records) {
      savedContent.push(...records.map((record) => record.contentUnitId));
    },
    async saveLibraryEntry() {},
    async savePublicationReadRecords(_context, records) {
      savedEntries.push(...records.map((record) => record.publicationEntryId));
    },
  };

  await setReadingStatus(transactions, repository, {
    status: 'reading',
    userUuid: 'user-1',
    visibility: 'private',
    workId: 'work-1',
  });
  await markContentRead(transactions, repository, {
    contentUnitIds: ['unit-1'],
    userUuid: 'user-1',
    visibility: null,
    workId: 'work-1',
  });

  expect(savedContent).toEqual(['unit-1']);
  expect(savedEntries).toEqual(['entry-a']);
  expect(await calculateCatchUp(repository, 'user-1', 'work-1')).toBe(true);
  await markContentReadThrough(transactions, repository, {
    contentUnitId: 'unit-2',
    userUuid: 'user-1',
    visibility: null,
    workId: 'work-1',
  });
  await unmarkContentRead(transactions, repository, {
    contentUnitIds: ['unit-1'],
    userUuid: 'user-1',
    workId: 'work-1',
  });
  expect(savedContent).toEqual(['unit-1', 'unit-1', 'unit-2']);
  expect(deletedContent).toEqual(['unit-1']);
  expect(deletedEntries).toEqual(['entry-a']);
});
