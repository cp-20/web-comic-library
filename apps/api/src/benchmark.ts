import type { LibraryRepository, TransactionPort } from '@web-comic-library/application';
import { TransactionContext } from '@web-comic-library/application';

import { createApp } from './app';

const sampleCount = 64;
const concurrency = 8;
const p95LimitMilliseconds = 1_500;

const percentile = (values: readonly number[], ratio: number): number => {
  const sorted = values.toSorted((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1);
  const value = sorted[index];
  if (value === undefined) throw new Error('benchmark sample is empty');
  return value;
};

const library: LibraryRepository = {
  async deleteContentReadRecords() {},
  async deletePublicationReadRecords() {},
  async findLibraryEntry() {
    return null;
  },
  async findWorkReadModel() {
    return {
      catchUpContentUnitIds: ['unit-1'],
      contentUnits: [{ id: 'unit-1', position: 1 }],
      mappings: [],
      publicationEntryIds: [],
      workId: 'work-1',
    };
  },
  async listReadContentUnitIds() {
    return [];
  },
  async saveContentReadRecords() {},
  async saveLibraryEntry() {},
  async savePublicationReadRecords() {},
};

const transactions: TransactionPort = {
  async transaction<T>(operation: (context: TransactionContext) => Promise<T>): Promise<T> {
    return operation(new TransactionContext());
  },
};

const application = createApp({
  library,
  transactions,
  async resolveSession() {
    return {
      accountStatus: 'active',
      assurance: 'none',
      email: 'benchmark@example.test',
      userUuid: 'benchmark-reader',
    };
  },
});

const run = async (): Promise<void> => {
  const sample = async (index: number): Promise<readonly number[]> => {
    if (index >= sampleCount) return [];
    const startedAt = performance.now();
    const response = await application.request('/api/library/status', {
      body: JSON.stringify({ status: 'reading', visibility: 'private', workId: 'work-1' }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });
    if (response.status !== 200)
      throw new Error(`unexpected benchmark response: ${response.status}`);
    return [performance.now() - startedAt, ...(await sample(index + concurrency))];
  };
  const durations = (
    await Promise.all(Array.from({ length: concurrency }, (_, index) => sample(index)))
  ).flat();
  const p95 = percentile(durations, 0.95);
  console.log(
    `library-status benchmark: samples=${durations.length} concurrency=${concurrency} p95=${p95.toFixed(2)}ms`,
  );
  if (p95 > p95LimitMilliseconds) {
    throw new Error(`library-status p95 ${p95.toFixed(2)}ms exceeded ${p95LimitMilliseconds}ms`);
  }
};

await run();
