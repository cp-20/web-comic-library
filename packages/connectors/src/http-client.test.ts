import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import type { FetchResourceState } from '@web-comic-library/application';

import { ConnectorHttpClient, ConnectorHttpError, HostRequestScheduler } from './http-client';

const startCutServer = (port: number) => {
  return Bun.listen({
    hostname: '127.0.0.1',
    port,
    socket: {
      data(socket) {
        socket.write(
          'HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nContent-Length: 100\r\nConnection: close\r\n\r\npartial',
        );
        socket.end();
      },
    },
  });
};

let server: ReturnType<typeof Bun.serve>;
let cutServer: ReturnType<typeof startCutServer>;
let imageRequests = 0;
let backoffRequests = 0;
let retryRequests = 0;
let conditionalHeaders: Readonly<{ etag: string | null; modified: string | null }> = {
  etag: null,
  modified: null,
};

beforeAll(() => {
  server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    async fetch(request) {
      const url = new URL(request.url);

      switch (url.pathname) {
        case '/html':
          return new Response('<main>fixture</main>', {
            headers: {
              'Content-Type': 'text/html; charset=utf-8',
              ETag: '"fixture-v1"',
              'Last-Modified': 'Fri, 25 Jul 2026 00:00:00 GMT',
            },
          });
        case '/redirect':
          return Response.redirect(new URL('/html', url), 302);
        case '/redirect-outside':
          return new Response(null, {
            headers: { Location: 'https://outside.example/document' },
            status: 302,
          });
        case '/redirect-loop':
          return new Response(null, {
            headers: { Location: '/redirect-loop' },
            status: 302,
          });
        case '/conditional':
          conditionalHeaders = {
            etag: request.headers.get('if-none-match'),
            modified: request.headers.get('if-modified-since'),
          };
          return new Response(null, {
            headers: {
              ETag: '"fixture-v1"',
              'Last-Modified': 'Fri, 25 Jul 2026 00:00:00 GMT',
            },
            status: 304,
          });
        case '/retry':
          retryRequests += 1;

          if (retryRequests === 1) {
            return new Response('retry', {
              headers: { 'Content-Type': 'text/plain', 'Retry-After': '2' },
              status: 429,
            });
          }

          return new Response('ok', { headers: { 'Content-Type': 'text/plain' } });
        case '/backoff':
          backoffRequests += 1;
          return new Response(backoffRequests === 1 ? 'temporary' : 'ok', {
            headers: { 'Content-Type': 'text/plain' },
            status: backoffRequests === 1 ? 503 : 200,
          });
        case '/slow':
          await Bun.sleep(100);
          return new Response('late', { headers: { 'Content-Type': 'text/plain' } });
        case '/large':
          return new Response('123456789', { headers: { 'Content-Type': 'text/plain' } });
        case '/wrong-type':
          return Response.json({ ok: true });
        case '/cover.jpg':
          imageRequests += 1;
          return new Response('image', { headers: { 'Content-Type': 'image/jpeg' } });
        default:
          return new Response('missing', { status: 404 });
      }
    },
  });
  cutServer = startCutServer(0);
});

afterAll(() => {
  server?.stop(true);
  cutServer?.stop(true);
});

const client = (
  options: Partial<ConstructorParameters<typeof ConnectorHttpClient>[0]> = {},
): ConnectorHttpClient => {
  return new ConnectorHttpClient({
    allowedHosts: [server.url.host],
    baseBackoffMs: 1,
    jitterMs: 0,
    maxAttempts: 2,
    minIntervalMs: 0,
    timeoutMs: 1_000,
    ...options,
  });
};

const input = (path: string, state: FetchResourceState | null = null) => ({
  acceptedContentTypes: ['text/html'],
  sourceId: crypto.randomUUID(),
  state,
  url: new URL(path, server.url).href,
});

