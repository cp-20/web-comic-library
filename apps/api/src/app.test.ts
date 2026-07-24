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

  test('exposes Prometheus metrics without request data labels', async () => {
    const client = hc<ApiType>('http://api.test', { fetch: app.request });
    const response = await client.metrics.$get();
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain('web_comic_library_api_requests_total');
    expect(body).not.toContain('url=');
  });
});
