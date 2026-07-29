import { expect, test } from 'bun:test';

import { createAuthAdapter } from './index';

test('configures Better Auth with secure cookies and mounts a standards-based handler', async () => {
  const adapter = createAuthAdapter({
    baseUrl: 'https://library.example',
    databaseUrl: 'postgres://postgres:postgres@127.0.0.1:55432/web_comic_library',
    googleClientId: 'google-client-id',
    googleClientSecret: 'google-client-secret',
    secret: 'a'.repeat(32),
    trustedOrigins: ['https://library.example'],
  });
  const response = await adapter.handler(new Request('https://library.example/api/auth/ok'));
  expect(response.status).toBe(200);
  const removedMagicLink = await adapter.handler(
    new Request('https://library.example/api/auth/sign-in/magic-link', { method: 'POST' }),
  );
  expect(removedMagicLink.status).toBe(404);
  await adapter.close();
});

test('rejects an unverifiable session cookie instead of using it as a database token', async () => {
  const adapter = createAuthAdapter({
    baseUrl: 'https://library.example',
    databaseUrl: 'postgres://postgres:postgres@127.0.0.1:55432/web_comic_library',
    googleClientId: 'google-client-id',
    googleClientSecret: 'google-client-secret',
    secret: 'a'.repeat(32),
    trustedOrigins: ['https://library.example'],
  });
  const token = await adapter.sessionToken(
    new Request('https://library.example/api/session', {
      headers: { cookie: '__Secure-better-auth.session_token=opaque%20token; unrelated=secret' },
    }),
  );
  expect(token).toBeNull();
  await adapter.close();
});

test('requires both Google OAuth credentials', () => {
  expect(() =>
    createAuthAdapter({
      baseUrl: 'https://library.example',
      databaseUrl: 'postgres://postgres:postgres@127.0.0.1:55432/web_comic_library',
      googleClientId: '',
      googleClientSecret: 'google-client-secret',
      secret: 'a'.repeat(32),
      trustedOrigins: ['https://library.example'],
    }),
  ).toThrow('Google OAuth client ID and secret are required');
});

test('permits loopback HTTP auth origins for local development', async () => {
  await Promise.all(
    ['http://localhost:3000', 'http://127.0.0.1:3000'].map(async (baseUrl) => {
      const adapter = createAuthAdapter({
        baseUrl,
        databaseUrl: 'postgres://postgres:postgres@localhost:55432/web_comic_library',
        googleClientId: 'google-client-id',
        googleClientSecret: 'google-client-secret',
        secret: 'a'.repeat(32),
        trustedOrigins: [baseUrl],
      });
      const response = await adapter.handler(new Request(`${baseUrl}/api/auth/ok`));
      expect(response.status).toBe(200);
      await adapter.close();
    }),
  );
});
