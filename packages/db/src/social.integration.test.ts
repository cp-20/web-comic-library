import { expect, test } from 'bun:test';

import {
  addReaction,
  blockUser,
  createReviewActivity,
  createReadingActivity,
  listReviews,
  muteUser,
  requestFollow,
  respondToFollow,
  setReadingStatus,
  unblockUser,
} from '@web-comic-library/application';
import postgres from 'postgres';

import { createPostgresFoundation } from './foundation';
import { createPostgresIdentity } from './identity';
import { createPostgresLibrary } from './library';
import { migrateDatabase } from './migrate';
import { createPostgresModeration } from './moderation';
import { createPostgresSocial } from './social';

const databaseUrl = process.env.DATABASE_URL;
const integrationTest =
  process.env.ALLOW_DATABASE_INTEGRATION_TESTS === '1' && databaseUrl ? test : test.skip;

integrationTest(
  'social storage transitions follow requests and hides activities after visibility changes',
  async () => {
    if (!databaseUrl) throw new Error('DATABASE_URL is required');
    await migrateDatabase(databaseUrl);
    await migrateDatabase(databaseUrl);
    const sql = postgres(databaseUrl, { max: 1 });
    const foundation = createPostgresFoundation(databaseUrl);
    const library = createPostgresLibrary(databaseUrl, foundation);
    const social = createPostgresSocial(databaseUrl, foundation);
    const authorId = crypto.randomUUID();
    const followerId = crypto.randomUUID();
    const workId = crypto.randomUUID();
    const contentUnitId = crypto.randomUUID();
    const volumeEditionId = crypto.randomUUID();
    const isbn = `978${crypto
      .randomUUID()
      .replaceAll('-', '')
      .split('')
      .map((character) => String((character.codePointAt(0) ?? 0) % 10))
      .join('')
      .slice(0, 10)}`;
    try {
      await sql`
        insert into "user" (id, name, email, email_verified, image, created_at, updated_at)
        values
          (${authorId}, 'Author', ${`author-${crypto.randomUUID()}@example.test`}, true, null, now(), now()),
          (${followerId}, 'Follower', ${`follower-${crypto.randomUUID()}@example.test`}, true, null, now(), now())
      `;
      await sql`
        insert into profiles (user_id, public_id, account_status, default_visibility)
        values (${authorId}, 'author-01', 'active', 'public'),
          (${followerId}, 'follower-01', 'active', 'followers')
      `;
      await sql`insert into works (id, serial_status, title) values (${workId}::uuid, 'ongoing', 'Social test')`;
      await sql`
        insert into content_units (id, work_id, title, position)
        values (${contentUnitId}::uuid, ${workId}::uuid, 'Episode 2', 2)
      `;
      await sql`
        insert into volume_editions (id, work_id, isbn, title, publication_status)
        values (${volumeEditionId}::uuid, ${workId}::uuid, ${isbn}, 'Volume 1', 'active')
      `;

      await expect(requestFollow(foundation, social, followerId, authorId)).resolves.toMatchObject({
        status: 'accepted',
      });
      await expect(requestFollow(foundation, social, authorId, followerId)).resolves.toMatchObject({
        status: 'pending',
      });
      await expect(
        respondToFollow(foundation, social, followerId, authorId, 'rejected'),
      ).resolves.toMatchObject({
        status: 'rejected',
      });

      const entry = await setReadingStatus(foundation, library, {
        status: 'completed',
        userUuid: authorId,
        visibility: 'public',
        workId,
      });
      await createReadingActivity(foundation, social, {
        shareActivity: true,
        status: entry.status,
        userUuid: authorId,
        workId,
      });
      expect((await social.listTimeline(followerId, null, 20)).items).toHaveLength(1);

      await setReadingStatus(foundation, library, {
        status: 'completed',
        userUuid: authorId,
        visibility: 'private',
        workId,
      });
      expect((await social.listTimeline(followerId, null, 20)).items).toHaveLength(0);

      const review = await createReviewActivity(foundation, social, {
        body: '<script>plain text only</script>',
        contentUnitId,
        spoiler: false,
        userUuid: authorId,
        visibility: 'public',
        volumeEditionId: null,
        workId,
      });
      const hidden = await listReviews(social, null, workId, {
        contentUnitId,
        volumeEditionId: null,
      });
      expect(hidden).toEqual([expect.objectContaining({ id: review.id, state: 'hidden' })]);
      expect('body' in hidden[0]!).toBe(false);

      await sql`
        insert into content_read_records (user_id, work_id, content_unit_id, read_at)
        values (${followerId}, ${workId}::uuid, ${contentUnitId}::uuid, now())
      `;
      const visible = await listReviews(social, followerId, workId, {
        contentUnitId,
        volumeEditionId: null,
      });
      expect(visible).toEqual([
        expect.objectContaining({
          body: '<script>plain text only</script>',
          id: review.id,
          state: 'visible',
        }),
      ]);
      expect(await addReaction(foundation, social, followerId, review.id)).toBe(true);
      expect(await addReaction(foundation, social, followerId, review.id)).toBe(false);
    } finally {
      await sql`delete from "user" where id in (${authorId}, ${followerId})`;
      await Promise.all([foundation.close(), library.close(), social.close()]);
      await sql.end({ timeout: 1 });
    }
  },
  60_000,
);

