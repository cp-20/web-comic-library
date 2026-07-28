import { defineConfig, devices } from '@playwright/test';

const port = 3100;
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  forbidOnly: Boolean(process.env.CI),
  fullyParallel: false,
  outputDir: 'test-results',
  reporter: process.env.CI ? [['html', { open: 'never' }], ['github']] : 'list',
  retries: process.env.CI ? 2 : 0,
  testDir: 'e2e',
  testMatch: '**/*.pw.ts',
  timeout: 30_000,
  use: { baseURL, screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: {
    command: `bun run --cwd apps/web start --hostname 127.0.0.1 --port ${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    url: baseURL,
  },
  workers: 1,
  projects: [{ name: 'mobile-chromium', use: { ...devices['Pixel 5'] } }],
});
