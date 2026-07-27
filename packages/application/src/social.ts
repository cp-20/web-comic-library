import type {
  ActivityKind,
  FollowStatus,
  ReadingActivity,
  UserFollow,
  Visibility,
} from '@web-comic-library/domain';
import { canRespondToFollow, followStatusForProfile } from '@web-comic-library/domain';

import type { TransactionContext, TransactionPort } from './persistence';

export type TimelinePage = Readonly<{
  items: readonly ReadingActivity[];
  nextCursor: string | null;
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
  deleteFollow(
    context: TransactionContext,
    followerUserUuid: string,
    followedUserUuid: string,
  ): Promise<void>;
  findFollow(followerUserUuid: string, followedUserUuid: string): Promise<UserFollow | null>;
  findFollowTarget(userUuid: string): Promise<FollowTarget | null>;
  findUserUuidByPublicId(publicId: string): Promise<string | null>;
  listFollowers(userUuid: string): Promise<readonly UserFollow[]>;
  listFollowing(userUuid: string): Promise<readonly UserFollow[]>;
  listTimeline(userUuid: string, cursor: string | null, limit: number): Promise<TimelinePage>;
  saveFollow(context: TransactionContext, follow: UserFollow): Promise<UserFollow>;
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
