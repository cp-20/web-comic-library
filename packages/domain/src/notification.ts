import type { ReleaseEventKind } from './release';

export const notificationChannels = ['in_app', 'web_push', 'email'] as const;

export type NotificationChannel = (typeof notificationChannels)[number];

export const notificationKinds = [
  'announcement',
  'availability_changed',
  'extra',
  'new_episode',
  'new_volume',
  'republication',
] as const satisfies readonly ReleaseEventKind[];

export type NotificationKind = (typeof notificationKinds)[number];

export type Notification = Readonly<{
  channel: NotificationChannel;
  createdAt: Date;
  eventId: string;
  id: string;
  idempotencyKey: string;
  kind: NotificationKind;
  readAt: Date | null;
  userUuid: string;
}>;

export type NotificationPreference = Readonly<{
  channel: NotificationChannel;
  enabled: boolean;
  kind: NotificationKind;
  userUuid: string;
}>;

const requireText = (value: string, name: string): string => {
  if (!value.trim()) throw new Error(`${name} must not be empty`);
  return value;
};

export const defaultNotificationEnabled = (
  kind: NotificationKind,
  channel: NotificationChannel = 'in_app',
): boolean =>
  channel === 'in_app' && (kind === 'new_episode' || kind === 'extra' || kind === 'new_volume');

export const notificationIdempotencyKey = (
  userUuid: string,
  eventId: string,
  channel: NotificationChannel,
  kind: NotificationKind,
): string => {
  requireText(userUuid, 'notification user UUID');
  requireText(eventId, 'notification event ID');
  return `notification:${userUuid}:${eventId}:${channel}:${kind}`;
};

export const createNotification = (input: Notification): Notification => {
  if (!notificationChannels.includes(input.channel))
    throw new Error('notification channel is invalid');
  if (!notificationKinds.includes(input.kind)) throw new Error('notification kind is invalid');
  if (!(input.createdAt instanceof Date) || Number.isNaN(input.createdAt.valueOf())) {
    throw new Error('notification creation time must be valid');
  }
  if (input.readAt !== null && Number.isNaN(input.readAt.valueOf())) {
    throw new Error('notification read time must be valid');
  }
  return {
    ...input,
    eventId: requireText(input.eventId, 'notification event ID'),
    id: requireText(input.id, 'notification ID'),
    idempotencyKey: requireText(input.idempotencyKey, 'notification idempotency key'),
    userUuid: requireText(input.userUuid, 'notification user UUID'),
  };
};
