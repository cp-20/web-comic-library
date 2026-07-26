export type EmailDigestSettings = Readonly<{
  enabled: boolean;
  sendTime: string;
  timezone: string;
  userUuid: string;
}>;

export const emailDigestIdempotencyKey = (userUuid: string, localDate: string): string => {
  if (!userUuid.trim()) throw new Error('email digest user UUID must not be empty');
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(localDate)) {
    throw new Error('email digest local date must use YYYY-MM-DD');
  }
  return `email-digest:${userUuid}:${localDate}`;
};

export const createEmailDigestSettings = (input: EmailDigestSettings): EmailDigestSettings => {
  if (!input.userUuid.trim()) throw new Error('email digest user UUID must not be empty');
  if (!/^\d{2}:\d{2}$/u.test(input.sendTime)) {
    throw new Error('email digest send time must use HH:MM');
  }
  try {
    Intl.DateTimeFormat('en-US', { timeZone: input.timezone });
  } catch {
    throw new Error('email digest timezone is invalid');
  }
  return input;
};
