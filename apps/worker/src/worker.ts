import {
  parseAccountDataExportJobPayload,
  parseBibliographyJobPayload,
  parseFoundationJobPayload,
  parseNotificationJobPayload,
} from '@web-comic-library/contracts';
import { run } from 'graphile-worker';
import type { Runner } from 'graphile-worker';

import type { AccountDataExportWorkerHandler, AccountDataPurgeWorkerHandler } from './account-data';
import type { BibliographyWorkerHandler } from './bibliography';
import type { EmailDigestWorkerHandler } from './email-digest';
import type { NotificationWorkerHandler } from './notifications';

export const startWorker = (
  databaseUrl: string,
  bibliographyHandler?: BibliographyWorkerHandler,
  notificationHandler?: NotificationWorkerHandler,
  emailDigestHandler?: EmailDigestWorkerHandler,
  accountDataExportHandler?: AccountDataExportWorkerHandler,
  accountDataPurgeHandler?: AccountDataPurgeWorkerHandler,
): Promise<Runner> => {
  return run({
    concurrency: 1,
    connectionString: databaseUrl,
    crontab: [
      emailDigestHandler ? '*/15 * * * * email_digest' : '# email digest disabled',
      accountDataPurgeHandler ? '0 3 * * * account_data_purge' : '# account data purge disabled',
    ].join('\n'),
    noHandleSignals: true,
    taskList: {
      bibliography_sync: async (payload) => {
        if (!bibliographyHandler) throw new Error('bibliography worker handler is not configured');
        const { isbn, mode, workId } = parseBibliographyJobPayload(payload);
        await bibliographyHandler({ isbn, mode, occurredAt: new Date(), workId });
      },
      notification_release: async (payload) => {
        if (!notificationHandler) throw new Error('notification worker handler is not configured');
        const { eventId } = parseNotificationJobPayload(payload);
        await notificationHandler(eventId);
      },
      email_digest: async () => {
        if (!emailDigestHandler) throw new Error('email digest worker handler is not configured');
        await emailDigestHandler();
      },
      account_data_export: async (payload) => {
        if (!accountDataExportHandler)
          throw new Error('account data export handler is not configured');
        await accountDataExportHandler(parseAccountDataExportJobPayload(payload));
      },
      account_data_purge: async () => {
        if (!accountDataPurgeHandler)
          throw new Error('account data purge handler is not configured');
        await accountDataPurgeHandler();
      },
      compatibility_probe: async (payload, helpers) => {
        const { id } = parseFoundationJobPayload(payload);
        await helpers.query(
          'insert into compatibility_probe (id, processed_at) values ($1, now())',
          [id],
        );
      },
    },
  });
};
