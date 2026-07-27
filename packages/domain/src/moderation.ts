export const moderationRoles = ['user', 'moderator', 'administrator'] as const;

export type ModerationRole = (typeof moderationRoles)[number];

export const reportTargetKinds = ['profile', 'activity', 'reaction'] as const;

export type ReportTargetKind = (typeof reportTargetKinds)[number];

export const reportStatuses = ['open', 'reviewing', 'resolved', 'dismissed'] as const;

export type ReportStatus = (typeof reportStatuses)[number];

export const moderationActionKinds = ['hide', 'warn', 'suspend', 'restore'] as const;

export type ModerationActionKind = (typeof moderationActionKinds)[number];

export type UserBlock = Readonly<{
  blockedUserUuid: string;
  blockerUserUuid: string;
  createdAt: Date;
}>;

export type UserMute = Readonly<{
  createdAt: Date;
  mutedUserUuid: string;
  muterUserUuid: string;
}>;

export type Report = Readonly<{
  createdAt: Date;
  id: string;
  reason: string;
  reporterUserUuid: string;
  status: ReportStatus;
  targetId: string;
  targetKind: ReportTargetKind;
  updatedAt: Date;
}>;

export type ModerationAction = Readonly<{
  action: ModerationActionKind;
  actorUserUuid: string;
  after: Readonly<Record<string, string | boolean | null>>;
  before: Readonly<Record<string, string | boolean | null>>;
  createdAt: Date;
  id: string;
  reason: string;
  reportId: string | null;
  targetId: string;
  targetKind: 'activity' | 'profile';
}>;

export type ModerationActor = Readonly<{
  id: string;
  role: ModerationRole;
}>;

const text = (value: string, field: string, maximum: number): string => {
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum)
    throw new Error(`${field} must be 1 to ${maximum} characters`);
  return normalized;
};

export const createReport = (
  input: Omit<Report, 'createdAt' | 'id' | 'status' | 'updatedAt'>,
  now: Date = new Date(),
): Report => ({
  createdAt: now,
  id: crypto.randomUUID(),
  reason: text(input.reason, 'report reason', 2_000),
  reporterUserUuid: text(input.reporterUserUuid, 'reporter user id', 200),
  status: 'open',
  targetId: text(input.targetId, 'report target id', 200),
  targetKind: input.targetKind,
  updatedAt: now,
});

export const canModerate = (actor: ModerationActor): boolean =>
  actor.role === 'moderator' || actor.role === 'administrator';

export const canSuspend = (actor: ModerationActor): boolean => actor.role === 'administrator';

export const requireModerationReason = (reason: string): string =>
  text(reason, 'moderation reason', 2_000);
