import { Hono } from 'hono';

export const app = new Hono().get('/api/health', (context) => {
  return context.json({ status: 'ok' as const }, 200);
});

export type ApiType = typeof app;
