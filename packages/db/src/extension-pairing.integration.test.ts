import { expect, test } from 'bun:test';

import {
  exchangeExtensionPairingCode,
  issueExtensionPairingCode,
  revokeExtensionToken,
} from '@web-comic-library/application';
import postgres from 'postgres';

import { createPostgresExtensionToken } from './extension-pairing';
import { createPostgresFoundation } from './foundation';
import { migrateDatabase } from './migrate';

const databaseUrl = process.env.DATABASE_URL;
const integrationTest =
  process.env.ALLOW_DATABASE_INTEGRATION_TESTS === '1' && databaseUrl ? test : test.skip;

integrationTest(
  'extension pairing persists only token hashes and enforces single-use ownership',
  async () => {
    if (!databaseUrl) throw new Error('DATABASE_URL is required');
    await migrateDatabase(databaseUrl);
    await migrateDatabase(databaseUrl);
    const sql = postgres(databaseUrl, { max: 1 });
    const foundation = createPostgresFoundation(databaseUrl);
    const repository = createPostgresExtensionToken(databaseUrl, foundation);
    const userUuid = crypto.randomUUID();
    try {
      await sql`
      insert into "user" (id, name, email, email_verified, image, created_at, updated_at)
      values (${userUuid}, 'extension reader', ${`extension-${userUuid}@example.test`}, true, null, now(), now())
    `;
      const issued = await issueExtensionPairingCode(foundation, repository, userUuid);
      const exchanged = await exchangeExtensionPairingCode(foundation, repository, {
        code: issued.code,
        deviceLabel: 'Firefox',
      });
      expect(exchanged).not.toBeNull();
      expect(
        await exchangeExtensionPairingCode(foundation, repository, {
          code: issued.code,
          deviceLabel: 'Chrome',
        }),
      ).toBeNull();
      const rows = await sql<{ tokenHash: string }[]>`
      select token_hash as "tokenHash" from extension_tokens where user_id = ${userUuid}
    `;
      expect(rows).toHaveLength(1);
      expect(rows[0]?.tokenHash).not.toBe(exchanged?.token);
      expect(
        await revokeExtensionToken(foundation, repository, 'other-user', exchanged?.tokenId ?? ''),
      ).toBe(false);
      expect(
        await revokeExtensionToken(foundation, repository, userUuid, exchanged?.tokenId ?? ''),
      ).toBe(true);
    } finally {
      await sql`delete from "user" where id = ${userUuid}`;
      await repository.close();
      await foundation.close();
      await sql.end({ timeout: 1 });
    }
  },
  60_000,
);
