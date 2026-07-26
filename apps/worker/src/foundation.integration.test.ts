import { expect, test } from 'bun:test';

import {
  createPostgresFoundation,
  createPostgresJobQueue,
  migrateDatabase,
} from '@web-comic-library/db';
import type { Runner } from 'graphile-worker';
import postgres from 'postgres';

import { startWorker } from './worker';

const databaseUrl = process.env.DATABASE_URL;
const integrationTest =
  process.env.ALLOW_DATABASE_INTEGRATION_TESTS === '1' && databaseUrl ? test : test.skip;

const waitUntil = async (condition: () => Promise<boolean>): Promise<void> => {
  const deadline = Date.now() + 20_000;

  while (Date.now() < deadline) {
    // oxlint-disable-next-line no-await-in-loop -- Each check observes the previous wait.
    if (await condition()) {
      return;
    }

    // oxlint-disable-next-line no-await-in-loop -- Polling must wait before the next check.
    await Bun.sleep(100);
  }

  throw new Error('condition was not met before timeout');
};

integrationTest(
  'migrations, transactions, outbox, and jobs preserve their guarantees',
  async () => {
    if (!databaseUrl) {
      throw new Error('DATABASE_URL is required');
    }

    await migrateDatabase(databaseUrl);
    await migrateDatabase(databaseUrl);

    const sql = postgres(databaseUrl, { max: 1 });
    const foundation = createPostgresFoundation(databaseUrl);
    const queue = createPostgresJobQueue(databaseUrl);
    let runner: Runner | undefined;
    const eventKeys: string[] = [];
    const jobKeys: string[] = [];
    const recordIds: string[] = [];

    try {
      await sql`
        create table if not exists foundation_test_records (
          id uuid primary key
        )
      `;
      await sql`
        create table if not exists compatibility_probe (
          id text primary key,
          processed_at timestamptz not null
        )
      `;

      const rolledBackId = crypto.randomUUID();
      const rolledBackEventKey = `event:${rolledBackId}`;
      eventKeys.push(rolledBackEventKey);
      recordIds.push(rolledBackId);
      let afterCommitCount = 0;
      let rollbackError: unknown;

      try {
        await foundation.transaction(async (context) => {
          await foundation.withSession(context, async (session) => {
            await session`insert into foundation_test_records (id) values (${rolledBackId})`;
          });
          await foundation.append(context, {
            eventName: 'foundation.test',
            idempotencyKey: rolledBackEventKey,
            payload: { id: rolledBackId },
          });
          context.afterCommit(() => {
            afterCommitCount += 1;
            return Promise.resolve();
          });
          throw new Error('rollback probe');
        });
      } catch (error) {
        rollbackError = error;
      }

      expect(rollbackError).toBeInstanceOf(Error);
      expect(afterCommitCount).toBe(0);

      const businessRows = await sql<{ count: number }[]>`
        select count(*)::int as count
        from foundation_test_records
        where id = ${rolledBackId}
      `;
      const rolledBackEvents = await sql<{ count: number }[]>`
        select count(*)::int as count
        from outbox_events
        where idempotency_key = ${rolledBackEventKey}
      `;
      expect(businessRows[0]?.count).toBe(0);
      expect(rolledBackEvents[0]?.count).toBe(0);

      const eventKey = `event:${crypto.randomUUID()}`;
      eventKeys.push(eventKey);
      const firstEvent = await foundation.transaction((context) => {
        context.afterCommit(() => {
          afterCommitCount += 1;
          return Promise.resolve();
        });
        return foundation.append(context, {
          eventName: 'foundation.test',
          idempotencyKey: eventKey,
          payload: { committed: true },
        });
      });
      const duplicateEvent = await foundation.transaction((context) => {
        return foundation.append(context, {
          eventName: 'foundation.test',
          idempotencyKey: eventKey,
          payload: { committed: true },
        });
      });
      expect(firstEvent.status).toBe('inserted');
      expect(duplicateEvent.status).toBe('duplicate');
      expect(afterCommitCount).toBe(1);
      const committedEvents = await sql<{ payload: { committed: boolean } }[]>`
        select payload
        from outbox_events
        where idempotency_key = ${eventKey}
      `;
      expect(committedEvents[0]?.payload.committed).toBe(true);

      const validId = crypto.randomUUID();
      const validJobKey = `job:${crypto.randomUUID()}`;
      jobKeys.push(validJobKey);
      recordIds.push(validId);
      expect(
        await queue.enqueue({
          idempotencyKey: validJobKey,
          payload: { id: validId },
          taskIdentifier: 'compatibility_probe',
        }),
      ).toBe('queued');
      expect(
        await queue.enqueue({
          idempotencyKey: validJobKey,
          payload: { id: validId },
          taskIdentifier: 'compatibility_probe',
        }),
      ).toBe('duplicate');

      const queuedJobs = await sql<{ count: number }[]>`
        select count(*)::int as count
        from graphile_worker._private_jobs
        where key = ${validJobKey}
      `;
      expect(queuedJobs[0]?.count).toBe(1);

      runner = await startWorker(databaseUrl, undefined, async () => undefined);
      await waitUntil(async () => {
        const rows = await sql<{ count: number }[]>`
          select count(*)::int as count
          from compatibility_probe
          where id = ${validId}
        `;
        return rows[0]?.count === 1;
      });
      await runner.stop('valid job completed');
      runner = undefined;

      const invalidJobKey = `job:${crypto.randomUUID()}`;
      jobKeys.push(invalidJobKey);
      expect(
        await queue.enqueue({
          idempotencyKey: invalidJobKey,
          payload: { id: 'not-a-uuid' },
          taskIdentifier: 'compatibility_probe',
        }),
      ).toBe('queued');

      const pendingJobs = await sql<{ attempts: number }[]>`
        select attempts
        from graphile_worker._private_jobs
        where key = ${invalidJobKey}
      `;
      expect(pendingJobs[0]?.attempts).toBe(0);

      runner = await startWorker(databaseUrl, undefined, async () => undefined);
      await waitUntil(async () => {
        const rows = await sql<{ attempts: number; last_error: string | null }[]>`
          select attempts, last_error
          from graphile_worker._private_jobs
          where key = ${invalidJobKey}
        `;
        return (rows[0]?.attempts ?? 0) > 0 && rows[0]?.last_error !== null;
      });
      await runner.stop('invalid payload recorded');
      runner = undefined;

      const invalidExecutions = await sql<{ count: number }[]>`
        select count(*)::int as count
        from compatibility_probe
        where id = 'not-a-uuid'
      `;
      expect(invalidExecutions[0]?.count).toBe(0);
    } finally {
      await runner?.stop('test cleanup');
      await sql`
        delete from graphile_worker._private_jobs
        where key = any(${sql.array(jobKeys)}::text[])
      `;
      await sql`
        delete from job_idempotency_keys
        where idempotency_key = any(${sql.array(jobKeys)}::text[])
      `;
      await sql`
        delete from outbox_events
        where idempotency_key = any(${sql.array(eventKeys)}::text[])
      `;
      await sql`
        delete from foundation_test_records
        where id::text = any(${sql.array(recordIds)}::text[])
      `;
      await sql`
        delete from compatibility_probe
        where id = any(${sql.array(recordIds)}::text[])
      `;
      await queue.close();
      await foundation.close();
      await sql.end({ timeout: 1 });
    }
  },
  60_000,
);
