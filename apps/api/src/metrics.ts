import { collectDefaultMetrics, Counter, Histogram, Registry } from 'prom-client';

export const apiMetrics = new Registry();

collectDefaultMetrics({
  prefix: 'web_comic_library_api_process_',
  register: apiMetrics,
});

export const apiRequests = new Counter({
  help: 'API HTTP requests by method and status.',
  labelNames: ['method', 'status'],
  name: 'web_comic_library_api_requests_total',
  registers: [apiMetrics],
});

export const apiRequestDuration = new Histogram({
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  help: 'API HTTP request duration in seconds.',
  labelNames: ['method', 'status'],
  name: 'web_comic_library_api_request_duration_seconds',
  registers: [apiMetrics],
});
