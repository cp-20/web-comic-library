import type { TransactionContext, TransactionPort } from './persistence';

export const extensionTokenScope = 'favorites:import' as const;

export type ExtensionTokenScope = typeof extensionTokenScope;

export type ExtensionPairingCode = Readonly<{
  codeHash: string;
  expiresAt: Date;
  id: string;
  userUuid: string;
}>;

export type ExtensionToken = Readonly<{
  deviceLabel: string;
  expiresAt: Date | null;
  id: string;
  scope: ExtensionTokenScope;
  tokenHash: string;
  userUuid: string;
}>;

export interface ExtensionTokenRepository {
  consumePairingCode(
    context: TransactionContext,
    codeHash: string,
    now: Date,
  ): Promise<ExtensionPairingCode | null>;
  createPairingCode(context: TransactionContext, pairing: ExtensionPairingCode): Promise<void>;
  createToken(context: TransactionContext, token: ExtensionToken): Promise<void>;
  findActiveTokenUserUuid(
    scope: ExtensionTokenScope,
    tokenHash: string,
    now: Date,
  ): Promise<string | null>;
  revokeToken(context: TransactionContext, userUuid: string, tokenId: string): Promise<boolean>;
}

const sha256 = async (value: string): Promise<string> => {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
};

export const authenticateExtensionToken = async (
  repository: ExtensionTokenRepository,
  token: string,
  now = new Date(),
): Promise<string | null> => {
  if (!token.trim()) return null;
  return repository.findActiveTokenUserUuid(extensionTokenScope, await sha256(token), now);
};

const randomSecret = (): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return Array.from(bytes, (byte) => byte.toString(36).padStart(2, '0'))
    .join('')
    .toUpperCase();
};

export type IssuedPairingCode = Readonly<{ code: string; expiresAt: Date }>;
export type IssuedExtensionToken = Readonly<{ token: string; tokenId: string }>;

export const issueExtensionPairingCode = async (
  transactions: TransactionPort,
  repository: ExtensionTokenRepository,
  userUuid: string,
  now = new Date(),
): Promise<IssuedPairingCode> => {
  const code = randomSecret();
  const expiresAt = new Date(now.getTime() + 5 * 60 * 1000);
  await transactions.transaction(async (context) =>
    repository.createPairingCode(context, {
      codeHash: await sha256(code),
      expiresAt,
      id: crypto.randomUUID(),
      userUuid,
    }),
  );
  return { code, expiresAt };
};

export const exchangeExtensionPairingCode = async (
  transactions: TransactionPort,
  repository: ExtensionTokenRepository,
  input: Readonly<{ code: string; deviceLabel: string }>,
  now = new Date(),
): Promise<IssuedExtensionToken | null> => {
  const token = randomSecret();
  return transactions.transaction(async (context) => {
    const pairing = await repository.consumePairingCode(context, await sha256(input.code), now);
    if (!pairing) return null;
    const tokenId = crypto.randomUUID();
    await repository.createToken(context, {
      deviceLabel: input.deviceLabel,
      expiresAt: null,
      id: tokenId,
      scope: extensionTokenScope,
      tokenHash: await sha256(token),
      userUuid: pairing.userUuid,
    });
    return { token, tokenId };
  });
};

export const revokeExtensionToken = (
  transactions: TransactionPort,
  repository: ExtensionTokenRepository,
  userUuid: string,
  tokenId: string,
): Promise<boolean> =>
  transactions.transaction((context) => repository.revokeToken(context, userUuid, tokenId));
