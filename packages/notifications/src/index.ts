import type { WebPushSubscription } from '@web-comic-library/domain';
import webPush from 'web-push';

export { createEmailDigestMessage, createResendEmailSender } from './email-digest';
export type { EmailDeliveryOutcome, EmailDigestMessage, EmailSender } from './email-digest';
export { verifyResendEmailFeedback } from './resend-webhook';
export type { ResendEmailFeedback } from './resend-webhook';

export type WebPushPayload = Readonly<{
  notificationId: string;
  url: string;
}>;

export type WebPushDeliveryOutcome = 'delivered' | 'permanent_failure' | 'retryable_failure';

export type WebPushSender = Readonly<{
  send(subscription: WebPushSubscription, payload: WebPushPayload): Promise<WebPushDeliveryOutcome>;
}>;

export type WebPushConfiguration = Readonly<{
  privateKey: string;
  publicKey: string;
  subject: string;
}>;

type WebPushClient = Readonly<{
  sendNotification(
    subscription: Readonly<{
      endpoint: string;
      keys: Readonly<{ auth: string; p256dh: string }>;
    }>,
    payload: string,
    options: Readonly<{ TTL: number; vapidDetails: WebPushConfiguration }>,
  ): Promise<unknown>;
}>;

const statusCode = (error: unknown): number | null => {
  if (typeof error !== 'object' || error === null || !('statusCode' in error)) return null;
  const value = error.statusCode;
  return typeof value === 'number' ? value : null;
};

export const classifyWebPushFailure = (error: unknown): WebPushDeliveryOutcome => {
  const status = statusCode(error);
  if (status === 404 || status === 410) return 'permanent_failure';
  return 'retryable_failure';
};

export const createWebPushSender = (
  configuration: WebPushConfiguration,
  client: WebPushClient = webPush,
): WebPushSender => ({
  async send(subscription, payload): Promise<WebPushDeliveryOutcome> {
    try {
      await client.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: { auth: subscription.auth, p256dh: subscription.p256dh },
        },
        JSON.stringify(payload),
        { TTL: 300, vapidDetails: configuration },
      );
      return 'delivered';
    } catch (error) {
      return classifyWebPushFailure(error);
    }
  },
});
