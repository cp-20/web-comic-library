import { object, optional, picklist, pipe, regex, string, trim, uuid } from 'valibot';

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
