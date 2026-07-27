import type {
  EmergencyStopCommand,
  SourcePolicyQueryPort,
  SourcePolicyRepository,
} from '@web-comic-library/application';
import type {
  AgeRatingDisposition,
  AgeRatingMapping,
  SourcePolicyRecord,
} from '@web-comic-library/domain';
import { canCollectSource, createSourcePolicyRecord } from '@web-comic-library/domain';
import { desc, eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import type { Sql } from 'postgres';

import {
  sourceAgeRatingMappings,
  sourcePolicyEvidence,
  sourcePolicyRecords,
} from './source-policy-schema';

export class PostgresSourcePolicy implements SourcePolicyRepository, SourcePolicyQueryPort {
  readonly #client: Sql;
  readonly #database: ReturnType<typeof drizzle>;

  constructor(databaseUrl: string) {
    this.#client = postgres(databaseUrl);
    this.#database = drizzle(this.#client);
  }

  async recordPolicy(policy: SourcePolicyRecord): Promise<void> {
    const record = createSourcePolicyRecord(policy);

    await this.#database.transaction(async (transaction) => {
      await transaction.insert(sourcePolicyRecords).values({
        advertising: record.advertising,
        affiliate: record.affiliate,
        changedAt: record.changedAt,
        changedBy: record.changedBy,
        collection: record.collection,
        commercialUse: record.commercialUse,
        emergencyStopped: record.emergencyStopped,
        id: record.id,
        revision: record.revision,
        sourceId: record.sourceId,
      });

      if (record.evidence.length > 0) {
        await transaction.insert(sourcePolicyEvidence).values(
          record.evidence.map((evidence) => ({
            checkedAt: evidence.checkedAt,
            id: evidence.id,
            kind: evidence.kind,
            policyRecordId: record.id,
            url: evidence.url,
          })),
        );
      }
    });
  }

  async recordAgeRatingMapping(mapping: AgeRatingMapping): Promise<void> {
    await this.#database.insert(sourceAgeRatingMappings).values(mapping);
  }

  async findLatestPolicy(sourceId: string): Promise<SourcePolicyRecord | null> {
    const records = await this.#database
      .select()
      .from(sourcePolicyRecords)
      .where(eq(sourcePolicyRecords.sourceId, sourceId))
      .orderBy(desc(sourcePolicyRecords.revision))
      .limit(1);
    const record = records[0];

    if (!record) {
      return null;
    }

    const evidence = await this.#database
      .select({
        checkedAt: sourcePolicyEvidence.checkedAt,
        id: sourcePolicyEvidence.id,
        kind: sourcePolicyEvidence.kind,
        url: sourcePolicyEvidence.url,
      })
      .from(sourcePolicyEvidence)
      .where(eq(sourcePolicyEvidence.policyRecordId, record.id))
      .orderBy(sourcePolicyEvidence.id);

    return createSourcePolicyRecord({ ...record, evidence });
  }

  async canCollect(sourceId: string): Promise<boolean> {
    return canCollectSource(await this.findLatestPolicy(sourceId));
  }

  async resolveCollectableSourceId(sourceKey: string): Promise<string | null> {
    const rows = await this.#client<{ sourceId: string }[]>`
      select source.id::text as "sourceId"
      from sources as source
      join lateral (
        select policy.collection, policy.emergency_stopped
        from source_policy_records as policy
        where policy.source_id = source.id
        order by policy.revision desc
        limit 1
      ) as policy on true
      where source.key = ${sourceKey}
        and policy.collection = 'allowed'
        and not policy.emergency_stopped
      limit 1
    `;
    return rows[0]?.sourceId ?? null;
  }

  async classifyAgeRating(
    sourceId: string,
    externalValue: string | null,
  ): Promise<AgeRatingDisposition> {
    if (externalValue === null) {
      return 'review';
    }

    const rows = await this.#database
      .select({ disposition: sourceAgeRatingMappings.disposition })
      .from(sourceAgeRatingMappings)
      .where(
        sql`${sourceAgeRatingMappings.sourceId} = ${sourceId}
          and ${sourceAgeRatingMappings.externalValue} = ${externalValue}`,
      )
      .orderBy(desc(sourceAgeRatingMappings.revision))
      .limit(1);

    return rows[0]?.disposition ?? 'review';
  }

  async listPublicPublicationIds(workId: string): Promise<readonly string[]> {
    const rows = await this.#client<{ id: string }[]>`
      select publication.id
      from publications as publication
      join lateral (
        select policy.collection, policy.emergency_stopped
        from source_policy_records as policy
        where policy.source_id = publication.source_id
        order by policy.revision desc
        limit 1
      ) as policy on true
      join lateral (
        select mapping.disposition
        from source_age_rating_mappings as mapping
        where mapping.source_id = publication.source_id
          and mapping.external_value = publication.age_rating_value
        order by mapping.revision desc
        limit 1
      ) as rating on true
      where publication.work_id = ${workId}
        and publication.retired_at is null
        and policy.collection = 'allowed'
        and not policy.emergency_stopped
        and rating.disposition = 'public'
      order by publication.id
    `;

    return rows.map((row) => row.id);
  }

  async setEmergencyStop(command: EmergencyStopCommand): Promise<void> {
    await this.#database.transaction(async (transaction) => {
      await transaction.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${command.sourceId}, 0))`,
      );
      const records = await transaction
        .select()
        .from(sourcePolicyRecords)
        .where(eq(sourcePolicyRecords.sourceId, command.sourceId))
        .orderBy(desc(sourcePolicyRecords.revision))
        .limit(1);
      const current = records[0];

      if (!current) {
        throw new Error(`source ${command.sourceId} has no policy`);
      }

      const currentEvidence = await transaction
        .select({
          checkedAt: sourcePolicyEvidence.checkedAt,
          id: sourcePolicyEvidence.id,
          kind: sourcePolicyEvidence.kind,
          url: sourcePolicyEvidence.url,
        })
        .from(sourcePolicyEvidence)
        .where(eq(sourcePolicyEvidence.policyRecordId, current.id));
      const next = createSourcePolicyRecord({
        ...current,
        changedAt: command.changedAt,
        changedBy: command.changedBy,
        emergencyStopped: command.stopped,
        evidence: [
          ...currentEvidence.map((evidence) => ({
            checkedAt: evidence.checkedAt,
            id: crypto.randomUUID(),
            kind: evidence.kind,
            url: evidence.url,
          })),
          command.evidence,
        ],
        id: crypto.randomUUID(),
        revision: current.revision + 1,
      });

      await transaction.insert(sourcePolicyRecords).values({
        advertising: next.advertising,
        affiliate: next.affiliate,
        changedAt: next.changedAt,
        changedBy: next.changedBy,
        collection: next.collection,
        commercialUse: next.commercialUse,
        emergencyStopped: next.emergencyStopped,
        id: next.id,
        revision: next.revision,
        sourceId: next.sourceId,
      });
      await transaction.insert(sourcePolicyEvidence).values(
        next.evidence.map((evidence) => ({
          checkedAt: evidence.checkedAt,
          id: evidence.id,
          kind: evidence.kind,
          policyRecordId: next.id,
          url: evidence.url,
        })),
      );
    });
  }

  async close(): Promise<void> {
    await this.#client.end({ timeout: 1 });
  }
}

export const createPostgresSourcePolicy = (databaseUrl: string): PostgresSourcePolicy => {
  return new PostgresSourcePolicy(databaseUrl);
};