integrationTest(
  'social storage hides blocked profiles, reviews, reactions, and timelines while mute keeps follows',
  async () => {
    if (!databaseUrl) throw new Error('DATABASE_URL is required');
    await migrateDatabase(databaseUrl);
    const sql = postgres(databaseUrl, { max: 1 });
    const foundation = createPostgresFoundation(databaseUrl);
    const identity = createPostgresIdentity(databaseUrl);
    const library = createPostgresLibrary(databaseUrl, foundation);
    const moderation = createPostgresModeration(databaseUrl, foundation);
    const social = createPostgresSocial(databaseUrl, foundation);
    const authorId = crypto.randomUUID();
    const followerId = crypto.randomUUID();
    const workId = crypto.randomUUID();
    const contentUnitId = crypto.randomUUID();
    try {
      await sql`
        insert into "user" (id, name, email, email_verified, image, created_at, updated_at)
        values
          (${authorId}, 'Author', ${`author-${crypto.randomUUID()}@example.test`}, true, null, now(), now()),
          (${followerId}, 'Follower', ${`follower-${crypto.randomUUID()}@example.test`}, true, null, now(), now())
      `;
      await sql`
        insert into profiles (user_id, public_id, account_status, default_visibility)
        values (${authorId}, 'blocked-author', 'active', 'public'),
          (${followerId}, 'blocking-follower', 'active', 'public')
      `;
      await sql`insert into works (id, serial_status, title) values (${workId}::uuid, 'ongoing', 'Block test')`;
      await sql`
        insert into content_units (id, work_id, title, position)
        values (${contentUnitId}::uuid, ${workId}::uuid, 'Episode 1', 1)
      `;
      await expect(requestFollow(foundation, social, followerId, authorId)).resolves.toMatchObject({
        status: 'accepted',
      });
      await sql`
        insert into profile_followers (follower_user_id, followed_user_id, created_at)
        values (${followerId}, ${authorId}, now()), (${authorId}, ${followerId}, now())
      `;
      const entry = await setReadingStatus(foundation, library, {
        status: 'completed',
        userUuid: authorId,
        visibility: 'public',
        workId,
      });
      await createReadingActivity(foundation, social, {
        shareActivity: true,
        status: entry.status,
        userUuid: authorId,
        workId,
      });
      const review = await createReviewActivity(foundation, social, {
        body: 'visible before block',
        contentUnitId,
        spoiler: false,
        userUuid: authorId,
        visibility: 'public',
        volumeEditionId: null,
        workId,
      });
      await addReaction(foundation, social, followerId, review.id);
      expect((await social.listTimeline(followerId, null, 20)).items).toHaveLength(1);
      expect(
        await listReviews(social, followerId, workId, { contentUnitId, volumeEditionId: null }),
      ).toHaveLength(1);

      await expect(blockUser(foundation, moderation, followerId, authorId)).resolves.toBe(true);
      expect(await social.findFollow(followerId, authorId)).toBeNull();
      const profileFollowers = await sql<{ count: number }[]>`
        select count(*)::integer as count from profile_followers
        where (follower_user_id = ${followerId} and followed_user_id = ${authorId})
          or (follower_user_id = ${authorId} and followed_user_id = ${followerId})
      `;
      expect(profileFollowers[0]?.count).toBe(0);
      expect((await social.listTimeline(followerId, null, 20)).items).toHaveLength(0);
      expect(
        await listReviews(social, followerId, workId, { contentUnitId, volumeEditionId: null }),
      ).toHaveLength(0);
      expect(await identity.isBlockedEitherDirection(followerId, authorId)).toBe(true);

      await expect(unblockUser(foundation, moderation, followerId, authorId)).resolves.toBe(true);
      await expect(requestFollow(foundation, social, followerId, authorId)).resolves.toMatchObject({
        status: 'accepted',
      });
      await expect(muteUser(foundation, moderation, followerId, authorId)).resolves.toBe(true);
      expect(await social.findFollow(followerId, authorId)).not.toBeNull();
      expect((await social.listTimeline(followerId, null, 20)).items).toHaveLength(0);
    } finally {
      await sql`delete from "user" where id in (${authorId}, ${followerId})`;
      await Promise.all([
        foundation.close(),
        identity.close(),
        library.close(),
        moderation.close(),
        social.close(),
      ]);
      await sql.end({ timeout: 1 });
    }
  },
  60_000,
);
