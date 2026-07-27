import { expect, test } from 'bun:test';

import {
  applyFavoriteImport,
  createFavoriteImport,
  getFavoriteImport,
} from '@web-comic-library/application';
import postgres from 'postgres';

import { createPostgresFavoriteImport } from './favorite-import';
import { createPostgresFollow } from './follow';
import { createPostgresFoundation } from './foundation';
import { createPostgresLibrary } from './library';
import { migrateDatabase } from './migrate';

const databaseUrl = process.env.DATABASE_URL;
const integrationTest =
  process.env.ALLOW_DATABASE_INTEGRATION_TESTS === '1' && databaseUrl ? test : test.skip;

integrationTest(
  'favorite imports keep matching results and apply selected works only once',
  async () => {
    if (!databaseUrl) throw new Error('DATABASE_URL is required');
    await migrateDatabase(databaseUrl);
    await migrateDatabase(databaseUrl);
    const sql = postgres(databaseUrl, { max: 1 });
    const foundation = createPostgresFoundation(databaseUrl);
    const favorites = createPostgresFavoriteImport(databaseUrl, foundation);
    const follow = createPostgresFollow(databaseUrl, foundation);
    const library = createPostgresLibrary(databaseUrl, foundation);
    const userId = crypto.randomUUID();
    const sourceId = crypto.randomUUID();
    const workId = crypto.randomUUID();
    const ambiguousWorkId = crypto.randomUUID();
    const publicationId = crypto.randomUUID();
    const conflictingPublicationId = crypto.randomUUID();
    try {
      await sql`
        insert into "user" (id, name, email, email_verified, image, created_at, updated_at)
        values (${userId}, 'Reader', ${`favorite-${crypto.randomUUID()}@example.test`}, true, null, now(), now())
      `;
      await sql`
        insert into sources (id, key, name, base_url)
        values (${sourceId}::uuid, ${`favorite-${crypto.randomUUID()}`}, 'Favorites', 'https://reader.example/')
      `;
      await sql`
        insert into works (id, serial_status, title) values
        (${workId}::uuid, 'ongoing', '照合済み作品'),
        (${ambiguousWorkId}::uuid, 'ongoing', '同名作品')
      `;
      await sql`
        insert into publications (id, source_id, work_id, external_id, kind, title, normalized_url) values
        (${publicationId}::uuid, ${sourceId}::uuid, ${workId}::uuid, 'exact-work', 'official', '照合済み作品', 'https://reader.example/works/exact'),
        (${conflictingPublicationId}::uuid, ${sourceId}::uuid, ${ambiguousWorkId}::uuid, 'other-work', 'official', '同名作品', 'https://reader.example/works/other')
      `;
      const batch = await createFavoriteImport(foundation, favorites, {
        favorites: [
          {
            canonicalUrl: 'https://reader.example/works/exact',
            externalWorkId: 'exact-work',
            sourceId,
            title: '照合済み作品',
          },
          {
            canonicalUrl: 'https://reader.example/works/other',
            externalWorkId: 'exact-work',
            sourceId,
            title: '同名作品',
          },
          {
            canonicalUrl: 'https://reader.example/works/missing',
            externalWorkId: null,
            sourceId,
            title: '同名作品',
          },
        ],
        userUuid: userId,
      });
      const imported = await getFavoriteImport(favorites, batch.id, userId);
      expect(imported?.candidates.map((candidate) => candidate.matchKind).toSorted()).toEqual([
        'ambiguous',
        'exact',
        'unmatched',
      ]);
      const exact = imported?.candidates.find((candidate) => candidate.matchKind === 'exact');
      expect(exact?.matchedWorkId).toBe(workId);
      const applied = await applyFavoriteImport(
        foundation,
        { favorites, follow, library },
        {
          batchId: batch.id,
          defaults: { followMode: 'selected_publications', readingStatus: 'want_to_read' },
          selections: [{ candidateId: exact?.id ?? '' }],
          userUuid: userId,
        },
      );
      expect(applied).toBe('applied');
      expect(await library.findLibraryEntry(userId, workId)).toMatchObject({
        status: 'want_to_read',
      });
      expect(await follow.listSubscriptionPublicationIds(userId, workId)).toEqual([publicationId]);
      expect(
        await applyFavoriteImport(
          foundation,
          { favorites, follow, library },
          {
            batchId: batch.id,
            defaults: { followMode: 'selected_publications', readingStatus: 'want_to_read' },
            selections: [],
            userUuid: userId,
          },
        ),
      ).toBe('expired');
      const history = await sql<{ count: number }[]>`
        select count(*)::int as count from library_status_history
        where user_id = ${userId} and work_id = ${workId}::uuid
      `;
      expect(history[0]?.count).toBe(1);
    } finally {
      await sql`delete from "user" where id = ${userId}`;
      await sql`delete from publications where id in (${publicationId}::uuid, ${conflictingPublicationId}::uuid)`;
      await sql`delete from sources where id = ${sourceId}::uuid`;
      await sql`delete from works where id in (${workId}::uuid, ${ambiguousWorkId}::uuid)`;
      await Promise.all([favorites.close(), follow.close(), foundation.close(), library.close()]);
      await sql.end({ timeout: 1 });
    }
  },
  60_000,
);
