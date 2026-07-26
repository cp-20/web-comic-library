import { expect, test } from 'bun:test';

import { createEmailDigestMessage, createResendEmailSender } from './email-digest';

test('email digest template contains only a count and safe notification URL', () => {
  const message = createEmailDigestMessage(2, 'https://comic.example.test/notifications');
  expect(message.subject).not.toContain('作品');
  expect(message.html).toContain('更新通知が2件');
  expect(message.html).not.toContain('ネタバレ');
});

test('Resend adapter classifies permanent and retryable delivery failures without logging content', async () => {
  const permanent = createResendEmailSender(
    'test-key',
    'updates@example.test',
    async () => new Response(null, { status: 422 }),
  );
  const retryable = createResendEmailSender(
    'test-key',
    'updates@example.test',
    async () => new Response(null, { status: 503 }),
  );
  const message = createEmailDigestMessage(1, 'https://comic.example.test/notifications');
  expect(await permanent.send('reader@example.test', message)).toBe('permanent_failure');
  expect(await retryable.send('reader@example.test', message)).toBe('retryable_failure');
});
