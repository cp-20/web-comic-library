import { sentry } from '@sentry/hono/bun';
import { Hono } from 'hono';

import { apiMetrics, apiRequestDuration, apiRequests } from './metrics';

const baseApp = new Hono();

baseApp.use(
  sentry(baseApp, {
    dataCollection: {
      cookies: false,
      databaseQueryData: false,
      frameContextLines: 0,
      genAI: { inputs: false, outputs: false },
      graphQL: { document: false, variables: false },
      httpBodies: [],
      httpHeaders: { request: false, response: false },
      stackFrameVariables: false,
      urlQueryParams: false,
      userInfo: false,
    },
    dsn: process.env.SENTRY_DSN,
  }),
);

baseApp.use(async (context, next) => {
  if (context.req.path === '/metrics') {
    await next();
    return;
  }

  const stopTimer = apiRequestDuration.startTimer({
    method: context.req.method,
  });
  try {
    await next();
  } finally {
    const status = String(context.res.status);
    apiRequests.inc({ method: context.req.method, status });
    stopTimer({ status });
  }
});

export const app = baseApp
  .get('/api/health', (context) => {
    return context.json({ status: 'ok' as const }, 200);
  })
  .get('/metrics', async (context) => {
    return context.body(await apiMetrics.metrics(), 200, {
      'content-type': apiMetrics.contentType,
    });
  });

export type ApiType = typeof app;
