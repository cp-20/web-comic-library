import { expect, test } from 'bun:test';

import {
  exchangeExtensionPairingCode,
  extensionTokenScope,
  issueExtensionPairingCode,
  revokeExtensionToken,
  type ExtensionPairingCode,
  type ExtensionToken,
  type ExtensionTokenRepository,
} from './extension-pairing';
import { TransactionContext, type TransactionPort } from './persistence';

const transactions: TransactionPort = {
  async transaction<T>(operation: (context: TransactionContext) => Promise<T>): Promise<T> {
    return operation(new TransactionContext());
  },
};

test('pairing codes are single-use, expire after five minutes, and mint only import-scoped tokens', async () => {
  let pairing: ExtensionPairingCode | null = null;
  const tokens: ExtensionToken[] = [];
  const repository: ExtensionTokenRepository = {
    async consumePairingCode(_context, _codeHash, now) {
      if (!pairing || pairing.expiresAt <= now) return null;
      const consumed = pairing;
      pairing = null;
      return consumed;
    },
    async createPairingCode(_context, created) {
      pairing = created;
    },
    async createToken(_context, token) {
      tokens.push(token);
    },
    async findActiveTokenUserUuid() {
      return null;
    },
    async revokeToken(_context, userUuid, tokenId) {
      const token = tokens.find(
        (candidate) => candidate.id === tokenId && candidate.userUuid === userUuid,
      );
      return token !== undefined;
    },
  };
  const now = new Date('2026-07-27T00:00:00.000Z');
  const issued = await issueExtensionPairingCode(transactions, repository, 'reader', now);

  expect(issued.expiresAt).toEqual(new Date('2026-07-27T00:05:00.000Z'));
  const exchanged = await exchangeExtensionPairingCode(
    transactions,
    repository,
    { code: issued.code, deviceLabel: 'Firefox' },
    now,
  );
  expect(exchanged).not.toBeNull();
  expect(tokens).toHaveLength(1);
  expect(tokens[0]?.scope).toBe(extensionTokenScope);
  expect(
    await exchangeExtensionPairingCode(
      transactions,
      repository,
      { code: issued.code, deviceLabel: 'Chrome' },
      now,
    ),
  ).toBeNull();
  expect(
    await revokeExtensionToken(transactions, repository, 'other-reader', exchanged?.tokenId ?? ''),
  ).toBe(false);
  expect(
    await revokeExtensionToken(transactions, repository, 'reader', exchanged?.tokenId ?? ''),
  ).toBe(true);

  const expired = await issueExtensionPairingCode(transactions, repository, 'reader', now);
  expect(
    await exchangeExtensionPairingCode(
      transactions,
      repository,
      { code: expired.code, deviceLabel: 'Firefox' },
      new Date('2026-07-27T00:05:00.000Z'),
    ),
  ).toBeNull();
});
