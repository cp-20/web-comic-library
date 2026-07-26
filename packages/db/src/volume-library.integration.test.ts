import { expect, test } from 'bun:test';

import {
  setUserVolumeRecord,
  submitVolumeContentMappingCorrection,
} from '@web-comic-library/application';
import postgres from 'postgres';

import { createPostgresFoundation } from './foundation';
import { migrateDatabase } from './migrate';
import { createPostgresVolumeLibrary } from './volume-library';

const databaseUrl = process.env.DATABASE_URL;
const integrationTest =
  process.env.ALLOW_DATABASE_INTEGRATION_TESTS === '1' && databaseUrl ? test : test.skip;

integrationTest(
  'volume records preserve ownership without mappings and reflect only confirmed mappings',
  async () => {
    if (!databaseUrl) throw new Error('DATABASE_URL is required');
    await migrateDatabase(databaseUrl);
    await migrateDatabase(databaseUrl);
    const sql = postgres(databaseUrl, { max: 1 });
    const foundation = createPostgresFoundation(databaseUrl);
    const volumeLibrary = createPostgresVolumeLibrary(databaseUrl, foundation);
    const userId = crypto.randomUUID();
    const workId = crypto.randomUUID();
    const sourceId = crypto.randomUUID();
    const publicationId = crypto.randomUUID();
    const contentUnitOneId = crypto.randomUUID();
    const contentUnitTwoId = crypto.randomUUID();
    const publicationEntryId = crypto.randomUUID();
    const volumeId = crypto.randomUUID();
    const unmappedVolumeId = crypto.randomUUID();
    try {
      await sql`
        insert into "user" (id, name, email, email_verified, image, created_at, updated_at)
        values (${userId}, 'Reader', ${`volume-${crypto.randomUUID()}@example.test`}, true, null, now(), now())
      `;
      await sql`insert into works (id, serial_status, title) values (${workId}::uuid, 'ongoing', 'Volume test')`;
      await sql`insert into sources (id, key, name, base_url) values (${sourceId}::uuid, ${`volume-${crypto.randomUUID()}`}, 'Source', 'https://example.test/')`;
      await sql`insert into publications (id, source_id, work_id, kind, title, normalized_url) values (${publicationId}::uuid, ${sourceId}::uuid, ${workId}::uuid, 'official', 'Publication', 'https://example.test/work')`;
      await sql`
        insert into content_units (id, work_id, position, title) values
        (${contentUnitOneId}::uuid, ${workId}::uuid, 1, 'Unit one'),
        (${contentUnitTwoId}::uuid, ${workId}::uuid, 2, 'Unit two')
      `;
      await sql`insert into publication_entries (id, publication_id, work_id, kind, position, title, normalized_url) values (${publicationEntryId}::uuid, ${publicationId}::uuid, ${workId}::uuid, 'regular', 1, 'Entry', 'https://example.test/entry')`;
      await sql`insert into entry_content_mappings (work_id, publication_entry_id, content_unit_id, confirmed) values (${workId}::uuid, ${publicationEntryId}::uuid, ${contentUnitOneId}::uuid, true)`;
      await sql`
        insert into volume_editions (id, work_id, isbn, publisher_product_id, title, publication_status)
        values
        (${volumeId}::uuid, ${workId}::uuid, null, ${`volume-${crypto.randomUUID()}`}, 'Volume one', 'active'),
        (${unmappedVolumeId}::uuid, ${workId}::uuid, null, ${`volume-${crypto.randomUUID()}`}, 'Volume two', 'active')
      `;
      await sql`
        insert into volume_content_mappings (volume_edition_id, content_unit_id, work_id, status) values
        (${volumeId}::uuid, ${contentUnitOneId}::uuid, ${workId}::uuid, 'confirmed'),
        (${volumeId}::uuid, ${contentUnitTwoId}::uuid, ${workId}::uuid, 'unconfirmed')
      `;

      await setUserVolumeRecord(foundation, volumeLibrary, {
        memoContentUnitId: contentUnitOneId,
        ownsDigital: true,
        ownsPaper: true,
        status: 'read',
        userUuid: userId,
        visibility: 'private',
        volumeEditionId: volumeId,
      });
      expect(await volumeLibrary.listUserVolumeRecords(userId)).toContainEqual({
        memoContentUnitId: contentUnitOneId,
        ownsDigital: true,
        ownsPaper: true,
        status: 'read',
        userUuid: userId,
        visibility: 'private',
        volumeEditionId: volumeId,
        workId,
      });
      expect(
        Array.from(
          await sql<{ contentUnitId: string }[]>`
          select content_unit_id::text as "contentUnitId" from content_read_records where user_id = ${userId}
        `,
        ),
      ).toEqual([{ contentUnitId: contentUnitOneId }]);
      expect(
        Array.from(
          await sql<{ publicationEntryId: string }[]>`
          select publication_entry_id::text as "publicationEntryId" from publication_read_records where user_id = ${userId}
        `,
        ),
      ).toEqual([{ publicationEntryId }]);

      await setUserVolumeRecord(foundation, volumeLibrary, {
        memoContentUnitId: null,
        ownsDigital: false,
        ownsPaper: true,
        status: 'unread',
        userUuid: userId,
        visibility: 'private',
        volumeEditionId: volumeId,
      });
      await setUserVolumeRecord(foundation, volumeLibrary, {
        memoContentUnitId: null,
        ownsDigital: false,
        ownsPaper: true,
        status: 'unread',
        userUuid: userId,
        visibility: 'private',
        volumeEditionId: unmappedVolumeId,
      });
      expect(
        Array.from(
          await sql<{ count: number }[]>`
          select count(*)::int as count from content_read_records where user_id = ${userId}
        `,
        ),
      ).toEqual([{ count: 1 }]);
      expect(await volumeLibrary.listUserVolumeRecords(userId)).toHaveLength(2);

      await submitVolumeContentMappingCorrection(foundation, volumeLibrary, {
        contentUnitId: contentUnitTwoId,
        rationale: 'この巻には第2話も収録されています。',
        suggestedStatus: 'confirmed',
        userUuid: userId,
        volumeEditionId: volumeId,
      });
      expect(
        Array.from(
          await sql<{ count: number }[]>`
          select count(*)::int as count from catalog_review_items
          where dedupe_key like ${`volume-mapping-correction:${userId}:%`}
        `,
        ),
      ).toEqual([{ count: 1 }]);
    } finally {
      await sql`delete from catalog_review_items where dedupe_key like ${`volume-mapping-correction:${userId}:%`}`;
      await sql`delete from "user" where id = ${userId}`;
      await sql`delete from volume_content_mappings where volume_edition_id in (${volumeId}::uuid, ${unmappedVolumeId}::uuid)`;
      await sql`delete from volume_editions where id in (${volumeId}::uuid, ${unmappedVolumeId}::uuid)`;
      await sql`delete from entry_content_mappings where work_id = ${workId}::uuid`;
      await sql`delete from publication_entries where publication_id = ${publicationId}::uuid`;
      await sql`delete from publications where id = ${publicationId}::uuid`;
      await sql`delete from content_units where work_id = ${workId}::uuid`;
      await sql`delete from sources where id = ${sourceId}::uuid`;
      await sql`delete from works where id = ${workId}::uuid`;
      await Promise.all([foundation.close(), volumeLibrary.close()]);
      await sql.end({ timeout: 1 });
    }
  },
  60_000,
);
