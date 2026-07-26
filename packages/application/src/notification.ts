import type {
  FollowReleaseCandidate,
  Notification,
  NotificationChannel,
  NotificationKind,
  NotificationPreference,
} from '@web-comic-library/domain';
import {
  createNotification,
  defaultNotificationEnabled,
  notificationIdempotencyKey,
  selectFollowReleaseCandidates,
} from '@web-comic-library/domain';

import type { FollowRepository, FollowSettings } from './follow';
import type { TransactionContext, TransactionPort } from './persistence';

export type NotificationReleaseEvent = Readonly<{
  candidates: readonly FollowReleaseCandidate[];
  id: string;
  kind: NotificationKind;
  notificationSuppressed: boolean;
  workId: string;
}>;

export type NotificationPage = Readonly<{
  items: readonly Notification[];
  nextCursor: string | null;
}>;

export interface NotificationRepository extends FollowRepository {
  findNotificationPreference(
    userUuid: string,
    kind: NotificationKind,
    channel: NotificationChannel,
  ): Promise<NotificationPreference | null>;
  findReleaseEvent(eventId: string): Promise<NotificationReleaseEvent | null>;
  listNotifications(
    userUuid: string,
    cursor: string | null,
    limit: number,
  ): Promise<NotificationPage>;
  listWorkFollowSettings(workId: string): Promise<readonly FollowSettings[]>;
  markAllNotificationsRead(
    context: TransactionContext,
    userUuid: string,
    readAt: Date,
  ): Promise<void>;
  markNotificationRead(
    context: TransactionContext,
    userUuid: string,
    notificationId: string,
    readAt: Date,
  ): Promise<boolean>;
  saveNotification(context: TransactionContext, notification: Notification): Promise<boolean>;
  saveNotificationPreference(
    context: TransactionContext,
    preference: NotificationPreference,
  ): Promise<void>;
  unreadNotificationCount(userUuid: string): Promise<number>;
}

const isEnabled = async (
  repository: NotificationRepository,
  userUuid: string,
  kind: NotificationKind,
  channel: NotificationChannel,
): Promise<boolean> => {
  const preference = await repository.findNotificationPreference(userUuid, kind, channel);
  return preference?.enabled ?? defaultNotificationEnabled(kind, channel);
};

export const generateNotifications = async (
  transactions: TransactionPort,
  repository: NotificationRepository,
  channel: NotificationChannel,
  eventId: string,
  now: Date = new Date(),
): Promise<number> => {
  const event = await repository.findReleaseEvent(eventId);
  if (!event || event.notificationSuppressed) return 0;
  const settings = await repository.listWorkFollowSettings(event.workId);
  let created = 0;
  // oxlint-disable no-await-in-loop -- Each independent insert is idempotent and a failure must be retried by the worker.
  for (const setting of settings) {
    const [preferences, publicationIds, enabled] = await Promise.all([
      repository.listSourcePreferences(setting.userUuid),
      repository.listSubscriptionPublicationIds(setting.userUuid, setting.workId),
      isEnabled(repository, setting.userUuid, event.kind, channel),
    ]);
    if (!enabled) continue;
    const selected = selectFollowReleaseCandidates(
      setting.mode,
      event.candidates,
      preferences,
      publicationIds,
    );
    if (!selected.some((candidate) => candidate.eventId === event.id)) continue;
    const notification = createNotification({
      channel,
      createdAt: now,
      eventId: event.id,
      id: crypto.randomUUID(),
      idempotencyKey: notificationIdempotencyKey(setting.userUuid, event.id, channel, event.kind),
      kind: event.kind,
      readAt: null,
      userUuid: setting.userUuid,
    });
    const inserted = await transactions.transaction((context) =>
      repository.saveNotification(context, notification),
    );
    created += inserted ? 1 : 0;
  }
  // oxlint-enable no-await-in-loop
  return created;
};

export const generateInAppNotifications = (
  transactions: TransactionPort,
  repository: NotificationRepository,
  eventId: string,
  now?: Date,
): Promise<number> => generateNotifications(transactions, repository, 'in_app', eventId, now);

export const setNotificationPreference = async (
  transactions: TransactionPort,
  repository: NotificationRepository,
  preference: NotificationPreference,
): Promise<void> => {
  await transactions.transaction((context) =>
    repository.saveNotificationPreference(context, preference),
  );
};

export const readNotification = async (
  transactions: TransactionPort,
  repository: NotificationRepository,
  userUuid: string,
  notificationId: string,
  now: Date = new Date(),
): Promise<boolean> => {
  if (!notificationId.trim()) throw new Error('notification ID must not be empty');
  return transactions.transaction((context) =>
    repository.markNotificationRead(context, userUuid, notificationId, now),
  );
};

export const readAllNotifications = async (
  transactions: TransactionPort,
  repository: NotificationRepository,
  userUuid: string,
  now: Date = new Date(),
): Promise<void> => {
  await transactions.transaction((context) =>
    repository.markAllNotificationsRead(context, userUuid, now),
  );
};
