import {
  email,
  nullable,
  object,
  picklist,
  pipe,
  string,
  trim,
  minLength,
  maxLength,
} from 'valibot';

const text = pipe(string(), trim(), minLength(1));
const optionalText = nullable(pipe(string(), trim(), maxLength(1_000)));

export const profileParamsSchema = object({ userId: text });

export const magicLinkRequestSchema = object({ email: pipe(text, email()) });

export const updateProfileRequestSchema = object({
  bio: optionalText,
  displayName: pipe(text, maxLength(100)),
  userId: text,
  visibility: nullable(picklist(['public', 'followers', 'private'])),
});
