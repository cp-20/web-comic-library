import type {
  JobInput,
  JobQueuePort,
  JobQueueResult,
  OutboxAppendResult,
  OutboxEventInput,
  OutboxPort,
  TransactionContext,
  TransactionPort,
} from '@web-comic-library/application';
import { TransactionContext as ApplicationTransactionContext } from '@web-comic-library/application';
import postgres from 'postgres';
import type { Sql, TransactionSql } from 'postgres';

export const enqueueNotificationRelease = async (
  session: TransactionSql,
  eventId: string,
): Promise<void> => {
  const idempotencyKey = `notification-release:${eventId}`;
  const keys = await session<{ idempotencyKey: string }[]>`
    insert into job_idempotency_keys (idempotency_key, task_identifier)
    values (${idempotencyKey}, 'notification_release')
    on conflict (idempotency_key) do nothing
    returning idempotency_key as "idempotencyKey"
  `;
  if (!keys[0]) return;
  await session`
    select graphile_worker.add_job(
      identifier => 'notification_release',
      payload => ${session.json({ eventId })}::json,
      max_attempts => 3,
      job_key => ${idempotencyKey},
      job_key_mode => 'unsafe_dedupe'::text
    )
  `;
};

export class PostgresFoundation implements OutboxPort, TransactionPort {
  readonly #client: Sql;
  readonly #sessions = new WeakMap<TransactionContext, TransactionSql>();

  constructor(databaseUrl: string) {
    this.#client = postgres(databaseUrl);
  }

  async transaction<T>(operation: (context: TransactionContext) => Promise<T>): Promise<T> {
    const context = new ApplicationTransactionContext();
    const result = await this.#client.begin(async (session) => {
      this.#sessions.set(context, session);

      try {
        return { value: await operation(context) };
      } finally {
        this.#sessions.delete(context);
      }
    });

    await context.runAfterCommit();
    return result.value;
  }

  async append(context: TransactionContext, event: OutboxEventInput): Promise<OutboxAppendResult> {
    const rows = await this.withSession(context, (session) => {
      return session<{ id: string }[]>`
        insert into outbox_events (idempotency_key, event_name, payload)
        values (
          ${event.idempotencyKey},
          ${event.eventName},
          ${session.json(event.payload)}
        )
        on conflict (idempotency_key) do nothing
        returning id::text
      `;
    });
    const row = rows[0];

    return row ? { eventId: row.id, status: 'inserted' } : { status: 'duplicate' };
  }

  async withSession<T>(
    context: TransactionContext,
    operation: (session: TransactionSql) => Promise<T>,
  ): Promise<T> {
    const session = this.#sessions.get(context);

    if (!session) {
      throw new Error('TransactionContext does not belong to an active transaction');
    }

    return operation(session);
  }

  async close(): Promise<void> {
    await this.#client.end({ timeout: 1 });
  }
}

export class PostgresJobQueue implements JobQueuePort {
  readonly #client: Sql;

  constructor(databaseUrl: string) {
    this.#client = postgres(databaseUrl);
  }

  async enqueue(job: JobInput): Promise<JobQueueResult> {
    return this.#client.begin(async (session) => {
      const inserted = await session<{ idempotency_key: string }[]>`
        insert into job_idempotency_keys (idempotency_key, task_identifier)
        values (${job.idempotencyKey}, ${job.taskIdentifier})
        on conflict (idempotency_key) do nothing
        returning idempotency_key
      `;

      if (!inserted[0]) {
        return 'duplicate';
      }

      await session`
        select graphile_worker.add_job(
          identifier => ${job.taskIdentifier}::text,
          payload => ${session.json(job.payload)}::json,
          max_attempts => 3,
          job_key => ${job.idempotencyKey}::text,
          job_key_mode => 'unsafe_dedupe'::text
        )
      `;
      return 'queued';
    });
  }

  async close(): Promise<void> {
    await this.#client.end({ timeout: 1 });
  }
}

export const createPostgresFoundation = (databaseUrl: string): PostgresFoundation => {
  return new PostgresFoundation(databaseUrl);
};

export const createPostgresJobQueue = (databaseUrl: string): PostgresJobQueue => {
  return new PostgresJobQueue(databaseUrl);
};
