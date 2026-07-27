import type {
  AgeRatingDisposition,
  AgeRatingMapping,
  SourcePolicyEvidence,
  SourcePolicyEvidenceKind,
  SourcePolicyRecord,
} from '@web-comic-library/domain';
import { sourcePolicyEvidenceKinds } from '@web-comic-library/domain';

import type {
  CatalogQueryPort,
  CatalogSearchQuery,
  CatalogSearchResult,
  WorkCatalogReadModel,
} from './catalog';

export type EmergencyStopCommand = Readonly<{
  changedAt: Date;
  changedBy: string;
  evidence: SourcePolicyEvidence;
  sourceId: string;
  stopped: boolean;
}>;

export interface SourcePolicyRepository {
  recordAgeRatingMapping(mapping: AgeRatingMapping): Promise<void>;
  recordPolicy(policy: SourcePolicyRecord): Promise<void>;
  setEmergencyStop(command: EmergencyStopCommand): Promise<void>;
}

export interface SourcePolicyQueryPort {
  canCollect(sourceId: string): Promise<boolean>;
  classifyAgeRating(sourceId: string, externalValue: string | null): Promise<AgeRatingDisposition>;
  findLatestPolicy(sourceId: string): Promise<SourcePolicyRecord | null>;
  listPublicPublicationIds(workId: string): Promise<readonly string[]>;
  resolveCollectableSourceId(sourceKey: string): Promise<string | null>;
}

export type SourceCollectionResult<Result> =
  | Readonly<{ status: 'disabled' | 'stopped' }>
  | Readonly<{ result: Result; status: 'enqueued' }>;

export const parseSourcePolicyEvidenceKind = (
  value: string | undefined,
): SourcePolicyEvidenceKind | null => {
  return sourcePolicyEvidenceKinds.find((kind) => kind === value) ?? null;
};

export const runSourceCollection = async <Candidate, Result>(
  policies: Pick<SourcePolicyQueryPort, 'canCollect'>,
  sourceId: string,
  request: () => Promise<Candidate>,
  enqueue: (candidate: Candidate) => Promise<Result>,
): Promise<SourceCollectionResult<Result>> => {
  if (!(await policies.canCollect(sourceId))) {
    return { status: 'disabled' };
  }

  const candidate = await request();

  if (!(await policies.canCollect(sourceId))) {
    return { status: 'stopped' };
  }

  return { result: await enqueue(candidate), status: 'enqueued' };
};

export const findPublicWork = async (
  catalog: CatalogQueryPort,
  policies: Pick<SourcePolicyQueryPort, 'listPublicPublicationIds'>,
  workId: string,
): Promise<WorkCatalogReadModel | null> => {
  const [work, publicPublicationIds] = await Promise.all([
    catalog.findWork(workId),
    policies.listPublicPublicationIds(workId),
  ]);

  if (!work) {
    return null;
  }

  const allowedIds = new Set(publicPublicationIds);
  const publications = work.publications.filter((publication) => allowedIds.has(publication.id));

  return publications.length === 0 ? null : { ...work, publications };
};

export const searchPublicWorks = async (
  catalog: CatalogQueryPort,
  policies: Pick<SourcePolicyQueryPort, 'listPublicPublicationIds'>,
  query: CatalogSearchQuery,
): Promise<readonly CatalogSearchResult[]> => {
  const workIds = await catalog.searchWorkIds(query);
  const works = await Promise.all(
    workIds.map(async (workId): Promise<CatalogSearchResult | null> => {
      const work = await findPublicWork(catalog, policies, workId);
      if (!work) return null;
      const publications: WorkCatalogReadModel['publications'] = work.publications.filter(
        (publication) =>
          (query.kind === null || publication.kind === query.kind) &&
          (query.sourceKey === null || publication.sourceKey === query.sourceKey),
      );
      if (publications.length === 0) return null;
      const latestUpdatedAt =
        publications
          .flatMap((publication) => publication.entries)
          .map((entry) => entry.publishedAt)
          .filter((publishedAt): publishedAt is Date => publishedAt !== null)
          .toSorted((left, right) => right.getTime() - left.getTime())[0] ?? null;
      return { latestUpdatedAt, work: { ...work, publications } };
    }),
  );
  return works.filter((work): work is CatalogSearchResult => work !== null);
};
