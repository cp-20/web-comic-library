import { deliverQueuedEmailDigests } from '@web-comic-library/application';
import { createPostgresEmailDigest, createPostgresFoundation } from '@web-comic-library/db';
import { createEmailDigestMessage, type EmailSender } from '@web-comic-library/notifications';

export type EmailDigestWorkerHandler = () => Promise<void>;

export const createEmailDigestWorkerHandler = (
  databaseUrl: string,
  sender: EmailSender,
  notificationsUrl: string,
): EmailDigestWorkerHandler => {
  return async () => {
    const foundation = createPostgresFoundation(databaseUrl);
    const digests = createPostgresEmailDigest(databaseUrl, foundation);
    try {
      await deliverQueuedEmailDigests(
        digests,
        {
          async send(recipient, input) {
            return sender.send(
              recipient,
              createEmailDigestMessage(input.notificationCount, input.url),
            );
          },
        },
        new Date(),
        notificationsUrl,
      );
    } finally {
      await Promise.all([foundation.close(), digests.close()]);
    }
  };
};
