import type { AccountProfile, VisibilityContext } from '@web-comic-library/domain';
import {
  canViewVisibility,
  createAccountProfile,
  resolveVisibility,
} from '@web-comic-library/domain';

export type SessionIdentity = Readonly<{
  accountStatus: 'active' | 'disabled' | 'pending_deletion';
  assurance: 'none' | 'two_factor';
  email: string;
  userUuid: string;
}>;

export interface SessionAssuranceRepository {
  recordTwoFactorAssurance(sessionToken: string): Promise<boolean>;
}

export type ProfileViewer = Readonly<{
  userUuid: string | null;
}>;

export interface IdentityRepository {
  findProfileByPublicId(publicId: string): Promise<AccountProfile | null>;
  findProfileByUserUuid(userUuid: string): Promise<AccountProfile | null>;
  isFollower(followerUserUuid: string, followedUserUuid: string): Promise<boolean>;
  saveProfile(profile: AccountProfile): Promise<AccountProfile>;
}

export const isActiveSession = (identity: SessionIdentity | null): identity is SessionIdentity => {
  return identity !== null && identity.accountStatus === 'active';
};

export const recordTwoFactorAssurance = async (
  repository: SessionAssuranceRepository,
  sessionToken: string,
): Promise<boolean> => repository.recordTwoFactorAssurance(sessionToken);

export const findVisibleProfile = async (
  repository: IdentityRepository,
  publicId: string,
  viewer: ProfileViewer,
): Promise<AccountProfile | null> => {
  const profile = await repository.findProfileByPublicId(publicId);
  if (!profile || profile.accountStatus !== 'active') return null;
  const context: VisibilityContext = {
    isFollower:
      viewer.userUuid === null
        ? false
        : await repository.isFollower(viewer.userUuid, profile.userUuid),
    requesterUserUuid: viewer.userUuid,
    subjectUserUuid: profile.userUuid,
  };
  return canViewVisibility(resolveVisibility(profile.visibility, null), context) ? profile : null;
};

export const updateProfile = async (
  repository: IdentityRepository,
  profile: AccountProfile,
): Promise<AccountProfile> => repository.saveProfile(createAccountProfile(profile));
