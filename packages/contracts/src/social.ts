import {
  boolean,
  maxLength,
  minLength,
  nullable,
  object,
  optional,
  picklist,
  pipe,
  regex,
  string,
  trim,
  uuid,
} from 'valibot';

const text = pipe(string(), trim());

export const socialProfileParamsSchema = object({
  userId: pipe(text, regex(/^[a-z0-9-]{3,32}$/u)),
});

export const followResponseRequestSchema = object({
  response: picklist(['accepted', 'rejected']),
});

export const followRequestParamsSchema = object({ userId: pipe(string(), uuid()) });

export const timelineQuerySchema = object({
  cursor: optional(pipe(text, regex(/^.+\|[0-9a-f-]{36}$/u))),
  limit: optional(pipe(text, regex(/^\d+$/u))),
});

const reviewId = pipe(string(), uuid());
export const createReviewRequestSchema = object({
  body: pipe(string(), trim(), minLength(1), maxLength(1_000)),
  contentUnitId: nullable(reviewId),
  spoiler: boolean(),
  visibility: picklist(['public', 'followers', 'private']),
  volumeEditionId: nullable(reviewId),
  workId: reviewId,
});

export const updateReviewRequestSchema = object({
  body: pipe(string(), trim(), minLength(1), maxLength(1_000)),
  spoiler: boolean(),
  visibility: picklist(['public', 'followers', 'private']),
});

export const reviewParamsSchema = object({ id: reviewId });

export const activityParamsSchema = object({ id: reviewId });

export const reviewListQuerySchema = object({
  contentUnitId: optional(reviewId),
  volumeEditionId: optional(reviewId),
});
