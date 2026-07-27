import { expect, test } from 'bun:test';

import { createAuthAdapter } from '@web-comic-library/auth';
import {
  createPostgresIdentity,
  createPostgresSessionAssurance,
  migrateDatabase,
} from '@web-comic-library/db';
import postgres from 'postgres';

const databaseUrl = process.env.DATABASE_URL;
const integrationTest =
  process.env.ALLOW_DATABASE_INTEGRATION_TESTS === '1' && databaseUrl ? test : test.skip;

const base32Decode = (value: string): ArrayBuffer => {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const character of value.replace(/=+$/u, '').toUpperCase()) {
    const index = alphabet.indexOf(character);
    if (index < 0) throw new Error('TOTP secret must be base32 encoded');
    buffer = (buffer << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  const result = new ArrayBuffer(bytes.length);
  new Uint8Array(result).set(bytes);
  return result;
};

const currentTotpCode = async (secret: string): Promise<string> => {
  let counter = Math.floor(Date.now() / 30_000);
  const counterBytes = new Uint8Array(new ArrayBuffer(8));
  for (let index = counterBytes.length - 1; index >= 0; index -= 1) {
    counterBytes[index] = counter & 0xff;
    counter >>>= 8;
  }
  const key = await crypto.subtle.importKey(
    'raw',
    base32Decode(secret),
    { hash: 'SHA-1', name: 'HMAC' },
    false,
    ['sign'],
  );
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, counterBytes.buffer));
  const offset = signature[signature.length - 1]! & 0x0f;
  const value =
    ((signature[offset]! & 0x7f) << 24) |
    (signature[offset + 1]! << 16) |
    (signature[offset + 2]! << 8) |
    signature[offset + 3]!;
  return (value % 1_000_000).toString().padStart(6, '0');
};

integrationTest(
  'TOTP verification creates a session that can receive two-factor assurance',
  async () => {
    if (!databaseUrl) throw new Error('DATABASE_URL is required');
    await migrateDatabase(databaseUrl);
    await migrateDatabase(databaseUrl);

    const sql = postgres(databaseUrl, { max: 1 });
    const identity = createPostgresIdentity(databaseUrl);
    const assurances = createPostgresSessionAssurance(databaseUrl);
    let magicLinkUrl: string | null = null;
    const auth = createAuthAdapter(
      {
        baseUrl: 'http://127.0.0.1:3001',
        databaseUrl,
        googleClientId: null,
        googleClientSecret: null,
        secret: 'test-secret-that-is-long-enough-for-better-auth',
        trustedOrigins: ['http://127.0.0.1:3001'],
      },
      {
        async send(message) {
          magicLinkUrl = message.url;
        },
      },
    );
    const email = `totp-${crypto.randomUUID()}@example.test`;
    try {
      const signIn = await auth.handler(
        new Request('http://127.0.0.1:3001/api/auth/sign-in/magic-link', {
          body: JSON.stringify({ email, name: 'TOTP reader' }),
          headers: { 'content-type': 'application/json', origin: 'http://127.0.0.1:3001' },
          method: 'POST',
        }),
      );
      expect(signIn.status).toBe(200);
      if (!magicLinkUrl) throw new Error('magic-link sign-in did not create a verification URL');
      const magicLink = await auth.handler(new Request(magicLinkUrl));
      expect(magicLink.status).toBe(302);
      const sessionCookie = magicLink.headers
        .getSetCookie()
        .find((value) => value.startsWith('better-auth.session_token='))
        ?.split(';')[0];
      if (!sessionCookie)
        throw new Error('magic-link verification did not create a session cookie');
      const users = await sql<{ id: string }[]>`select id from "user" where email = ${email}`;
      const userId = users[0]?.id;
      if (!userId) throw new Error('magic-link verification did not create a user');
      await identity.saveProfile({
        accountStatus: 'active',
        bio: null,
        displayName: 'TOTP reader',
        iconUrl: null,
        userId: `totp-${userId.slice(0, 8)}`,
        userUuid: userId,
        visibility: 'private',
      });
      const headers = {
        'content-type': 'application/json',
        cookie: sessionCookie,
        origin: 'http://127.0.0.1:3001',
      };
      const enrollment = await auth.handler(
        new Request('http://127.0.0.1:3001/api/auth/two-factor/enable', {
          body: JSON.stringify({ issuer: 'Web Comic Library test' }),
          headers,
          method: 'POST',
        }),
      );
      expect(enrollment.status).toBe(200);
      const body: unknown = await enrollment.json();
      if (
        !body ||
        typeof body !== 'object' ||
        !('totpURI' in body) ||
        typeof body.totpURI !== 'string'
      ) {
        throw new Error('TOTP enrollment response did not include a URI');
      }
      const secret = new URL(body.totpURI).searchParams.get('secret');
      if (!secret) throw new Error('TOTP enrollment URI did not include a secret');
      const verification = await auth.handler(
        new Request('http://127.0.0.1:3001/api/auth/two-factor/verify-totp', {
          body: JSON.stringify({ code: await currentTotpCode(secret) }),
          headers,
          method: 'POST',
        }),
      );
      expect(verification.status).toBe(200);
      const verificationBody: unknown = await verification.json();
      if (
        !verificationBody ||
        typeof verificationBody !== 'object' ||
        !('token' in verificationBody) ||
        typeof verificationBody.token !== 'string'
      ) {
        throw new Error('TOTP verification response did not include a session token');
      }
      const verifiedSessionCookie = verification.headers
        .getSetCookie()
        .find((value) => value.startsWith('better-auth.session_token='))
        ?.split(';')[0];
      if (!verifiedSessionCookie)
        throw new Error('TOTP verification did not rotate the session cookie');
      const verifiedSessionToken = await auth.sessionToken(
        new Request('http://127.0.0.1:3001/api/session', {
          headers: { cookie: verifiedSessionCookie },
        }),
      );
      if (!verifiedSessionToken)
        throw new Error('TOTP session cookie did not resolve to a session');
      expect(await assurances.recordTwoFactorAssurance(verifiedSessionToken)).toBe(true);
      expect(await identity.findSessionIdentity(verifiedSessionToken)).toMatchObject({
        assurance: 'two_factor',
        userUuid: userId,
      });
    } finally {
      await sql`delete from "user" where email = ${email}`;
      await auth.close();
      await assurances.close();
      await identity.close();
      await sql.end({ timeout: 1 });
    }
  },
  60_000,
);
