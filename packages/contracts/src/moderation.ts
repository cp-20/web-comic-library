import {
  maxLength,
  minLength,
  nullable,
  object,
  optional,
  picklist,
  pipe,
  string,
  trim,
  uuid,
} from 'valibot';

const text = pipe(string(), trim());

export const reportRequestSchema = object({
  reason: pipe(text, minLength(1), maxLength(2_000)),
  targetId: pipe(text, minLength(1), maxLength(200)),
  targetKind: picklist(['profile', 'activity', 'reaction']),
});

export const moderationReportsQuerySchema = object({
  status: optional(picklist(['open', 'reviewing', 'resolved', 'dismissed'])),
});

export const moderationActionsQuerySchema = object({
  reportId: optional(pipe(string(), uuid())),
});

export const moderationReportParamsSchema = object({ id: pipe(string(), uuid()) });

export const moderationActionRequestSchema = object({
  action: picklist(['hide', 'warn', 'suspend', 'restore']),
  reason: pipe(text, minLength(1), maxLength(2_000)),
  targetId: pipe(text, minLength(1), maxLength(200)),
  targetKind: picklist(['profile', 'activity']),
});

export const nullableReportIdSchema = nullable(pipe(string(), uuid()));
