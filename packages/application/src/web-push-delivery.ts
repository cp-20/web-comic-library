import type { WebPushSubscription } from '@web-comic-library/domain';

export type WebPushDeliveryOutcome = 'delivered' | 'permanent_failure' | 'retryable_failure';

export type WebPushDelivery = Readonly<{
  id: string;
  notificationId: string;
  subscription: WebPushSubscription;
}>;

export interface WebPushDeliveryRepository {
  listWebPushDeliveriesForRelease(eventId: string): Promise<readonly WebPushDelivery[]>;
  recordWebPushDeliveryResult(deliveryId: string, outcome: WebPushDeliveryOutcome): Promise<void>;
}

export interface WebPushSenderPort {
  send(
    subscription: WebPushSubscription,
    payload: Readonly<{ notificationId: string; url: string }>,
  ): Promise<WebPushDeliveryOutcome>;
}

export const deliverWebPushForRelease = async (
  repository: WebPushDeliveryRepository,
  sender: WebPushSenderPort,
  eventId: string,
): Promise<number> => {
  const deliveries = await repository.listWebPushDeliveriesForRelease(eventId);
  let delivered = 0;
  for (const delivery of deliveries) {
    // oxlint-disable-next-line no-await-in-loop -- Delivery status must be persisted before the next retry decision.
    const outcome = await sender.send(delivery.subscription, {
      notificationId: delivery.notificationId,
      url: '/notifications',
    });
    // oxlint-disable-next-line no-await-in-loop -- Delivery status is independent and durable per subscription.
    await repository.recordWebPushDeliveryResult(delivery.id, outcome);
    if (outcome === 'retryable_failure') throw new Error('web push delivery failed temporarily');
    delivered += outcome === 'delivered' ? 1 : 0;
  }
  return delivered;
};
