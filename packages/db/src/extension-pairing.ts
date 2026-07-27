import type {
  ExtensionPairingCode,
  ExtensionToken,
  ExtensionTokenRepository,
  TransactionContext,
} from '@web-comic-library/application';
import postgres from 'postgres';
import type { Sql } from 'postgres';

import type { PostgresFoundation } from './foundation';

export class PostgresExtensionToken implements ExtensionTokenRepository {
  readonly #client: Sql;
  readonly #foundation: PostgresFoundation;

  constructor(databaseUrl: string, foundation: PostgresFoundation) {
    this.#client = postgres(databaseUrl);
    this.#foundation = foundation;
  }

  async consumePairingCode(
    context: TransactionContext,
    codeHash: string,
    now: Date,
  ): Promise<ExtensionPairingCode | null> {
    const rows = await this.#foundation.withSession(
      context,
      (session) => session<ExtensionPairingCode[]>`
      update extension_pairing_codes
      set used_at = ${now}
      where code_hash = ${codeHash} and used_at is null and expires_at > ${now}
      returning id::text, user_id as "userUuid", code_hash as "codeHash", expires_at as "expiresAt"
    `,
    );
    return rows[0] ?? null;
  }

  async createPairingCode(
    context: TransactionContext,
    pairing: ExtensionPairingCode,
  ): Promise<void> {
    await this.#foundation.withSession(
      context,
      (session) => session`
      insert into extension_pairing_codes (id, user_id, code_hash, expires_at)
      values (${pairing.id}::uuid, ${pairing.userUuid}, ${pairing.codeHash}, ${pairing.expiresAt})
    `,
    );
  }

  async createToken(context: TransactionContext, token: ExtensionToken): Promise<void> {
    await this.#foundation.withSession(
      context,
      (session) => session`
      insert into extension_tokens (id, user_id, token_hash, scope, device_label, expires_at)
      values (${token.id}::uuid, ${token.userUuid}, ${token.tokenHash}, ${token.scope},
        ${token.deviceLabel}, ${token.expiresAt})
    `,
    );
  }

  async findActiveTokenUserUuid(
    scope: ExtensionToken['scope'],
    tokenHash: string,
    now: Date,
  ): Promise<string | null> {
    const rows = await this.#client<{ userUuid: string }[]>`
      select user_id as "userUuid" from extension_tokens
      where token_hash = ${tokenHash} and scope = ${scope} and revoked_at is null
        and (expires_at is null or expires_at > ${now})
    `;
    return rows[0]?.userUuid ?? null;
  }

  async revokeToken(
    context: TransactionContext,
    userUuid: string,
    tokenId: string,
  ): Promise<boolean> {
    const rows = await this.#foundation.withSession(
      context,
      (session) => session<{ id: string }[]>`
      update extension_tokens set revoked_at = coalesce(revoked_at, now())
      where id = ${tokenId}::uuid and user_id = ${userUuid}
      returning id::text
    `,
    );
    return rows.length === 1;
  }

  async close(): Promise<void> {
    await this.#client.end({ timeout: 1 });
  }
}

export const createPostgresExtensionToken = (
  databaseUrl: string,
  foundation: PostgresFoundation,
): PostgresExtensionToken => new PostgresExtensionToken(databaseUrl, foundation);
