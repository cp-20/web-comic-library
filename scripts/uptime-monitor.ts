const endpoints = [
  {
    name: 'Web',
    url: 'https://comic.cp20.dev/',
    accepts: (response: Response): boolean => response.ok,
  },
  {
    name: 'API',
    url: 'https://comic.cp20.dev/api/health',
    accepts: async (response: Response): Promise<boolean> => {
      if (!response.ok) {
        return false;
      }

      const body: unknown = await response.json();
      return typeof body === 'object' && body !== null && 'status' in body && body.status === 'ok';
    },
  },
] as const;

type Fetch = typeof fetch;

export type ProbeFailure = Readonly<{
  name: string;
  reason: string;
}>;

export const probeEndpoints = async (fetcher: Fetch): Promise<ProbeFailure[]> => {
  const results = await Promise.all(
    endpoints.map(async (endpoint): Promise<ProbeFailure | undefined> => {
      try {
        const response = await fetcher(endpoint.url, {
          headers: { 'user-agent': 'web-comic-library-uptime/1.0' },
          signal: AbortSignal.timeout(10_000),
        });
        if (!(await endpoint.accepts(response))) {
          return { name: endpoint.name, reason: `HTTP ${response.status}` };
        }
      } catch {
        return { name: endpoint.name, reason: 'request failed' };
      }
    }),
  );

  return results.filter((result): result is ProbeFailure => result !== undefined);
};

export const notifyDiscord = async (
  webhookUrl: string | undefined,
  failures: readonly ProbeFailure[],
  fetcher: Fetch,
): Promise<void> => {
  if (!webhookUrl) {
    throw new Error('DISCORD_WEBHOOK_URL is required when an endpoint is down');
  }

  const content = [
    '🚨 web-comic-library public endpoint failure',
    ...failures.map((failure) => `- ${failure.name}: ${failure.reason}`),
  ].join('\n');
  const response = await fetcher(webhookUrl, {
    body: JSON.stringify({ content }),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new Error(`Discord notification failed with HTTP ${response.status}`);
  }
};

export const runUptimeMonitor = async (
  webhookUrl: string | undefined,
  fetcher: Fetch = fetch,
): Promise<void> => {
  const failures = await probeEndpoints(fetcher);
  if (failures.length === 0) {
    console.log('public endpoints healthy');
    return;
  }

  await notifyDiscord(webhookUrl, failures, fetcher);
  throw new Error(`${failures.length} public endpoint(s) failed`);
};

if (import.meta.main) {
  await runUptimeMonitor(process.env.DISCORD_WEBHOOK_URL);
}
