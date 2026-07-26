import type {
  FollowMode,
  FollowReleaseCandidate,
  SubscriptionPublication,
  UserSourcePreference,
} from '@web-comic-library/domain';
import { followModes, selectFollowReleaseCandidates } from '@web-comic-library/domain';

import type { TransactionContext, TransactionPort } from './persistence';

export type FollowSettings = Readonly<{
  mode: FollowMode;
  userUuid: string;
  workId: string;
}>;

export interface FollowRepository {
  findFollowSettings(userUuid: string, workId: string): Promise<FollowSettings | null>;
  listSourcePreferences(userUuid: string): Promise<readonly UserSourcePreference[]>;
  listSubscriptionPublicationIds(userUuid: string, workId: string): Promise<readonly string[]>;
  replaceSourcePreferences(
    context: TransactionContext,
    userUuid: string,
    sourceIds: readonly string[],
  ): Promise<readonly UserSourcePreference[]>;
  replaceSubscriptionPublications(
    context: TransactionContext,
    userUuid: string,
    workId: string,
    publicationIds: readonly string[],
  ): Promise<readonly SubscriptionPublication[]>;
  saveFollowSettings(context: TransactionContext, settings: FollowSettings): Promise<void>;
}

const requireDistinctIds = (ids: readonly string[], name: string): readonly string[] => {
  const normalized = ids.map((id) => id.trim());
  if (normalized.some((id) => !id)) throw new Error(`${name} must not contain an empty ID`);
  if (new Set(normalized).size !== normalized.length) throw new Error(`${name} must be unique`);
  return normalized;
};

export const setSourcePreferences = async (
  transactions: TransactionPort,
  repository: FollowRepository,
  userUuid: string,
  sourceIds: readonly string[],
): Promise<readonly UserSourcePreference[]> => {
  return transactions.transaction((context) =>
    repository.replaceSourcePreferences(
      context,
      userUuid,
      requireDistinctIds(sourceIds, 'source IDs'),
    ),
  );
};

export const setFollowSettings = async (
  transactions: TransactionPort,
  repository: FollowRepository,
  input: FollowSettings & Readonly<{ publicationIds: readonly string[] }>,
): Promise<void> => {
  if (!followModes.includes(input.mode)) throw new Error('follow mode is invalid');
  const publicationIds = requireDistinctIds(input.publicationIds, 'publication IDs');
  await transactions.transaction(async (context) => {
    await repository.saveFollowSettings(context, input);
    await repository.replaceSubscriptionPublications(
      context,
      input.userUuid,
      input.workId,
      publicationIds,
    );
  });
};

export const selectFollowNotifications = async (
  repository: FollowRepository,
  userUuid: string,
  workId: string,
  candidates: readonly FollowReleaseCandidate[],
): Promise<readonly FollowReleaseCandidate[]> => {
  const settings = await repository.findFollowSettings(userUuid, workId);
  if (!settings) return [];
  const [preferences, publicationIds] = await Promise.all([
    repository.listSourcePreferences(userUuid),
    repository.listSubscriptionPublicationIds(userUuid, workId),
  ]);
  return selectFollowReleaseCandidates(settings.mode, candidates, preferences, publicationIds);
};
