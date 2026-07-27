import type {
  ModerationAction,
  ModerationActionKind,
  ModerationActor,
  Report,
  ReportStatus,
  ReportTargetKind,
  UserBlock,
  UserMute,
} from '@web-comic-library/domain';
import {
  canModerate,
  canSuspend,
  createReport,
  requireModerationReason,
} from '@web-comic-library/domain';

import type { TransactionContext, TransactionPort } from './persistence';

export type ModerationQueuePage = Readonly<{
  items: readonly Report[];
}>;

export interface ModerationRepository {
  createBlock(context: TransactionContext, block: UserBlock): Promise<boolean>;
  createMute(context: TransactionContext, mute: UserMute): Promise<boolean>;
  createReport(context: TransactionContext, report: Report): Promise<Report>;
  deleteBlock(
    context: TransactionContext,
    blockerUserUuid: string,
    blockedUserUuid: string,
  ): Promise<boolean>;
  deleteMute(
    context: TransactionContext,
    muterUserUuid: string,
    mutedUserUuid: string,
  ): Promise<boolean>;
  findReport(id: string): Promise<Report | null>;
  listModerationActions(reportId: string | null): Promise<readonly ModerationAction[]>;
  listReports(status: ReportStatus | null): Promise<ModerationQueuePage>;
  moderate(
    context: TransactionContext,
    input: Readonly<{
      action: ModerationActionKind;
      actor: ModerationActor;
      reason: string;
      reportId: string | null;
      targetId: string;
      targetKind: 'activity' | 'profile';
    }>,
  ): Promise<ModerationAction | null>;
  removeMutualFollows(
    context: TransactionContext,
    firstUserUuid: string,
    secondUserUuid: string,
  ): Promise<void>;
}

const requireOtherUser = (actorUserUuid: string, targetUserUuid: string): void => {
  if (!actorUserUuid.trim() || !targetUserUuid.trim() || actorUserUuid === targetUserUuid) {
    throw new Error('a moderation relationship requires two different users');
  }
};

export const blockUser = async (
  transactions: TransactionPort,
  repository: ModerationRepository,
  blockerUserUuid: string,
  blockedUserUuid: string,
  now: Date = new Date(),
): Promise<boolean> => {
  requireOtherUser(blockerUserUuid, blockedUserUuid);
  return transactions.transaction(async (context) => {
    await repository.removeMutualFollows(context, blockerUserUuid, blockedUserUuid);
    return repository.createBlock(context, { blockedUserUuid, blockerUserUuid, createdAt: now });
  });
};

export const unblockUser = (
  transactions: TransactionPort,
  repository: ModerationRepository,
  blockerUserUuid: string,
  blockedUserUuid: string,
): Promise<boolean> => {
  requireOtherUser(blockerUserUuid, blockedUserUuid);
  return transactions.transaction((context) =>
    repository.deleteBlock(context, blockerUserUuid, blockedUserUuid),
  );
};

export const muteUser = (
  transactions: TransactionPort,
  repository: ModerationRepository,
  muterUserUuid: string,
  mutedUserUuid: string,
  now: Date = new Date(),
): Promise<boolean> => {
  requireOtherUser(muterUserUuid, mutedUserUuid);
  return transactions.transaction((context) =>
    repository.createMute(context, { createdAt: now, mutedUserUuid, muterUserUuid }),
  );
};

export const unmuteUser = (
  transactions: TransactionPort,
  repository: ModerationRepository,
  muterUserUuid: string,
  mutedUserUuid: string,
): Promise<boolean> => {
  requireOtherUser(muterUserUuid, mutedUserUuid);
  return transactions.transaction((context) =>
    repository.deleteMute(context, muterUserUuid, mutedUserUuid),
  );
};

export const submitReport = (
  transactions: TransactionPort,
  repository: ModerationRepository,
  input: Readonly<{
    reason: string;
    reporterUserUuid: string;
    targetId: string;
    targetKind: ReportTargetKind;
  }>,
): Promise<Report> => {
  const report = createReport(input);
  return transactions.transaction((context) => repository.createReport(context, report));
};

export const performModeration = async (
  transactions: TransactionPort,
  repository: ModerationRepository,
  input: Readonly<{
    action: ModerationActionKind;
    actor: ModerationActor;
    reason: string;
    reportId: string | null;
    targetId: string;
    targetKind: 'activity' | 'profile';
  }>,
): Promise<ModerationAction> => {
  if (!canModerate(input.actor)) throw new Error('moderation requires a moderator');
  if ((input.action === 'suspend' || input.action === 'restore') && !canSuspend(input.actor)) {
    throw new Error('suspension and restoration require an administrator');
  }
  const reason = requireModerationReason(input.reason);
  if (input.reportId !== null && !(await repository.findReport(input.reportId))) {
    throw new Error('report is unavailable');
  }
  const action = await transactions.transaction((context) =>
    repository.moderate(context, { ...input, reason }),
  );
  if (!action) throw new Error('moderation target is unavailable');
  return action;
};
