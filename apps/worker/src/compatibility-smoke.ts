import { resolve } from 'node:path';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required');
}

const repoRoot = resolve(import.meta.dir, '../../..');
const environment = { ...process.env, DATABASE_URL: databaseUrl };

const run = async (command: string[]): Promise<void> => {
  const subprocess = Bun.spawn(command, {
    cwd: repoRoot,
    env: environment,
    stderr: 'pipe',
    stdout: 'pipe',
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    subprocess.exited,
    new Response(subprocess.stdout).text(),
    new Response(subprocess.stderr).text(),
  ]);

  if (exitCode !== 0) {
    throw new Error(`${command.join(' ')} failed (${exitCode})\n${stdout}\n${stderr}`);
  }
};

const start = (command: string[], env: Record<string, string | undefined>, cwd = repoRoot) => {
  return Bun.spawn(command, {
    cwd,
    env: { ...environment, ...env },
    stderr: 'inherit',
    stdin: 'ignore',
    stdout: 'inherit',
  });
};

const waitForHttp = async (url: string): Promise<void> => {
  const deadline = Date.now() + 20_000;

  while (Date.now() < deadline) {
    try {
      // oxlint-disable-next-line no-await-in-loop -- Each request observes the previous wait.
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // The process may still be starting.
    }

    // oxlint-disable-next-line no-await-in-loop -- Polling must wait before the next request.
    await Bun.sleep(100);
  }

  throw new Error(`${url} did not become ready`);
};

const stop = async (
  subprocess: ReturnType<typeof start>,
  name: string,
  allowedExitCodes: readonly number[] = [0],
): Promise<void> => {
  subprocess.kill('SIGTERM');
  const exitCode = await Promise.race([
    subprocess.exited,
    Bun.sleep(10_000).then(() => {
      subprocess.kill('SIGKILL');
      throw new Error(`${name} did not stop after SIGTERM`);
    }),
  ]);

  if (!allowedExitCodes.includes(exitCode)) {
    throw new Error(`${name} exited with code ${exitCode}`);
  }
};

await run([process.execPath, 'run', 'packages/auth/src/compatibility.ts']);
await run([process.execPath, 'run', 'packages/db/src/compatibility.ts', 'setup']);
await run([process.execPath, 'run', 'packages/notifications/src/compatibility.ts']);

const api = start([process.execPath, 'apps/api/src/index.ts'], { PORT: '3101' });
const web = start(
  [process.execPath, '--bun', 'node_modules/next/dist/bin/next', 'start'],
  { PORT: '3100' },
  resolve(repoRoot, 'apps/web'),
);
const worker = start([process.execPath, 'apps/worker/src/index.ts'], {});

try {
  await Promise.all([
    waitForHttp('http://127.0.0.1:3100'),
    waitForHttp('http://127.0.0.1:3101/api/health'),
  ]);
  await run([
    process.execPath,
    'run',
    'packages/api-client/src/compatibility.ts',
    'http://127.0.0.1:3101',
  ]);

  const completedJobId = crypto.randomUUID();
  await run([
    process.execPath,
    'run',
    'apps/worker/src/compatibility-job.ts',
    'wait',
    completedJobId,
  ]);

  await stop(worker, 'worker');

  const pendingJobId = crypto.randomUUID();
  await run([
    process.execPath,
    'run',
    'apps/worker/src/compatibility-job.ts',
    'enqueue',
    pendingJobId,
  ]);
  await Bun.sleep(500);
  await run([
    process.execPath,
    'run',
    'packages/db/src/compatibility.ts',
    'assert-missing',
    pendingJobId,
  ]);

  await Promise.all([stop(api, 'api'), stop(web, 'web', [0, 143])]);
} finally {
  for (const subprocess of [api, web, worker]) {
    if (subprocess.exitCode === null) {
      subprocess.kill('SIGKILL');
    }
  }
}

console.log('Bun compatibility smoke test passed');
