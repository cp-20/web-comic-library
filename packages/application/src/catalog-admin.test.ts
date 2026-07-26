import { expect, test } from 'bun:test';

import type {
  CatalogAdminRepository,
  CatalogAuditRecord,
  MergeWorksCommand,
} from './catalog-admin';
import { mergeWorks } from './catalog-admin';
import { TransactionContext, type TransactionPort } from './persistence';

const transactionPort: TransactionPort = {
  async transaction<T>(operation: (context: TransactionContext) => Promise<T>): Promise<T> {
    return operation(new TransactionContext());
  },
};

const audit: CatalogAuditRecord = {
  after: { workId: 'target-work' },
  before: { workId: 'source-work' },
  createdAt: new Date('2026-07-27T00:00:00Z'),
  id: 'audit-1',
  operation: 'merge_work',
  operatorId: 'admin-1',
  reason: 'duplicate publication',
};

test('merge work command is authorized and runs inside the application transaction', async () => {
  let called = false;
  const repository: CatalogAdminRepository = {
    async findAuditRecords(): Promise<readonly CatalogAuditRecord[]> {
      return [];
    },
    async findRedirect() {
      return null;
    },
    async listReviewItems() {
      return [];
    },
    async mergeContentUnits() {
      return audit;
    },
    async mergeWorks(_context, command) {
      called = true;
      expect(command.reason).toBe('duplicate publication');
      return audit;
    },
    async resolveReviewItem() {
      throw new Error('not used');
    },
    async splitContentUnit() {
      return audit;
    },
    async splitWork() {
      return audit;
    },
  };
  const command: MergeWorksCommand = {
    actor: { assurance: 'passkey', id: 'admin-1', role: 'administrator' },
    reason: 'duplicate publication',
    sourceWorkId: 'source-work',
    targetWorkId: 'target-work',
  };

  await expect(mergeWorks(transactionPort, repository, command)).resolves.toEqual(audit);
  expect(called).toBe(true);
  await expect(
    mergeWorks(transactionPort, repository, {
      ...command,
      actor: { ...command.actor, role: 'user' },
    }),
  ).rejects.toThrow('administrator');
});
