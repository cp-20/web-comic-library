import type { SessionAssuranceRepository } from '@web-comic-library/application';
import postgres from 'postgres';
import type { Sql } from 'postgres';

type SessionAssuranceRow = Readonly<{
  sessionId: string;
}>;

export class PostgresSessionAssurance implements SessionAssuranceRepository {
  readonly #client: Sql;

  constructor(databaseUrl: string) {
    this.#client = postgres(databaseUrl);
  }

  async recordTwoFactorAssurance(sessionToken: string): Promise<boolean> {
    const rows = await this.#client<SessionAssuranceRow[]>`
      insert into session_assurances (session_id, assurance, verified_at, expires_at)
      select session.id, 'two_factor'::session_assurance, now(), session.expires_at
      from session
      where session.token = ${sessionToken} and session.expires_at > now()
      on conflict (session_id) do update
      set assurance = excluded.assurance,
          verified_at = excluded.verified_at,
          expires_at = excluded.expires_at
      returning session_id as "sessionId"
    `;
    return rows.length === 1;
  }

  async close(): Promise<void> {
    await this.#client.end({ timeout: 1 });
  }
}

export const createPostgresSessionAssurance = (databaseUrl: string): PostgresSessionAssurance =>
  new PostgresSessionAssurance(databaseUrl);
