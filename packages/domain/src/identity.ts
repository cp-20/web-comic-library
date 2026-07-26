export const visibilities = ['public', 'followers', 'private'] as const;

export type Visibility = (typeof visibilities)[number];

export const accountStatuses = ['active', 'disabled', 'pending_deletion'] as const;

export type AccountStatus = (typeof accountStatuses)[number];

export type AccountProfile = Readonly<{
  accountStatus: AccountStatus;
  bio: string | null;
  displayName: string;
  iconUrl: string | null;
  userId: string;
  userUuid: string;
  visibility: Visibility | null;
}>;

export type VisibilityContext = Readonly<{
  isFollower: boolean;
  requesterUserUuid: string | null;
  subjectUserUuid: string;
}>;

const reservedUserIds = new Set([
  'admin',
  'api',
  'auth',
  'login',
  'logout',
  'settings',
  'support',
  'system',
]);

export const normalizeUserId = (input: string): string => {
  const normalized = input.normalize('NFKC').trim().toLowerCase();
  if (!/^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])?$/u.test(normalized)) {
    throw new Error('user ID must be 3 to 32 lowercase ASCII letters, digits, or hyphens');
  }
  if (reservedUserIds.has(normalized)) throw new Error('user ID is reserved');
  return normalized;
};

export const resolveVisibility = (
  accountDefault: Visibility | null,
  recordOverride: Visibility | null,
): Visibility => recordOverride ?? accountDefault ?? 'private';

export const canViewVisibility = (visibility: Visibility, context: VisibilityContext): boolean => {
  if (context.requesterUserUuid === context.subjectUserUuid) return true;
  if (visibility === 'public') return true;
  return visibility === 'followers' && context.isFollower;
};

export const createAccountProfile = (input: AccountProfile): AccountProfile => {
  const displayName = input.displayName.trim();
  if (displayName.length < 1 || displayName.length > 100) {
    throw new Error('display name must be between 1 and 100 characters');
  }
  const bio = input.bio === null ? null : input.bio.trim();
  if (bio !== null && bio.length > 1_000) throw new Error('bio must be at most 1000 characters');
  if (input.iconUrl !== null && new URL(input.iconUrl).protocol !== 'https:') {
    throw new Error('icon URL must use HTTPS');
  }
  return { ...input, bio, displayName, userId: normalizeUserId(input.userId) };
};
