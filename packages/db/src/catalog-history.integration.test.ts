import { expect, test } from 'bun:test';

import {
  generateInAppNotifications,
  markContentRead,
  mergeContentUnits,
  mergeWorks,
  setFollowSettings,
  setReadingStatus,
  setUserVolumeRecord,
  splitContentUnit,
  splitWork,
} from '@web-comic-library/application';
import postgres from 'postgres';

import { createPostgresCatalogAdmin } from './catalog-admin';
import { createPostgresFollow } from './follow';
import { createPostgresFoundation } from './foundation';
import { createPostgresLibrary } from './library';
import { migrateDatabase } from './migrate';
import { createPostgresNotification } from './notification';
import { createPostgresVolumeLibrary } from './volume-library';

const databaseUrl = process.env.DATABASE_URL;
const integrationTest =
  process.env.ALLOW_DATABASE_INTEGRATION_TESTS === '1' && databaseUrl ? test : test.skip;

const actor = {
  assurance: 'passkey' as const,
  id: 'catalog-history-test',
  role: 'administrator' as const,
};

const getNewId = (value: unknown, key: string): string => {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    typeof value[key as keyof typeof value] !== 'string'
  ) {
    throw new Error(`catalog audit is missing ${key}`);
  }
  return value[key as keyof typeof value];
};

