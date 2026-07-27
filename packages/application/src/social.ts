import type {
  ActivityKind,
  ActivityReaction,
  FollowStatus,
  ReadingActivity,
  ReviewActivity,
  ReviewReadModel,
  ReviewReadState,
  UserFollow,
  Visibility,
} from '@web-comic-library/domain';
import {
  canRespondToFollow,
  followStatusForProfile,
  toReviewReadModel,
  validateReviewActivity,
} from '@web-comic-library/domain';

import type { TransactionContext, TransactionPort } from './persistence';

export type TimelinePage = Readonly<{
  items: readonly ReadingActivity[];
  nextCursor: string | null;
}>;

export type ReviewTarget =
  | Readonly<{ contentUnitId: string; volumeEditionId: null }>
  | Readonly<{ contentUnitId: null; volumeEditionId: string }>;

export type ReviewListItem = Readonly<{
  reactionCount: number;
  review: ReviewActivity;
}>;

export type FollowTarget = Readonly<{
  accountStatus: 'active' | 'disabled' | 'pending_deletion';
  visibility: Visibility | null;
}>;

export interface SocialRepository {
  createReadingActivity(
    context: TransactionContext,
    input: Readonly<{
      kind: Exclude<ActivityKind, 'review'>;
      status: ReadingActivity['status'];
      userUuid: string;
      workId: string;
    }>,
  ): Promise<ReadingActivity>;
  createReviewActivity(
    context: TransactionContext,
    input: Omit<ReviewActivity, 'createdAt' | 'id' | 'kind' | 'updatedAt'>,
  ): Promise<ReviewActivity>;
  deleteFollow(
    context: TransactionContext,
    followerUserUuid: string,
    followedUserUuid: string,
  ): Promise<void>;
  findFollow(followerUserUuid: string, followedUserUuid: string): Promise<UserFollow | null>;
  findFollowTarget(userUuid: string): Promise<FollowTarget | null>;
  findReviewActivity(id: string): Promise<ReviewActivity | null>;
  findUserUuidByPublicId(publicId: string): Promise<string | null>;
  listFollowers(userUuid: string): Promise<readonly UserFollow[]>;
  listFollowing(userUuid: string): Promise<readonly UserFollow[]>;
  listReviewActivities(workId: string, target: ReviewTarget): Promise<readonly ReviewListItem[]>;
  listReviewReadState(userUuid: string, workId: string): Promise<ReviewReadState>;
  listTimeline(userUuid: string, cursor: string | null, limit: number): Promise<TimelinePage>;
  saveFollow(context: TransactionContext, follow: UserFollow): Promise<UserFollow>;
  saveReaction(context: TransactionContext, reaction: ActivityReaction): Promise<boolean>;
  updateReviewActivity(
    context: TransactionContext,
    userUuid: string,
    id: string,
    input: Pick<ReviewActivity, 'body' | 'spoiler' | 'visibility'>,
  ): Promise<ReviewActivity | null>;
  deleteReviewActivity(context: TransactionContext, userUuid: string, id: string): Promise<boolean>;
  deleteReaction(
    context: TransactionContext,
    userUuid: string,
    activityId: string,
  ): Promise<boolean>;
}

export const requestFollow = async (
  transactions: TransactionPort,
  repository: SocialRepository,
  followerUserUuid: string,
  followedUserUuid: string,
  now: Date = new Date(),
): Promise<UserFollow> => {
  if (followerUserUuid === followedUserUuid) throw new Error('cannot follow yourself');
  const target = await repository.findFollowTarget(followedUserUuid);
  if (!target || target.accountStatus !== 'active') throw new Error('profile is unavailable');
  const existing = await repository.findFollow(followerUserUuid, followedUserUuid);
  if (existing?.status === 'accepted') return existing;
  const follow: UserFollow = {
    createdAt: now,
    followerUserUuid,
    followedUserUuid,
    respondedAt: followStatusForProfile(target.visibility) === 'accepted' ? now : null,
    status: followStatusForProfile(target.visibility),
  };
  return transactions.transaction((context) => repository.saveFollow(context, follow));
};

