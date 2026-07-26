import type {
  EmailDigestDeliveryOutcome,
  EmailDigestDeliveryRepository,
  EmailDigestSettingsRepository,
  QueuedEmailDigest,
  TransactionContext,
} from '@web-comic-library/application';
import type { EmailDigestSettings } from '@web-comic-library/domain';
import postgres from 'postgres';
import type { Sql } from 'postgres';

import type { PostgresFoundation } from './foundation';

export class PostgresEmailDigest
  implements EmailDigestSettingsRepository, EmailDigestDeliveryRepository
{
  readonly #client: Sql;
  readonly #foundation: PostgresFoundation;

  constructor(databaseUrl: string, foundation: PostgresFoundation) {
    this.#client = postgres(databaseUrl);
    this.#foundation = foundation;
  }

  async saveEmailDigestSettings(
    context: TransactionContext,
    settings: EmailDigestSettings,
  ): Promise<void> {
    await this.#foundation.withSession(context, async (session) => {
      await session`
        insert into email_digest_settings (user_id, enabled, timezone, send_time, unsubscribed_at)
        values (${settings.userUuid}, ${settings.enabled}, ${settings.timezone}, ${settings.sendTime}::time, null)
        on conflict (user_id) do update
        set enabled = excluded.enabled, timezone = excluded.timezone, send_time = excluded.send_time,
            unsubscribed_at = null, updated_at = now()
        `;
      if (settings.enabled) {
        await session`
            insert into notification_preferences (user_id, kind, channel, enabled)
            values
              (${settings.userUuid}, 'new_episode'::release_event_kind, 'email'::notification_channel, true),
              (${settings.userUuid}, 'extra'::release_event_kind, 'email'::notification_channel, true),
              (${settings.userUuid}, 'new_volume'::release_event_kind, 'email'::notification_channel, true)
            on conflict (user_id, kind, channel) do nothing
          `;
      }
    });
  }

  async unsubscribeEmailDigest(context: TransactionContext, userUuid: string): Promise<void> {
    await this.#foundation.withSession(
      context,
      (session) => session`
        insert into email_digest_settings (user_id, enabled, unsubscribed_at)
        values (${userUuid}, false, now())
        on conflict (user_id) do update
        set enabled = false, unsubscribed_at = now(), updated_at = now()
      `,
    );
  }

  async recordEmailDigestFeedback(
    context: TransactionContext,
    input: Readonly<{ eventId: string; kind: 'bounce' | 'complaint'; recipient: string }>,
  ): Promise<void> {
    await this.#foundation.withSession(context, async (session) => {
      const rows = await session<{ userUuid: string }[]>`
        insert into email_digest_feedbacks (id, provider_event_id, user_id, kind)
        select gen_random_uuid(), ${input.eventId}, "user".id, ${input.kind}::email_digest_feedback_kind
        from "user" where email = ${input.recipient}
        on conflict (provider_event_id) do nothing
        returning user_id as "userUuid"
      `;
      const userUuid = rows[0]?.userUuid;
      if (userUuid) {
        await session`
          update email_digest_settings
          set enabled = false, unsubscribed_at = now(), updated_at = now()
          where user_id = ${userUuid}
        `;
      }
    });
  }

  async listQueuedEmailDigests(now: Date): Promise<readonly QueuedEmailDigest[]> {
    await this.#client`
      insert into email_digests (id, idempotency_key, user_id, local_date)
      select gen_random_uuid(),
        'email-digest:' || setting.user_id || ':' || ((${now} at time zone setting.timezone)::date)::text,
        setting.user_id, ((${now} at time zone setting.timezone)::date)
      from email_digest_settings as setting
      join notifications as notification
        on notification.user_id = setting.user_id and notification.channel = 'email'::notification_channel
      where setting.enabled and setting.unsubscribed_at is null
        and ((${now} at time zone setting.timezone)::time) >= setting.send_time
        and (notification.created_at at time zone setting.timezone)::date = ((${now} at time zone setting.timezone)::date)
      group by setting.user_id, setting.timezone
      on conflict (user_id, local_date) do nothing
    `;
    await this.#client`
      insert into email_digest_notifications (digest_id, notification_id)
      select digest.id, notification.id
      from email_digests as digest
      join notifications as notification
        on notification.user_id = digest.user_id and notification.channel = 'email'::notification_channel
      join email_digest_settings as setting on setting.user_id = digest.user_id
      where digest.status = 'queued'::email_digest_status and setting.enabled and setting.unsubscribed_at is null
        and (notification.created_at at time zone setting.timezone)::date = digest.local_date
      on conflict do nothing
    `;
    return this.#client<QueuedEmailDigest[]>`
      select digest.id::text, "user".email as recipient, count(item.notification_id)::int as "notificationCount"
      from email_digests as digest
      join "user" on "user".id = digest.user_id
      join email_digest_notifications as item on item.digest_id = digest.id
      where digest.status = 'queued'::email_digest_status
      group by digest.id, "user".email
      order by digest.created_at
    `;
  }

  async recordEmailDigestResult(
    digestId: string,
    outcome: EmailDigestDeliveryOutcome,
  ): Promise<void> {
    const delivered = outcome === 'delivered';
    const status = delivered
      ? 'sent'
      : outcome === 'permanent_failure'
        ? 'permanent_failure'
        : 'queued';
    await this.#client.begin(async (session) => {
      const rows = await session<{ userUuid: string }[]>`
        update email_digests
        set status = ${status}::email_digest_status,
            attempt_count = attempt_count + 1,
            sent_at = case when ${delivered} then now() else sent_at end,
            last_error_code = case when ${delivered} then null else ${outcome} end,
            updated_at = now()
        where id = ${digestId}::uuid
        returning user_id as "userUuid"
      `;
      const userUuid = rows[0]?.userUuid;
      if (outcome === 'permanent_failure' && userUuid) {
        await session`
          update email_digest_settings
          set enabled = false, unsubscribed_at = now(), updated_at = now()
          where user_id = ${userUuid}
        `;
      }
    });
  }

  async close(): Promise<void> {
    await this.#client.end({ timeout: 1 });
  }
}

export const createPostgresEmailDigest = (
  databaseUrl: string,
  foundation: PostgresFoundation,
): PostgresEmailDigest => new PostgresEmailDigest(databaseUrl, foundation);
