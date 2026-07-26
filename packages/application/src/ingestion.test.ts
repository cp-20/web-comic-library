import { expect, test } from 'bun:test';

import type {
  CompleteDiscoveryInput,
  ConnectorStateRepository,
  PublicationCandidate,
} from './connectors';
import { ingestDiscovery, type IngestionCandidateSink } from './ingestion';
import { TransactionContext, type TransactionPort } from './persistence';

const candidate = (sourceId: string): PublicationCandidate => ({
  ageRatingValue: null,
  authors: ['Author'],
  entries: [],
  externalId: 'publication',
  kind: 'official',
  kindEvidence: 'https://example.test/evidence',
  sourceId,
  title: 'Work',
  updatedAt: null,
  url: 'https://example.test/publication',
});

test('ingestion saves candidates and checkpoint in one transaction with notification mode', async () => {
  const sourceId = crypto.randomUUID();
  const calls: string[] = [];
  const transactions: TransactionPort = {
    transaction: async (operation) => operation(new TransactionContext()),
  };
  const states: ConnectorStateRepository = {
    completeDiscovery: async () => {
      calls.push('state');
    },
    findFetchResource: async () => null,
    findSourceCrawlState: async () => ({
      checkpoint: null,
      consecutiveFailures: 0,
      sourceId,
      status: 'active',
      updatedAt: new Date(0),
    }),
    recordFailure: async () => {
      throw new Error('not used');
    },
    resume: async () => {
      throw new Error('not used');
    },
  };
  const candidates: IngestionCandidateSink = {
    saveCandidates: async (_context, receivedSourceId, values, mode) => {
      calls.push('candidate:' + mode);
      expect(receivedSourceId).toBe(sourceId);
      expect(values).toHaveLength(1);
      return { insertedCandidates: 1, releaseEventCount: 1 };
    },
  };
  const input: CompleteDiscoveryInput & { mode: 'initial' } = {
    batch: { candidates: [candidate(sourceId)], checkpoint: { cursor: 'next' } },
    fetchStates: [],
    mode: 'initial',
    run: {
      durationMs: 1,
      failureCode: null,
      finishedAt: new Date('2026-07-27T00:00:01Z'),
      id: crypto.randomUUID(),
      parseFailureCount: 0,
      sourceId,
      startedAt: new Date('2026-07-27T00:00:00Z'),
      successCount: 1,
    },
  };

  await expect(ingestDiscovery(transactions, states, candidates, input)).resolves.toEqual({
    insertedCandidates: 1,
    releaseEventCount: 1,
  });
  expect(calls).toEqual(['candidate:initial', 'state']);
});

test('ingestion rejects candidates from another source before advancing checkpoint', async () => {
  const sourceId = crypto.randomUUID();
  const transactions: TransactionPort = {
    transaction: async (operation) => operation(new TransactionContext()),
  };
  const states: ConnectorStateRepository = {
    completeDiscovery: async () => undefined,
    findFetchResource: async () => null,
    findSourceCrawlState: async () => ({
      checkpoint: null,
      consecutiveFailures: 0,
      sourceId,
      status: 'active',
      updatedAt: new Date(0),
    }),
    recordFailure: async () => {
      throw new Error('not used');
    },
    resume: async () => {
      throw new Error('not used');
    },
  };
  const candidates: IngestionCandidateSink = {
    saveCandidates: async () => ({ insertedCandidates: 0, releaseEventCount: 0 }),
  };
  const input = {
    batch: { candidates: [candidate(crypto.randomUUID())], checkpoint: {} },
    fetchStates: [],
    mode: 'incremental' as const,
    run: {
      durationMs: 1,
      failureCode: null,
      finishedAt: new Date(),
      id: crypto.randomUUID(),
      parseFailureCount: 0,
      sourceId,
      startedAt: new Date(),
      successCount: 1,
    },
  };

  await expect(ingestDiscovery(transactions, states, candidates, input)).rejects.toThrow(
    'must belong to the same source',
  );
});
