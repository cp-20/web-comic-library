import { expect, test } from 'bun:test';

import type { ReadingActivity, ReviewActivity, UserFollow } from '@web-comic-library/domain';

import { TransactionContext, type TransactionPort } from './persistence';
import type { SocialRepository, TimelinePage } from './social';
import {
  addReaction,
  createReadingActivity,
  createReviewActivity,
  deleteReviewActivity,
  listReviews,
  requestFollow,
  respondToFollow,
  revealReview,
  unfollow,
  updateReviewActivity,
} from './social';

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
  const reviews = new Map<string, ReviewActivity>();
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
    async createReviewActivity(_context, input) {
      const review: ReviewActivity = {
        ...input,
        createdAt: new Date('2026-07-27T00:00:00Z'),
        id: `review-${reviews.size + 1}`,
        kind: 'review',
        updatedAt: new Date('2026-07-27T00:00:00Z'),
      };
      reviews.set(review.id, review);
      return review;
    },
    async deleteFollow(_context, follower, followed): Promise<void> {
      follows.delete(followKey(follower, followed));
    },
    async deleteReaction() {
      return false;
    },
    async deleteReviewActivity(_context, userUuid, id) {
      const review = reviews.get(id);
      if (!review || review.userUuid !== userUuid) return false;
      reviews.delete(id);
      return true;
    },
    async findFollow(follower, followed) {
      return follows.get(followKey(follower, followed)) ?? null;
    },
    async findFollowTarget() {
      return { accountStatus: 'active' as const, visibility };
    },
    async findReviewActivity(id) {
      return reviews.get(id) ?? null;
    },
    async findUserUuidByPublicId(publicId) {
      return publicId === 'reader' ? 'reader' : null;
    },
    async isBlockedEitherDirection() {
      return false;
    },
    async listFollowers() {
      return [];
    },
    async listFollowing() {
      return [];
    },
    async listReviewActivities() {
      return [...reviews.values()].map((review) => ({ reactionCount: 0, review }));
    },
    async listReviewReadState() {
      return { readContentUnitIds: [], readVolumeEditionIds: [] };
    },
    async listTimeline(): Promise<TimelinePage> {
      return { items: activities, nextCursor: null };
    },
    async saveFollow(_context, follow) {
      follows.set(followKey(follow.followerUserUuid, follow.followedUserUuid), follow);
      return follow;
    },
    async saveReaction() {
      return true;
    },
    async updateReviewActivity(_context, userUuid, id, input) {
      const review = reviews.get(id);
      if (!review || review.userUuid !== userUuid) return null;
      const updated = { ...review, ...input };
      reviews.set(id, updated);
      return updated;
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

test('reviews return a spoiler-safe read model and reveal only public text', async () => {
  const { repository } = createRepository('public');
  const review = await createReviewActivity(transactions, repository, {
    body: '<script>not html</script>',
    contentUnitId: 'unit-2',
    spoiler: false,
    userUuid: 'author',
    visibility: 'public',
    volumeEditionId: null,
    workId: 'work-1',
  });

  await expect(
    listReviews(repository, null, 'work-1', { contentUnitId: 'unit-2', volumeEditionId: null }),
  ).resolves.toEqual([expect.objectContaining({ id: review.id, state: 'hidden' })]);
  await expect(revealReview(repository, null, review.id)).resolves.toEqual({
    body: '<script>not html</script>',
    id: review.id,
  });
  await expect(addReaction(transactions, repository, 'reader', review.id)).resolves.toBe(true);
});

test('review authors can edit and delete while private reviews do not enter public queries', async () => {
  const { repository } = createRepository('public');
  const review = await createReviewActivity(transactions, repository, {
    body: 'private note',
    contentUnitId: null,
    spoiler: false,
    userUuid: 'author',
    visibility: 'private',
    volumeEditionId: 'volume-1',
    workId: 'work-1',
  });
  await expect(
    listReviews(repository, null, 'work-1', { contentUnitId: null, volumeEditionId: 'volume-1' }),
  ).resolves.toEqual([]);
  await expect(
    updateReviewActivity(transactions, repository, 'author', review.id, {
      body: 'edited private note',
      spoiler: true,
      visibility: 'private',
    }),
  ).resolves.toMatchObject({ body: 'edited private note', spoiler: true });
  await expect(deleteReviewActivity(transactions, repository, 'author', review.id)).resolves.toBe(
    true,
  );
});
