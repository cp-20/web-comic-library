import {
  array,
  email,
  maxLength,
  minLength,
  nullable,
  object,
  optional,
  picklist,
  pipe,
  regex,
  string,
  trim,
} from 'valibot';

const text = pipe(string(), trim(), minLength(1));
const optionalText = nullable(pipe(string(), trim(), maxLength(1_000)));

export const profileParamsSchema = object({ userId: text });

export const magicLinkRequestSchema = object({ email: pipe(text, email()) });

export const twoFactorEnableRequestSchema = object({
  issuer: optional(pipe(text, maxLength(100))),
});

export const twoFactorEnableResponseSchema = object({
  backupCodes: array(pipe(string(), minLength(1), maxLength(1_000))),
  totpURI: pipe(string(), minLength(1), maxLength(4_000)),
});

export const twoFactorVerifyRequestSchema = object({
  code: pipe(string(), regex(/^\d{6}$/u)),
});

export const twoFactorVerifyResponseSchema = object({
  token: pipe(string(), minLength(1), maxLength(1_000)),
});

export const updateProfileRequestSchema = object({
  bio: optionalText,
  displayName: pipe(text, maxLength(100)),
  userId: text,
  visibility: nullable(picklist(['public', 'followers', 'private'])),
});
