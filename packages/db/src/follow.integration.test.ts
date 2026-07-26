import { expect, test } from 'bun:test';

import { setFollowSettings, setSourcePreferences } from '@web-comic-library/application';
import postgres from 'postgres';

import { createPostgresFollow } from './follow';
import { createPostgresFoundation } from './foundation';
import { migrateDatabase } from './migrate';

const databaseUrl = process.env.DATABASE_URL;
const integrationTest =
  process.env.ALLOW_DATABASE_INTEGRATION_TESTS === '1' && databaseUrl ? test : test.skip;

integrationTest(
  'follow storage persists global source priority and work-scoped publication selections',
  async () => {
    if (!databaseUrl) throw new Error('DATABASE_URL is required');
    await migrateDatabase(databaseUrl);
    await migrateDatabase(databaseUrl);
    const sql = postgres(databaseUrl, { max: 1 });
    const foundation = createPostgresFoundation(databaseUrl);
    const follow = createPostgresFollow(databaseUrl, foundation);
    const userId = crypto.randomUUID();
    const workId = crypto.randomUUID();
    const sourceOneId = crypto.randomUUID();
    const sourceTwoId = crypto.randomUUID();
    const publicationOneId = crypto.randomUUID();
    const publicationTwoId = crypto.randomUUID();
    try {
      await sql`
        insert into "user" (id, name, email, email_verified, image, created_at, updated_at)
        values (${userId}, 'Reader', ${`follow-${crypto.randomUUID()}@example.test`}, true, null, now(), now())
      `;
      await sql`insert into works (id, serial_status, title) values (${workId}::uuid, 'ongoing', 'Follow test')`;
      await sql`
        insert into sources (id, key, name, base_url) values
        (${sourceOneId}::uuid, ${`follow-one-${crypto.randomUUID()}`}, 'Source one', 'https://one.example.test/'),
        (${sourceTwoId}::uuid, ${`follow-two-${crypto.randomUUID()}`}, 'Source two', 'https://two.example.test/')
      `;
      await sql`
        insert into publications (id, source_id, work_id, kind, title, normalized_url) values
        (${publicationOneId}::uuid, ${sourceOneId}::uuid, ${workId}::uuid, 'official', 'One', 'https://one.example.test/work'),
        (${publicationTwoId}::uuid, ${sourceTwoId}::uuid, ${workId}::uuid, 'official', 'Two', 'https://two.example.test/work')
      `;

      await setSourcePreferences(foundation, follow, userId, [sourceTwoId, sourceOneId]);
      await setFollowSettings(foundation, follow, {
        mode: 'selected_publications',
        publicationIds: [publicationTwoId],
        userUuid: userId,
        workId,
      });
      expect(await follow.listSourcePreferences(userId)).toEqual([
        { position: 0, sourceId: sourceTwoId, userUuid: userId },
        { position: 1, sourceId: sourceOneId, userUuid: userId },
      ]);
      expect(await follow.findFollowSettings(userId, workId)).toEqual({
        mode: 'selected_publications',
        userUuid: userId,
        workId,
      });
      expect(await follow.listSubscriptionPublicationIds(userId, workId)).toEqual([
        publicationTwoId,
      ]);
    } finally {
      await sql`delete from "user" where id = ${userId}`;
      await sql`delete from publications where id in (${publicationOneId}::uuid, ${publicationTwoId}::uuid)`;
      await sql`delete from sources where id in (${sourceOneId}::uuid, ${sourceTwoId}::uuid)`;
      await sql`delete from works where id = ${workId}::uuid`;
      await Promise.all([foundation.close(), follow.close()]);
      await sql.end({ timeout: 1 });
    }
  },
  60_000,
);
