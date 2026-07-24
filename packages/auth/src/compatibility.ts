import { betterAuth } from 'better-auth';

const auth = betterAuth({
  baseURL: 'http://127.0.0.1:3101',
  secret: 'bun-compatibility-probe-secret-32-bytes',
  telemetry: { enabled: false },
});
const response = await auth.handler(new Request('http://127.0.0.1:3101/api/auth/ok'));

if (response.status !== 200 || (await response.json()).ok !== true) {
  throw new Error('Better Auth health request failed');
}
