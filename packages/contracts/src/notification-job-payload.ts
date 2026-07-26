import { object, parse, pipe, string, uuid } from 'valibot';
import type { InferOutput } from 'valibot';

export const notificationJobPayloadSchema = object({ eventId: pipe(string(), uuid()) });

export type NotificationJobPayload = InferOutput<typeof notificationJobPayloadSchema>;

export const parseNotificationJobPayload = (input: unknown): NotificationJobPayload =>
  parse(notificationJobPayloadSchema, input);
