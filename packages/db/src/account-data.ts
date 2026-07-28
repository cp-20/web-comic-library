import type {
  AccountDataRepository,
  AccountDataExport,
  JsonValue,
  TransactionContext,
} from '@web-comic-library/application';
import postgres from 'postgres';
import type { Sql } from 'postgres';

import type { PostgresFoundation } from './foundation';

type ExportRow = Readonly<{
  expiresAt: Date;
  id: string;
  payload: JsonValue | null;
  status: AccountDataExport['status'];
}>;

const toExport = (row: ExportRow): AccountDataExport => ({
  expiresAt: row.expiresAt,
  id: row.id,
  payload: row.payload,
  status: row.status,
});

export class PostgresAccountData implements AccountDataRepository {
  readonly #client: Sql;
  readonly #foundation: PostgresFoundation;

  constructor(databaseUrl: string, foundation: PostgresFoundation) {
    this.#client = postgres(databaseUrl);
    this.#foundation = foundation;
  }

  async createDataExport(
    context: TransactionContext,
    input: Readonly<{ downloadTokenHash: string; expiresAt: Date; id: string; userUuid: string }>,
  ): Promise<AccountDataExport> {
    const rows = await this.#foundation.withSession(
      context,
      (session) => session<ExportRow[]>`
        insert into account_data_exports (id, user_id, download_token_hash, expires_at)
        values (${input.id}::uuid, ${input.userUuid}, ${input.downloadTokenHash}, ${input.expiresAt})
        returning id::text, status::text, payload, expires_at as "expiresAt"
      `,
    );
    const row = rows[0];
    if (!row) throw new Error('account data export creation did not return a row');
    return toExport(row);
  }

  async findDataExport(
    userUuid: string,
    id: string,
    downloadTokenHash: string,
    now: Date,
  ): Promise<AccountDataExport | null> {
    const rows = await this.#client<ExportRow[]>`
      select id::text, status::text, payload, expires_at as "expiresAt"
      from account_data_exports
      where id = ${id}::uuid and user_id = ${userUuid} and download_token_hash = ${downloadTokenHash}
        and expires_at > ${now}
    `;
    const row = rows[0];
    return row ? toExport(row) : null;
  }

  async markDataExportReady(id: string, payload: JsonValue, now: Date): Promise<boolean> {
    const rows = await this.#client<{ id: string }[]>`
      update account_data_exports
      set status = 'ready'::account_data_export_status, payload = ${this.#client.json(payload)},
          ready_at = ${now}
      where id = ${id}::uuid and status = 'queued'::account_data_export_status and expires_at > ${now}
      returning id::text
    `;
    return rows.length === 1;
  }

  async purgeExpiredDataExports(now: Date): Promise<void> {
    await this.#client`
      update account_data_exports
      set status = 'expired'::account_data_export_status, payload = null
      where expires_at <= ${now} and status <> 'expired'::account_data_export_status
    `;
  }

  async requestAccountDeletion(
    context: TransactionContext,
    input: Readonly<{ purgeAfter: Date; userUuid: string }>,
  ): Promise<void> {
    await this.#foundation.withSession(context, async (session) => {
      await session`
        insert into account_deletion_ledger (id, user_id, purge_after)
        values (gen_random_uuid(), ${input.userUuid}, ${input.purgeAfter})
        on conflict (user_id) do update
        set status = 'requested'::account_deletion_status, purge_after = excluded.purge_after,
            completed_at = null, requested_at = now()
      `;
      await session`
        update profiles set account_status = 'pending_deletion'::account_status, updated_at = now()
        where user_id = ${input.userUuid}
      `;
      await session`delete from session where user_id = ${input.userUuid}`;
    });
  }

  async purgeDueAccounts(now: Date): Promise<readonly string[]> {
    return this.#client.begin(async (session) => {
      const rows = await session<{ userUuid: string }[]>`
        select user_id as "userUuid" from account_deletion_ledger
        where status = 'requested'::account_deletion_status and purge_after <= ${now}
        order by purge_after asc
        for update skip locked
      `;
      const userUuids = rows.map((row) => row.userUuid);
      if (userUuids.length === 0) return [];
      await session`delete from "user" where id = any(${userUuids})`;
      await session`
        update account_deletion_ledger
        set status = 'purged'::account_deletion_status, completed_at = ${now}
        where user_id = any(${userUuids})
      `;
      return rows.map((row) => row.userUuid);
    });
  }

  async buildDataExport(userUuid: string): Promise<JsonValue | null> {
    const rows = await this.#client<{ payload: JsonValue }[]>`
      select jsonb_build_object(
        'account', jsonb_build_object(
          'email', "user".email,
          'emailVerified', "user".email_verified,
          'createdAt', "user".created_at,
          'updatedAt', "user".updated_at
        ),
        'profile', jsonb_build_object(
          'userId', profile.public_id,
          'displayName', "user".name,
          'bio', profile.bio,
          'iconUrl', profile.icon_url,
          'visibility', profile.default_visibility,
          'accountStatus', profile.account_status,
          'createdAt', profile.created_at,
          'updatedAt', profile.updated_at
        ),
        'library', jsonb_build_object(
          'entries', coalesce((select jsonb_agg(to_jsonb(entry)) from library_entries entry where entry.user_id = "user".id), '[]'::jsonb),
          'statusHistory', coalesce((select jsonb_agg(to_jsonb(history)) from library_status_history history where history.user_id = "user".id), '[]'::jsonb),
          'contentReads', coalesce((select jsonb_agg(to_jsonb(read_record)) from content_read_records read_record where read_record.user_id = "user".id), '[]'::jsonb),
          'publicationReads', coalesce((select jsonb_agg(to_jsonb(read_record)) from publication_read_records read_record where read_record.user_id = "user".id), '[]'::jsonb)
        ),
        'volumes', coalesce((select jsonb_agg(to_jsonb(volume_record)) from user_volume_records volume_record where volume_record.user_id = "user".id), '[]'::jsonb),
        'follow', jsonb_build_object(
          'sourcePreferences', coalesce((select jsonb_agg(to_jsonb(preference)) from user_source_preferences preference where preference.user_id = "user".id), '[]'::jsonb),
          'workSettings', coalesce((select jsonb_agg(to_jsonb(setting)) from work_follow_settings setting where setting.user_id = "user".id), '[]'::jsonb),
          'publicationSelections', coalesce((select jsonb_agg(to_jsonb(selection)) from subscription_publications selection where selection.user_id = "user".id), '[]'::jsonb),
          'following', coalesce((select jsonb_agg(jsonb_build_object('userUuid', follow.followed_user_id, 'status', follow.status, 'createdAt', follow.created_at)) from user_follows follow where follow.follower_user_id = "user".id), '[]'::jsonb),
          'followers', coalesce((select jsonb_agg(jsonb_build_object('userUuid', follow.follower_user_id, 'status', follow.status, 'createdAt', follow.created_at)) from user_follows follow where follow.followed_user_id = "user".id), '[]'::jsonb)
        ),
        'activities', coalesce((select jsonb_agg(to_jsonb(activity)) from activities activity where activity.user_id = "user".id), '[]'::jsonb),
        'reactions', coalesce((select jsonb_agg(to_jsonb(reaction)) from activity_reactions reaction where reaction.user_id = "user".id), '[]'::jsonb),
        'notificationPreferences', coalesce((select jsonb_agg(to_jsonb(preference)) from notification_preferences preference where preference.user_id = "user".id), '[]'::jsonb),
        'emailDigestSettings', (select to_jsonb(setting) from email_digest_settings setting where setting.user_id = "user".id),
        'reports', coalesce((select jsonb_agg(to_jsonb(report)) from reports report where report.reporter_user_id = "user".id), '[]'::jsonb)
      ) as payload
      from "user"
      join profiles as profile on profile.user_id = "user".id
      where "user".id = ${userUuid}
    `;
    return rows[0]?.payload ?? null;
  }

  async close(): Promise<void> {
    await this.#client.end({ timeout: 1 });
  }
}

export const createPostgresAccountData = (
  databaseUrl: string,
  foundation: PostgresFoundation,
): PostgresAccountData => new PostgresAccountData(databaseUrl, foundation);
