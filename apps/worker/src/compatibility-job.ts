import { makeWorkerUtils } from 'graphile-worker';

const databaseUrl = process.env.DATABASE_URL;
const mode = process.argv[2];
const id = process.argv[3];

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required');
}

if ((mode !== 'enqueue' && mode !== 'wait') || !id) {
  throw new Error('usage: compatibility-job.ts <enqueue|wait> <id>');
}

const workerUtils = await makeWorkerUtils({ connectionString: databaseUrl });

try {
  await workerUtils.addJob('compatibility_probe', { id }, { maxAttempts: 1 });

  if (mode === 'wait') {
    const deadline = Date.now() + 20_000;

    while (Date.now() < deadline) {
      // oxlint-disable-next-line no-await-in-loop -- Each query observes the previous wait.
      const processed = await workerUtils.withPgClient(async (client) => {
        const result = await client.query<{ found: boolean }>(
          'select exists(select 1 from compatibility_probe where id = $1) as found',
          [id],
        );
        return result.rows[0]?.found === true;
      });

      if (processed) {
        process.exit(0);
      }

      // oxlint-disable-next-line no-await-in-loop -- Polling must wait before the next query.
      await Bun.sleep(100);
    }

    throw new Error(`job ${id} was not processed`);
  }
} finally {
  await workerUtils.release();
}
