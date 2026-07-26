import { array, minLength, nullable, object, picklist, pipe, string, trim } from 'valibot';

const id = pipe(string(), trim(), minLength(1));
const visibility = nullable(picklist(['public', 'followers', 'private']));

export const setReadingStatusRequestSchema = object({
  status: picklist(['want_to_read', 'reading', 'paused', 'dropped', 'completed']),
  visibility,
  workId: id,
});

export const markContentReadRequestSchema = object({
  contentUnitIds: pipe(array(id), minLength(1)),
  visibility,
  workId: id,
});

export const markContentReadThroughRequestSchema = object({
  contentUnitId: id,
  visibility,
  workId: id,
});

export const unmarkContentReadRequestSchema = object({
  contentUnitIds: pipe(array(id), minLength(1)),
  workId: id,
});

export const markPublicationReadRequestSchema = object({
  publicationEntryId: id,
  visibility,
  workId: id,
});
