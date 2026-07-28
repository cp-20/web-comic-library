import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { mockApi } from './api-mock';

for (const path of ['/', '/login', '/settings/profile', '/settings/follows', '/library/volumes']) {
  test(`主要画面 ${path} に重大なWCAG 2.2 AA違反がない`, async ({ page }) => {
    await mockApi(page);
    await page.goto(path);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag22aa'])
      .analyze();
    expect(results.violations).toEqual([]);
  });
}
