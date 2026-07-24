import { describe, expect, test } from 'bun:test';

import { notifyDiscord, probeEndpoints } from './uptime-monitor';

const healthyFetch: typeof fetch = async (input) => {
  const url = String(input);
  return url.endsWith('/api/health') ? Response.json({ status: 'ok' }) : new Response('ok');
};

const unhealthyApiFetch: typeof fetch = async (input) => {
  const url = String(input);
  return url.endsWith('/api/health')
    ? new Response('token=must-not-be-logged', { status: 503 })
    : new Response('ok');
};

describe('uptime monitor', () => {
  test('accepts healthy Web and API responses', async () => {
    expect(await probeEndpoints(healthyFetch)).toEqual([]);
  });

  test('reports an endpoint without exposing its response body', async () => {
    expect(await probeEndpoints(unhealthyApiFetch)).toEqual([{ name: 'API', reason: 'HTTP 503' }]);
  });

  test('fails safely when notification credentials are absent', async () => {
    await expect(
      notifyDiscord(undefined, [{ name: 'Web', reason: 'request failed' }], fetch),
    ).rejects.toThrow('DISCORD_WEBHOOK_URL is required');
  });

  test('sends only the failure summary to Discord', async () => {
    let requestBody: unknown;
    const fetcher: typeof fetch = async (_input, init) => {
      requestBody = JSON.parse(String(init?.body));
      return new Response(undefined, { status: 204 });
    };

    await notifyDiscord(
      'https://discord.example/webhook',
      [{ name: 'API', reason: 'HTTP 503' }],
      fetcher,
    );

    expect(requestBody).toEqual({
      content: '🚨 web-comic-library public endpoint failure\n- API: HTTP 503',
    });
  });
});
