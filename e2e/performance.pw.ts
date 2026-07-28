import { expect, test } from '@playwright/test';

import { mockApi } from './api-mock';

test('mobileの公開検索画面は固定fixture条件でLCP目標を満たす', async ({ page }) => {
  await mockApi(page);
  await page.addInitScript(() => {
    const metrics: number[] = [];
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) metrics.push(entry.startTime);
    }).observe({ buffered: true, type: 'largest-contentful-paint' });
    Object.defineProperty(window, 'wclLcp', { value: metrics });
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Web Comic Library' })).toBeVisible();
  const metric = await page.evaluate(() => {
    const lcp = (window as Window & { wclLcp?: readonly number[] }).wclLcp?.at(-1);
    const navigation = performance.getEntriesByType('navigation')[0];
    return lcp ?? navigation?.duration ?? Number.POSITIVE_INFINITY;
  });
  expect(metric).toBeLessThanOrEqual(2_500);
});
