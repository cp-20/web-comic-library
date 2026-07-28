import { generateAccountDataExport, purgeDueAccountData } from '@web-comic-library/application';
import { createPostgresAccountData, createPostgresFoundation } from '@web-comic-library/db';

export type AccountDataExportWorkerHandler = (
  input: Readonly<{ exportId: string; userUuid: string }>,
) => Promise<void>;
export type AccountDataPurgeWorkerHandler = () => Promise<void>;

export const createAccountDataExportWorkerHandler = (
  databaseUrl: string,
): AccountDataExportWorkerHandler => {
  return async ({ exportId, userUuid }) => {
    const foundation = createPostgresFoundation(databaseUrl);
    const repository = createPostgresAccountData(databaseUrl, foundation);
    try {
      await generateAccountDataExport(repository, exportId, userUuid, new Date());
    } finally {
      await Promise.all([foundation.close(), repository.close()]);
    }
  };
};

export const createAccountDataPurgeWorkerHandler = (
  databaseUrl: string,
): AccountDataPurgeWorkerHandler => {
  return async () => {
    const foundation = createPostgresFoundation(databaseUrl);
    const repository = createPostgresAccountData(databaseUrl, foundation);
    try {
      await purgeDueAccountData(repository, new Date());
    } finally {
      await Promise.all([foundation.close(), repository.close()]);
    }
  };
};
