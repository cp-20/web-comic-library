import {
  parseBibliographyJobPayload,
  parseFoundationJobPayload,
  parseNotificationJobPayload,
} from '@web-comic-library/contracts';
import { run } from 'graphile-worker';
import type { Runner } from 'graphile-worker';

import type { BibliographyWorkerHandler } from './bibliography';
import type { NotificationWorkerHandler } from './notifications';

export const startWorker = (
  databaseUrl: string,
  bibliographyHandler?: BibliographyWorkerHandler,
  notificationHandler?: NotificationWorkerHandler,
): Promise<Runner> => {
  return run({
    concurrency: 1,
    connectionString: databaseUrl,
    crontab: '# foundation: cron disabled',
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
