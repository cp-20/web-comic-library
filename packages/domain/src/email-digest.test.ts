import { expect, test } from 'bun:test';

import { createEmailDigestSettings, emailDigestIdempotencyKey } from './email-digest';

test('email digest settings validate timezone and one local day idempotency key', () => {
  expect(
    createEmailDigestSettings({
      enabled: true,
      sendTime: '09:00',
      timezone: 'Asia/Tokyo',
      userUuid: 'reader',
    }),
  ).toMatchObject({ timezone: 'Asia/Tokyo' });
  expect(() =>
    createEmailDigestSettings({
      enabled: true,
      sendTime: '09:00',
      timezone: 'unknown/zone',
      userUuid: 'reader',
    }),
  ).toThrow('timezone');
  expect(emailDigestIdempotencyKey('reader', '2026-07-27')).toBe('email-digest:reader:2026-07-27');
});
