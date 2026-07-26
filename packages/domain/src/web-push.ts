export type WebPushSubscription = Readonly<{
  auth: string;
  endpoint: string;
  id: string;
  p256dh: string;
  userUuid: string;
}>;

export const webPushDeliveryIdempotencyKey = (
  notificationId: string,
  subscriptionId: string,
): string => {
  if (!notificationId.trim()) throw new Error('web push notification ID must not be empty');
  if (!subscriptionId.trim()) throw new Error('web push subscription ID must not be empty');
  return `web-push:${notificationId}:${subscriptionId}`;
};

export const createWebPushSubscription = (input: WebPushSubscription): WebPushSubscription => {
  if (!input.id.trim()) throw new Error('web push subscription ID must not be empty');
  if (!input.userUuid.trim()) throw new Error('web push subscription user UUID must not be empty');
  if (!input.endpoint.startsWith('https://')) {
    throw new Error('web push subscription endpoint must use HTTPS');
  }
  if (!input.p256dh.trim() || !input.auth.trim()) {
    throw new Error('web push subscription keys must not be empty');
  }
  return input;
};
