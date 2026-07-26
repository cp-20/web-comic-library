import { expect, test } from 'bun:test';

import { classifyWebPushFailure, createWebPushSender } from './index';

test('web push classifies expired subscriptions separately from retryable failures', async () => {
  expect(classifyWebPushFailure({ statusCode: 410 })).toBe('permanent_failure');
  expect(classifyWebPushFailure({ statusCode: 503 })).toBe('retryable_failure');
  const sender = createWebPushSender(
    { privateKey: 'private', publicKey: 'public', subject: 'mailto:test@example.test' },
    {
      async sendNotification() {
        return undefined;
      },
    },
  );
  await expect(
    sender.send(
      {
        auth: 'auth',
        endpoint: 'https://push.example.test/subscription',
        id: 'subscription',
        p256dh: 'key',
        userUuid: 'reader',
      },
      { notificationId: 'notification', url: '/notifications' },
    ),
  ).resolves.toBe('delivered');
});
