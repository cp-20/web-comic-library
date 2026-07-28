import { expect, test } from '@playwright/test';

import { mockApi } from './api-mock';

test.beforeEach(async ({ page }) => {
  await mockApi(page);
});

test('登録、公開範囲選択、検索、follow、既読をkeyboardで完了できる', async ({ page }) => {
  await page.goto('/settings/profile');
  await page.getByLabel('ユーザーID').fill('reader-1');
  await page.getByLabel('表示名').fill('読者');
  await page.getByLabel('標準公開範囲').selectOption('private');
  await page.getByRole('button', { name: '保存' }).press('Enter');
  await expect(page.getByText('保存しました。')).toBeVisible();
  await page.goto('/');
  await page.getByLabel('作品名・別名・読み仮名・作者名').fill('テスト');
  await page.getByRole('button', { name: '検索' }).press('Enter');
  await page.getByRole('link', { name: 'テスト作品' }).click();
  await expect(page.getByRole('heading', { name: 'テスト作品' })).toBeVisible();
  await page.getByLabel('読書状態', { exact: true }).selectOption('reading');
  await page.getByRole('button', { name: '状態を保存' }).press('Enter');
  await expect(page.getByText('読書状態を保存しました。')).toBeVisible();
});

test('掲載先優先順位と四つのfollow方式を保存できる', async ({ page }) => {
  await page.goto('/settings/follows');
  await page.getByLabel('掲載先ID（優先順にカンマ区切り）').fill('source-a,source-b');
  await page.getByRole('button', { name: '優先順位を保存' }).click();
  await expect(page.getByText('掲載先の優先順位を保存しました。')).toBeVisible();
  await page.getByLabel('作品ID').fill('work-1');
  await page.getByLabel('方式').selectOption('fastest');
  await page.getByRole('button', { name: 'follow設定を保存' }).click();
  await page.getByLabel('方式').selectOption('source_priority');
  await page.getByRole('button', { name: 'follow設定を保存' }).click();
  await page.getByLabel('方式').selectOption('selected_publications');
  await page.getByRole('button', { name: 'follow設定を保存' }).click();
  await page.getByLabel('方式').selectOption('all_publications');
  await page.getByRole('button', { name: 'follow設定を保存' }).click();
  await expect(page.getByText('follow設定を保存しました。')).toBeVisible();
});

test('単行本だけの既読と所蔵を保存できる', async ({ page }) => {
  await page.goto('/library/volumes');
  await page.locator('#volumeEditionId').fill('volume-1');
  await page.getByLabel('読書状態', { exact: true }).selectOption('read');
  await page.getByLabel('紙を所蔵').check();
  await page.getByLabel('電子を所蔵').check();
  await page.getByRole('button', { name: '巻の記録を保存' }).click();
  await expect(page.getByText('単行本の記録を保存しました。')).toBeVisible();
});

test('未読者への感想本文は明示操作までDOMへ表示しない', async ({ page }) => {
  await page.goto('/works/work-1');
  await page.getByLabel('対象ID').fill('content-1');
  await page.getByRole('button', { name: '感想を表示' }).click();
  await expect(page.getByText('明示操作後だけ表示する感想本文')).not.toBeVisible();
  const reveal = page.waitForResponse((response) =>
    response.url().endsWith('/api/reviews/review-1/reveal'),
  );
  await page.getByRole('button', { name: '本文を表示する' }).click();
  expect(await (await reveal).json()).toEqual({ body: '明示操作後だけ表示する感想本文' });
  await expect(page.getByText('明示操作後だけ表示する感想本文')).toBeVisible();
});

test('公開記録だけを共有し、非公開記録をtimelineと共有pageから除外する', async ({ page }) => {
  await page.goto('/activities/activity-public');
  await expect(page.getByRole('heading', { name: '読書状態変更' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'X' })).toHaveAttribute(
    'href',
    /activities%2Factivity-public/,
  );
  await page.goto('/activities/activity-private');
  await expect(page.getByText('公開記録が見つかりません。')).toBeVisible();
  await page.goto('/timeline');
  await expect(page.getByText(/読書状態変更 \/ reading/)).toBeVisible();
  await expect(page.getByText('activity-private')).not.toBeVisible();
});

test('block、通報、管理者の非表示を完了できる', async ({ page }) => {
  await page.goto('/profiles/reader-2');
  await page.getByRole('button', { name: 'blockする' }).click();
  await expect(page.getByText('blockしました。相互のfollow申請も解除されます。')).toBeVisible();
  await page.getByLabel('通報理由').fill('公開範囲違反');
  await page.getByRole('button', { name: 'プロフィールを通報する' }).click();
  await expect(page.getByText('通報を受け付けました。')).toBeVisible();
  await page.goto('/admin/moderation');
  await expect(page.getByText('通報ID: report-1')).toBeVisible();
  await page.getByLabel('通報ID').fill('report-1');
  await page.getByLabel('対象ID').fill('activity-public');
  await page.getByLabel('理由').fill('規約違反のため非表示');
  await page.getByRole('button', { name: '操作を保存する' }).click();
  await expect(page.getByText('操作と監査記録を保存しました。')).toBeVisible();
});
