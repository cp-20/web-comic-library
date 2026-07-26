import { minLength, object, pipe, string, trim } from 'valibot';

const text = pipe(string(), trim(), minLength(1));

export const exchangeExtensionPairingCodeRequestSchema = object({ code: text, deviceLabel: text });
export const revokeExtensionTokenParamsSchema = object({ tokenId: text });
