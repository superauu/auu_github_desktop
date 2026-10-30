import { expect, test, type Page } from '@playwright/test';

const original = '@@ -47,6 +47,8 @@ The commit panel sits beside the diff at typical laptop widths';
test.beforeEach(async ({ page, baseURL }) => {
  await page.route('**/*', route => { const url = new URL(route.request().url()); return url.origin !== baseURL || url.pathname.startsWith('/api/') ? route.abort() : route.continue(); });
  await page.setViewportSize({ width: 1575, height: 831 });
});
test.afterEach(async ({ page }) => { await expect(page.locator('html')).toHaveAttribute('data-ui-fixture-network-attempts', '[]'); });
async function open(page: Page) {
  await page.goto('/tests/visual/index.html?automation=1&hunks=1&diffHunks=1');
  await expect(page.locator('html')).toHaveAttribute('data-ui-fixture-ready', 'true', { timeout: 45_000 });
  await expect(page.locator('[data-diff-hunk-label]').first()).toBeVisible();
}
test('readable ranges show actual change counts and copy the original header without altering hunk actions', async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (text: string) => { document.documentElement.dataset.hunkClipboard = text; } } }); });
  await open(page);
  const header = page.locator('.review-diff-hunk').first(), trigger = header.locator('[data-diff-hunk-label]');
  await expect(header).toContainText('原 47–52 行 → 新 47–54 行'); await expect(header).toContainText('+2'); await expect(header).toContainText('−0');
  await expect(header).not.toContainText('The commit panel');
  await trigger.click();
  const details = page.getByRole('dialog', { name: '代码块信息', exact: true });
  await expect(details).toContainText('新增 2 行'); await expect(details).toContainText('删除 0 行'); await expect(details).toContainText('行号范围包含未修改的上下文');
  await expect(details.locator('pre')).toHaveText(original);
  await details.getByRole('button', { name: '复制原始标记', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-hunk-clipboard', original);
  await page.keyboard.press('Escape'); await expect(details).toHaveCount(0); await expect(trigger).toBeFocused();
  await header.getByRole('button', { name: '取消暂存此块', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-hunk-fixture-stage-header', original);
  await page.getByRole('textbox', { name: '查找差异内容', exact: true }).fill('47–52');
  await expect(header.locator('mark')).toHaveText('47–52');
});

test('split view and a narrow viewport retain readable labels and a keyboard-accessible details popover', async ({ page }) => {
  await open(page); await page.getByRole('button', { name: '分栏视图', exact: true }).click();
  const trigger = page.locator('[data-diff-hunk-label]').first();
  await expect(trigger).toContainText('原 47–52 行 → 新 47–54 行');
  await page.setViewportSize({ width: 750, height: 600 }); await trigger.focus(); await page.keyboard.press('Enter');
  const details = page.getByRole('dialog', { name: '代码块信息', exact: true }); await expect(details).toBeVisible();
  const bounds = await details.boundingBox(); expect(bounds).not.toBeNull(); expect(bounds!.x).toBeGreaterThanOrEqual(0); expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(750);
  await expect(details.locator('pre')).toHaveText(original); await page.keyboard.press('Escape'); await expect(trigger).toBeFocused();
});

test('clipboard failure leaves the exact original header available for manual copying', async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new Error('Clipboard blocked'); } } }); });
  await open(page); await page.locator('[data-diff-hunk-label]').first().click();
  const details = page.getByRole('dialog', { name: '代码块信息', exact: true });
  await details.getByRole('button', { name: '复制原始标记', exact: true }).click();
  await expect(details.getByRole('alert')).toContainText('请选中上方原始标记手动复制'); await expect(details.locator('pre')).toHaveText(original);
});
