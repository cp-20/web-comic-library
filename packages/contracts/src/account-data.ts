import { literal, object, parse, pipe, regex, string, uuid } from 'valibot';
import type { InferOutput } from 'valibot';

const id = pipe(string(), uuid());

export const accountDataExportParamsSchema = object({ id });
export const accountDataExportQuerySchema = object({
  token: pipe(string(), regex(/^[a-f0-9]{64}$/u)),
});
export const accountDeletionRequestSchema = object({ confirmation: literal('DELETE ACCOUNT') });
export const accountDataExportJobPayloadSchema = object({
  exportId: id,
  userUuid: pipe(string(), uuid()),
});

export type AccountDataExportJobPayload = InferOutput<typeof accountDataExportJobPayloadSchema>;

export const parseAccountDataExportJobPayload = (input: unknown): AccountDataExportJobPayload =>
  parse(accountDataExportJobPayloadSchema, input);
