import type { Visibility } from './identity';
import type { ReadingStatus } from './library';

export const followStatuses = ['pending', 'accepted', 'rejected'] as const;

export type FollowStatus = (typeof followStatuses)[number];

export const activityKinds = ['reading_status', 'completed', 'review'] as const;

export type ActivityKind = (typeof activityKinds)[number];

export type UserFollow = Readonly<{
  createdAt: Date;
  followerUserUuid: string;
  followedUserUuid: string;
  respondedAt: Date | null;
  status: FollowStatus;
}>;

export type ReadingActivity = Readonly<{
  createdAt: Date;
  id: string;
  kind: Exclude<ActivityKind, 'review'>;
  status: ReadingStatus;
  userUuid: string;
  workId: string;
}>;

export type ReviewActivity = Readonly<{
  body: string;
  contentUnitId: string | null;
  createdAt: Date;
  id: string;
  kind: 'review';
  spoiler: boolean;
  updatedAt: Date;
  userUuid: string;
  visibility: Visibility;
  volumeEditionId: string | null;
  workId: string;
}>;

export type ActivityReaction = Readonly<{
  activityId: string;
  createdAt: Date;
  userUuid: string;
}>;

export type ReviewReadState = Readonly<{
  readContentUnitIds: readonly string[];
  readVolumeEditionIds: readonly string[];
}>;

export type ReviewReadModel =
  | Readonly<{
      contentUnitId: string | null;
      createdAt: Date;
      id: string;
      reactionCount: number;
      reviewerUserUuid: string;
      spoiler: boolean;
      state: 'hidden';
      volumeEditionId: string | null;
    }>
  | Readonly<{
      body: string;
      contentUnitId: string | null;
      createdAt: Date;
      id: string;
      reactionCount: number;
      reviewerUserUuid: string;
      spoiler: boolean;
      state: 'visible';
      volumeEditionId: string | null;
    }>;

export const validateReviewActivity = (
  input: Omit<ReviewActivity, 'createdAt' | 'id' | 'kind' | 'updatedAt'>,
): Omit<ReviewActivity, 'createdAt' | 'id' | 'kind' | 'updatedAt'> => {
  const body = input.body.trim();
  if (body.length === 0 || body.length > 1_000)
    throw new Error('review body must be 1 to 1000 characters');
  if ((input.contentUnitId === null) === (input.volumeEditionId === null)) {
    throw new Error('review must target exactly one content unit or volume edition');
  }
  return { ...input, body };
};

export const isReviewSpoilerFor = (
  review: ReviewActivity,
  viewerUserUuid: string | null,
  readState: ReviewReadState | null,
): boolean => {
  if (viewerUserUuid === review.userUuid) return false;
  if (viewerUserUuid === null || readState === null || review.spoiler) return true;
  return review.contentUnitId !== null
    ? !readState.readContentUnitIds.includes(review.contentUnitId)
    : !readState.readVolumeEditionIds.includes(review.volumeEditionId ?? '');
};

export const toReviewReadModel = (
  review: ReviewActivity,
  reactionCount: number,
  viewerUserUuid: string | null,
  readState: ReviewReadState | null,
): ReviewReadModel => {
  const base = {
    contentUnitId: review.contentUnitId,
    createdAt: review.createdAt,
    id: review.id,
    reactionCount,
    reviewerUserUuid: review.userUuid,
    spoiler: review.spoiler,
    volumeEditionId: review.volumeEditionId,
  } as const;
  return isReviewSpoilerFor(review, viewerUserUuid, readState)
    ? { ...base, state: 'hidden' }
    : { ...base, body: review.body, state: 'visible' };
};

export const followStatusForProfile = (profileVisibility: Visibility | null): FollowStatus =>
  profileVisibility === 'public' ? 'accepted' : 'pending';

export const canRespondToFollow = (follow: UserFollow, userUuid: string): boolean =>
  follow.followedUserUuid === userUuid && follow.status === 'pending';