export const respondToFollow = async (
  transactions: TransactionPort,
  repository: SocialRepository,
  actorUserUuid: string,
  followerUserUuid: string,
  response: Extract<FollowStatus, 'accepted' | 'rejected'>,
  now: Date = new Date(),
): Promise<UserFollow> => {
  const follow = await repository.findFollow(followerUserUuid, actorUserUuid);
  if (!follow || !canRespondToFollow(follow, actorUserUuid))
    throw new Error('follow request is unavailable');
  return transactions.transaction((context) =>
    repository.saveFollow(context, { ...follow, respondedAt: now, status: response }),
  );
};

export const unfollow = async (
  transactions: TransactionPort,
  repository: SocialRepository,
  followerUserUuid: string,
  followedUserUuid: string,
): Promise<void> =>
  transactions.transaction((context) =>
    repository.deleteFollow(context, followerUserUuid, followedUserUuid),
  );

export const createReadingActivity = async (
  transactions: TransactionPort,
  repository: SocialRepository,
  input: Readonly<{
    shareActivity: boolean;
    status: ReadingActivity['status'];
    userUuid: string;
    workId: string;
  }>,
): Promise<ReadingActivity | null> => {
  if (!input.shareActivity) return null;
  const kind = input.status === 'completed' ? 'completed' : 'reading_status';
  return transactions.transaction((context) =>
    repository.createReadingActivity(context, { ...input, kind }),
  );
};

export const createReviewActivity = async (
  transactions: TransactionPort,
  repository: SocialRepository,
  input: Omit<ReviewActivity, 'createdAt' | 'id' | 'kind' | 'updatedAt'>,
): Promise<ReviewActivity> => {
  const review = validateReviewActivity(input);
  return transactions.transaction((context) => repository.createReviewActivity(context, review));
};

export const updateReviewActivity = async (
  transactions: TransactionPort,
  repository: SocialRepository,
  userUuid: string,
  id: string,
  input: Pick<ReviewActivity, 'body' | 'spoiler' | 'visibility'>,
): Promise<ReviewActivity> => {
  const body = input.body.trim();
  if (body.length === 0 || body.length > 1_000)
    throw new Error('review body must be 1 to 1000 characters');
  const review = await transactions.transaction((context) =>
    repository.updateReviewActivity(context, userUuid, id, { ...input, body }),
  );
  if (!review) throw new Error('review is unavailable');
  return review;
};

export const deleteReviewActivity = async (
  transactions: TransactionPort,
  repository: SocialRepository,
  userUuid: string,
  id: string,
): Promise<boolean> =>
  transactions.transaction((context) => repository.deleteReviewActivity(context, userUuid, id));

export const listReviews = async (
  repository: SocialRepository,
  viewerUserUuid: string | null,
  workId: string,
  target: ReviewTarget,
): Promise<readonly ReviewReadModel[]> => {
  const items = await repository.listReviewActivities(workId, target);
  const visibleItems = items.filter(
    ({ review }) => review.visibility === 'public' || review.userUuid === viewerUserUuid,
  );
  const readState = viewerUserUuid
    ? await repository.listReviewReadState(viewerUserUuid, workId)
    : null;
  return visibleItems.map(({ review, reactionCount }) =>
    toReviewReadModel(review, reactionCount, viewerUserUuid, readState),
  );
};

export const revealReview = async (
  repository: SocialRepository,
  viewerUserUuid: string | null,
  id: string,
): Promise<Pick<ReviewActivity, 'body' | 'id'> | null> => {
  const review = await repository.findReviewActivity(id);
  if (!review || (review.visibility !== 'public' && review.userUuid !== viewerUserUuid))
    return null;
  return { body: review.body, id: review.id };
};

export const addReaction = async (
  transactions: TransactionPort,
  repository: SocialRepository,
  userUuid: string,
  activityId: string,
  now: Date = new Date(),
): Promise<boolean> => {
  const review = await repository.findReviewActivity(activityId);
  if (!review || (review.visibility !== 'public' && review.userUuid !== userUuid)) {
    throw new Error('review is unavailable');
  }
  return transactions.transaction((context) =>
    repository.saveReaction(context, { activityId, createdAt: now, userUuid }),
  );
};

export const removeReaction = async (
  transactions: TransactionPort,
  repository: SocialRepository,
  userUuid: string,
  activityId: string,
): Promise<boolean> =>
  transactions.transaction((context) => repository.deleteReaction(context, userUuid, activityId));
