import { boolean, minLength, object, pipe, regex, string, trim } from 'valibot';

export const emailDigestSettingsRequestSchema = object({
  enabled: boolean(),
  sendTime: pipe(string(), trim(), regex(/^\d{2}:\d{2}$/u)),
  timezone: pipe(string(), trim(), minLength(1)),
});
