import type {
  FollowSettings,
  NotificationPage,
  NotificationReleaseEvent,
  NotificationRepository,
  TransactionContext,
} from '@web-comic-library/application';
import type {
  Notification,
  NotificationChannel,
  NotificationKind,
  NotificationPreference,
  UserSourcePreference,
} from '@web-comic-library/domain';
import postgres from 'postgres';
import type { Sql } from 'postgres';

import type { PostgresFoundation } from './foundation';

type NotificationRow = Readonly<{
  channel: NotificationChannel;
  createdAt: Date;
  eventId: string;
  id: string;
  idempotencyKey: string;
  kind: NotificationKind;
  readAt: Date | null;
  userUuid: string;
}>;

type CandidateRow = Readonly<{
  contentUnitId: string | null;
  eventId: string;
  notificationEligible: boolean;
  occurredAt: Date;
  official: boolean;
  publicationId: string;
  publicationValid: boolean;
  sourceId: string;
}>;

const decodeCursor = (
  cursor: string | null,
): Readonly<{ createdAt: Date | null; id: string | null }> => {
  if (cursor === null) return { createdAt: null, id: null };
  const [createdAtText, id] = cursor.split('|');
  if (!createdAtText || !id) throw new Error('notification cursor is invalid');
  const createdAt = new Date(createdAtText);
  if (Number.isNaN(createdAt.valueOf())) throw new Error('notification cursor is invalid');
  return { createdAt, id };
};

export class PostgresNotification implements NotificationRepository {
  readonly #client: Sql;
  readonly #foundation: PostgresFoundation;

  constructor(databaseUrl: string, foundation: PostgresFoundation) {
    this.#client = postgres(databaseUrl);
    this.#foundation = foundation;
  }