describe('connector HTTP client', () => {
  test('fetches allowed documents and follows only allowed redirects', async () => {
    const result = await client().get(input('/redirect'));

    expect(result.status).toBe('modified');

    if (result.status === 'modified') {
      expect(new TextDecoder().decode(result.body)).toBe('<main>fixture</main>');
      expect(result.state.bodyHash).toHaveLength(64);
      expect(result.state.etag).toBe('"fixture-v1"');
      expect(result.state.url).toBe(new URL('/redirect', server.url).href);
    }

    await expect(client().get(input('/redirect-outside'))).rejects.toMatchObject({
      code: 'disallowed_host',
    });
    await expect(client({ maxRedirects: 1 }).get(input('/redirect-loop'))).rejects.toMatchObject({
      code: 'redirect',
    });
    await expect(
      client().get({ ...input('/html'), url: 'https://outside.example/document' }),
    ).rejects.toMatchObject({ code: 'disallowed_host' });
  });

  test('sends validators and does not parse a 304 body', async () => {
    const previous: FetchResourceState = {
      bodyHash: 'a'.repeat(64),
      checkedAt: new Date('2026-07-25T00:00:00Z'),
      etag: '"fixture-v1"',
      lastModified: 'Fri, 25 Jul 2026 00:00:00 GMT',
      sourceId: crypto.randomUUID(),
      url: new URL('/conditional', server.url).href,
    };
    const result = await client().get({
      acceptedContentTypes: ['text/html'],
      sourceId: previous.sourceId,
      state: previous,
      url: previous.url,
    });

    expect(result.status).toBe('not_modified');
    expect(result.state.bodyHash).toBe(previous.bodyHash);
    expect(conditionalHeaders).toEqual({
      etag: '"fixture-v1"',
      modified: 'Fri, 25 Jul 2026 00:00:00 GMT',
    });
  });

  test('honors Retry-After before retrying a 429 response', async () => {
    retryRequests = 0;
    const delays: number[] = [];
    const result = await client({
      sleep: (milliseconds) => {
        delays.push(milliseconds);
        return Promise.resolve();
      },
    }).get({
      ...input('/retry'),
      acceptedContentTypes: ['text/plain'],
    });

    expect(result.status).toBe('modified');
    expect(retryRequests).toBe(2);
    expect(delays).toEqual([2_000]);
  });

  test('uses exponential backoff for other temporary responses', async () => {
    backoffRequests = 0;
    const delays: number[] = [];
    const result = await client({
      baseBackoffMs: 10,
      random: () => 0,
      sleep: (milliseconds) => {
        delays.push(milliseconds);
        return Promise.resolve();
      },
    }).get({
      ...input('/backoff'),
      acceptedContentTypes: ['text/plain'],
    });

    expect(result.status).toBe('modified');
    expect(backoffRequests).toBe(2);
    expect(delays).toEqual([10]);
  });

  test('classifies timeout, body limit, content type, and interrupted bodies', async () => {
    await expect(
      client({ timeoutMs: 10 }).get({
        ...input('/slow'),
        acceptedContentTypes: ['text/plain'],
      }),
    ).rejects.toMatchObject({ code: 'timeout' });
    await expect(
      client({ maxBodyBytes: 4 }).get({
        ...input('/large'),
        acceptedContentTypes: ['text/plain'],
      }),
    ).rejects.toMatchObject({ code: 'body_too_large' });
    await expect(client().get(input('/wrong-type'))).rejects.toMatchObject({
      code: 'content_type',
    });
    await expect(
      client({ allowedHosts: [`${cutServer.hostname}:${cutServer.port}`] }).get({
        acceptedContentTypes: ['text/plain'],
        sourceId: crypto.randomUUID(),
        state: null,
        url: `http://${cutServer.hostname}:${cutServer.port}/cut`,
      }),
    ).rejects.toMatchObject({ code: 'network' });
  });

  test('rejects image resources before issuing a request', async () => {
    imageRequests = 0;

    await expect(
      client().get({
        ...input('/cover.jpg'),
        acceptedContentTypes: ['image/jpeg'],
      }),
    ).rejects.toMatchObject({ code: 'prohibited_resource' });
    expect(imageRequests).toBe(0);
  });
});

describe('host scheduler', () => {
  test('serializes a host and waits for its minimum interval plus jitter', async () => {
    let now = 0;
    let active = 0;
    let maximumActive = 0;
    const delays: number[] = [];
    const scheduler = new HostRequestScheduler({
      jitterMs: 100,
      minIntervalMs: 2_000,
      now: () => now,
      random: () => 0.5,
      sleep: (milliseconds) => {
        delays.push(milliseconds);
        now += milliseconds;
        return Promise.resolve();
      },
    });
    const request = async () => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await Bun.sleep(1);
      active -= 1;
    };

    await Promise.all([
      scheduler.schedule('example.test', request),
      scheduler.schedule('example.test', request),
    ]);

    expect(maximumActive).toBe(1);
    expect(delays).toEqual([2_050]);
  });
});

test('ConnectorHttpError exposes a stable failure code', () => {
  expect(new ConnectorHttpError('parse', 'failed').code).toBe('parse');
});
