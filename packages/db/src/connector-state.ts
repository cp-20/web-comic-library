import type {
  CompleteDiscoveryInput,
  ConnectorStateRepository,
  CrawlRun,
  FetchResourceState,
  JsonValue,
  SourceCrawlState,
  TransactionContext,
} from '@web-comic-library/application';
import postgres from 'postgres';
import type { Sql, TransactionSql } from 'postgres';

import type { PostgresFoundation } from './foundation';

type SourceCrawlRow = Readonly<{
  checkpoint: JsonValue | null;
  consecutiveFailures: number;
  sourceId: string;
  status: 'active' | 'stopped';
  updatedAt: Date;
}>;

export class PostgresConnectorState implements ConnectorStateRepository {
  readonly #client: Sql;
  readonly #foundation: PostgresFoundation;

  constructor(databaseUrl: string, foundation: PostgresFoundation) {
    this.#client = postgres(databaseUrl);
    this.#foundation = foundation;
  }

  async completeDiscovery(
    context: TransactionContext,
    input: CompleteDiscoveryInput,
  ): Promise<void> {
    if (input.run.failureCode !== null) {
      throw new Error('completed discovery run must not have a failure code');
    }

    if (input.fetchStates.some((state) => state.sourceId !== input.run.sourceId)) {
      throw new Error('fetch state and crawl run must belong to the same source');
    }

    await this.#foundation.withSession(context, async (session) => {
      const rows = await session<{ status: 'active' | 'stopped' }[]>`
        select status
        from source_crawl_states
        where source_id = ${input.run.sourceId}
        for update
      `;

      if (rows[0]?.status === 'stopped') {
        throw new Error(`source ${input.run.sourceId} is stopped`);
      }

      await Promise.all(
        input.fetchStates.map((state) => {
          return session`
            insert into fetch_resource_states (
              source_id,
              resource_url,
              etag,
              last_modified,
              body_hash,
              checked_at
            )
            values (
              ${state.sourceId},
              ${state.url},
              ${state.etag},
              ${state.lastModified},
              ${state.bodyHash},
              ${state.checkedAt}
            )
            on conflict (source_id, resource_url) do update
            set
              etag = excluded.etag,
              last_modified = excluded.last_modified,
              body_hash = excluded.body_hash,
              checked_at = excluded.checked_at
          `;
        }),
      );
      await session`
        insert into source_crawl_states (
          source_id,
          checkpoint,
          consecutive_failures,
          status,
          updated_at
        )
        values (
          ${input.run.sourceId},
          ${session.json(input.batch.checkpoint)},
          0,
          'active',
          ${input.run.finishedAt}
        )
        on conflict (source_id) do update
        set
          checkpoint = excluded.checkpoint,
          consecutive_failures = 0,
          updated_at = excluded.updated_at
      `;
      await this.#insertRun(session, input.run);
    });
  }

  async findFetchResource(sourceId: string, url: string): Promise<FetchResourceState | null> {
    const rows = await this.#client<
      {
        bodyHash: string;
        checkedAt: Date;
        etag: string | null;
        lastModified: string | null;
        sourceId: string;
        url: string;
      }[]
    >`
      select
        source_id::text as "sourceId",
        resource_url as url,
        etag,
        last_modified as "lastModified",
        body_hash as "bodyHash",
        checked_at as "checkedAt"
      from fetch_resource_states
      where source_id = ${sourceId}
        and resource_url = ${url}
    `;

    return rows[0] ?? null;
  }

  async findSourceCrawlState(sourceId: string): Promise<SourceCrawlState> {
    const rows = await this.#client<SourceCrawlRow[]>`
      select
        source_id::text as "sourceId",
        checkpoint,
        consecutive_failures as "consecutiveFailures",
        status,
        updated_at as "updatedAt"
      from source_crawl_states
      where source_id = ${sourceId}
    `;

    return (
      rows[0] ?? {
        checkpoint: null,
        consecutiveFailures: 0,
        sourceId,
        status: 'active',
        updatedAt: new Date(0),
      }
    );
  }

  async recordFailure(run: CrawlRun, stopAfter: number): Promise<SourceCrawlState> {
    if (run.failureCode === null) {
      throw new Error('failed crawl run must have a failure code');
    }

    if (!Number.isSafeInteger(stopAfter) || stopAfter < 1) {
      throw new Error('stopAfter must be a positive safe integer');
    }

    return this.#client.begin(async (session) => {
      await this.#insertRun(session, run);
      const rows = await session<SourceCrawlRow[]>`
        insert into source_crawl_states (
          source_id,
          checkpoint,
          consecutive_failures,
          status,
          updated_at
        )
        values (
          ${run.sourceId},
          null,
          1,
          ${stopAfter === 1 ? 'stopped' : 'active'}::source_crawl_status,
          ${run.finishedAt}
        )
        on conflict (source_id) do update
        set
          consecutive_failures = source_crawl_states.consecutive_failures + 1,
          status = case
            when source_crawl_states.status = 'stopped' then 'stopped'::source_crawl_status
            when source_crawl_states.consecutive_failures + 1 >= ${stopAfter}
              then 'stopped'::source_crawl_status
            else 'active'::source_crawl_status
          end,
          updated_at = excluded.updated_at
        returning
          source_id::text as "sourceId",
          checkpoint,
          consecutive_failures as "consecutiveFailures",
          status,
          updated_at as "updatedAt"
      `;
      const state = rows[0];

      if (!state) {
        throw new Error('failed to record source crawl failure');
      }

      return state;
    });
  }

  async resume(sourceId: string, resumedAt: Date): Promise<SourceCrawlState> {
    const rows = await this.#client<SourceCrawlRow[]>`
      insert into source_crawl_states (
        source_id,
        checkpoint,
        consecutive_failures,
        status,
        updated_at
      )
      values (${sourceId}, null, 0, 'active', ${resumedAt})
      on conflict (source_id) do update
      set
        consecutive_failures = 0,
        status = 'active',
        updated_at = excluded.updated_at
      returning
        source_id::text as "sourceId",
        checkpoint,
        consecutive_failures as "consecutiveFailures",
        status,
        updated_at as "updatedAt"
    `;
    const state = rows[0];

    if (!state) {
      throw new Error('failed to resume source crawl');
    }

    return state;
  }

  async #insertRun(session: TransactionSql, run: CrawlRun): Promise<void> {
    await session`
      insert into crawl_runs (
        id,
        source_id,
        started_at,
        finished_at,
        duration_ms,
        success_count,
        parse_failure_count,
        failure_code
      )
      values (
        ${run.id},
        ${run.sourceId},
        ${run.startedAt},
        ${run.finishedAt},
        ${run.durationMs},
        ${run.successCount},
        ${run.parseFailureCount},
        ${run.failureCode}
      )
    `;
  }

  async close(): Promise<void> {
    await this.#client.end({ timeout: 1 });
  }
}

export const createPostgresConnectorState = (
  databaseUrl: string,
  foundation: PostgresFoundation,
): PostgresConnectorState => {
  return new PostgresConnectorState(databaseUrl, foundation);
};
