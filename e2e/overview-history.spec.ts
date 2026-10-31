import { test, expect } from '@playwright/test';
test.beforeEach(async ({ page, baseURL }) => {
  await page.route('**/*', route => { const url = new URL(route.request().url()); return url.origin !== baseURL || url.pathname.startsWith('/api/') ? route.abort() : route.continue(); });
  await page.setViewportSize({ width: 1440, height: 900 });
});
test.afterEach(async ({ page }) => { await expect(page.locator('html')).toHaveAttribute('data-ui-fixture-network-attempts', '[]'); });
test('overview isolates repository errors, deduplicates changed files, filters and navigates', async ({ page }) => {
  await page.goto('/tests/visual/index.html?automation=1&overview=1');
  const overview = page.getByRole('region', { name: '多仓库总览', exact: true });
  const app = overview.getByRole('article', { name: 'Application', exact: true });
  await expect(app).toContainText('1 个改动文件'); await expect(app).toContainText('2 个待推送'); await expect(app).toContainText('origin/main'); await expect(app.locator('code')).toHaveText('bbbbbbbbbbbb');
  await expect(overview.getByRole('article', { name: 'Unavailable folder' })).toContainText('Fixture directory unavailable');
  await expect(overview.getByRole('article', { name: 'Conflict project' })).toContainText('1 个冲突文件');
  await expect(overview.getByRole('article', { name: 'Clean library' })).toContainText('检查通过');
  await overview.getByRole('combobox', { name: '筛选仓库' }).selectOption('attention'); await expect(overview.getByRole('article', { name: 'Clean library' })).toHaveCount(0);
  await overview.getByRole('searchbox').fill('Application'); await expect(overview.getByRole('article')).toHaveCount(1);
  await app.getByRole('button', { name: '查看变更', exact: true }).click();
  await expect(page.getByRole('region', { name: '多仓库总览', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '多仓库总览', exact: true }).click();
  await overview.getByRole('article', { name: 'Conflict project', exact: true }).getByRole('button', { name: '查看历史', exact: true }).click();
  await expect(overview).toHaveCount(0); await expect(page.locator('[data-commit-row]').first()).toBeVisible();
});
test('stopping a refresh does not publish late results and a retry completes normally', async ({ page }) => {
  await page.goto('/tests/visual/index.html?automation=1&overview=1&overviewSlow=1');
  const overview = page.getByRole('region', { name: '多仓库总览', exact: true });
  await overview.getByRole('button', { name: '停止刷新', exact: true }).click();
  await expect(overview).toContainText('已停止安排新的读取');
  await overview.getByRole('button', { name: '刷新总览', exact: true }).click();
  await expect(overview.getByRole('article', { name: 'Application', exact: true })).toContainText('2 个待推送');
  await expect(overview.getByRole('article', { name: 'Clean library' })).toContainText('工作区干净');
});
test('history survives a fresh page, drops retry actions, filters and clears persistently', async ({ page }) => {
  await page.goto('/tests/visual/index.html?automation=1&overview=1&historyReload=1');
  await page.getByRole('button', { name: '最近操作', exact: true }).click();
  let dialog = page.getByRole('dialog', { name: '最近操作', exact: true });
  await expect(dialog.getByRole('button', { name: 'Fixture retry', exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: '最近操作', exact: true }).click(); dialog = page.getByRole('dialog', { name: '最近操作', exact: true });
  await expect(dialog.getByText('Fixture failed fetch', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Fixture retry', exact: true })).toHaveCount(0);
  await expect(dialog).not.toContainText('fixture-private-token');
  await dialog.getByRole('combobox', { name: '筛选操作所属仓库' }).selectOption('/__overview_1__'); await expect(dialog.getByText('Fixture failed fetch', { exact: true })).toHaveCount(0);
  await dialog.getByRole('combobox', { name: '筛选操作所属仓库' }).selectOption('all');
  await dialog.getByRole('searchbox').fill('failed'); await expect(dialog.getByRole('article')).toHaveCount(1);
  await dialog.getByRole('button', { name: '清空记录', exact: true }).click();
  expect(await page.evaluate(() => localStorage.getItem('auugit-operation-history'))).toBeNull();
});
test('overview remains usable in a narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 680, height: 600 });
  await page.goto('/tests/visual/index.html?automation=1&overview=1');
  const overview = page.getByRole('region', { name: '多仓库总览', exact: true });
  await expect(overview.getByRole('article', { name: 'Application', exact: true })).toContainText('1 个改动文件');
  expect(await overview.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
});
test('switching accounts discards late CI replies from the old account', async ({ page }) => {
  await page.goto('/tests/visual/index.html?automation=1&overview=1&overviewAccount=1');
  const app = page.getByRole('article', { name: 'Application', exact: true });
  await expect(app).toContainText('正在读取 CI');
  await page.evaluate(() => window.dispatchEvent(new Event('overview-fixture-account')));
  await expect(app).toContainText('检查通过');
  await expect.poll(async () => Number(await page.locator('html').getAttribute('data-overview-fixture-old-ci'))).toBeGreaterThan(0);
  await expect(app).not.toContainText('检查未通过'); await expect(app).not.toContainText('OLD_ACCOUNT_RESULT');
});
test('search finds repositories outside the first batch and refresh reads the matching card', async ({ page }) => {
  await page.goto('/tests/visual/index.html?automation=1&overview=1&overviewMany=1');
  const overview = page.getByRole('region', { name: '多仓库总览', exact: true });
  await expect(overview.getByRole('button', { name: '刷新总览', exact: true })).toBeEnabled();
  await overview.getByRole('searchbox').fill('Extra 29');
  const card = overview.getByRole('article', { name: 'Extra 29', exact: true });
  await expect(card).toContainText('尚未读取');
  await overview.getByRole('button', { name: '刷新总览', exact: true }).click();
  await expect(card).toContainText('工作区干净');
});

test('single-repository overview fills the content width and exposes keyboard-accessible details and account connection', async ({ page }) => {
  await page.setViewportSize({ width: 1575, height: 831 });
  await page.goto('/tests/visual/index.html?automation=1&overview=1&overviewSingle=1');
  const overview = page.getByRole('region', { name: '多仓库总览', exact: true });
  const summary = overview.getByRole('region', { name: '工作空间状态', exact: true });
  await expect(summary.getByRole('button', { name: /需要处理/ })).toContainText('0');
  const row = overview.getByRole('article', { name: 'Application', exact: true });
  await expect(row).toContainText('工作区干净'); await expect(row).toContainText('已同步');
  await expect(row.getByRole('button', { name: '连接 GitHub', exact: true })).toBeVisible();
  const toggle = row.getByRole('button', { name: '仓库详情：Application', exact: true });
  await toggle.focus(); await page.keyboard.press('Space'); await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await page.keyboard.press('Enter'); await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  const sizes = await row.evaluate(element => ({ row: element.clientWidth, list: element.parentElement!.clientWidth })); expect(sizes.row).toBeGreaterThan(sizes.list * .95);
  await summary.getByRole('button', { name: /需要处理/ }).click(); await expect(overview.getByText('没有需要处理的仓库', { exact: true })).toBeVisible();
  await overview.getByRole('button', { name: '显示全部仓库', exact: true }).click(); await expect(row).toBeVisible();
});

test('summary shortcuts filter confirmed conflicts and retain readable statuses in the light theme', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 600 });
  await page.goto('/tests/visual/index.html?automation=1&overview=1&theme=light');
  const overview = page.getByRole('region', { name: '多仓库总览', exact: true });
  await expect(overview.getByRole('article', { name: 'Conflict project', exact: true })).toContainText('1 个冲突文件');
  await overview.getByRole('region', { name: '工作空间状态', exact: true }).getByRole('button', { name: /冲突文件/ }).click();
  await expect(overview.getByRole('article')).toHaveCount(1);
  await expect(overview.getByRole('article', { name: 'Conflict project', exact: true })).toBeVisible();
  expect(await overview.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
});
