import { expect, test } from 'bun:test';

import { TransactionContext, type TransactionPort } from './persistence';
import type { VolumeLibraryRepository } from './volume-library';
import { setUserVolumeRecord } from './volume-library';

test('saving a read volume reflects only confirmed mappings and never removes Web reads', async () => {
  const calls: string[] = [];
  const repository: VolumeLibraryRepository = {
    async findVolumeReadModel() {
      return {
        contentUnitIds: ['unit-1', 'unit-2'],
        entryMappings: [
          { confirmed: true, contentUnitId: 'unit-1', publicationEntryId: 'entry-1' },
          { confirmed: true, contentUnitId: 'unit-2', publicationEntryId: 'entry-2' },
        ],
        volumeEditionId: 'volume-1',
        volumeMappings: [
          { confirmed: true, contentUnitId: 'unit-1' },
          { confirmed: false, contentUnitId: 'unit-2' },
        ],
        workId: 'work-1',
      };
    },
    async listUserVolumeRecords() {
      return [];
    },
    async saveContentReadRecords(_context, records) {
      calls.push(`content:${records.map((record) => record.contentUnitId).join(',')}`);
    },
    async savePublicationReadRecords(_context, records) {
      calls.push(`entry:${records.map((record) => record.publicationEntryId).join(',')}`);
    },
    async saveUserVolumeRecord(_context, record) {
      calls.push(`volume:${record.status}:${record.ownsPaper}:${record.ownsDigital}`);
    },
    async saveVolumeContentMappingCorrection() {},
  };
  const transactions: TransactionPort = {
    async transaction<T>(operation: (context: TransactionContext) => Promise<T>): Promise<T> {
      return operation(new TransactionContext());
    },
  };

  await setUserVolumeRecord(transactions, repository, {
    memoContentUnitId: 'unit-1',
    ownsDigital: true,
    ownsPaper: true,
    status: 'read',
    userUuid: 'reader',
    visibility: 'private',
    volumeEditionId: 'volume-1',
  });
  await setUserVolumeRecord(transactions, repository, {
    memoContentUnitId: null,
    ownsDigital: false,
    ownsPaper: true,
    status: 'unread',
    userUuid: 'reader',
    visibility: 'private',
    volumeEditionId: 'volume-1',
  });

  expect(calls).toEqual([
    'volume:read:true:true',
    'content:unit-1',
    'entry:entry-1',
    'volume:unread:true:false',
    'content:',
    'entry:',
  ]);
});
