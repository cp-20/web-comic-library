import { expect, test } from 'bun:test';

import { canViewVisibility, normalizeUserId, resolveVisibility } from './identity';

test('normalizes user IDs and rejects duplicates-prone reserved or malformed values', () => {
  expect(normalizeUserId('  Reader-01  ')).toBe('reader-01');
  expect(() => normalizeUserId('admin')).toThrow('reserved');
  expect(() => normalizeUserId('日本語')).toThrow('user ID');
});

test('uses record visibility over an account default and keeps an unset account private', () => {
  expect(resolveVisibility('public', 'private')).toBe('private');
  expect(resolveVisibility(null, null)).toBe('private');
  expect(
    canViewVisibility('followers', {
      isFollower: true,
      requesterUserUuid: 'reader',
      subjectUserUuid: 'author',
    }),
  ).toBe(true);
  expect(
    canViewVisibility('private', {
      isFollower: true,
      requesterUserUuid: 'reader',
      subjectUserUuid: 'author',
    }),
  ).toBe(false);
});
