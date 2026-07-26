import {
  boolean,
  maxLength,
  minLength,
  nullable,
  object,
  picklist,
  pipe,
  string,
  trim,
} from 'valibot';

const id = pipe(string(), trim(), minLength(1));
const visibility = nullable(picklist(['public', 'followers', 'private']));

export const setUserVolumeRecordRequestSchema = object({
  memoContentUnitId: nullable(id),
  ownsDigital: boolean(),
  ownsPaper: boolean(),
  status: picklist(['unread', 'reading', 'read']),
  visibility,
  volumeEditionId: id,
});

export const submitVolumeContentMappingCorrectionRequestSchema = object({
  contentUnitId: id,
  rationale: pipe(string(), trim(), minLength(1), maxLength(2_000)),
  suggestedStatus: picklist(['confirmed', 'unconfirmed', 'rejected']),
  volumeEditionId: id,
});
