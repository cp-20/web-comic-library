import { generateInAppNotifications } from '@web-comic-library/application';
import { createPostgresFoundation, createPostgresNotification } from '@web-comic-library/db';

export type NotificationWorkerHandler = (eventId: string) => Promise<void>;

export const createNotificationWorkerHandler = (databaseUrl: string): NotificationWorkerHandler => {
  const foundation = createPostgresFoundation(databaseUrl);
  const notifications = createPostgresNotification(databaseUrl, foundation);
  return async (eventId) => {
    await generateInAppNotifications(foundation, notifications, eventId);
  };
};
