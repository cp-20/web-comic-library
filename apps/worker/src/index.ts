import { run } from 'graphile-worker';
import { object, parse, string } from 'valibot';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required');
}

const compatibilityPayloadSchema = object({ id: string() });
const runner = await run({
  concurrency: 1,
  connectionString: databaseUrl,
  crontab: '# compatibility: cron disabled',
  noHandleSignals: true,
  taskList: {
    compatibility_probe: async (payload, helpers) => {
      const { id } = parse(compatibilityPayloadSchema, payload);
      await helpers.query('insert into compatibility_probe (id, processed_at) values ($1, now())', [
        id,
      ]);
    },
  },
});

let stopping = false;
const stop = (signal: string): void => {
  if (stopping) {
    return;
  }

  stopping = true;
  void runner.stop(signal);
};

process.once('SIGINT', () => stop('SIGINT'));
process.once('SIGTERM', () => stop('SIGTERM'));
console.log('worker ready');
await runner.promise;
