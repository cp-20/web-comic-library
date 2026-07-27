import { expect, test } from 'bun:test';

import { performModeration, submitReport } from '@web-comic-library/application';
import postgres from 'postgres';

import { createPostgresFoundation } from './foundation';
import { migrateDatabase } from './migrate';
import { createPostgresModeration } from './moderation';

const databaseUrl = process.env.DATABASE_URL;
const integrationTest =
  process.env.ALLOW_DATABASE_INTEGRATION_TESTS === '1' && databaseUrl ? test : test.skip;

integrationTest(
  'moderation storage reopens reports and records activity and account state changes',
  async () => {
    if (!databaseUrl) throw new Error('DATABASE_URL is required');
    await migrateDatabase(databaseUrl);
    const sql = postgres(databaseUrl, { max: 1 });
    const foundation = createPostgresFoundation(databaseUrl);
    const moderation = createPostgresModeration(databaseUrl, foundation);
    const administratorId = crypto.randomUUID();
    const moderatorId = crypto.randomUUID();
    const targetId = crypto.randomUUID();
    const workId = crypto.randomUUID();
    const activityId = crypto.randomUUID();
    try {
      await sql`
        insert into "user" (id, name, email, email_verified, image, role, created_at, updated_at)
        values
          (${administratorId}, 'Administrator', ${`administrator-${crypto.randomUUID()}@example.test`}, true, null, 'administrator', now(), now()),
          (${moderatorId}, 'Moderator', ${`moderator-${crypto.randomUUID()}@example.test`}, true, null, 'moderator', now(), now()),
          (${targetId}, 'Target', ${`target-${crypto.randomUUID()}@example.test`}, true, null, 'user', now(), now())
      `;
      await sql`
        insert into profiles (user_id, public_id, account_status, default_visibility)
        values (${administratorId}, 'moderation-admin', 'active', 'public'),
          (${moderatorId}, 'moderation-moderator', 'active', 'public'),
          (${targetId}, 'moderation-target', 'active', 'public')
      `;
      await sql`insert into works (id, serial_status, title) values (${workId}::uuid, 'ongoing', 'Moderation test')`;
      await sql`
        insert into activities (id, user_id, work_id, kind, status)
        values (${activityId}::uuid, ${targetId}, ${workId}::uuid, 'reading_status', 'reading')
      `;

      const first = await submitReport(foundation, moderation, {
        reason: 'first report',
        reporterUserUuid: administratorId,
        targetId: activityId,
        targetKind: 'activity',
      });
      await performModeration(foundation, moderation, {
        action: 'hide',
        actor: { id: moderatorId, role: 'moderator' },
        reason: 'policy violation',
        reportId: first.id,
        targetId: activityId,
        targetKind: 'activity',
      });
      const hidden = await sql<{ hiddenAt: Date | null }[]>`
        select hidden_at as "hiddenAt" from activities where id = ${activityId}::uuid
      `;
      expect(hidden[0]?.hiddenAt).not.toBeNull();
      expect(await moderation.listModerationActions(first.id)).toHaveLength(1);

      const reopened = await submitReport(foundation, moderation, {
        reason: 'second report',
        reporterUserUuid: administratorId,
        targetId: activityId,
        targetKind: 'activity',
      });
      expect(reopened).toMatchObject({ id: first.id, reason: 'second report', status: 'open' });

      await performModeration(foundation, moderation, {
        action: 'suspend',
        actor: { id: administratorId, role: 'administrator' },
        reason: 'repeat violation',
        reportId: null,
        targetId,
        targetKind: 'profile',
      });
      const status = await sql<{ accountStatus: string }[]>`
        select account_status::text as "accountStatus" from profiles where user_id = ${targetId}
      `;
      expect(status[0]?.accountStatus).toBe('disabled');
    } finally {
      await sql`
        delete from moderation_actions where actor_user_id in (${administratorId}, ${moderatorId})
      `;
      await sql`delete from "user" where id in (${administratorId}, ${moderatorId}, ${targetId})`;
      await Promise.all([foundation.close(), moderation.close()]);
      await sql.end({ timeout: 1 });
    }
  },
  60_000,
);
