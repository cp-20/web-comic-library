import type {
  TransactionContext,
  WebPushDelivery,
  WebPushDeliveryOutcome,
  WebPushDeliveryRepository,
  WebPushSubscriptionRepository,
} from '@web-comic-library/application';
import type { WebPushSubscription } from '@web-comic-library/domain';
import postgres from 'postgres';
import type { Sql } from 'postgres';

import type { PostgresFoundation } from './foundation';

export class PostgresWebPushSubscription
  implements WebPushSubscriptionRepository, WebPushDeliveryRepository
{
  readonly #client: Sql;
  readonly #foundation: PostgresFoundation;

  constructor(databaseUrl: string, foundation: PostgresFoundation) {
    this.#client = postgres(databaseUrl);
    this.#foundation = foundation;
  }

  async deactivateWebPushSubscription(
    context: TransactionContext,
    userUuid: string,
    endpoint: string,
  ): Promise<boolean> {
    const rows = await this.#foundation.withSession(
      context,
      (session) =>
        session<{ id: string }[]>`
          update web_push_subscriptions
          set disabled_at = coalesce(disabled_at, now()), updated_at = now()
          where user_id = ${userUuid} and endpoint = ${endpoint}
          returning id::text
        `,
    );
    return rows.length === 1;
  }

  async saveWebPushSubscription(
    context: TransactionContext,
    subscription: WebPushSubscription,
  ): Promise<void> {
    await this.#foundation.withSession(
      context,
      (session) =>
        session`
          insert into web_push_subscriptions (id, user_id, endpoint, p256dh, auth)
          values (
            ${subscription.id}::uuid, ${subscription.userUuid}, ${subscription.endpoint},
            ${subscription.p256dh}, ${subscription.auth}
          )
          on conflict (endpoint) do update
          set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth,
              disabled_at = null, updated_at = now()
        `,
    );
  }

  async listWebPushDeliveriesForRelease(eventId: string): Promise<readonly WebPushDelivery[]> {
    await this.#client`
      insert into web_push_deliveries (id, idempotency_key, notification_id, subscription_id)
      select gen_random_uuid(), 'web-push:' || notification.id::text || ':' || subscription.id::text,
        notification.id, subscription.id
      from notifications as notification
      join web_push_subscriptions as subscription
        on subscription.user_id = notification.user_id and subscription.disabled_at is null
      where notification.release_event_id = ${eventId}::uuid
        and notification.channel = 'web_push'::notification_channel
      on conflict (notification_id, subscription_id) do nothing
    `;
    const rows = await this.#client<
      Readonly<{
        auth: string;
        deliveryId: string;
        endpoint: string;
        notificationId: string;
        p256dh: string;
        subscriptionId: string;
        userUuid: string;
      }>[]
    >`
      select delivery.id::text as "deliveryId", notification.id::text as "notificationId",
        subscription.id::text as "subscriptionId", subscription.user_id as "userUuid",
        subscription.endpoint, subscription.p256dh, subscription.auth
      from web_push_deliveries as delivery
      join notifications as notification on notification.id = delivery.notification_id
      join web_push_subscriptions as subscription on subscription.id = delivery.subscription_id
      where notification.release_event_id = ${eventId}::uuid
        and delivery.status = 'queued'::web_push_delivery_status and subscription.disabled_at is null
      order by delivery.created_at
    `;
    return rows.map((row) => ({
      id: row.deliveryId,
      notificationId: row.notificationId,
      subscription: {
        auth: row.auth,
        endpoint: row.endpoint,
        id: row.subscriptionId,
        p256dh: row.p256dh,
        userUuid: row.userUuid,
      },
    }));
  }

  async recordWebPushDeliveryResult(
    deliveryId: string,
    outcome: WebPushDeliveryOutcome,
  ): Promise<void> {
    await this.#client.begin(async (session) => {
      const rows = await session<{ subscriptionId: string }[]>`
        update web_push_deliveries
        set status = ${outcome === 'retryable_failure' ? 'queued' : outcome}::web_push_delivery_status,
            attempt_count = attempt_count + 1,
            delivered_at = case when ${outcome} = 'delivered' then now() else delivered_at end,
            last_error_code = case when ${outcome} = 'delivered' then null else ${outcome} end,
            updated_at = now()
        where id = ${deliveryId}::uuid
        returning subscription_id::text as "subscriptionId"
      `;
      const subscriptionId = rows[0]?.subscriptionId;
      if (outcome === 'permanent_failure' && subscriptionId) {
        await session`
          update web_push_subscriptions set disabled_at = now(), updated_at = now()
          where id = ${subscriptionId}::uuid
        `;
      }
    });
  }

  async close(): Promise<void> {
    await this.#client.end({ timeout: 1 });
  }
}

export const createPostgresWebPushSubscription = (
  databaseUrl: string,
  foundation: PostgresFoundation,
): PostgresWebPushSubscription => new PostgresWebPushSubscription(databaseUrl, foundation);
