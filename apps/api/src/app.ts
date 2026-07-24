import { sentry } from '@sentry/hono/bun';
import { Hono } from 'hono';

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

export const app = baseApp.get('/api/health', (context) => {
  return context.json({ status: 'ok' as const }, 200);
});

export type ApiType = typeof app;
