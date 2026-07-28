import { expect, test } from 'bun:test';

import {
  findAccountDataExport,
  generateAccountDataExport,
  requestAccountDataExport,
  requestAccountDeletion,
} from '@web-comic-library/application';
import postgres from 'postgres';

import { createPostgresAccountData } from './account-data';
import { createPostgresFoundation } from './foundation';
import { createPostgresIdentity } from './identity';
import { migrateDatabase } from './migrate';

const databaseUrl = process.env.DATABASE_URL;
const integrationTest =
  process.env.ALLOW_DATABASE_INTEGRATION_TESTS === '1' && databaseUrl ? test : test.skip;

integrationTest(
  'account data exports omit credentials and deletion stays effective across a purge',
  async () => {
    if (!databaseUrl) throw new Error('DATABASE_URL is required');
    await migrateDatabase(databaseUrl);
    const sql = postgres(databaseUrl, { max: 1 });
    const foundation = createPostgresFoundation(databaseUrl);
    const repository = createPostgresAccountData(databaseUrl, foundation);
    const identity = createPostgresIdentity(databaseUrl);
    const userId = crypto.randomUUID();
    const token = `account-data-${crypto.randomUUID()}`;
    try {
      await sql`
        insert into "user" (id, name, email, email_verified, image, created_at, updated_at)
        values (${userId}, 'Reader', ${`account-data-${crypto.randomUUID()}@example.test`}, true, null, now(), now())
      `;
      await identity.saveProfile({
        accountStatus: 'active',
        bio: 'private profile data',
        displayName: 'Reader',
        iconUrl: null,
        userId: `reader-${userId.slice(0, 8)}`,
        userUuid: userId,
        visibility: 'private',
      });
      await sql`
        insert into session (id, expires_at, token, created_at, updated_at, ip_address, user_agent, user_id)
        values (${crypto.randomUUID()}, now() + interval '1 hour', ${token}, now(), now(), null, null, ${userId})
      `;
      const requested = await requestAccountDataExport(foundation, repository, userId, new Date());
      expect(
        await generateAccountDataExport(repository, requested.export.id, userId, new Date()),
      ).toBe(true);
      const exported = await findAccountDataExport(
        repository,
        userId,
        requested.export.id,
        requested.downloadToken,
        new Date(),
      );
      expect(exported?.payload).toMatchObject({
        profile: { bio: 'private profile data', displayName: 'Reader' },
      });
      expect(JSON.stringify(exported?.payload)).not.toContain('session');
      expect(JSON.stringify(exported?.payload)).not.toContain('token');

      await requestAccountDeletion(foundation, repository, userId, new Date());
      expect(await identity.findSessionIdentity(token)).toBeNull();
      expect(await identity.findProfileByUserUuid(userId)).toMatchObject({
        accountStatus: 'pending_deletion',
      });
      await sql`
        update account_deletion_ledger set purge_after = now() - interval '1 second'
        where user_id = ${userId}
      `;
      expect(await repository.purgeDueAccounts(new Date())).toEqual([userId]);
      expect(await identity.findProfileByUserUuid(userId)).toBeNull();
      const ledger = await sql<Readonly<{ completedAt: Date; status: string }>[]>`
        select status::text as status, completed_at as "completedAt"
        from account_deletion_ledger where user_id = ${userId}
      `;
      expect(ledger).toHaveLength(1);
      expect(ledger[0]).toMatchObject({ completedAt: expect.any(Date), status: 'purged' });
    } finally {
      await sql`delete from "user" where id = ${userId}`;
      await sql`delete from account_deletion_ledger where user_id = ${userId}`;
      await Promise.all([foundation.close(), repository.close(), identity.close()]);
      await sql.end({ timeout: 1 });
    }
  },
  60_000,
);
