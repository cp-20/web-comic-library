import { startWorker } from './worker';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required');
}

const runner = await startWorker(databaseUrl);
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
