import { test, expect, type Page } from '@playwright/test';

// 全局文本右键菜单（AppTextContextMenu / captureTextContext）：输入框内的
// 快照-恢复-全选链路，替代浏览器原生菜单的行为契约。

test.beforeEach(async ({ page, baseURL }) => {
  await page.route('**/*', route => { const url = new URL(route.request().url()); return url.origin !== baseURL || url.pathname.startsWith('/api/') ? route.abort() : route.continue(); });
  await page.setViewportSize({ width: 1280, height: 800 });
});
test.afterEach(async ({ page }) => { await expect(page.locator('html')).toHaveAttribute('data-ui-fixture-network-attempts', '[]'); });

async function openFixture(page: Page) {
  await page.goto('/tests/visual/index.html?automation=1&interactions=1');
  await expect(page.locator('html')).toHaveAttribute('data-ui-fixture-ready', 'true', { timeout: 45_000 });
  await expect(page.locator('[data-commit-row]').first()).toBeVisible();
}

async function selection(page: Page) {
  return page.evaluate(() => {
    const element = document.activeElement;
    return element instanceof HTMLInputElement
      ? { value: element.value, start: element.selectionStart, end: element.selectionEnd, focused: true }
      : { focused: false };
  });
}

test('输入框右键菜单提供编辑项并全选当前值', async ({ page }) => {
  await openFixture(page);
  const search = page.getByRole('textbox', { name: '搜索主题、作者或 Hash...' });
  await search.fill('keyboard navigation');
  await search.click({ button: 'right' });
  const menu = page.getByRole('menu', { name: '文本操作' });
  await expect(menu).toBeVisible();
  // 可访问名含快捷键后缀（如「撤销 Ctrl+Z」），用子串匹配
  for (const item of ['撤销', '重做', '剪切', '复制', '粘贴', '全选']) {
    await expect(menu.getByRole('menuitem', { name: item })).toBeVisible();
  }
  await expect(menu.getByRole('menuitem', { name: '剪切' })).toBeDisabled();
  await expect(menu.getByRole('menuitem', { name: '复制' })).toBeDisabled();
  await menu.getByRole('menuitem', { name: '全选' }).click();
  await expect(menu).toHaveCount(0);
  await expect.poll(async () => selection(page)).toEqual({ value: 'keyboard navigation', start: 0, end: 'keyboard navigation'.length, focused: true });
});

test('右键打开菜单后焦点回到原输入框，剪切项随选区解锁', async ({ page }) => {
  await openFixture(page);
  const search = page.getByRole('textbox', { name: '搜索主题、作者或 Hash...' });
  await search.fill('restore focus');
  // 手动划选一段文本再右键：右键必须落在选区内，否则 Chromium 会塌缩选区
  await search.evaluate((element: HTMLInputElement) => { element.focus(); element.setSelectionRange(0, 7); });
  await search.click({ button: 'right', position: { x: 6, y: 15 } });
  const menu = page.getByRole('menu', { name: '文本操作' });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: '剪切' })).toBeEnabled();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  // Escape 关闭菜单后焦点与选区恢复到输入框
  await expect.poll(async () => selection(page)).toEqual({ value: 'restore focus', start: 0, end: 7, focused: true });
});

test('普通区域右键不出现文本菜单', async ({ page }) => {
  await openFixture(page);
  await page.locator('body').click({ button: 'right', position: { x: 8, y: 8 } });
  await expect(page.getByRole('menu', { name: '文本操作' })).toHaveCount(0);
});
