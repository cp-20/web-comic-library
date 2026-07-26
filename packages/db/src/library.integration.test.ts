import { expect, test } from 'bun:test';

import {
  markContentRead,
  setReadingStatus,
  unmarkContentRead,
} from '@web-comic-library/application';
import postgres from 'postgres';

import { createPostgresFoundation } from './foundation';
import { createPostgresLibrary } from './library';
import { migrateDatabase } from './migrate';

const databaseUrl = process.env.DATABASE_URL;
const integrationTest =
  process.env.ALLOW_DATABASE_INTEGRATION_TESTS === '1' && databaseUrl ? test : test.skip;

integrationTest(
  'library storage keeps status history and propagates reads only across confirmed mappings',
  async () => {
    if (!databaseUrl) throw new Error('DATABASE_URL is required');
    await migrateDatabase(databaseUrl);
    await migrateDatabase(databaseUrl);
    const sql = postgres(databaseUrl, { max: 1 });
    const foundation = createPostgresFoundation(databaseUrl);
    const library = createPostgresLibrary(databaseUrl, foundation);
    const userId = crypto.randomUUID();
    const workId = crypto.randomUUID();
    const sourceId = crypto.randomUUID();
    const publicationId = crypto.randomUUID();
    const contentUnitId = crypto.randomUUID();
    const confirmedEntryId = crypto.randomUUID();
    const unconfirmedEntryId = crypto.randomUUID();
    try {
      await sql`
        insert into "user" (id, name, email, email_verified, image, created_at, updated_at)
        values (${userId}, 'Reader', ${`library-${crypto.randomUUID()}@example.test`}, true, null, now(), now())
      `;
      await sql`insert into works (id, serial_status, title) values (${workId}::uuid, 'ongoing', 'Library test')`;
      await sql`insert into sources (id, key, name, base_url) values (${sourceId}::uuid, ${`library-${crypto.randomUUID()}`}, 'Source', 'https://example.test/')`;
      await sql`insert into publications (id, source_id, work_id, kind, title, normalized_url) values (${publicationId}::uuid, ${sourceId}::uuid, ${workId}::uuid, 'official', 'Publication', 'https://example.test/work')`;
      await sql`insert into content_units (id, work_id, position, title) values (${contentUnitId}::uuid, ${workId}::uuid, 1, 'Unit')`;
      await sql`insert into publication_entries (id, publication_id, work_id, kind, position, title, normalized_url) values (${confirmedEntryId}::uuid, ${publicationId}::uuid, ${workId}::uuid, 'regular', 1, 'Confirmed', 'https://example.test/confirmed'), (${unconfirmedEntryId}::uuid, ${publicationId}::uuid, ${workId}::uuid, 'regular', 2, 'Unconfirmed', 'https://example.test/unconfirmed')`;
      await sql`insert into entry_content_mappings (work_id, content_unit_id, publication_entry_id, confirmed) values (${workId}::uuid, ${contentUnitId}::uuid, ${confirmedEntryId}::uuid, true), (${workId}::uuid, ${contentUnitId}::uuid, ${unconfirmedEntryId}::uuid, false)`;

      await setReadingStatus(foundation, library, {
        status: 'reading',
        userUuid: userId,
        visibility: 'private',
        workId,
      });
      await markContentRead(foundation, library, {
        contentUnitIds: [contentUnitId],
        userUuid: userId,
        visibility: null,
        workId,
      });
      expect(await library.listReadContentUnitIds(userId, workId)).toEqual([contentUnitId]);
      const publicationReads = await sql<{ publicationEntryId: string }[]>`
        select publication_entry_id::text as "publicationEntryId" from publication_read_records where user_id = ${userId}
      `;
      const historyCount = await sql<{ count: number }[]>`
        select count(*)::int as count from library_status_history where user_id = ${userId}
      `;
      expect(Array.from(publicationReads)).toEqual([{ publicationEntryId: confirmedEntryId }]);
      expect(Array.from(historyCount)).toEqual([{ count: 1 }]);

      await unmarkContentRead(foundation, library, {
        contentUnitIds: [contentUnitId],
        userUuid: userId,
        workId,
      });
      expect(await library.listReadContentUnitIds(userId, workId)).toEqual([]);
      const publicationReadCount = await sql<{ count: number }[]>`
        select count(*)::int as count from publication_read_records where user_id = ${userId}
      `;
      expect(Array.from(publicationReadCount)).toEqual([{ count: 0 }]);
    } finally {
      await sql`delete from "user" where id = ${userId}`;
      await Promise.all([foundation.close(), library.close()]);
      await sql.end({ timeout: 1 });
    }
  },
  60_000,
);
