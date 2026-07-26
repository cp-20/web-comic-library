import { expect, test } from 'bun:test';

import { TransactionContext, type TransactionPort } from './persistence';
import type { WebPushSubscriptionRepository } from './web-push';
import { registerWebPushSubscription, unregisterWebPushSubscription } from './web-push';

test('web push subscriptions register and unregister only through a transaction', async () => {
  const actions: string[] = [];
  const repository: WebPushSubscriptionRepository = {
    async deactivateWebPushSubscription(_context, userUuid, endpoint) {
      actions.push(`remove:${userUuid}:${endpoint}`);
      return true;
    },
    async saveWebPushSubscription(_context, subscription) {
      actions.push(`save:${subscription.userUuid}:${subscription.endpoint}`);
    },
  };
  const transactions: TransactionPort = {
    async transaction<T>(operation: (context: TransactionContext) => Promise<T>): Promise<T> {
      return operation(new TransactionContext());
    },
  };
  await registerWebPushSubscription(transactions, repository, {
    auth: 'auth',
    endpoint: 'https://push.example.test/subscription',
    p256dh: 'key',
    userUuid: 'reader',
  });
  await expect(
    unregisterWebPushSubscription(
      transactions,
      repository,
      'reader',
      'https://push.example.test/subscription',
    ),
  ).resolves.toBe(true);
  expect(actions).toEqual([
    'save:reader:https://push.example.test/subscription',
    'remove:reader:https://push.example.test/subscription',
  ]);
});
