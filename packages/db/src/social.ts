import type {
  FollowTarget,
  SocialRepository,
  TimelinePage,
  TransactionContext,
} from '@web-comic-library/application';
import type { ReadingActivity, UserFollow } from '@web-comic-library/domain';
import postgres from 'postgres';
import type { Sql } from 'postgres';

import type { PostgresFoundation } from './foundation';

type FollowRow = Readonly<{
  createdAt: Date;
  followerUserUuid: string;
  followedUserUuid: string;
  respondedAt: Date | null;
  status: UserFollow['status'];
}>;

type ActivityRow = Readonly<{
  createdAt: Date;
  id: string;
  kind: ReadingActivity['kind'];
  status: ReadingActivity['status'];
  userUuid: string;
  workId: string;
}>;

const decodeCursor = (cursor: string | null): Readonly<{ createdAt: Date; id: string }> | null => {
  if (cursor === null) return null;
  const [createdAtText, id] = cursor.split('|');
  const createdAt = createdAtText ? new Date(createdAtText) : null;
  if (!createdAt || Number.isNaN(createdAt.valueOf()) || !id) {
    throw new Error('timeline cursor is invalid');
  }
  return { createdAt, id };
};

const toFollow = (row: FollowRow): UserFollow => row;
const toActivity = (row: ActivityRow): ReadingActivity => row;

export class PostgresSocial implements SocialRepository {
  readonly #client: Sql;
  readonly #foundation: PostgresFoundation;

  constructor(databaseUrl: string, foundation: PostgresFoundation) {
    this.#client = postgres(databaseUrl);
    this.#foundation = foundation;
  }

