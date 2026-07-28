import { betterAuth } from 'better-auth';
import { magicLink, twoFactor } from 'better-auth/plugins';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';

export {
  type R2ObjectClient,
  type R2ObjectClientOptions,
  type R2OgImageStorageOptions,
  type R2ProfileIconStorageOptions,
  R2OgImageStorage,
  R2ProfileIconStorage,
  R2S3ObjectClient,
  createR2ObjectClient,
  createR2OgImageStorage,
  createR2ProfileIconStorage,
} from './profile-icon-storage';

export type MagicLinkMessage = Readonly<{
  email: string;
  url: string;
}>;

export interface MagicLinkSender {
  send(message: MagicLinkMessage): Promise<void>;
}

export type AuthConfiguration = Readonly<{
  baseUrl: string;
  databaseUrl: string;
  googleClientId: string | null;
  googleClientSecret: string | null;
  secret: string;
  trustedOrigins: readonly string[];
}>;

export type AuthAdapter = Readonly<{
  close(): Promise<void>;
  handler(request: Request): Promise<Response>;
  sessionToken(request: Request): Promise<string | null>;
}>;

const sessionTokenFromResponse = async (response: Response): Promise<string | null> => {
  if (!response.ok) return null;
  const body: unknown = await response.json();
  if (!body || typeof body !== 'object' || !('session' in body)) return null;
  const session = body.session;
  if (!session || typeof session !== 'object' || !('token' in session)) return null;
  return typeof session.token === 'string' ? session.token : null;
};

const requireHttpsOrLocalhost = (value: string): string => {
  const url = new URL(value);
  if (url.protocol === 'https:' || (url.protocol === 'http:' && url.hostname === '127.0.0.1')) {
    return url.href.replace(/\/$/u, '');
  }
  throw new Error('auth base URL must use HTTPS outside localhost');
};

export const createAuthAdapter = (
  configuration: AuthConfiguration,
  magicLinkSender: MagicLinkSender,
): AuthAdapter => {
  const baseURL = requireHttpsOrLocalhost(configuration.baseUrl);
  if (configuration.secret.length < 32)
    throw new Error('auth secret must contain at least 32 characters');
  if ((configuration.googleClientId === null) !== (configuration.googleClientSecret === null)) {
    throw new Error('Google OAuth client ID and secret must be configured together');
  }
  const pool = new Pool({ connectionString: configuration.databaseUrl });
  const database = new Kysely({ dialect: new PostgresDialect({ pool }) });
  const socialProviders =
    configuration.googleClientId && configuration.googleClientSecret
      ? {
          google: {
            clientId: configuration.googleClientId,
            clientSecret: configuration.googleClientSecret,
          },
        }
      : undefined;
  const auth = betterAuth({
    account: {
      fields: {
        accessToken: 'access_token',
        accessTokenExpiresAt: 'access_token_expires_at',
        accountId: 'account_id',
        createdAt: 'created_at',
        idToken: 'id_token',
        providerId: 'provider_id',
        refreshToken: 'refresh_token',
        refreshTokenExpiresAt: 'refresh_token_expires_at',
        updatedAt: 'updated_at',
        userId: 'user_id',
      },
    },
    advanced: {
      cookies: {
        session_token: {
          attributes: {
            httpOnly: true,
            sameSite: 'lax',
            secure: baseURL.startsWith('https://'),
          },
        },
      },
      database: { generateId: () => crypto.randomUUID() },
    },
    baseURL,
    database: { db: database, transaction: true, type: 'postgres' },
    plugins: [
      magicLink({
        expiresIn: 300,
        sendMagicLink: async ({ email, url }) => magicLinkSender.send({ email, url }),
        storeToken: 'hashed',
      }),
      twoFactor({
        allowPasswordless: true,
        schema: {
          twoFactor: {
            fields: {
              backupCodes: 'backup_codes',
              failedVerificationCount: 'failed_verification_count',
              lockedUntil: 'locked_until',
              secret: 'secret',
              userId: 'user_id',
              verified: 'verified',
            },
            modelName: 'two_factor',
          },
          user: {
            fields: {
              twoFactorEnabled: 'two_factor_enabled',
            },
          },
        },
      }),
    ],
    rateLimit: {
      enabled: true,
      window: 60,
      max: 10,
    },
    session: {
      fields: {
        createdAt: 'created_at',
        expiresAt: 'expires_at',
        ipAddress: 'ip_address',
        updatedAt: 'updated_at',
        userAgent: 'user_agent',
        userId: 'user_id',
      },
      storeSessionInDatabase: true,
    },
    secret: configuration.secret,
    socialProviders,
    telemetry: { enabled: false },
    trustedOrigins: [...configuration.trustedOrigins],
    user: {
      fields: {
        createdAt: 'created_at',
        emailVerified: 'email_verified',
        updatedAt: 'updated_at',
      },
    },
    verification: {
      fields: {
        createdAt: 'created_at',
        expiresAt: 'expires_at',
        updatedAt: 'updated_at',
      },
    },
  });
  return {
    async close(): Promise<void> {
      await database.destroy();
    },
    async handler(request: Request): Promise<Response> {
      return auth.handler(request);
    },
    async sessionToken(request: Request): Promise<string | null> {
      const headers = new Headers();
      const cookie = request.headers.get('cookie');
      if (cookie) headers.set('cookie', cookie);
      const response = await auth.handler(
        new Request(new URL('/api/auth/get-session', request.url), { headers }),
      );
      return sessionTokenFromResponse(response);
    },
  };
};
