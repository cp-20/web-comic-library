import type {
  ModerationQueuePage,
  ModerationRepository,
  TransactionContext,
} from '@web-comic-library/application';
import type {
  ModerationAction,
  ModerationActionKind,
  ModerationActor,
  Report,
  ReportStatus,
  UserBlock,
  UserMute,
} from '@web-comic-library/domain';
import postgres from 'postgres';
import type { Sql } from 'postgres';

import type { PostgresFoundation } from './foundation';

type ReportRow = Readonly<{
  createdAt: Date;
  id: string;
  reason: string;
  reporterUserUuid: string;
  status: ReportStatus;
  targetId: string;
  targetKind: Report['targetKind'];
  updatedAt: Date;
}>;

type ActionRow = Readonly<{
  action: ModerationActionKind;
  actorUserUuid: string;
  after: ModerationAction['after'];
  before: ModerationAction['before'];
  createdAt: Date;
  id: string;
  reason: string;
  reportId: string | null;
  targetId: string;
  targetKind: ModerationAction['targetKind'];
}>;

const toReport = (row: ReportRow): Report => row;
const toAction = (row: ActionRow): ModerationAction => row;

export class PostgresModeration implements ModerationRepository {
  readonly #client: Sql;
  readonly #foundation: PostgresFoundation;

  constructor(databaseUrl: string, foundation: PostgresFoundation) {
    this.#client = postgres(databaseUrl);
    this.#foundation = foundation;
  }

