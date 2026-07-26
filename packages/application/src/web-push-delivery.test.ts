import { expect, test } from 'bun:test';

import { deliverWebPushForRelease } from './web-push-delivery';

test('web push delivery records a permanent result and retries temporary failures', async () => {
  const outcomes: string[] = [];
  const repository = {
    async listWebPushDeliveriesForRelease() {
      return [
        {
          id: 'delivery',
          notificationId: 'notification',
          subscription: {
            auth: 'auth',
            endpoint: 'https://push.example.test/subscription',
            id: 'subscription',
            p256dh: 'key',
            userUuid: 'reader',
          },
        },
      ];
    },
    async recordWebPushDeliveryResult(_deliveryId: string, outcome: string) {
      outcomes.push(outcome);
    },
  };
  await expect(
    deliverWebPushForRelease(
      repository,
      {
        async send() {
          return 'permanent_failure' as const;
        },
      },
      'event',
    ),
  ).resolves.toBe(0);
  await expect(
    deliverWebPushForRelease(
      repository,
      {
        async send() {
          return 'retryable_failure' as const;
        },
      },
      'event',
    ),
  ).rejects.toThrow('temporarily');
  expect(outcomes).toEqual(['permanent_failure', 'retryable_failure']);
});
