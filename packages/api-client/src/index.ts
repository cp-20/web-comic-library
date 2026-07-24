import type { ApiType } from '@web-comic-library/api/rpc';
import { hc } from 'hono/client';

export type ApiClient = ReturnType<typeof hc<ApiType>>;

export const createApiClient = (...args: Parameters<typeof hc>): ApiClient => {
  return hc<ApiType>(...args);
};
