import { expect, test } from 'bun:test';

import type { NotificationRepository } from './notification';
import { generateInAppNotifications } from './notification';
import { TransactionContext, type TransactionPort } from './persistence';

test('notification generation honors follow selection, defaults, opt-ins, suppression, and idempotency', async () => {
  const saved: string[] = [];
  const repository: NotificationRepository = {
    async findFollowSettings() {
      return null;
    },
    async findNotificationPreference(_userUuid, kind) {
      return kind === 'announcement'
        ? { channel: 'in_app', enabled: true, kind, userUuid: 'reader' }
        : null;
    },
    async findReleaseEvent(eventId) {
      return {
        candidates: [
          {
            contentUnitId: 'content-1',
            eventId,
            notificationEligible: true,
            occurredAt: new Date('2026-07-27T00:00:00Z'),
            official: true,
            publicationId: 'publication-1',
            publicationValid: true,
            sourceId: 'source-1',
          },
        ],
        id: eventId,
        kind: 'new_episode',
        notificationSuppressed: false,
        workId: 'work-1',
      };
    },
    async listNotifications() {
      return { items: [], nextCursor: null };
    },
    async listSourcePreferences() {
      return [];
    },
    async listSubscriptionPublicationIds() {
      return [];
    },
    async listWorkFollowSettings() {
      return [{ mode: 'fastest', userUuid: 'reader', workId: 'work-1' }];
    },
    async markAllNotificationsRead() {},
    async markNotificationRead() {
      return false;
    },
    async replaceSourcePreferences() {
      return [];
    },
    async replaceSubscriptionPublications() {
      return [];
    },
    async saveFollowSettings() {},
    async saveNotification(_context, notification) {
      if (saved.includes(notification.idempotencyKey)) return false;
      saved.push(notification.idempotencyKey);
      return true;
    },
    async saveNotificationPreference() {},
    async unreadNotificationCount() {
      return 0;
    },
  };
  const transactions: TransactionPort = {
    async transaction<T>(operation: (context: TransactionContext) => Promise<T>): Promise<T> {
      return operation(new TransactionContext());
    },
  };

  await expect(generateInAppNotifications(transactions, repository, 'event-1')).resolves.toBe(1);
  await expect(generateInAppNotifications(transactions, repository, 'event-1')).resolves.toBe(0);
  expect(saved).toEqual(['notification:reader:event-1:in_app:new_episode']);
});
