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

export const followStatusForProfile = (profileVisibility: Visibility | null): FollowStatus =>
  profileVisibility === 'public' ? 'accepted' : 'pending';

export const canRespondToFollow = (follow: UserFollow, userUuid: string): boolean =>
  follow.followedUserUuid === userUuid && follow.status === 'pending';
