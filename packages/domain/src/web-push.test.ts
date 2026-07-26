import { expect, test } from 'bun:test';

import { createWebPushSubscription, webPushDeliveryIdempotencyKey } from './web-push';

test('web push subscriptions require HTTPS endpoints and stable delivery keys', () => {
  expect(() =>
    createWebPushSubscription({
      auth: 'auth',
      endpoint: 'http://push.example.test/subscription',
      id: 'subscription',
      p256dh: 'key',
      userUuid: 'reader',
    }),
  ).toThrow('HTTPS');
  expect(webPushDeliveryIdempotencyKey('notification', 'subscription')).toBe(
    'web-push:notification:subscription',
  );
});
