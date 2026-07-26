import { generateInAppNotifications } from '@web-comic-library/application';
import { createPostgresFoundation, createPostgresNotification } from '@web-comic-library/db';

export type NotificationWorkerHandler = (eventId: string) => Promise<void>;

export const createNotificationWorkerHandler = (databaseUrl: string): NotificationWorkerHandler => {
  return async (eventId) => {
    const foundation = createPostgresFoundation(databaseUrl);
    const notifications = createPostgresNotification(databaseUrl, foundation);
    try {
      await generateInAppNotifications(foundation, notifications, eventId);
    } finally {
      await Promise.all([foundation.close(), notifications.close()]);
    }
  };
};
