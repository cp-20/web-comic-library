import { expect, test } from 'bun:test';

import type { FollowRepository, FollowSettings } from './follow';
import { selectFollowNotifications, setFollowSettings, setSourcePreferences } from './follow';
import { TransactionContext, type TransactionPort } from './persistence';

test('follow settings and source preferences replace records within transactions', async () => {
  const transactions: TransactionPort = {
    async transaction<Result>(operation: (context: TransactionContext) => Promise<Result>) {
      return operation(new TransactionContext());
    },
  };
  let sourceIds: readonly string[] = [];
  let settings: FollowSettings | null = null;
  let publicationIds: readonly string[] = [];
  const repository: FollowRepository = {
    async findFollowSettings() {
      return settings;
    },
    async listSourcePreferences(userUuid) {
      return sourceIds.map((sourceId, position) => ({ position, sourceId, userUuid }));
    },
    async listSubscriptionPublicationIds() {
      return publicationIds;
    },
    async replaceSourcePreferences(_, __, values) {
      sourceIds = values;
      return values.map((sourceId, position) => ({ position, sourceId, userUuid: 'reader' }));
    },
    async replaceSubscriptionPublications(_, __, ___, values) {
      publicationIds = values;
      return values.map((publicationId) => ({
        publicationId,
        userUuid: 'reader',
        workId: 'work-1',
      }));
    },
    async saveFollowSettings(_, value) {
      settings = value;
    },
  };

  await setSourcePreferences(transactions, repository, 'reader', ['source-b', 'source-a']);
  await setFollowSettings(transactions, repository, {
    mode: 'source_priority',
    publicationIds: ['publication-b'],
    userUuid: 'reader',
    workId: 'work-1',
  });
  expect(
    await selectFollowNotifications(repository, 'reader', 'work-1', [
      {
        contentUnitId: 'content-1',
        eventId: 'event-a',
        notificationEligible: true,
        occurredAt: new Date('2026-07-27T00:00:00Z'),
        official: true,
        publicationId: 'publication-a',
        publicationValid: true,
        sourceId: 'source-a',
      },
      {
        contentUnitId: 'content-1',
        eventId: 'event-b',
        notificationEligible: true,
        occurredAt: new Date('2026-07-27T01:00:00Z'),
        official: true,
        publicationId: 'publication-b',
        publicationValid: true,
        sourceId: 'source-b',
      },
    ]),
  ).toMatchObject([{ eventId: 'event-b' }]);
  await expect(
    setSourcePreferences(transactions, repository, 'reader', ['source-a', 'source-a']),
  ).rejects.toThrow();
});
