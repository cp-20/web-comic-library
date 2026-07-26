import { createEmailDigestSettings, type EmailDigestSettings } from '@web-comic-library/domain';

import type { TransactionContext, TransactionPort } from './persistence';

export interface EmailDigestSettingsRepository {
  saveEmailDigestSettings(
    context: TransactionContext,
    settings: EmailDigestSettings,
  ): Promise<void>;
  unsubscribeEmailDigest(context: TransactionContext, userUuid: string): Promise<void>;
  recordEmailDigestFeedback(
    context: TransactionContext,
    input: Readonly<{ eventId: string; kind: 'bounce' | 'complaint'; recipient: string }>,
  ): Promise<void>;
}

export const setEmailDigestSettings = async (
  transactions: TransactionPort,
  repository: EmailDigestSettingsRepository,
  settings: EmailDigestSettings,
): Promise<void> => {
  const validated = createEmailDigestSettings(settings);
  await transactions.transaction((context) =>
    repository.saveEmailDigestSettings(context, validated),
  );
};

export const unsubscribeEmailDigest = async (
  transactions: TransactionPort,
  repository: EmailDigestSettingsRepository,
  userUuid: string,
): Promise<void> => {
  if (!userUuid.trim()) throw new Error('email digest user UUID must not be empty');
  await transactions.transaction((context) => repository.unsubscribeEmailDigest(context, userUuid));
};

export const recordEmailDigestFeedback = async (
  transactions: TransactionPort,
  repository: EmailDigestSettingsRepository,
  input: Readonly<{ eventId: string; kind: 'bounce' | 'complaint'; recipient: string }>,
): Promise<void> => {
  if (!input.eventId.trim() || !input.recipient.trim())
    throw new Error('email feedback is invalid');
  await transactions.transaction((context) => repository.recordEmailDigestFeedback(context, input));
};
