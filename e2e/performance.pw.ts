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
  await expect(page.getByRole('heading', { name: '作品を探す' })).toBeVisible();
  const metric = await page.evaluate(() => {
    const lcp = (window as Window & { wclLcp?: readonly number[] }).wclLcp?.at(-1);
    const navigation = performance.getEntriesByType('navigation')[0];
    return lcp ?? navigation?.duration ?? Number.POSITIVE_INFINITY;
  });
  expect(metric).toBeLessThanOrEqual(2_500);
});

test('fixture E2E loadで公開検索のp95が1.5秒以内', async ({ browser, baseURL }) => {
  const sampleCount = 16;
  const concurrency = 4;
  const sample = async (index: number): Promise<readonly number[]> => {
    if (index >= sampleCount) return [];
    const context = await browser.newContext();
    const page = await context.newPage();
    await mockApi(page);
    const startedAt = performance.now();
    await page.goto(baseURL ?? 'http://127.0.0.1:3100');
    await expect(page.getByRole('heading', { name: '作品を探す' })).toBeVisible();
    const duration = performance.now() - startedAt;
    await context.close();
    return [duration, ...(await sample(index + concurrency))];
  };
  const durations = (
    await Promise.all(Array.from({ length: concurrency }, (_, index) => sample(index)))
  ).flat();
  const ordered = durations.toSorted((left, right) => left - right);
  const p95 = ordered[Math.ceil(ordered.length * 0.95) - 1];
  expect(p95).toBeDefined();
  expect(p95 ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(1_500);
});
