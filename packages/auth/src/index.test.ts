import { expect, test } from 'bun:test';

import { createAuthAdapter, readSessionToken } from './index';

test('configures Better Auth with secure cookies and mounts a standards-based handler', async () => {
  const adapter = createAuthAdapter(
    {
      baseUrl: 'https://library.example',
      databaseUrl: 'postgres://postgres:postgres@127.0.0.1:55432/web_comic_library',
      googleClientId: null,
      googleClientSecret: null,
      secret: 'a'.repeat(32),
      trustedOrigins: ['https://library.example'],
    },
    { async send() {} },
  );
  const response = await adapter.handler(new Request('https://library.example/api/auth/ok'));
  expect(response.status).toBe(200);
  await adapter.close();
});

test('extracts only the Better Auth session cookie without exposing other cookie values', () => {
  const request = new Request('https://library.example/api/session', {
    headers: { cookie: '__Secure-better-auth.session_token=opaque%20token; unrelated=secret' },
  });
  expect(readSessionToken(request)).toBe('opaque token');
});
