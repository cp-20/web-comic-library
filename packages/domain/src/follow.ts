export const followModes = [
  'fastest',
  'source_priority',
  'selected_publications',
  'all_publications',
] as const;

export type FollowMode = (typeof followModes)[number];

export type UserSourcePreference = Readonly<{
  position: number;
  sourceId: string;
  userUuid: string;
}>;

export type SubscriptionPublication = Readonly<{
  publicationId: string;
  userUuid: string;
  workId: string;
}>;

export type FollowReleaseCandidate = Readonly<{
  contentUnitId: string | null;
  eventId: string;
  notificationEligible: boolean;
  occurredAt: Date;
  official: boolean;
  publicationId: string;
  publicationValid: boolean;
  sourceId: string;
}>;

const compareCandidates = (left: FollowReleaseCandidate, right: FollowReleaseCandidate): number => {
  const occurredAt = left.occurredAt.getTime() - right.occurredAt.getTime();
  if (occurredAt !== 0) return occurredAt;
  return left.eventId.localeCompare(right.eventId);
};

const isSelectable = (candidate: FollowReleaseCandidate): boolean => {
  return candidate.notificationEligible && candidate.publicationValid;
};

const groupKey = (candidate: FollowReleaseCandidate): string => {
  return candidate.contentUnitId ?? `entry:${candidate.eventId}`;
};

const selectFastest = (
  candidates: readonly FollowReleaseCandidate[],
): readonly FollowReleaseCandidate[] => {
  const selected = new Map<string, FollowReleaseCandidate>();
  for (const candidate of candidates.toSorted(compareCandidates)) {
    const key = groupKey(candidate);
    if (!selected.has(key)) selected.set(key, candidate);
  }
  return [...selected.values()];
};

export const selectFollowReleaseCandidates = (
  mode: FollowMode,
  candidates: readonly FollowReleaseCandidate[],
  sourcePreferences: readonly UserSourcePreference[],
  subscribedPublicationIds: readonly string[],
): readonly FollowReleaseCandidate[] => {
  const selectable = candidates.filter(isSelectable);
  if (mode === 'all_publications') return selectable.toSorted(compareCandidates);
  if (mode === 'selected_publications') {
    const subscriptions = new Set(subscribedPublicationIds);
    return selectable
      .filter((candidate) => subscriptions.has(candidate.publicationId))
      .toSorted(compareCandidates);
  }
  if (mode === 'fastest') return selectFastest(selectable);

  const priorities = new Map(
    sourcePreferences.map((preference) => [preference.sourceId, preference.position]),
  );
  const groups = new Map<string, FollowReleaseCandidate[]>();
  for (const candidate of selectable) {
    const key = groupKey(candidate);
    const group = groups.get(key);
    if (group) group.push(candidate);
    else groups.set(key, [candidate]);
  }
  return [...groups.values()]
    .map((group) => {
      const prioritized = group
        .filter((candidate) => priorities.has(candidate.sourceId))
        .toSorted((left, right) => {
          const leftPosition = priorities.get(left.sourceId) ?? Number.MAX_SAFE_INTEGER;
          const rightPosition = priorities.get(right.sourceId) ?? Number.MAX_SAFE_INTEGER;
          return leftPosition - rightPosition || compareCandidates(left, right);
        })[0];
      if (prioritized) return prioritized;
      return group.filter((candidate) => candidate.official).toSorted(compareCandidates)[0];
    })
    .filter((candidate): candidate is FollowReleaseCandidate => candidate !== undefined)
    .toSorted(compareCandidates);
};
