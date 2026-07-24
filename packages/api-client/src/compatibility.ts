import { createApiClient } from './index';

const baseUrl = process.argv[2];

if (!baseUrl) {
  throw new Error('API base URL is required');
}

const response = await createApiClient(baseUrl).api.health.$get();

if (response.status !== 200 || (await response.json()).status !== 'ok') {
  throw new Error('Hono RPC health request failed');
}
