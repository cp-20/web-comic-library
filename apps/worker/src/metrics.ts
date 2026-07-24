import type { JobQueueMetricsPort } from '@web-comic-library/application';
import { collectDefaultMetrics, Counter, Gauge, Histogram, Registry } from 'prom-client';

export type WorkerMetrics = Readonly<{
  recordConnectorRun(outcome: 'failure' | 'success', durationSeconds: number): void;
  recordNotificationFailure(): void;
  registry: Registry;
}>;

export const createWorkerMetrics = (jobQueueMetrics: JobQueueMetricsPort): WorkerMetrics => {
  const registry = new Registry();
  collectDefaultMetrics({
    prefix: 'web_comic_library_worker_process_',
    register: registry,
  });

  const availableJobs = new Gauge({
    async collect() {
      const snapshot = await jobQueueMetrics.read();
      this.set(snapshot.available);
    },
    help: 'Runnable Graphile Worker jobs.',
    name: 'web_comic_library_jobs_available',
    registers: [registry],
  });
  const overdueJobs = new Gauge({
    async collect() {
      const snapshot = await jobQueueMetrics.read();
      this.set(snapshot.overdue);
    },
    help: 'Runnable Graphile Worker jobs overdue by at least ten minutes.',
    name: 'web_comic_library_jobs_overdue',
    registers: [registry],
  });
  const failedJobs = new Gauge({
    async collect() {
      const snapshot = await jobQueueMetrics.read();
      this.set(snapshot.failed);
    },
    help: 'Graphile Worker jobs that exhausted all attempts.',
    name: 'web_comic_library_jobs_failed',
    registers: [registry],
  });
  const oldestAvailableJob = new Gauge({
    async collect() {
      const snapshot = await jobQueueMetrics.read();
      this.set(snapshot.oldestAvailableSeconds);
    },
    help: 'Age of the oldest runnable Graphile Worker job in seconds.',
    name: 'web_comic_library_job_oldest_available_seconds',
    registers: [registry],
  });
  const connectorRuns = new Counter({
    help: 'Connector runs by outcome.',
    labelNames: ['outcome'],
    name: 'web_comic_library_connector_runs_total',
    registers: [registry],
  });
  const connectorDuration = new Histogram({
    buckets: [0.1, 0.5, 1, 2.5, 5, 10, 30, 60],
    help: 'Connector run duration in seconds.',
    name: 'web_comic_library_connector_duration_seconds',
    registers: [registry],
  });
  const notificationFailures = new Counter({
    help: 'Notification delivery failures.',
    name: 'web_comic_library_notification_failures_total',
    registers: [registry],
  });

  connectorRuns.inc({ outcome: 'success' }, 0);
  connectorRuns.inc({ outcome: 'failure' }, 0);
  void availableJobs;
  void overdueJobs;
  void failedJobs;
  void oldestAvailableJob;

  return {
    recordConnectorRun(outcome, durationSeconds) {
      connectorRuns.inc({ outcome });
      connectorDuration.observe(durationSeconds);
    },
    recordNotificationFailure() {
      notificationFailures.inc();
    },
    registry,
  };
};

export const startMetricsServer = (
  metrics: WorkerMetrics,
  port: number,
): ReturnType<typeof Bun.serve> => {
  return Bun.serve({
    fetch: async (request) => {
      if (new URL(request.url).pathname !== '/metrics') {
        return new Response('not found', { status: 404 });
      }

      return new Response(await metrics.registry.metrics(), {
        headers: { 'content-type': metrics.registry.contentType },
      });
    },
    port,
  });
};
