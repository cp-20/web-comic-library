import { expect, test } from 'bun:test';

import {
  deliverQueuedEmailDigests,
  type EmailDigestDeliveryRepository,
} from './email-digest-delivery';

test('email digest delivery persists each result and retries temporary failures', async () => {
  const outcomes: string[] = [];
  const repository: EmailDigestDeliveryRepository = {
    async listQueuedEmailDigests() {
      return [
        { id: 'digest-1', notificationCount: 2, recipient: 'reader@example.test' },
        { id: 'digest-2', notificationCount: 1, recipient: 'other@example.test' },
      ];
    },
    async recordEmailDigestResult(id, outcome) {
      outcomes.push(`${id}:${outcome}`);
    },
  };
  const sender = {
    async send(recipient: string) {
      return recipient === 'reader@example.test'
        ? ('delivered' as const)
        : ('retryable_failure' as const);
    },
  };
  await expect(
    deliverQueuedEmailDigests(
      repository,
      sender,
      new Date('2026-07-27T00:00:00Z'),
      'https://comic.example.test/notifications',
    ),
  ).rejects.toThrow('temporarily');
  expect(outcomes).toEqual(['digest-1:delivered', 'digest-2:retryable_failure']);
});
