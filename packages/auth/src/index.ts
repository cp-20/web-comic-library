import { betterAuth } from 'better-auth';
import { magicLink } from 'better-auth/plugins';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';

export {
  type R2ObjectClient,
  type R2ObjectClientOptions,
  type R2ProfileIconStorageOptions,
  R2ProfileIconStorage,
  R2S3ObjectClient,
  createR2ObjectClient,
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
}>;

export const readSessionToken = (request: Request): string | null => {
  const cookie = request.headers.get('cookie');
  if (!cookie) return null;
  const prefix = request.url.startsWith('https://')
    ? '__Secure-better-auth.session_token'
    : 'better-auth.session_token';
  const token = cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${prefix}=`));
  return token ? decodeURIComponent(token.slice(prefix.length + 1)) : null;
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
      database: { generateId: 'uuid' },
    },
    baseURL,
    database: { casing: 'snake', db: database, transaction: true, type: 'postgres' },
    plugins: [
      magicLink({
        expiresIn: 300,
        sendMagicLink: async ({ email, url }) => magicLinkSender.send({ email, url }),
        storeToken: 'hashed',
      }),
    ],
    rateLimit: {
      enabled: true,
      window: 60,
      max: 10,
    },
    secret: configuration.secret,
    socialProviders,
    telemetry: { enabled: false },
    trustedOrigins: [...configuration.trustedOrigins],
  });
  return {
    async close(): Promise<void> {
      await database.destroy();
    },
    async handler(request: Request): Promise<Response> {
      return auth.handler(request);
    },
  };
};
