import type {
  CompleteDiscoveryInput,
  ConnectorStateRepository,
  PublicationCandidate,
} from './connectors';
import type { TransactionContext, TransactionPort } from './persistence';

export const ingestionModes = ['backfill', 'incremental', 'initial'] as const;

export type IngestionMode = (typeof ingestionModes)[number];

export type IngestionResult = Readonly<{
  insertedCandidates: number;
  releaseEventCount: number;
}>;

export interface IngestionCandidateSink {
  saveCandidates(
    context: TransactionContext,
    sourceId: string,
    candidates: readonly PublicationCandidate[],
    mode: IngestionMode,
  ): Promise<IngestionResult>;
}

export type IngestDiscoveryInput = CompleteDiscoveryInput &
  Readonly<{
    mode: IngestionMode;
  }>;

export const ingestDiscovery = async (
  transactions: TransactionPort,
  states: ConnectorStateRepository,
  candidates: IngestionCandidateSink,
  input: IngestDiscoveryInput,
): Promise<IngestionResult> => {
  if (input.batch.candidates.some((candidate) => candidate.sourceId !== input.run.sourceId)) {
    throw new Error('discovery candidates and crawl run must belong to the same source');
  }

  return transactions.transaction(async (context) => {
    const result = await candidates.saveCandidates(
      context,
      input.run.sourceId,
      input.batch.candidates,
      input.mode,
    );
    await states.completeDiscovery(context, input);
    return result;
  });
};
