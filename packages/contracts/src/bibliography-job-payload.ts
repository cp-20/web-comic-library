import { minLength, object, parse, picklist, pipe, string, trim, uuid } from 'valibot';
import type { InferOutput } from 'valibot';

export const bibliographyJobPayloadSchema = object({
  isbn: pipe(string(), trim(), minLength(1)),
  mode: picklist(['initial', 'incremental']),
  workId: pipe(string(), uuid()),
});

export type BibliographyJobPayload = InferOutput<typeof bibliographyJobPayloadSchema>;

export const parseBibliographyJobPayload = (input: unknown): BibliographyJobPayload => {
  return parse(bibliographyJobPayloadSchema, input);
};
