import { test, expect } from '@playwright/test';

// 全局代码搜索浮层（Ctrl+Shift+G）：fixture 对 codeSearchService.grepRepo 返回固定三条命中
// （两个文件组），断言分组、计数、复制与打开入口不触网；暗/亮两档视觉基线。
test.beforeEach(async ({ page, baseURL }) => {
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    return url.origin !== baseURL || url.pathname.startsWith('/api/') ? route.abort() : route.continue();
  });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await page.goto('/tests/visual/index.html?theme=dark&automation=1');
  await expect(page.locator('html')).toHaveAttribute('data-ui-fixture-ready', 'true', { timeout: 45_000 });
  await expect(page.locator('[data-commit-row]').first()).toBeVisible();
});
test.afterEach(async ({ page }) => {
  await expect(page.locator('html')).toHaveAttribute('data-ui-fixture-network-attempts', '[]');
});

const openSearch = async (page: import('@playwright/test').Page) => {
  await page.keyboard.press('Control+Shift+g');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  return dialog;
};

test('shortcut opens code search; literal query groups hits by file with counts', async ({ page }) => {
  const dialog = await openSearch(page);
  await dialog.getByLabel('搜索代码').fill('todo');
  const rows = dialog.locator('[data-code-search-text]');
  await expect(rows).toHaveCount(3);
  await expect(dialog.getByText('src/features/git/CommitHistoryView.tsx')).toBeVisible();
  await expect(dialog.getByText('src/components/layout/Header.tsx')).toBeVisible();
  await expect(dialog.getByText('2 个文件中的 3 处匹配')).toBeVisible();
  // 行级动作可聚焦可达（复制 / 系统打开）
  await expect(dialog.getByRole('button', { name: '复制该行内容' }).first()).toBeVisible();
  await expect(dialog.getByRole('button', { name: '用系统默认程序打开' }).first()).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('short query shows the minimum-length hint and toggles keep results stable', async ({ page }) => {
  const dialog = await openSearch(page);
  await dialog.getByLabel('搜索代码').fill('t');
  await expect(dialog.getByText('请输入至少 2 个字符')).toBeVisible();
  await dialog.getByLabel('搜索代码').fill('todo');
  await expect(dialog.locator('[data-code-search-text]')).toHaveCount(3);
  // 开关不改变夹具结果（桩与查询无关），但 aria-pressed 状态必须可靠
  const caseToggle = dialog.getByRole('button', { name: '区分大小写' });
  await caseToggle.click();
  await expect(caseToggle).toHaveAttribute('aria-pressed', 'true');
  await expect(dialog.locator('[data-code-search-text]')).toHaveCount(3);
});

test('global search dark baseline', async ({ page }) => {
  const dialog = await openSearch(page);
  await dialog.getByLabel('搜索代码').fill('todo');
  await expect(dialog.locator('[data-code-search-text]').first()).toBeVisible();
  await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); });
  await expect(page).toHaveScreenshot('global-search-dark-1280x720.png');
});

test('global search light baseline', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  await page.goto('/tests/visual/index.html?theme=light&automation=1');
  await expect(page.locator('html')).toHaveAttribute('data-ui-fixture-ready', 'true', { timeout: 45_000 });
  const dialog = await openSearch(page);
  await dialog.getByLabel('搜索代码').fill('todo');
  await expect(dialog.locator('[data-code-search-text]').first()).toBeVisible();
  await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); });
  await expect(page).toHaveScreenshot('global-search-light-1280x720.png');
});
