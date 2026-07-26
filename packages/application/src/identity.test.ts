import { expect, test } from 'bun:test';

import { findVisibleProfile, isActiveSession } from './identity';

test('does not expose an account until a visibility is selected', async () => {
  const repository = {
    async findProfileByPublicId() {
      return {
        accountStatus: 'active' as const,
        bio: null,
        displayName: 'Reader',
        iconUrl: null,
        userId: 'reader-01',
        userUuid: 'reader',
        visibility: null,
      };
    },
    async findProfileByUserUuid() {
      return null;
    },
    async isFollower() {
      return false;
    },
    async saveProfile() {
      throw new Error('not used');
    },
  };
  await expect(
    findVisibleProfile(repository, 'reader-01', { userUuid: 'other' }),
  ).resolves.toBeNull();
  expect(
    isActiveSession({ accountStatus: 'active', email: 'reader@example.com', userUuid: 'reader' }),
  ).toBe(true);
  expect(
    isActiveSession({ accountStatus: 'disabled', email: 'reader@example.com', userUuid: 'reader' }),
  ).toBe(false);
});