integrationTest(
  'catalog redirects retain read, volume, and notification history across merge and split',
  async () => {
    if (!databaseUrl) throw new Error('DATABASE_URL is required');
    await migrateDatabase(databaseUrl);
    await migrateDatabase(databaseUrl);

    const sql = postgres(databaseUrl, { max: 1 });
    const foundation = createPostgresFoundation(databaseUrl);
    const admin = createPostgresCatalogAdmin(databaseUrl, foundation);
    const follow = createPostgresFollow(databaseUrl, foundation);
    const library = createPostgresLibrary(databaseUrl, foundation);
    const notifications = createPostgresNotification(databaseUrl, foundation);
    const volumes = createPostgresVolumeLibrary(databaseUrl, foundation);
    const userId = crypto.randomUUID();
    const sourceWorkId = crypto.randomUUID();
    const targetWorkId = crypto.randomUUID();
    const sourceId = crypto.randomUUID();
    const sourcePublicationId = crypto.randomUUID();
    const targetPublicationId = crypto.randomUUID();
    const sourceEntryId = crypto.randomUUID();
    const targetEntryId = crypto.randomUUID();
    const sourceContentId = crypto.randomUUID();
    const targetContentId = crypto.randomUUID();
    const volumeId = crypto.randomUUID();
    const initialEventId = crypto.randomUUID();
    const laterEventId = crypto.randomUUID();
    let splitContentId: string | null = null;
    let splitWorkId: string | null = null;

    try {
      await sql`
        insert into "user" (id, name, email, email_verified, image, created_at, updated_at)
        values (${userId}, 'Reader', ${`catalog-history-${crypto.randomUUID()}@example.test`}, true, null, now(), now())
      `;
      await sql`
        insert into works (id, serial_status, title)
        values
          (${sourceWorkId}::uuid, 'ongoing', 'Merged source'),
          (${targetWorkId}::uuid, 'ongoing', 'Canonical target')
      `;
      await sql`
        insert into sources (id, key, name, base_url)
        values (${sourceId}::uuid, ${`catalog-history-${crypto.randomUUID()}`}, 'Source', 'https://example.test/')
      `;
      await sql`
        insert into publications (id, source_id, work_id, kind, title, normalized_url)
        values
          (${sourcePublicationId}::uuid, ${sourceId}::uuid, ${sourceWorkId}::uuid, 'official', 'Source publication', 'https://example.test/source'),
          (${targetPublicationId}::uuid, ${sourceId}::uuid, ${targetWorkId}::uuid, 'official', 'Target publication', 'https://example.test/target')
      `;
      await sql`
        insert into content_units (id, work_id, position, title)
        values
          (${sourceContentId}::uuid, ${sourceWorkId}::uuid, 1, 'Source content'),
          (${targetContentId}::uuid, ${targetWorkId}::uuid, 1, 'Canonical content')
      `;
      await sql`
        insert into publication_entries (
          id, publication_id, work_id, kind, position, title, normalized_url
        ) values
          (${sourceEntryId}::uuid, ${sourcePublicationId}::uuid, ${sourceWorkId}::uuid, 'regular', 1, 'Source entry', 'https://example.test/source/1'),
          (${targetEntryId}::uuid, ${targetPublicationId}::uuid, ${targetWorkId}::uuid, 'regular', 1, 'Target entry', 'https://example.test/target/1')
      `;
      await sql`
        insert into entry_content_mappings (work_id, publication_entry_id, content_unit_id, confirmed)
        values
          (${sourceWorkId}::uuid, ${sourceEntryId}::uuid, ${sourceContentId}::uuid, true),
          (${targetWorkId}::uuid, ${targetEntryId}::uuid, ${targetContentId}::uuid, true)
      `;
      await sql`
        insert into volume_editions (
          id, work_id, isbn, publisher_product_id, title, publication_status
        ) values (${volumeId}::uuid, ${sourceWorkId}::uuid, '9781234567890', null, 'Source volume', 'active')
      `;
      await sql`
        insert into volume_content_mappings (volume_edition_id, content_unit_id, work_id, status)
        values (${volumeId}::uuid, ${sourceContentId}::uuid, ${sourceWorkId}::uuid, 'confirmed')
      `;

      await setReadingStatus(foundation, library, {
        status: 'reading',
        userUuid: userId,
        visibility: 'private',
        workId: sourceWorkId,
      });
      await markContentRead(foundation, library, {
        contentUnitIds: [sourceContentId],
        userUuid: userId,
        visibility: 'followers',
        workId: sourceWorkId,
      });
      await setUserVolumeRecord(foundation, volumes, {
        memoContentUnitId: sourceContentId,
        ownsDigital: true,
        ownsPaper: false,
        status: 'read',
        userUuid: userId,
        visibility: 'private',
        volumeEditionId: volumeId,
      });
      await setFollowSettings(foundation, follow, {
        mode: 'fastest',
        publicationIds: [],
        userUuid: userId,
        workId: sourceWorkId,
      });
      await sql`
        insert into release_events (
          id, idempotency_key, source_id, publication_entry_id, kind, occurred_at, notification_suppressed
        ) values (
          ${initialEventId}::uuid,
          ${`catalog-history:${initialEventId}`},
          ${sourceId}::uuid,
          ${sourceEntryId}::uuid,
          'new_episode',
          now(),
          false
        )
      `;
      expect(await generateInAppNotifications(foundation, notifications, initialEventId)).toBe(1);

      await mergeWorks(foundation, admin, {
        actor,
        reason: 'reconcile duplicate catalog work history',
        sourceWorkId,
        targetWorkId,
      });
      expect(await library.findLibraryEntry(userId, targetWorkId)).toEqual({
        status: 'reading',
        userUuid: userId,
        visibility: 'private',
        workId: targetWorkId,
      });
      expect(await library.listReadContentUnitIds(userId, targetWorkId)).toEqual([sourceContentId]);
      expect(await volumes.listUserVolumeRecords(userId)).toEqual([
        expect.objectContaining({
          memoContentUnitId: sourceContentId,
          volumeEditionId: volumeId,
          workId: targetWorkId,
        }),
      ]);
      expect((await notifications.findReleaseEvent(initialEventId))?.workId).toBe(targetWorkId);
      expect((await notifications.listNotifications(userId, null, 10)).items).toHaveLength(1);

      await mergeContentUnits(foundation, admin, {
        actor,
        reason: 'reconcile duplicate content history',
        sourceContentUnitId: sourceContentId,
        targetContentUnitId: targetContentId,
      });
      expect(await library.listReadContentUnitIds(userId, targetWorkId)).toEqual([targetContentId]);
      expect(await volumes.listUserVolumeRecords(userId)).toEqual([
        expect.objectContaining({
          memoContentUnitId: targetContentId,
          volumeEditionId: volumeId,
          workId: targetWorkId,
        }),
      ]);

      const splitContentAudit = await splitContentUnit(foundation, admin, {
        actor,
        entryIds: [sourceEntryId],
        position: 2,
        reason: 'restore independently published content',
        sourceContentUnitId: targetContentId,
        title: 'Split content',
      });
      splitContentId = getNewId(splitContentAudit.after, 'newContentUnitId');
      expect(await library.listReadContentUnitIds(userId, targetWorkId)).toEqual([targetContentId]);
      const rawReadRows = await sql<{ contentUnitId: string }[]>`
        select content_unit_id::text as "contentUnitId"
        from content_read_records
        where user_id = ${userId}
      `;
      expect(Array.from(rawReadRows)).toEqual([{ contentUnitId: sourceContentId }]);

      const splitWorkAudit = await splitWork(foundation, admin, {
        actor,
        contentUnitIds: [splitContentId],
        publicationIds: [sourcePublicationId],
        reason: 'restore a mistakenly merged publication',
        serialStatus: 'ongoing',
        sourceWorkId: targetWorkId,
        title: 'Split work',
      });
      splitWorkId = getNewId(splitWorkAudit.after, 'newWorkId');
      expect(await library.listReadContentUnitIds(userId, splitWorkId)).toEqual([]);
      expect(await library.listReadContentUnitIds(userId, targetWorkId)).toEqual([targetContentId]);

      await sql`
        insert into release_events (
          id, idempotency_key, source_id, publication_entry_id, kind, occurred_at, notification_suppressed
        ) values (
          ${laterEventId}::uuid,
          ${`catalog-history:${laterEventId}`},
          ${sourceId}::uuid,
          ${targetEntryId}::uuid,
          'extra',
          now(),
          false
        )
      `;
      expect(await generateInAppNotifications(foundation, notifications, laterEventId)).toBe(1);
      expect(await generateInAppNotifications(foundation, notifications, laterEventId)).toBe(0);
      expect((await notifications.listNotifications(userId, null, 10)).items).toHaveLength(2);
    } finally {
      await sql`delete from "user" where id = ${userId}`;
      await sql`
        delete from release_events
        where id in (${initialEventId}::uuid, ${laterEventId}::uuid)
      `;
      await sql`
        delete from catalog_redirects
        where source_id in (${sourceWorkId}::uuid, ${sourceContentId}::uuid)
      `;
      await sql`delete from catalog_merge_audits where operator_id = ${actor.id}`;
      await sql`
        delete from volume_content_mappings
        where volume_edition_id = ${volumeId}::uuid
      `;
      await sql`delete from volume_editions where id = ${volumeId}::uuid`;
      if (splitWorkId) {
        await sql`delete from entry_content_mappings where work_id = ${splitWorkId}::uuid`;
        await sql`delete from publication_entries where work_id = ${splitWorkId}::uuid`;
        await sql`delete from content_units where work_id = ${splitWorkId}::uuid`;
        await sql`delete from publications where work_id = ${splitWorkId}::uuid`;
        await sql`delete from work_creators where work_id = ${splitWorkId}::uuid`;
        await sql`delete from work_aliases where work_id = ${splitWorkId}::uuid`;
        await sql`delete from works where id = ${splitWorkId}::uuid`;
      }
      await sql`
        delete from entry_content_mappings
        where work_id in (${sourceWorkId}::uuid, ${targetWorkId}::uuid)
      `;
      await sql`
        delete from publication_entries
        where work_id in (${sourceWorkId}::uuid, ${targetWorkId}::uuid)
      `;
      await sql`
        delete from content_units
        where work_id in (${sourceWorkId}::uuid, ${targetWorkId}::uuid)
      `;
      await sql`
        delete from publications
        where work_id in (${sourceWorkId}::uuid, ${targetWorkId}::uuid)
      `;
      await sql`delete from sources where id = ${sourceId}::uuid`;
      await sql`delete from works where id in (${sourceWorkId}::uuid, ${targetWorkId}::uuid)`;
      await Promise.all([
        admin.close(),
        follow.close(),
        foundation.close(),
        library.close(),
        notifications.close(),
        volumes.close(),
      ]);
      await sql.end({ timeout: 1 });
    }
  },
  60_000,
);