  async createReadingActivity(
    context: TransactionContext,
    input: Readonly<{
      kind: ReadingActivity['kind'];
      status: ReadingActivity['status'];
      userUuid: string;
      workId: string;
    }>,
  ): Promise<ReadingActivity> {
    const rows = await this.#foundation.withSession(
      context,
      (session) =>
        session<ActivityRow[]>`
        insert into activities (user_id, work_id, kind, status)
        values (${input.userUuid}, ${input.workId}::uuid, ${input.kind}::activity_kind,
          ${input.status}::reading_status)
        returning id::text, user_id as "userUuid", work_id::text as "workId", kind, status,
          created_at as "createdAt"
      `,
    );
    const row = rows[0];
    if (!row) throw new Error('activity save did not return an activity');
    return toActivity(row);
  }

  async deleteFollow(
    context: TransactionContext,
    followerUserUuid: string,
    followedUserUuid: string,
  ): Promise<void> {
    await this.#foundation.withSession(
      context,
      (session) =>
        session`
        delete from user_follows
        where follower_user_id = ${followerUserUuid} and followed_user_id = ${followedUserUuid}
      `,
    );
  }

  async findFollow(followerUserUuid: string, followedUserUuid: string): Promise<UserFollow | null> {
    const rows = await this.#client<FollowRow[]>`
      select follower_user_id as "followerUserUuid", followed_user_id as "followedUserUuid",
        status, created_at as "createdAt", responded_at as "respondedAt"
      from user_follows
      where follower_user_id = ${followerUserUuid} and followed_user_id = ${followedUserUuid}
    `;
    return rows[0] ? toFollow(rows[0]) : null;
  }

  async findFollowTarget(userUuid: string): Promise<FollowTarget | null> {
    const rows = await this.#client<FollowTarget[]>`
      select account_status as "accountStatus", default_visibility as visibility
      from profiles where user_id = ${userUuid}
    `;
    return rows[0] ?? null;
  }

  async findUserUuidByPublicId(publicId: string): Promise<string | null> {
    const rows = await this.#client<{ userUuid: string }[]>`
      select user_id as "userUuid" from profiles
      where public_id = ${publicId} and account_status = 'active'
    `;
    return rows[0]?.userUuid ?? null;
  }

  async listFollowers(userUuid: string): Promise<readonly UserFollow[]> {
    const rows = await this.#client<FollowRow[]>`
      select follower_user_id as "followerUserUuid", followed_user_id as "followedUserUuid",
        status, created_at as "createdAt", responded_at as "respondedAt"
      from user_follows where followed_user_id = ${userUuid}
      order by created_at desc, follower_user_id
    `;
    return rows.map(toFollow);
  }

  async listFollowing(userUuid: string): Promise<readonly UserFollow[]> {
    const rows = await this.#client<FollowRow[]>`
      select follower_user_id as "followerUserUuid", followed_user_id as "followedUserUuid",
        status, created_at as "createdAt", responded_at as "respondedAt"
      from user_follows where follower_user_id = ${userUuid}
      order by created_at desc, followed_user_id
    `;
    return rows.map(toFollow);
  }

  async listTimeline(
    userUuid: string,
    cursor: string | null,
    limit: number,
  ): Promise<TimelinePage> {
    const decoded = decodeCursor(cursor);
    const rows = decoded
      ? await this.#client<ActivityRow[]>`
          select activity.id::text, activity.user_id as "userUuid", activity.work_id::text as "workId",
            activity.kind, activity.status, activity.created_at as "createdAt"
          from activities as activity
          join user_follows as follow on follow.followed_user_id = activity.user_id
            and follow.follower_user_id = ${userUuid} and follow.status = 'accepted'
          join library_entries as entry on entry.user_id = activity.user_id and entry.work_id = activity.work_id
          join profiles as profile on profile.user_id = activity.user_id
          where profile.account_status = 'active'
            and coalesce(entry.visibility, profile.default_visibility, 'private'::visibility) in ('public', 'followers')
            and (activity.created_at, activity.id) < (${decoded.createdAt}, ${decoded.id}::uuid)
          order by activity.created_at desc, activity.id desc limit ${limit + 1}
        `
      : await this.#client<ActivityRow[]>`
          select activity.id::text, activity.user_id as "userUuid", activity.work_id::text as "workId",
            activity.kind, activity.status, activity.created_at as "createdAt"
          from activities as activity
          join user_follows as follow on follow.followed_user_id = activity.user_id
            and follow.follower_user_id = ${userUuid} and follow.status = 'accepted'
          join library_entries as entry on entry.user_id = activity.user_id and entry.work_id = activity.work_id
          join profiles as profile on profile.user_id = activity.user_id
          where profile.account_status = 'active'
            and coalesce(entry.visibility, profile.default_visibility, 'private'::visibility) in ('public', 'followers')
          order by activity.created_at desc, activity.id desc limit ${limit + 1}
        `;
    const hasNext = rows.length > limit;
    const items = rows.slice(0, limit).map(toActivity);
    const last = items.at(-1);
    return {
      items,
      nextCursor: hasNext && last ? `${last.createdAt.toISOString()}|${last.id}` : null,
    };
  }

  async saveFollow(context: TransactionContext, follow: UserFollow): Promise<UserFollow> {
    const rows = await this.#foundation.withSession(
      context,
      (session) =>
        session<FollowRow[]>`
        insert into user_follows (follower_user_id, followed_user_id, status, created_at, responded_at)
        values (${follow.followerUserUuid}, ${follow.followedUserUuid}, ${follow.status}::follow_status,
          ${follow.createdAt}, ${follow.respondedAt})
        on conflict (follower_user_id, followed_user_id) do update
        set status = excluded.status, created_at = excluded.created_at, responded_at = excluded.responded_at
        returning follower_user_id as "followerUserUuid", followed_user_id as "followedUserUuid",
          status, created_at as "createdAt", responded_at as "respondedAt"
      `,
    );
    const row = rows[0];
    if (!row) throw new Error('follow save did not return a follow');
    return toFollow(row);
  }

  async close(): Promise<void> {
    await this.#client.end({ timeout: 1 });
  }
}

export const createPostgresSocial = (
  databaseUrl: string,
  foundation: PostgresFoundation,
): PostgresSocial => new PostgresSocial(databaseUrl, foundation);