  async createBlock(context: TransactionContext, block: UserBlock): Promise<boolean> {
    const rows = await this.#foundation.withSession(
      context,
      (session) =>
        session<{ blockerUserUuid: string }[]>`
        insert into user_blocks (blocker_user_id, blocked_user_id, created_at)
        values (${block.blockerUserUuid}, ${block.blockedUserUuid}, ${block.createdAt})
        on conflict do nothing returning blocker_user_id as "blockerUserUuid"
      `,
    );
    return rows.length === 1;
  }

  async createMute(context: TransactionContext, mute: UserMute): Promise<boolean> {
    const rows = await this.#foundation.withSession(
      context,
      (session) =>
        session<{ muterUserUuid: string }[]>`
        insert into user_mutes (muter_user_id, muted_user_id, created_at)
        values (${mute.muterUserUuid}, ${mute.mutedUserUuid}, ${mute.createdAt})
        on conflict do nothing returning muter_user_id as "muterUserUuid"
      `,
    );
    return rows.length === 1;
  }

  async createReport(context: TransactionContext, report: Report): Promise<Report> {
    const rows = await this.#foundation.withSession(
      context,
      (session) =>
        session<ReportRow[]>`
        insert into reports (
          id, reporter_user_id, target_kind, target_id, reason, status, created_at, updated_at
        ) values (
          ${report.id}::uuid, ${report.reporterUserUuid}, ${report.targetKind}::report_target_kind,
          ${report.targetId}, ${report.reason}, ${report.status}::report_status,
          ${report.createdAt}, ${report.updatedAt}
        ) on conflict (reporter_user_id, target_kind, target_id) do update
        set reason = excluded.reason, status = 'open'::report_status, updated_at = excluded.updated_at
        returning id::text, reporter_user_id as "reporterUserUuid", target_kind as "targetKind",
          target_id as "targetId", reason, status, created_at as "createdAt", updated_at as "updatedAt"
      `,
    );
    const saved = rows[0];
    if (!saved) throw new Error('report save did not return a report');
    return toReport(saved);
  }

  async deleteBlock(
    context: TransactionContext,
    blockerUserUuid: string,
    blockedUserUuid: string,
  ): Promise<boolean> {
    const result = await this.#foundation.withSession(
      context,
      (session) =>
        session`delete from user_blocks where blocker_user_id = ${blockerUserUuid} and blocked_user_id = ${blockedUserUuid}`,
    );
    return result.count > 0;
  }

  async deleteMute(
    context: TransactionContext,
    muterUserUuid: string,
    mutedUserUuid: string,
  ): Promise<boolean> {
    const result = await this.#foundation.withSession(
      context,
      (session) =>
        session`delete from user_mutes where muter_user_id = ${muterUserUuid} and muted_user_id = ${mutedUserUuid}`,
    );
    return result.count > 0;
  }

  async findReport(id: string): Promise<Report | null> {
    const rows = await this.#client<ReportRow[]>`
      select id::text, reporter_user_id as "reporterUserUuid", target_kind as "targetKind", target_id as "targetId",
        reason, status, created_at as "createdAt", updated_at as "updatedAt"
      from reports where id = ${id}::uuid
    `;
    return rows[0] ? toReport(rows[0]) : null;
  }

  async listModerationActions(reportId: string | null): Promise<readonly ModerationAction[]> {
    const rows = reportId
      ? await this.#client<ActionRow[]>`
          select id::text, report_id::text as "reportId", actor_user_id as "actorUserUuid", action,
            target_kind as "targetKind", target_id as "targetId", reason,
            before_state as before, after_state as after, created_at as "createdAt"
          from moderation_actions where report_id = ${reportId}::uuid order by created_at desc, id desc
        `
      : await this.#client<ActionRow[]>`
          select id::text, report_id::text as "reportId", actor_user_id as "actorUserUuid", action,
            target_kind as "targetKind", target_id as "targetId", reason,
            before_state as before, after_state as after, created_at as "createdAt"
          from moderation_actions order by created_at desc, id desc limit 100
        `;
    return rows.map(toAction);
  }

  async listReports(status: ReportStatus | null): Promise<ModerationQueuePage> {
    const rows = status
      ? await this.#client<ReportRow[]>`
          select id::text, reporter_user_id as "reporterUserUuid", target_kind as "targetKind", target_id as "targetId",
            reason, status, created_at as "createdAt", updated_at as "updatedAt"
          from reports where status = ${status}::report_status order by updated_at asc, id asc
        `
      : await this.#client<ReportRow[]>`
          select id::text, reporter_user_id as "reporterUserUuid", target_kind as "targetKind", target_id as "targetId",
            reason, status, created_at as "createdAt", updated_at as "updatedAt"
          from reports order by updated_at asc, id asc
        `;
    return { items: rows.map(toReport) };
  }

  async moderate(
    context: TransactionContext,
    input: Readonly<{
      action: ModerationActionKind;
      actor: ModerationActor;
      reason: string;
      reportId: string | null;
      targetId: string;
      targetKind: 'activity' | 'profile';
    }>,
  ): Promise<ModerationAction | null> {
    return this.#foundation.withSession(context, async (session) => {
      const before =
        input.targetKind === 'activity'
          ? await session<
              { hiddenAt: Date | null }[]
            >`select hidden_at as "hiddenAt" from activities where id = ${input.targetId}::uuid`
          : await session<
              { accountStatus: string }[]
            >`select account_status::text as "accountStatus" from profiles where user_id = ${input.targetId}`;
      const prior = before[0];
      if (!prior) return null;
      const next =
        input.targetKind === 'activity'
          ? input.action === 'warn' || input.action === 'suspend'
            ? before
            : await session<{ hiddenAt: Date | null }[]>`
                update activities set hidden_at = ${input.action === 'hide' ? new Date() : null}
                where id = ${input.targetId}::uuid returning hidden_at as "hiddenAt"
              `
          : input.action === 'warn' || input.action === 'hide'
            ? before
            : await session<{ accountStatus: string }[]>`
                update profiles set account_status = ${input.action === 'suspend' ? 'disabled' : 'active'}::account_status,
                  updated_at = now() where user_id = ${input.targetId}
                returning account_status::text as "accountStatus"
              `;
      const after = next[0];
      if (!after) return null;
      if (input.reportId !== null) {
        await session`update reports set status = 'resolved'::report_status, updated_at = now() where id = ${input.reportId}::uuid`;
      }
      const rows = await session<ActionRow[]>`
        insert into moderation_actions (
          report_id, actor_user_id, action, target_kind, target_id, reason, before_state, after_state
        ) values (
          ${input.reportId}::uuid, ${input.actor.id}, ${input.action}::moderation_action_kind,
          ${input.targetKind}, ${input.targetId}, ${input.reason}, ${JSON.stringify(prior)}::jsonb,
          ${JSON.stringify(after)}::jsonb
        ) returning id::text, report_id::text as "reportId", actor_user_id as "actorUserUuid", action,
          target_kind as "targetKind", target_id as "targetId", reason, before_state as before,
          after_state as after, created_at as "createdAt"
      `;
      return rows[0] ? toAction(rows[0]) : null;
    });
  }

  async removeMutualFollows(
    context: TransactionContext,
    firstUserUuid: string,
    secondUserUuid: string,
  ): Promise<void> {
    await this.#foundation.withSession(context, async (session) => {
      await session`
        delete from user_follows where (follower_user_id = ${firstUserUuid} and followed_user_id = ${secondUserUuid})
          or (follower_user_id = ${secondUserUuid} and followed_user_id = ${firstUserUuid})
      `;
      await session`
        delete from profile_followers where (follower_user_id = ${firstUserUuid} and followed_user_id = ${secondUserUuid})
          or (follower_user_id = ${secondUserUuid} and followed_user_id = ${firstUserUuid})
      `;
    });
  }

  async close(): Promise<void> {
    await this.#client.end({ timeout: 1 });
  }
}

export const createPostgresModeration = (
  databaseUrl: string,
  foundation: PostgresFoundation,
): PostgresModeration => new PostgresModeration(databaseUrl, foundation);
