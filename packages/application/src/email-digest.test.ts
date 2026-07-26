import { expect, test } from 'bun:test';

import type { EmailDigestSettingsRepository } from './email-digest';
import {
  recordEmailDigestFeedback,
  setEmailDigestSettings,
  unsubscribeEmailDigest,
} from './email-digest';
import { TransactionContext, type TransactionPort } from './persistence';

test('email digest settings and unsubscribe are persisted transactionally', async () => {
  const events: string[] = [];
  const repository: EmailDigestSettingsRepository = {
    async saveEmailDigestSettings(_context, settings) {
      events.push(`save:${settings.userUuid}:${settings.timezone}:${settings.enabled}`);
    },
    async unsubscribeEmailDigest(_context, userUuid) {
      events.push(`unsubscribe:${userUuid}`);
    },
    async recordEmailDigestFeedback(_context, feedback) {
      events.push(`feedback:${feedback.kind}:${feedback.recipient}`);
    },
  };
  const transactions: TransactionPort = {
    async transaction<T>(operation: (context: TransactionContext) => Promise<T>): Promise<T> {
      return operation(new TransactionContext());
    },
  };
  await setEmailDigestSettings(transactions, repository, {
    enabled: true,
    sendTime: '09:00',
    timezone: 'Asia/Tokyo',
    userUuid: 'reader',
  });
  await unsubscribeEmailDigest(transactions, repository, 'reader');
  await recordEmailDigestFeedback(transactions, repository, {
    eventId: 'event-1',
    kind: 'bounce',
    recipient: 'reader@example.test',
  });
  expect(events).toEqual([
    'save:reader:Asia/Tokyo:true',
    'unsubscribe:reader',
    'feedback:bounce:reader@example.test',
  ]);
});
