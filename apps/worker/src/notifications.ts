import {
  deliverWebPushForRelease,
  generateInAppNotifications,
  generateNotifications,
  type WebPushSenderPort,
} from '@web-comic-library/application';
import {
  createPostgresFoundation,
  createPostgresNotification,
  createPostgresWebPushSubscription,
} from '@web-comic-library/db';

export type NotificationWorkerHandler = (eventId: string) => Promise<void>;

export const createNotificationWorkerHandler = (
  databaseUrl: string,
  sender: WebPushSenderPort | null = null,
): NotificationWorkerHandler => {
  return async (eventId) => {
    const foundation = createPostgresFoundation(databaseUrl);
    const notifications = createPostgresNotification(databaseUrl, foundation);
    const subscriptions = createPostgresWebPushSubscription(databaseUrl, foundation);
    try {
      await generateInAppNotifications(foundation, notifications, eventId);
      if (sender) {
        await generateNotifications(foundation, notifications, 'web_push', eventId);
        await deliverWebPushForRelease(subscriptions, sender, eventId);
      }
    } finally {
      await Promise.all([foundation.close(), notifications.close(), subscriptions.close()]);
    }
  };
};
