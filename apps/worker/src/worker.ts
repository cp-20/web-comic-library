import { parseFoundationJobPayload } from '@web-comic-library/contracts';
import { run } from 'graphile-worker';
import type { Runner } from 'graphile-worker';

export const startWorker = (databaseUrl: string): Promise<Runner> => {
  return run({
    concurrency: 1,
    connectionString: databaseUrl,
    crontab: '# foundation: cron disabled',
    noHandleSignals: true,
    taskList: {
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
