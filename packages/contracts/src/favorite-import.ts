import {
  array,
  minLength,
  nullable,
  object,
  optional,
  picklist,
  pipe,
  string,
  trim,
} from 'valibot';

const id = pipe(string(), trim(), minLength(1));
const text = pipe(string(), trim(), minLength(1));
const readingStatus = nullable(
  picklist(['want_to_read', 'reading', 'paused', 'dropped', 'completed']),
);
const followMode = picklist([
  'fastest',
  'source_priority',
  'selected_publications',
  'all_publications',
]);

export const createFavoriteImportRequestSchema = object({
  favorites: pipe(
    array(
      object({
        canonicalUrl: text,
        externalWorkId: nullable(text),
        sourceId: id,
        title: text,
      }),
    ),
    minLength(1),
  ),
});

export const favoriteImportParamsSchema = object({ batchId: id });

export const applyFavoriteImportRequestSchema = object({
  defaults: object({ followMode, readingStatus }),
  selections: array(
    object({
      candidateId: id,
      followMode: optional(followMode),
      readingStatus: optional(readingStatus),
    }),
  ),
});
