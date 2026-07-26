export type EmailDigestDeliveryOutcome = 'delivered' | 'permanent_failure' | 'retryable_failure';

export type QueuedEmailDigest = Readonly<{
  id: string;
  notificationCount: number;
  recipient: string;
}>;

export interface EmailDigestDeliveryRepository {
  listQueuedEmailDigests(now: Date): Promise<readonly QueuedEmailDigest[]>;
  recordEmailDigestResult(digestId: string, outcome: EmailDigestDeliveryOutcome): Promise<void>;
}

export interface EmailDigestSenderPort {
  send(
    recipient: string,
    input: Readonly<{ notificationCount: number; url: string }>,
  ): Promise<EmailDigestDeliveryOutcome>;
}

export const deliverQueuedEmailDigests = async (
  repository: EmailDigestDeliveryRepository,
  sender: EmailDigestSenderPort,
  now: Date,
  notificationsUrl: string,
): Promise<number> => {
  const digests = await repository.listQueuedEmailDigests(now);
  let delivered = 0;
  for (const digest of digests) {
    // oxlint-disable-next-line no-await-in-loop -- Each recipient has an independent durable result.
    const outcome = await sender.send(digest.recipient, {
      notificationCount: digest.notificationCount,
      url: notificationsUrl,
    });
    // oxlint-disable-next-line no-await-in-loop -- Result must be durable before retrying another digest.
    await repository.recordEmailDigestResult(digest.id, outcome);
    if (outcome === 'retryable_failure')
      throw new Error('email digest delivery failed temporarily');
    delivered += outcome === 'delivered' ? 1 : 0;
  }
  return delivered;
};
