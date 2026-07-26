import { expect, test } from 'bun:test';

import { selectFollowReleaseCandidates } from './follow';

const candidates = [
  {
    contentUnitId: 'content-1',
    eventId: 'event-a',
    notificationEligible: true,
    occurredAt: new Date('2026-07-27T00:00:00Z'),
    official: true,
    publicationId: 'publication-a',
    publicationValid: true,
    sourceId: 'source-a',
  },
  {
    contentUnitId: 'content-1',
    eventId: 'event-b',
    notificationEligible: true,
    occurredAt: new Date('2026-07-27T01:00:00Z'),
    official: true,
    publicationId: 'publication-b',
    publicationValid: true,
    sourceId: 'source-b',
  },
  {
    contentUnitId: 'content-2',
    eventId: 'event-c',
    notificationEligible: true,
    occurredAt: new Date('2026-07-27T02:00:00Z'),
    official: false,
    publicationId: 'publication-c',
    publicationValid: true,
    sourceId: 'source-c',
  },
  {
    contentUnitId: 'content-3',
    eventId: 'event-invalid',
    notificationEligible: true,
    occurredAt: new Date('2026-07-27T03:00:00Z'),
    official: true,
    publicationId: 'publication-invalid',
    publicationValid: false,
    sourceId: 'source-a',
  },
  {
    contentUnitId: 'content-4',
    eventId: 'event-suppressed',
    notificationEligible: false,
    occurredAt: new Date('2026-07-27T04:00:00Z'),
    official: true,
    publicationId: 'publication-suppressed',
    publicationValid: true,
    sourceId: 'source-a',
  },
] as const;

test('selectFollowReleaseCandidates applies each mode, fallback, and invalid-event exclusion', () => {
  expect(
    selectFollowReleaseCandidates('fastest', candidates, [], []).map(
      (candidate) => candidate.eventId,
    ),
  ).toEqual(['event-a', 'event-c']);
  expect(
    selectFollowReleaseCandidates(
      'source_priority',
      candidates,
      [
        { position: 0, sourceId: 'source-b', userUuid: 'reader' },
        { position: 1, sourceId: 'source-a', userUuid: 'reader' },
      ],
      [],
    ).map((candidate) => candidate.eventId),
  ).toEqual(['event-b']);
  expect(
    selectFollowReleaseCandidates('selected_publications', candidates, [], ['publication-b']).map(
      (candidate) => candidate.eventId,
    ),
  ).toEqual(['event-b']);
  expect(
    selectFollowReleaseCandidates('all_publications', candidates, [], []).map(
      (candidate) => candidate.eventId,
    ),
  ).toEqual(['event-a', 'event-b', 'event-c']);
});
