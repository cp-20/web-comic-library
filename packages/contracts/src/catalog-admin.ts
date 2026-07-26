import {
  array,
  object,
  picklist,
  pipe,
  string,
  trim,
  minLength,
  minValue,
  integer,
  number,
} from 'valibot';

const text = pipe(string(), trim(), minLength(1));
const reason = pipe(text, minLength(3));
const idList = array(text);
const serialStatusValues = ['ongoing', 'hiatus', 'completed', 'unknown'] as const;

export const mergeWorksRequestSchema = object({
  reason,
  sourceWorkId: text,
  targetWorkId: text,
});

export const mergeContentUnitsRequestSchema = object({
  reason,
  sourceContentUnitId: text,
  targetContentUnitId: text,
});

export const splitWorkRequestSchema = object({
  contentUnitIds: idList,
  publicationIds: idList,
  reason,
  serialStatus: picklist(serialStatusValues),
  sourceWorkId: text,
  title: text,
});

export const splitContentUnitRequestSchema = object({
  entryIds: idList,
  position: pipe(number(), integer(), minValue(0)),
  reason,
  sourceContentUnitId: text,
  title: text,
});

export const catalogRedirectParamsSchema = object({
  id: text,
  resource: picklist(['content_unit', 'work']),
});

export const catalogReviewItemParamsSchema = object({ id: text });
