import { join } from 'node:path';

import { createIssueHandler } from './http/handler';

const parsePort = (arguments_: readonly string[]): number => {
  const index = arguments_.indexOf('--port');
  const raw = index === -1 ? '3210' : arguments_[index + 1];
  if (raw === undefined || !/^\d+$/u.test(raw)) throw new Error('--port requires a number');
  const port = Number(raw);
  if (port < 1024 || port > 65_535) throw new Error('--port must be between 1024 and 65535');
  return port;
};

export const startIssueBrowser = (arguments_: readonly string[]): ReturnType<typeof Bun.serve> => {
  const port = parsePort(arguments_);
  const repositoryRoot = join(import.meta.dir, '..', '..');
  const server = Bun.serve({
    fetch: createIssueHandler(join(repositoryRoot, 'issues'), crypto.randomUUID()),
    hostname: '127.0.0.1',
    port,
  });
  console.log(`Issue browser: ${server.url}`);
  return server;
};

if (import.meta.main) startIssueBrowser(Bun.argv.slice(2));
