import type { JobQueueMetrics, JobQueueMetricsPort } from '@web-comic-library/application';
import postgres from 'postgres';
import type { Sql } from 'postgres';

type MetricsRow = Readonly<{
  available: number;
  failed: number;
  oldest_available_seconds: number;
  overdue: number;
}>;

export class PostgresJobQueueMetrics implements JobQueueMetricsPort {
  readonly #client: Sql;

  constructor(databaseUrl: string) {
    this.#client = postgres(databaseUrl);
  }

  async read(): Promise<JobQueueMetrics> {
    const rows = await this.#client<MetricsRow[]>`
      select
        count(*) filter (
          where is_available and run_at <= now()
        )::integer as available,
        count(*) filter (
          where attempts >= max_attempts
        )::integer as failed,
        coalesce(
          extract(epoch from (now() - min(run_at) filter (
            where is_available and run_at <= now()
          ))),
          0
        )::double precision as oldest_available_seconds,
        count(*) filter (
          where is_available and run_at <= now() - interval '10 minutes'
        )::integer as overdue
      from graphile_worker._private_jobs
    `;
    const row = rows[0];
    if (!row) {
      throw new Error('Job queue metrics query returned no rows');
    }

    return {
      available: row.available,
      failed: row.failed,
      oldestAvailableSeconds: row.oldest_available_seconds,
      overdue: row.overdue,
    };
  }

  async close(): Promise<void> {
    await this.#client.end({ timeout: 1 });
  }
}

export const createPostgresJobQueueMetrics = (databaseUrl: string): PostgresJobQueueMetrics => {
  return new PostgresJobQueueMetrics(databaseUrl);
};
