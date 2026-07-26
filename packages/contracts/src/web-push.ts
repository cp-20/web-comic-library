import { minLength, object, pipe, startsWith, string, trim } from 'valibot';

const text = pipe(string(), trim(), minLength(1));

export const webPushSubscriptionRequestSchema = object({
  auth: text,
  endpoint: pipe(text, startsWith('https://')),
  p256dh: text,
});

export const webPushUnsubscribeRequestSchema = object({ endpoint: text });
