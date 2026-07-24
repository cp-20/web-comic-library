import { object, parse, pipe, string, uuid } from 'valibot';
import type { InferOutput } from 'valibot';

export const foundationJobPayloadSchema = object({
  id: pipe(string(), uuid()),
});

export type FoundationJobPayload = InferOutput<typeof foundationJobPayloadSchema>;

export const parseFoundationJobPayload = (input: unknown): FoundationJobPayload => {
  return parse(foundationJobPayloadSchema, input);
};
