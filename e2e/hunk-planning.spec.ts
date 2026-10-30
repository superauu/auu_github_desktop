import { test, expect, type Page } from '@playwright/test';

test.beforeEach(async ({ page, baseURL }) => {
  await page.route('**/*', route => { const url = new URL(route.request().url()); return url.origin !== baseURL || url.pathname.startsWith('/api/') ? route.abort() : route.continue(); });
  await page.setViewportSize({ width: 1440, height: 900 });
});
test.afterEach(async ({ page }) => { await expect(page.locator('html')).toHaveAttribute('data-ui-fixture-network-attempts', '[]'); });
async function open(page: Page, extra = '') {
  await page.goto(`/tests/visual/index.html?automation=1&hunks=1${extra}`);
  await expect(page.locator('html')).toHaveAttribute('data-ui-fixture-ready', 'true', { timeout: 45_000 });
  await page.locator('#commit-title').fill('Existing ordinary draft');
  await page.getByRole('button', { name: '按暂存代码块规划提交', exact: true }).click();
  return page.getByRole('dialog', { name: '规划代码块提交' });
}
async function split(page: Page, extra = '') {
  const dialog = await open(page, extra);
  await expect(dialog.getByText('3 个暂存块', { exact: true })).toBeVisible();
  await dialog.getByLabel('提交标题', { exact: true }).fill('feat: first');
  await dialog.getByRole('button', { name: '添加提交', exact: true }).click();
  await dialog.getByLabel('提交标题', { exact: true }).nth(1).fill('feat: second');
  await dialog.getByRole('combobox', { name: '分配到提交: task.ts @@ -1,1 +1,1 @@', exact: true }).selectOption({ label: '1. feat: first' });
  await dialog.getByRole('combobox', { name: '分配到提交: task.ts @@ -20,1 +20,1 @@', exact: true }).selectOption({ label: '2. feat: second' });
  return dialog;
}
const writes = async (page: Page) => JSON.parse(await page.locator('html').getAttribute('data-hunk-fixture-writes') || '[]') as { title: string; units: string[] }[];

test('manual staged-hunk groups preview exactly, reorder and preserve the ordinary draft', async ({ page }) => {
  const dialog = await split(page);
  await expect(dialog.getByText('1 个块暂不提交', { exact: true })).toBeVisible();
  await dialog.getByRole('region', { name: '提交 2', exact: true }).getByRole('button', { name: '预览本次提交差异' }).click();
  const preview = dialog.getByRole('region', { name: '提交差异预览', exact: true });
  await expect(preview).toContainText('+second feature'); await expect(preview).not.toContainText('+first feature');
  expect(await writes(page)).toHaveLength(0);
  await dialog.getByRole('region', { name: '提交 2', exact: true }).getByRole('button', { name: '向前移动此提交', exact: true }).click();
  await expect(preview).toHaveCount(0);
  await expect(dialog.getByLabel('提交标题', { exact: true }).first()).toHaveValue('feat: second');
  await page.setViewportSize({ width: 750, height: 600 });
  const bounds = await dialog.evaluate(element => ({ width: element.clientWidth, scroll: element.scrollWidth })); expect(bounds.scroll).toBeLessThanOrEqual(bounds.width + 1);
  await dialog.getByRole('button', { name: '按顺序创建 2 个提交', exact: true }).click();
  await expect(dialog.getByText('已创建 2 个提交', { exact: true })).toBeVisible();
  expect(await writes(page)).toEqual([{ title: 'feat: second', units: ['h0:1'] }, { title: 'feat: first', units: ['h0:0'] }]);
  await dialog.getByRole('button', { name: '关闭', exact: true }).last().click();
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.locator('#commit-title')).toHaveValue('Existing ordinary draft');
});

test('a partial hook failure keeps completed results and explicitly reloads only remaining units', async ({ page }) => {
  const dialog = await split(page, '&failSecond=1');
  await dialog.getByRole('button', { name: '按顺序创建 2 个提交', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Fixture hook rejected');
  await expect(dialog.getByText('已创建 1 个提交', { exact: true })).toBeVisible();
  expect(await writes(page)).toHaveLength(1);
  await expect(dialog.getByRole('button', { name: '按顺序创建 2 个提交', exact: true })).toHaveCount(0);
  await dialog.getByRole('button', { name: '读取剩余暂存改动并重新分组', exact: true }).click();
  await expect(dialog.getByText('2 个暂存块', { exact: true })).toBeVisible();
  await expect(dialog.getByLabel('提交标题', { exact: true })).toHaveValue('');
  await expect(dialog.getByRole('combobox', { name: /分配到提交: task.ts @@ -1,/ })).toHaveCount(0);
  expect(await writes(page)).toHaveLength(1);
});

test('stop waits for the active commit and prevents later commits', async ({ page }) => {
  const dialog = await split(page, '&slowWrite=1');
  await dialog.getByRole('button', { name: '按顺序创建 2 个提交', exact: true }).click();
  await dialog.getByRole('button', { name: '停止后续提交', exact: true }).click();
  await expect(dialog.getByRole('button', { name: '关闭', exact: true }).last()).toBeDisabled();
  await page.keyboard.press('Escape'); await expect(dialog).toBeVisible();
  await expect(dialog.getByText('已创建 1 个提交', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('alert')).toContainText('已停止后续提交'); expect(await writes(page)).toHaveLength(1);
});

test('cancelled capture cannot populate a late plan and an empty index explains staging first', async ({ page }) => {
  let dialog = await open(page, '&slowRead=1');
  await dialog.getByRole('button', { name: '取消读取', exact: true }).click();
  await expect(dialog.getByRole('alert')).toHaveText('已取消读取。');
  // The delayed capture must not replace the cancelled state.
  await expect(dialog.getByRole('button', { name: '按顺序创建 1 个提交', exact: true })).toHaveCount(0);
  await dialog.getByRole('button', { name: '关闭', exact: true }).last().click();
  dialog = await open(page, '&noStaged=1');
  await expect(dialog.getByRole('alert')).toContainText('尚无已暂存改动'); expect(await writes(page)).toHaveLength(0);
});
