import { expect, test } from 'bun:test';

import type { ReadingActivity, UserFollow } from '@web-comic-library/domain';

import { TransactionContext, type TransactionPort } from './persistence';
import type { SocialRepository, TimelinePage } from './social';
import { createReadingActivity, requestFollow, respondToFollow, unfollow } from './social';

const context = new TransactionContext();

const transactions: TransactionPort = {
  async transaction<T>(operation: (transaction: TransactionContext) => Promise<T>): Promise<T> {
    return operation(context);
  },
};

const followKey = (follower: string, followed: string): string => `${follower}|${followed}`;

const createRepository = (visibility: 'public' | 'followers' | 'private' | null) => {
  const follows = new Map<string, UserFollow>();
  const activities: ReadingActivity[] = [];
  const repository: SocialRepository = {
    async createReadingActivity(_context, input) {
      const activity: ReadingActivity = {
        createdAt: new Date('2026-07-27T00:00:00Z'),
        id: `activity-${activities.length + 1}`,
        kind: input.kind,
        status: input.status,
        userUuid: input.userUuid,
        workId: input.workId,
      };
      activities.push(activity);
      return activity;
    },
    async deleteFollow(_context, follower, followed): Promise<void> {
      follows.delete(followKey(follower, followed));
    },
    async findFollow(follower, followed) {
      return follows.get(followKey(follower, followed)) ?? null;
    },
    async findFollowTarget() {
      return { accountStatus: 'active' as const, visibility };
    },
    async findUserUuidByPublicId(publicId) {
      return publicId === 'reader' ? 'reader' : null;
    },
    async listFollowers() {
      return [];
    },
    async listFollowing() {
      return [];
    },
    async listTimeline(): Promise<TimelinePage> {
      return { items: activities, nextCursor: null };
    },
    async saveFollow(_context, follow) {
      follows.set(followKey(follow.followerUserUuid, follow.followedUserUuid), follow);
      return follow;
    },
  };
  return { activities, follows, repository };
};

test('public profiles accept follows immediately and private profiles require a response', async () => {
  const publicRepository = createRepository('public');
  await expect(
    requestFollow(transactions, publicRepository.repository, 'follower', 'reader'),
  ).resolves.toMatchObject({
    status: 'accepted',
  });

  const privateRepository = createRepository('private');
  await expect(
    requestFollow(transactions, privateRepository.repository, 'follower', 'reader'),
  ).resolves.toMatchObject({
    status: 'pending',
  });
  await expect(
    respondToFollow(transactions, privateRepository.repository, 'reader', 'follower', 'accepted'),
  ).resolves.toMatchObject({ status: 'accepted' });
  await unfollow(transactions, privateRepository.repository, 'follower', 'reader');
  expect(await privateRepository.repository.findFollow('follower', 'reader')).toBeNull();
});

test('only selected status changes create an activity', async () => {
  const { activities, repository } = createRepository('public');
  await expect(
    createReadingActivity(transactions, repository, {
      shareActivity: false,
      status: 'reading',
      userUuid: 'reader',
      workId: 'work-1',
    }),
  ).resolves.toBeNull();
  await expect(
    createReadingActivity(transactions, repository, {
      shareActivity: true,
      status: 'completed',
      userUuid: 'reader',
      workId: 'work-1',
    }),
  ).resolves.toMatchObject({ kind: 'completed' });
  expect(activities).toHaveLength(1);
});
