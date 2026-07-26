import { Webhook } from 'svix';

export type ResendEmailFeedback = Readonly<{
  eventId: string;
  kind: 'bounce' | 'complaint';
  recipient: string;
}>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

export const verifyResendEmailFeedback = (
  payload: string,
  headers: Readonly<{ id: string | null; signature: string | null; timestamp: string | null }>,
  secret: string,
): ResendEmailFeedback | null => {
  if (!headers.id || !headers.signature || !headers.timestamp) return null;
  let event: unknown;
  try {
    event = new Webhook(secret).verify(payload, {
      'svix-id': headers.id,
      'svix-signature': headers.signature,
      'svix-timestamp': headers.timestamp,
    });
  } catch {
    return null;
  }
  if (!isRecord(event) || (event.type !== 'email.bounced' && event.type !== 'email.complained')) {
    return null;
  }
  const data = event.data;
  if (!isRecord(data) || !Array.isArray(data.to) || typeof data.to[0] !== 'string') return null;
  return {
    eventId: headers.id,
    kind: event.type === 'email.bounced' ? 'bounce' : 'complaint',
    recipient: data.to[0],
  };
};
