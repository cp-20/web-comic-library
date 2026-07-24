import { describe, expect, test } from 'bun:test';

import type { JobQueueMetricsPort } from '@web-comic-library/application';

import { createWorkerMetrics } from './metrics';

const jobQueueMetrics: JobQueueMetricsPort = {
  async close() {},
  async read() {
    return {
      available: 2,
      failed: 1,
      oldestAvailableSeconds: 601,
      overdue: 1,
    };
  },
};

describe('worker metrics', () => {
  test('exposes queue, connector, and notification metrics without payloads', async () => {
    const metrics = createWorkerMetrics(jobQueueMetrics);
    metrics.recordConnectorRun('success', 0.5);
    metrics.recordNotificationFailure();

    const body = await metrics.registry.metrics();

    expect(body).toContain('web_comic_library_jobs_available 2');
    expect(body).toContain('web_comic_library_jobs_overdue 1');
    expect(body).toContain('web_comic_library_connector_runs_total{outcome="success"} 1');
    expect(body).toContain('web_comic_library_notification_failures_total 1');
  });
});
