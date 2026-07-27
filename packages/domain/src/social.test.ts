import { expect, test } from 'bun:test';

import { isReviewSpoilerFor, toReviewReadModel, validateReviewActivity } from './social';

const review = {
  body: '結末に触れない感想です。',
  contentUnitId: 'unit-2',
  createdAt: new Date('2026-07-27T00:00:00Z'),
  id: 'review-1',
  kind: 'review' as const,
  spoiler: false,
  updatedAt: new Date('2026-07-27T00:00:00Z'),
  userUuid: 'author',
  visibility: 'public' as const,
  volumeEditionId: null,
  workId: 'work-1',
};

test('review spoiler decisions are based on author flag and a viewer read position', () => {
  const cases = [
    { expected: true, read: [], spoiler: false, viewer: null },
    { expected: true, read: [], spoiler: false, viewer: 'reader' },
    { expected: false, read: ['unit-2'], spoiler: false, viewer: 'reader' },
    { expected: true, read: ['unit-2'], spoiler: true, viewer: 'reader' },
    { expected: false, read: [], spoiler: true, viewer: 'author' },
  ] as const;

  for (const item of cases) {
    expect(
      isReviewSpoilerFor(
        { ...review, spoiler: item.spoiler },
        item.viewer,
        item.viewer ? { readContentUnitIds: item.read, readVolumeEditionIds: [] } : null,
      ),
    ).toBe(item.expected);
  }
});

test('review read models omit a hidden body and validate one target with plain text bounds', () => {
  const hidden = toReviewReadModel(review, 0, null, null);
  expect(hidden.state).toBe('hidden');
  expect('body' in hidden).toBe(false);
  expect(() =>
    validateReviewActivity({
      body: ' ',
      contentUnitId: 'unit-2',
      spoiler: false,
      userUuid: 'author',
      visibility: 'public',
      volumeEditionId: null,
      workId: 'work-1',
    }),
  ).toThrow();
  expect(() =>
    validateReviewActivity({
      body: 'valid',
      contentUnitId: 'unit-2',
      spoiler: false,
      userUuid: 'author',
      visibility: 'public',
      volumeEditionId: 'volume-1',
      workId: 'work-1',
    }),
  ).toThrow();
});