  async findFollowSettings(userUuid: string, workId: string): Promise<FollowSettings | null> {
    const rows = await this.#client<FollowSettings[]>`
      select user_id as "userUuid", work_id::text as "workId", mode
      from work_follow_settings where user_id = ${userUuid} and work_id = ${workId}::uuid
    `;
    return rows[0] ?? null;
  }

  async findNotificationPreference(
    userUuid: string,
    kind: NotificationKind,
    channel: NotificationChannel,
  ): Promise<NotificationPreference | null> {
    const rows = await this.#client<NotificationPreference[]>`
      select user_id as "userUuid", kind, channel, enabled from notification_preferences
      where user_id = ${userUuid} and kind = ${kind}::release_event_kind
        and channel = ${channel}::notification_channel
    `;
    return rows[0] ?? null;
  }

  async findReleaseEvent(eventId: string): Promise<NotificationReleaseEvent | null> {
    const events = await this.#client<
      Readonly<{
        id: string;
        kind: NotificationKind;
        notificationSuppressed: boolean;
        workId: string;
      }>[]
    >`
      select
        event.id::text,
        event.kind,
        event.notification_suppressed as "notificationSuppressed",
        coalesce(entry.work_id, volume.work_id)::text as "workId"
      from release_events as event
      left join publication_entries as entry on entry.id = event.publication_entry_id
      left join volume_editions as volume on volume.id = event.volume_edition_id
      where event.id = ${eventId}::uuid
    `;
    const event = events[0];
    if (!event) return null;
    const candidates = await this.#client<CandidateRow[]>`
      with target_content as (
        select mapping.content_unit_id
        from release_events as target
        join entry_content_mappings as mapping
          on mapping.publication_entry_id = target.publication_entry_id and mapping.confirmed
        where target.id = ${eventId}::uuid
      )
      select distinct
        candidate.id::text as "eventId",
        candidate.occurred_at as "occurredAt",
        candidate.notification_suppressed = false as "notificationEligible",
        candidate_mapping.content_unit_id::text as "contentUnitId",
        coalesce(publication.id::text, candidate.id::text) as "publicationId",
        coalesce(source.id::text, candidate.id::text) as "sourceId",
        coalesce(publication.kind = 'official'::publication_kind, true) as official,
        coalesce(publication.retired_at is null, true) as "publicationValid"
      from release_events as candidate
      left join publication_entries as entry on entry.id = candidate.publication_entry_id
      left join publications as publication on publication.id = entry.publication_id
      left join sources as source on source.id = candidate.source_id
      left join entry_content_mappings as candidate_mapping
        on candidate_mapping.publication_entry_id = candidate.publication_entry_id and candidate_mapping.confirmed
      where candidate.id = ${eventId}::uuid
        or candidate_mapping.content_unit_id in (select content_unit_id from target_content)
    `;
    return { ...event, candidates };
  }

  async listNotifications(
    userUuid: string,
    cursor: string | null,
    limit: number,
  ): Promise<NotificationPage> {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      throw new Error('notification page size must be between 1 and 100');
    }
    const decoded = decodeCursor(cursor);
    const rows = await this.#client<NotificationRow[]>`
      select
        id::text,
        idempotency_key as "idempotencyKey",
        user_id as "userUuid",
        release_event_id::text as "eventId",
        kind,
        channel,
        read_at as "readAt",
        created_at as "createdAt"
      from notifications
      where user_id = ${userUuid}
        and (
          ${decoded.createdAt}::timestamptz is null
          or created_at < ${decoded.createdAt}
          or (created_at = ${decoded.createdAt} and id < ${decoded.id}::uuid)
        )
      order by created_at desc, id desc
      limit ${limit + 1}
    `;
    const items = rows.slice(0, limit);
    const last = items.at(-1);
    return {
      items,
      nextCursor: rows.length > limit && last ? `${last.createdAt.toISOString()}|${last.id}` : null,
    };
  }

  async listSourcePreferences(userUuid: string): Promise<readonly UserSourcePreference[]> {
    return this.#client<UserSourcePreference[]>`
      select user_id as "userUuid", source_id::text as "sourceId", position
      from user_source_preferences where user_id = ${userUuid} order by position
    `;
  }

  async listSubscriptionPublicationIds(
    userUuid: string,
    workId: string,
  ): Promise<readonly string[]> {
    const rows = await this.#client<{ publicationId: string }[]>`
      select publication_id::text as "publicationId" from subscription_publications
      where user_id = ${userUuid} and work_id = ${workId}::uuid order by publication_id
    `;
    return rows.map((row) => row.publicationId);
  }

  async listWorkFollowSettings(workId: string): Promise<readonly FollowSettings[]> {
    return this.#client<FollowSettings[]>`
      select user_id as "userUuid", work_id::text as "workId", mode
      from work_follow_settings where work_id = ${workId}::uuid
    `;
  }

  async markAllNotificationsRead(
    context: TransactionContext,
    userUuid: string,
    readAt: Date,
  ): Promise<void> {
    await this.#foundation.withSession(
      context,
      (session) =>
        session`update notifications set read_at = ${readAt} where user_id = ${userUuid} and read_at is null`,
    );
  }

  async markNotificationRead(
    context: TransactionContext,
    userUuid: string,
    notificationId: string,
    readAt: Date,
  ): Promise<boolean> {
    const rows = await this.#foundation.withSession(
      context,
      (session) =>
        session<{ id: string }[]>`
        update notifications set read_at = coalesce(read_at, ${readAt})
        where id = ${notificationId}::uuid and user_id = ${userUuid}
        returning id::text
      `,
    );
    return rows.length === 1;
  }

  async replaceSourcePreferences(): Promise<never> {
    throw new Error('notification repository does not update follow settings');
  }

  async replaceSubscriptionPublications(): Promise<never> {
    throw new Error('notification repository does not update follow settings');
  }

  async saveFollowSettings(): Promise<never> {
    throw new Error('notification repository does not update follow settings');
  }

  async saveNotification(
    context: TransactionContext,
    notification: Notification,
  ): Promise<boolean> {
    const rows = await this.#foundation.withSession(
      context,
      (session) =>
        session<{ id: string }[]>`
        insert into notifications (
          id, idempotency_key, user_id, release_event_id, kind, channel, read_at, created_at
        ) values (
          ${notification.id}::uuid, ${notification.idempotencyKey}, ${notification.userUuid},
          ${notification.eventId}::uuid, ${notification.kind}::release_event_kind,
          ${notification.channel}::notification_channel, null, ${notification.createdAt}
        ) on conflict (idempotency_key) do nothing returning id::text
      `,
    );
    return rows.length === 1;
  }

  async saveNotificationPreference(
    context: TransactionContext,
    preference: NotificationPreference,
  ): Promise<void> {
    await this.#foundation.withSession(
      context,
      (session) =>
        session`
        insert into notification_preferences (user_id, kind, channel, enabled)
        values (${preference.userUuid}, ${preference.kind}::release_event_kind,
          ${preference.channel}::notification_channel, ${preference.enabled})
        on conflict (user_id, kind, channel) do update
        set enabled = excluded.enabled, updated_at = now()
      `,
    );
  }

  async unreadNotificationCount(userUuid: string): Promise<number> {
    const rows = await this.#client<{ count: number }[]>`
      select count(*)::int as count from notifications where user_id = ${userUuid} and read_at is null
    `;
    return rows[0]?.count ?? 0;
  }

  async close(): Promise<void> {
    await this.#client.end({ timeout: 1 });
  }
}

export const createPostgresNotification = (
  databaseUrl: string,
  foundation: PostgresFoundation,
): PostgresNotification => new PostgresNotification(databaseUrl, foundation);
