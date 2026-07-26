import type {
  ContentReadRecord,
  PublicationReadRecord,
  UserVolumeRecord,
  Visibility,
  VolumeContentMappingCorrection,
  VolumeReadingStatus,
} from '@web-comic-library/domain';
import {
  confirmedVolumeContentUnitIds,
  createUserVolumeRecord,
  createVolumeContentMappingCorrection,
} from '@web-comic-library/domain';

import type { ReadMapping } from './library';
import type { TransactionContext, TransactionPort } from './persistence';

export type VolumeLibraryReadModel = Readonly<{
  contentUnitIds: readonly string[];
  entryMappings: readonly ReadMapping[];
  volumeEditionId: string;
  volumeMappings: readonly Readonly<{ confirmed: boolean; contentUnitId: string }>[];
  workId: string;
}>;

export interface VolumeLibraryRepository {
  findVolumeReadModel(volumeEditionId: string): Promise<VolumeLibraryReadModel | null>;
  listUserVolumeRecords(userUuid: string): Promise<readonly UserVolumeRecord[]>;
  saveContentReadRecords(
    context: TransactionContext,
    records: readonly ContentReadRecord[],
  ): Promise<void>;
  savePublicationReadRecords(
    context: TransactionContext,
    records: readonly PublicationReadRecord[],
  ): Promise<void>;
  saveUserVolumeRecord(context: TransactionContext, record: UserVolumeRecord): Promise<void>;
  saveVolumeContentMappingCorrection(
    context: TransactionContext,
    correction: VolumeContentMappingCorrection,
  ): Promise<void>;
}

type SetUserVolumeRecordInput = Readonly<{
  memoContentUnitId: string | null;
  ownsDigital: boolean;
  ownsPaper: boolean;
  status: VolumeReadingStatus;
  userUuid: string;
  visibility: Visibility | null;
  volumeEditionId: string;
}>;

const requireVolume = (
  volume: VolumeLibraryReadModel | null,
  volumeEditionId: string,
): VolumeLibraryReadModel => {
  if (!volume || volume.volumeEditionId !== volumeEditionId) {
    throw new Error('volume edition is unavailable');
  }
  return volume;
};

export const setUserVolumeRecord = async (
  transactions: TransactionPort,
  repository: VolumeLibraryRepository,
  input: SetUserVolumeRecordInput,
  now: Date = new Date(),
): Promise<UserVolumeRecord> => {
  const volume = requireVolume(
    await repository.findVolumeReadModel(input.volumeEditionId),
    input.volumeEditionId,
  );
  if (
    input.memoContentUnitId !== null &&
    !volume.contentUnitIds.includes(input.memoContentUnitId)
  ) {
    throw new Error('memo content unit does not belong to volume work');
  }
  const record = createUserVolumeRecord({ ...input, workId: volume.workId });
  const confirmedContentUnitIds =
    record.status === 'read' ? confirmedVolumeContentUnitIds(volume.volumeMappings) : [];
  const contentRecords: readonly ContentReadRecord[] = confirmedContentUnitIds.map(
    (contentUnitId) => ({
      contentUnitId,
      readAt: now,
      userUuid: record.userUuid,
      visibility: record.visibility,
      workId: record.workId,
    }),
  );
  const publicationRecords: readonly PublicationReadRecord[] = volume.entryMappings
    .filter(
      (mapping) => mapping.confirmed && confirmedContentUnitIds.includes(mapping.contentUnitId),
    )
    .map((mapping) => ({
      publicationEntryId: mapping.publicationEntryId,
      readAt: now,
      userUuid: record.userUuid,
      visibility: record.visibility,
      workId: record.workId,
    }));

  await transactions.transaction(async (context) => {
    await repository.saveUserVolumeRecord(context, record);
    await repository.saveContentReadRecords(context, contentRecords);
    await repository.savePublicationReadRecords(context, publicationRecords);
  });
  return record;
};

export const submitVolumeContentMappingCorrection = async (
  transactions: TransactionPort,
  repository: VolumeLibraryRepository,
  correction: VolumeContentMappingCorrection,
): Promise<void> => {
  const validated = createVolumeContentMappingCorrection(correction);
  const volume = requireVolume(
    await repository.findVolumeReadModel(validated.volumeEditionId),
    validated.volumeEditionId,
  );
  if (!volume.contentUnitIds.includes(validated.contentUnitId)) {
    throw new Error('correction content unit does not belong to volume work');
  }
  await transactions.transaction((context) =>
    repository.saveVolumeContentMappingCorrection(context, validated),
  );
};
