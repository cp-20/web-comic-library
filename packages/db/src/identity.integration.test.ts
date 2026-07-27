import { expect, test } from 'bun:test';

import { findVisibleProfile } from '@web-comic-library/application';
import postgres from 'postgres';

import { createPostgresIdentity } from './identity';
import { migrateDatabase } from './migrate';
import { createPostgresSessionAssurance } from './session-assurance';

const databaseUrl = process.env.DATABASE_URL;
const integrationTest =
  process.env.ALLOW_DATABASE_INTEGRATION_TESTS === '1' && databaseUrl ? test : test.skip;

integrationTest(
  'identity storage preserves profile privacy, follower visibility, and account session status',
  async () => {
    if (!databaseUrl) throw new Error('DATABASE_URL is required');
    await migrateDatabase(databaseUrl);
    await migrateDatabase(databaseUrl);

    const sql = postgres(databaseUrl, { max: 1 });
    const identity = createPostgresIdentity(databaseUrl);
    const assurances = createPostgresSessionAssurance(databaseUrl);
    const readerId = crypto.randomUUID();
    const followerId = crypto.randomUUID();
    const sessionId = crypto.randomUUID();
    const token = `identity-test-${crypto.randomUUID()}`;
    try {
      const users: ReadonlyArray<readonly [string, string, string]> = [
        [readerId, '読書者', `reader-${crypto.randomUUID()}@example.test`],
        [followerId, 'フォロワー', `follower-${crypto.randomUUID()}@example.test`],
      ];
      await Promise.all(
        users.map(async ([id, name, email]) => {
          await sql`
          insert into "user" (id, name, email, email_verified, image, created_at, updated_at)
          values (${id}, ${name}, ${email}, true, null, now(), now())
        `;
        }),
      );
      await identity.saveProfile({
        accountStatus: 'active',
        bio: 'profile',
        displayName: '読書者',
        iconUrl: null,
        userId: `reader-${readerId.slice(0, 8)}`,
        userUuid: readerId,
        visibility: null,
      });
      const privateProfile = await findVisibleProfile(identity, `reader-${readerId.slice(0, 8)}`, {
        userUuid: followerId,
      });
      expect(privateProfile).toBeNull();

      await identity.saveProfile({
        accountStatus: 'active',
        bio: 'profile',
        displayName: '読書者',
        iconUrl: null,
        userId: `reader-${readerId.slice(0, 8)}`,
        userUuid: readerId,
        visibility: 'followers',
      });
      await sql`
        insert into profile_followers (follower_user_id, followed_user_id)
        values (${followerId}, ${readerId})
      `;
      expect(
        await findVisibleProfile(identity, `reader-${readerId.slice(0, 8)}`, {
          userUuid: followerId,
        }),
      ).toMatchObject({ userUuid: readerId, visibility: 'followers' });

      await sql`
        insert into session (id, expires_at, token, created_at, updated_at, ip_address, user_agent, user_id)
        values (${sessionId}, now() + interval '1 hour', ${token}, now(), now(), null, null, ${readerId})
      `;
      expect(await identity.findSessionIdentity(token)).toMatchObject({
        accountStatus: 'active',
        assurance: 'none',
        userUuid: readerId,
      });
      expect(await identity.findCatalogAdminActor(token)).toEqual({
        assurance: 'none',
        id: readerId,
        role: 'user',
      });
      await sql`update "user" set role = 'administrator'::catalog_user_role where id = ${readerId}`;
      expect([
        ...(await sql`select previous_role::text as "previousRole", role::text as role from user_role_audits where user_id = ${readerId}`),
      ]).toEqual([{ previousRole: 'user', role: 'administrator' }]);
      expect(await assurances.recordTwoFactorAssurance(token)).toBe(true);
      expect(await identity.findSessionIdentity(token)).toMatchObject({
        assurance: 'two_factor',
      });
      expect(await identity.findCatalogAdminActor(token)).toEqual({
        assurance: 'two_factor',
        id: readerId,
        role: 'administrator',
      });
      expect([
        ...(await sql`select assurance::text as assurance from session_assurance_audits where session_id = ${sessionId}`),
      ]).toEqual([{ assurance: 'two_factor' }]);
      await sql`update session_assurances set expires_at = now() - interval '1 second'`;
      expect(await identity.findSessionIdentity(token)).toMatchObject({ assurance: 'none' });
      expect(await assurances.recordTwoFactorAssurance(token)).toBe(true);
      await sql`delete from session where token = ${token}`;
      expect(
        await sql`select session_id from session_assurances where session_id = ${sessionId}`,
      ).toHaveLength(0);
      await sql`update profiles set account_status = 'disabled'::account_status where user_id = ${readerId}`;
      expect(await identity.findSessionIdentity(token)).toBeNull();
    } finally {
      await sql`delete from "user" where id in (${readerId}, ${followerId})`;
      await identity.close();
      await assurances.close();
      await sql.end({ timeout: 1 });
    }
  },
  60_000,
);
