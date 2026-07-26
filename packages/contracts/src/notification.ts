import {
  boolean,
  minLength,
  object,
  optional,
  picklist,
  pipe,
  regex,
  string,
  trim,
  uuid,
} from 'valibot';

const id = pipe(string(), uuid());

export const notificationListQuerySchema = object({
  cursor: optional(pipe(string(), trim(), minLength(1))),
  limit: optional(pipe(string(), trim(), regex(/^\d+$/u))),
});

export const notificationParamsSchema = object({ id });

export const setNotificationPreferenceRequestSchema = object({
  channel: picklist(['in_app', 'web_push', 'email']),
  enabled: boolean(),
  kind: picklist([
    'announcement',
    'availability_changed',
    'extra',
    'new_episode',
    'new_volume',
    'republication',
  ]),
});
