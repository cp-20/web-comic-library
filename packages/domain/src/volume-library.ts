import type { VolumeContentMappingStatus } from './bibliography';
import type { Visibility } from './identity';

export const volumeReadingStatuses = ['unread', 'reading', 'read'] as const;

export type VolumeReadingStatus = (typeof volumeReadingStatuses)[number];

export type UserVolumeRecord = Readonly<{
  memoContentUnitId: string | null;
  ownsDigital: boolean;
  ownsPaper: boolean;
  status: VolumeReadingStatus;
  userUuid: string;
  visibility: Visibility | null;
  volumeEditionId: string;
  workId: string;
}>;

export type VolumeContentMappingCorrection = Readonly<{
  contentUnitId: string;
  rationale: string;
  suggestedStatus: VolumeContentMappingStatus;
  userUuid: string;
  volumeEditionId: string;
}>;

const requireId = (value: string, field: string): string => {
  if (!value.trim()) throw new Error(`${field} must not be empty`);
  return value;
};

export const createUserVolumeRecord = (input: UserVolumeRecord): UserVolumeRecord => {
  if (!volumeReadingStatuses.includes(input.status)) {
    throw new Error('volume reading status is invalid');
  }
  requireId(input.userUuid, 'user UUID');
  requireId(input.volumeEditionId, 'volume edition ID');
  requireId(input.workId, 'work ID');
  if (input.memoContentUnitId !== null) requireId(input.memoContentUnitId, 'memo content unit ID');
  return input;
};

export const createVolumeContentMappingCorrection = (
  input: VolumeContentMappingCorrection,
): VolumeContentMappingCorrection => {
  requireId(input.userUuid, 'user UUID');
  requireId(input.volumeEditionId, 'volume edition ID');
  requireId(input.contentUnitId, 'content unit ID');
  if (!input.rationale.trim()) throw new Error('correction rationale must not be empty');
  if (!['confirmed', 'unconfirmed', 'rejected'].includes(input.suggestedStatus)) {
    throw new Error('volume mapping correction status is invalid');
  }
  return { ...input, rationale: input.rationale.trim() };
};

export const confirmedVolumeContentUnitIds = (
  mappings: readonly Readonly<{ confirmed: boolean; contentUnitId: string }>[],
): readonly string[] => [
  ...new Set(
    mappings.filter((mapping) => mapping.confirmed).map((mapping) => mapping.contentUnitId),
  ),
];
