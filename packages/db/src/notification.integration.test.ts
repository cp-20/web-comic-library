import { expect, test } from 'bun:test';

import {
  generateInAppNotifications,
  readAllNotifications,
  readNotification,
  setNotificationPreference,
} from '@web-comic-library/application';
import postgres from 'postgres';

import { createPostgresFoundation } from './foundation';
import { migrateDatabase } from './migrate';
import { createPostgresNotification } from './notification';

const databaseUrl = process.env.DATABASE_URL;
const integrationTest =
  process.env.ALLOW_DATABASE_INTEGRATION_TESTS === '1' && databaseUrl ? test : test.skip;

integrationTest(
  'notification storage generates one in-app notification and keeps reads scoped to its owner',
  async () => {
    if (!databaseUrl) throw new Error('DATABASE_URL is required');
    await migrateDatabase(databaseUrl);
    await migrateDatabase(databaseUrl);
    const sql = postgres(databaseUrl, { max: 1 });
    const foundation = createPostgresFoundation(databaseUrl);
    const notifications = createPostgresNotification(databaseUrl, foundation);
    const userId = crypto.randomUUID();
    const otherUserId = crypto.randomUUID();
    const workId = crypto.randomUUID();
    const sourceId = crypto.randomUUID();
    const publicationId = crypto.randomUUID();
    const contentUnitId = crypto.randomUUID();
    const entryId = crypto.randomUUID();
    const eventId = crypto.randomUUID();
    try {
      await Promise.all(
        [userId, otherUserId].map(
          (user) =>
            sql`
            insert into "user" (id, name, email, email_verified, image, created_at, updated_at)
            values (${user}, 'Reader', ${`notification-${crypto.randomUUID()}@example.test`}, true, null, now(), now())
          `,
        ),
      );
      await sql`insert into works (id, serial_status, title) values (${workId}::uuid, 'ongoing', 'Notification test')`;
      await sql`insert into sources (id, key, name, base_url) values (${sourceId}::uuid, ${`notification-${crypto.randomUUID()}`}, 'Source', 'https://example.test/')`;
      await sql`insert into publications (id, source_id, work_id, kind, title, normalized_url) values (${publicationId}::uuid, ${sourceId}::uuid, ${workId}::uuid, 'official', 'Publication', 'https://example.test/work')`;
      await sql`insert into content_units (id, work_id, position, title) values (${contentUnitId}::uuid, ${workId}::uuid, 1, 'Unit')`;
      await sql`insert into publication_entries (id, publication_id, work_id, kind, position, title, normalized_url) values (${entryId}::uuid, ${publicationId}::uuid, ${workId}::uuid, 'regular', 1, 'Entry', 'https://example.test/entry')`;
      await sql`insert into entry_content_mappings (work_id, publication_entry_id, content_unit_id, confirmed) values (${workId}::uuid, ${entryId}::uuid, ${contentUnitId}::uuid, true)`;
      await sql`insert into release_events (id, idempotency_key, source_id, publication_entry_id, kind, occurred_at, notification_suppressed) values (${eventId}::uuid, ${`notification:${eventId}`}, ${sourceId}::uuid, ${entryId}::uuid, 'new_episode', now(), false)`;
      await sql`insert into work_follow_settings (user_id, work_id, mode) values (${userId}, ${workId}::uuid, 'fastest')`;

      expect(await generateInAppNotifications(foundation, notifications, eventId)).toBe(1);
      expect(await generateInAppNotifications(foundation, notifications, eventId)).toBe(0);
      const firstPage = await notifications.listNotifications(userId, null, 1);
      expect(firstPage.items).toHaveLength(1);
      const notification = firstPage.items[0];
      if (!notification) throw new Error('notification is missing');
      expect(await notifications.unreadNotificationCount(userId)).toBe(1);
      expect(await readNotification(foundation, notifications, otherUserId, notification.id)).toBe(
        false,
      );
      expect(await readNotification(foundation, notifications, userId, notification.id)).toBe(true);
      await readAllNotifications(foundation, notifications, userId);
      expect(await notifications.unreadNotificationCount(userId)).toBe(0);
      await setNotificationPreference(foundation, notifications, {
        channel: 'in_app',
        enabled: false,
        kind: 'new_episode',
        userUuid: userId,
      });
      expect(
        await notifications.findNotificationPreference(userId, 'new_episode', 'in_app'),
      ).toEqual({
        channel: 'in_app',
        enabled: false,
        kind: 'new_episode',
        userUuid: userId,
      });
    } finally {
      await sql`delete from "user" where id in (${userId}, ${otherUserId})`;
      await sql`delete from release_events where id = ${eventId}::uuid`;
      await sql`delete from entry_content_mappings where work_id = ${workId}::uuid`;
      await sql`delete from publication_entries where id = ${entryId}::uuid`;
      await sql`delete from publications where id = ${publicationId}::uuid`;
      await sql`delete from content_units where id = ${contentUnitId}::uuid`;
      await sql`delete from sources where id = ${sourceId}::uuid`;
      await sql`delete from works where id = ${workId}::uuid`;
      await Promise.all([foundation.close(), notifications.close()]);
      await sql.end({ timeout: 1 });
    }
  },
  60_000,
);
