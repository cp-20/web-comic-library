import { expect, test } from 'bun:test';

import { createLibraryEntry, isCaughtUp, transitionReadingStatus } from './library';

test('keeps a manual reading status separate from catch-up calculation and preserves history', () => {
  const entry = createLibraryEntry('user-1', 'work-1', 'want_to_read', null);
  const changedAt = new Date('2026-07-27T00:00:00Z');
  const transition = transitionReadingStatus(entry, 'paused', changedAt);

  expect(transition.entry).toMatchObject({
    status: 'paused',
    userUuid: 'user-1',
    workId: 'work-1',
  });
  expect(transition.history).toEqual({
    changedAt,
    status: 'paused',
    userUuid: 'user-1',
    workId: 'work-1',
  });
  expect(isCaughtUp(['unit-1', 'unit-2'], ['unit-1', 'unit-2'])).toBe(true);
  expect(isCaughtUp(['unit-1', 'unit-2'], ['unit-1'])).toBe(false);
  expect(isCaughtUp([], [])).toBe(false);
});
