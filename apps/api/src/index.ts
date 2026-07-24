import { app } from './app';

const port = Number(process.env.PORT ?? '3001');

if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
  throw new Error('PORT must be an integer between 1 and 65535');
}

const server = Bun.serve({ fetch: app.fetch, port });
let stopping = false;

const stop = (): void => {
  if (stopping) {
    return;
  }

  stopping = true;
  void server.stop().then(() => process.exit(0));
};

process.once('SIGINT', stop);
process.once('SIGTERM', stop);
console.log(`API listening on ${server.url}`);
