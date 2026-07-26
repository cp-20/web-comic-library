import type { PublicationEntryKind, PublicationKind } from '@web-comic-library/domain';

import type { JsonValue, TransactionContext, TransactionPort } from './persistence';

export type DiscoveryContext = Readonly<{
  checkpoint: JsonValue | null;
  sourceId: string;
}>;

export type PublicationRef = Readonly<{
  externalId: string | null;
  sourceId: string;
  url: string;
}>;

export type PublicationCandidate = Readonly<{
  ageRatingValue: string | null;
  authors: readonly string[];
  entries: readonly PublicationEntryCandidate[];
  externalId: string | null;
  kind: PublicationKind;
  kindEvidence: string | null;
  sourceId: string;
  title: string;
  updatedAt: Date | null;
  url: string;
}>;

export type PublicationEntryCandidate = Readonly<{
  externalId: string;
  kind: PublicationEntryKind;
  publishedAt: Date | null;
  title: string;
  url: string;
}>;

export type DiscoveryBatch = Readonly<{
  candidates: readonly PublicationCandidate[];
  checkpoint: JsonValue;
}>;

export interface Connector {
  discover(context: DiscoveryContext): Promise<DiscoveryBatch>;
  fetchPublication(reference: PublicationRef): Promise<PublicationCandidate>;
}

export type FetchResourceState = Readonly<{
  bodyHash: string;
  checkedAt: Date;
  etag: string | null;
  lastModified: string | null;
  sourceId: string;
  url: string;
}>;

export const sourceCrawlStatuses = ['active', 'stopped'] as const;

export type SourceCrawlStatus = (typeof sourceCrawlStatuses)[number];

export type SourceCrawlState = Readonly<{
  checkpoint: JsonValue | null;
  consecutiveFailures: number;
  sourceId: string;
  status: SourceCrawlStatus;
  updatedAt: Date;
}>;

export const connectorFailureCodes = [
  'body_too_large',
  'content_type',
  'disallowed_host',
  'http_status',
  'network',
  'parse',
  'prohibited_resource',
  'rate_limited',
  'redirect',
  'timeout',
  'validation',
] as const;

export type ConnectorFailureCode = (typeof connectorFailureCodes)[number];

export type CrawlRun = Readonly<{
  durationMs: number;
  failureCode: ConnectorFailureCode | null;
  finishedAt: Date;
  id: string;
  parseFailureCount: number;
  sourceId: string;
  startedAt: Date;
  successCount: number;
}>;

export interface DiscoveryCandidateSink {
  saveCandidates(
    context: TransactionContext,
    sourceId: string,
    candidates: readonly PublicationCandidate[],
  ): Promise<number>;
}

export type CompleteDiscoveryInput = Readonly<{
  batch: DiscoveryBatch;
  fetchStates: readonly FetchResourceState[];
  run: CrawlRun;
}>;

export interface ConnectorStateRepository {
  completeDiscovery(context: TransactionContext, input: CompleteDiscoveryInput): Promise<void>;
  findFetchResource(sourceId: string, url: string): Promise<FetchResourceState | null>;
  findSourceCrawlState(sourceId: string): Promise<SourceCrawlState>;
  recordFailure(run: CrawlRun, stopAfter: number): Promise<SourceCrawlState>;
  resume(sourceId: string, resumedAt: Date): Promise<SourceCrawlState>;
}

export type CommitDiscoveryResult = Readonly<{
  insertedCandidates: number;
  status: 'committed';
}>;

export type ConnectorDiscoveryResult =
  | Readonly<{ status: 'stopped' }>
  | Readonly<{ batch: DiscoveryBatch; status: 'discovered' }>;

export const discoverIfActive = async (
  connector: Connector,
  states: Pick<ConnectorStateRepository, 'findSourceCrawlState'>,
  context: DiscoveryContext,
): Promise<ConnectorDiscoveryResult> => {
  const state = await states.findSourceCrawlState(context.sourceId);

  if (!canCrawlSource(state)) {
    return { status: 'stopped' };
  }

  return { batch: await connector.discover(context), status: 'discovered' };
};

export const commitDiscovery = async (
  transactions: TransactionPort,
  states: ConnectorStateRepository,
  candidates: DiscoveryCandidateSink,
  input: CompleteDiscoveryInput,
): Promise<CommitDiscoveryResult> => {
  if (input.batch.candidates.some((candidate) => candidate.sourceId !== input.run.sourceId)) {
    throw new Error('discovery candidates and crawl run must belong to the same source');
  }

  return transactions.transaction(async (context) => {
    const insertedCandidates = await candidates.saveCandidates(
      context,
      input.run.sourceId,
      input.batch.candidates,
    );
    await states.completeDiscovery(context, input);
    return { insertedCandidates, status: 'committed' };
  });
};

export const canCrawlSource = (state: SourceCrawlState): boolean => {
  return state.status === 'active';
};
