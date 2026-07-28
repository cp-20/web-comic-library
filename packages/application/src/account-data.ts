import type { JsonValue, TransactionContext, TransactionPort } from './persistence';

export type AccountDataExport = Readonly<{
  expiresAt: Date;
  id: string;
  payload: JsonValue | null;
  status: 'queued' | 'ready' | 'expired' | 'failed';
}>;

export type RequestedAccountDataExport = Readonly<{
  export: AccountDataExport;
  downloadToken: string;
}>;

export interface AccountDataRepository {
  createDataExport(
    context: TransactionContext,
    input: Readonly<{
      downloadTokenHash: string;
      expiresAt: Date;
      id: string;
      userUuid: string;
    }>,
  ): Promise<AccountDataExport>;
  findDataExport(
    userUuid: string,
    id: string,
    downloadTokenHash: string,
    now: Date,
  ): Promise<AccountDataExport | null>;
  markDataExportReady(id: string, payload: JsonValue, now: Date): Promise<boolean>;
  purgeExpiredDataExports(now: Date): Promise<void>;
  requestAccountDeletion(
    context: TransactionContext,
    input: Readonly<{ purgeAfter: Date; userUuid: string }>,
  ): Promise<void>;
  purgeDueAccounts(now: Date): Promise<readonly string[]>;
  buildDataExport(userUuid: string): Promise<JsonValue | null>;
}

const sha256 = async (value: string): Promise<string> => {
  const digest = new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)),
  );
  return [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('');
};

const randomToken = (): string =>
  crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', '');

export const requestAccountDataExport = async (
  transactions: TransactionPort,
  repository: AccountDataRepository,
  userUuid: string,
  now: Date,
): Promise<RequestedAccountDataExport> => {
  const downloadToken = randomToken();
  const id = crypto.randomUUID();
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const downloadTokenHash = await sha256(downloadToken);
  const exportRequest = await transactions.transaction((context) =>
    repository.createDataExport(context, {
      downloadTokenHash,
      expiresAt,
      id,
      userUuid,
    }),
  );
  return { downloadToken, export: exportRequest };
};

export const findAccountDataExport = async (
  repository: AccountDataRepository,
  userUuid: string,
  id: string,
  downloadToken: string,
  now: Date,
): Promise<AccountDataExport | null> => {
  const downloadTokenHash = await sha256(downloadToken);
  return repository.findDataExport(userUuid, id, downloadTokenHash, now);
};

export const generateAccountDataExport = async (
  repository: AccountDataRepository,
  id: string,
  userUuid: string,
  now: Date,
): Promise<boolean> => {
  const payload = await repository.buildDataExport(userUuid);
  if (payload === null) return false;
  return repository.markDataExportReady(id, payload, now);
};

export const requestAccountDeletion = async (
  transactions: TransactionPort,
  repository: AccountDataRepository,
  userUuid: string,
  now: Date,
): Promise<void> => {
  const purgeAfter = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  await transactions.transaction((context) =>
    repository.requestAccountDeletion(context, { purgeAfter, userUuid }),
  );
};

export const purgeDueAccountData = async (
  repository: AccountDataRepository,
  now: Date,
): Promise<readonly string[]> => {
  await repository.purgeExpiredDataExports(now);
  return repository.purgeDueAccounts(now);
};
