import { describe, expect, test } from 'bun:test';

import { hc } from 'hono/client';

import { app, type ApiType } from './app';

describe('health endpoint', () => {
  test('is callable through Hono RPC', async () => {
    const client = hc<ApiType>('http://api.test', {
      fetch: app.request,
    });
    const response = await client.api.health.$get();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
  });
});
