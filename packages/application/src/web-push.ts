import { createWebPushSubscription, type WebPushSubscription } from '@web-comic-library/domain';

import type { TransactionContext, TransactionPort } from './persistence';

export interface WebPushSubscriptionRepository {
  deactivateWebPushSubscription(
    context: TransactionContext,
    userUuid: string,
    endpoint: string,
  ): Promise<boolean>;
  saveWebPushSubscription(
    context: TransactionContext,
    subscription: WebPushSubscription,
  ): Promise<void>;
}

export type WebPushSubscriptionInput = Readonly<{
  auth: string;
  endpoint: string;
  p256dh: string;
  userUuid: string;
}>;

export const registerWebPushSubscription = async (
  transactions: TransactionPort,
  repository: WebPushSubscriptionRepository,
  input: WebPushSubscriptionInput,
): Promise<void> => {
  const subscription = createWebPushSubscription({ ...input, id: crypto.randomUUID() });
  await transactions.transaction((context) =>
    repository.saveWebPushSubscription(context, subscription),
  );
};

export const unregisterWebPushSubscription = async (
  transactions: TransactionPort,
  repository: WebPushSubscriptionRepository,
  userUuid: string,
  endpoint: string,
): Promise<boolean> => {
  if (!endpoint.trim()) throw new Error('web push subscription endpoint must not be empty');
  return transactions.transaction((context) =>
    repository.deactivateWebPushSubscription(context, userUuid, endpoint),
  );
};
