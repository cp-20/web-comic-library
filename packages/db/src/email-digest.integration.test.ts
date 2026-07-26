import { expect, test } from 'bun:test';

import { setEmailDigestSettings, unsubscribeEmailDigest } from '@web-comic-library/application';
import postgres from 'postgres';

import { createPostgresEmailDigest } from './email-digest';
import { createPostgresFoundation } from './foundation';
import { migrateDatabase } from './migrate';

const databaseUrl = process.env.DATABASE_URL;
const integrationTest =
  process.env.ALLOW_DATABASE_INTEGRATION_TESTS === '1' && databaseUrl ? test : test.skip;

integrationTest(
  'email digest groups a local day once and stops after unsubscribe',
  async () => {
    if (!databaseUrl) throw new Error('DATABASE_URL is required');
    await migrateDatabase(databaseUrl);
    await migrateDatabase(databaseUrl);
    const sql = postgres(databaseUrl, { max: 1 });
    const foundation = createPostgresFoundation(databaseUrl);
    const digests = createPostgresEmailDigest(databaseUrl, foundation);
    const userId = crypto.randomUUID();
    const workId = crypto.randomUUID();
    const sourceId = crypto.randomUUID();
    const publicationId = crypto.randomUUID();
    const entryId = crypto.randomUUID();
    const eventId = crypto.randomUUID();
    const nextEventId = crypto.randomUUID();
    try {
      await sql`
        insert into "user" (id, name, email, email_verified, image, created_at, updated_at)
        values (${userId}, 'Reader', ${`digest-${crypto.randomUUID()}@example.test`}, true, null, now(), now())
      `;
      await sql`insert into works (id, serial_status, title) values (${workId}::uuid, 'ongoing', 'Digest test')`;
      await sql`insert into sources (id, key, name, base_url) values (${sourceId}::uuid, ${`digest-${crypto.randomUUID()}`}, 'Source', 'https://example.test/')`;
      await sql`insert into publications (id, source_id, work_id, kind, title, normalized_url) values (${publicationId}::uuid, ${sourceId}::uuid, ${workId}::uuid, 'official', 'Publication', 'https://example.test/work')`;
      await sql`insert into publication_entries (id, publication_id, work_id, kind, position, title, normalized_url) values (${entryId}::uuid, ${publicationId}::uuid, ${workId}::uuid, 'regular', 1, 'Entry', 'https://example.test/entry')`;
      await sql`
        insert into release_events (
          id, idempotency_key, source_id, publication_entry_id, kind, occurred_at, notification_suppressed
        ) values (
          ${eventId}::uuid, ${`digest:${eventId}`}, ${sourceId}::uuid, ${entryId}::uuid,
          'new_episode', '2026-07-26T15:30:00Z', false
        )
      `;
      await sql`
        insert into release_events (
          id, idempotency_key, source_id, publication_entry_id, kind, occurred_at, notification_suppressed
        ) values (
          ${nextEventId}::uuid, ${`digest:${nextEventId}`}, ${sourceId}::uuid, ${entryId}::uuid,
          'new_episode', '2026-07-27T15:30:00Z', false
        )
      `;
      await setEmailDigestSettings(foundation, digests, {
        enabled: true,
        sendTime: '09:00',
        timezone: 'Asia/Tokyo',
        userUuid: userId,
      });
      await sql`
        insert into notifications (
          id, idempotency_key, user_id, release_event_id, kind, channel, created_at
        ) values (
          ${crypto.randomUUID()}::uuid, ${`digest-notification:${crypto.randomUUID()}`}, ${userId},
          ${eventId}::uuid, 'new_episode', 'email', '2026-07-26T15:30:00Z'
        )
      `;

      const first = await digests.listQueuedEmailDigests(new Date('2026-07-27T00:30:00Z'));
      expect(first).toHaveLength(1);
      expect(first[0]?.notificationCount).toBe(1);
      const digest = first[0];
      if (!digest) throw new Error('email digest is missing');
      await digests.recordEmailDigestResult(digest.id, 'delivered');
      expect(await digests.listQueuedEmailDigests(new Date('2026-07-27T00:30:00Z'))).toEqual([]);

      await unsubscribeEmailDigest(foundation, digests, userId);
      await sql`
        insert into notifications (
          id, idempotency_key, user_id, release_event_id, kind, channel, created_at
        ) values (
          ${crypto.randomUUID()}::uuid, ${`digest-notification:${crypto.randomUUID()}`}, ${userId},
          ${nextEventId}::uuid, 'new_episode', 'email', '2026-07-27T15:30:00Z'
        )
      `;
      expect(await digests.listQueuedEmailDigests(new Date('2026-07-28T00:30:00Z'))).toEqual([]);
    } finally {
      await sql`delete from "user" where id = ${userId}`;
      await sql`delete from release_events where id = ${nextEventId}::uuid`;
      await sql`delete from release_events where id = ${eventId}::uuid`;
      await sql`delete from publication_entries where id = ${entryId}::uuid`;
      await sql`delete from publications where id = ${publicationId}::uuid`;
      await sql`delete from sources where id = ${sourceId}::uuid`;
      await sql`delete from works where id = ${workId}::uuid`;
      await Promise.all([foundation.close(), digests.close()]);
      await sql.end({ timeout: 1 });
    }
  },
  60_000,
);
