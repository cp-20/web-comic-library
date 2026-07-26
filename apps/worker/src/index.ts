import { createPostgresJobQueueMetrics } from '@web-comic-library/db';

import { createBibliographyWorkerHandler } from './bibliography';
import { createWorkerMetrics, startMetricsServer } from './metrics';
import { startWorker } from './worker';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required');
}

const runner = await startWorker(databaseUrl, createBibliographyWorkerHandler(databaseUrl));
const jobQueueMetrics = createPostgresJobQueueMetrics(databaseUrl);
const metrics = createWorkerMetrics(jobQueueMetrics);
const metricsPort = Number(process.env.METRICS_PORT ?? '3002');
if (!Number.isSafeInteger(metricsPort) || metricsPort < 1 || metricsPort > 65_535) {
  throw new Error('METRICS_PORT must be an integer between 1 and 65535');
}
const metricsServer = startMetricsServer(metrics, metricsPort);
let stopping = false;
const stop = (signal: string): void => {
  if (stopping) {
    return;
  }

  stopping = true;
  void Promise.all([runner.stop(signal), metricsServer.stop(), jobQueueMetrics.close()]);
};

process.once('SIGINT', () => stop('SIGINT'));
process.once('SIGTERM', () => stop('SIGTERM'));
console.log(`worker ready; metrics listening on ${metricsServer.url}`);
await runner.promise;
