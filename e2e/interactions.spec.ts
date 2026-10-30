import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page, baseURL }) => {
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== baseURL || url.pathname.startsWith('/api/')) return route.abort();
    return route.continue();
  });
  await page.setViewportSize({ width: 1280, height: 800 });
});

async function openFixture(page: import('@playwright/test').Page, extra = '') {
  await page.goto(`/tests/visual/index.html?automation=1&interactions=1${extra}`);
  await expect(page.locator('html')).toHaveAttribute('data-ui-fixture-ready', 'true', { timeout: 45_000 });
  await expect(page.locator('[data-commit-row]').first()).toBeVisible();
}

test.afterEach(async ({ page }) => {
  await expect(page.locator('html')).toHaveAttribute('data-ui-fixture-network-attempts', '[]');
});

test('history keyboard navigation and context-menu dismissal preserve selection and focus', async ({ page }) => {
  await openFixture(page);
  const rows = page.locator('[data-commit-row]');
  await rows.first().focus();
  await page.keyboard.press('ArrowDown');
  await expect(rows.nth(1)).toBeFocused();
  await expect(rows.nth(1)).toHaveAttribute('aria-current', 'true');
  await page.keyboard.press('Shift+F10');
  await expect(page.getByRole('menu')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
  await expect(rows.nth(1)).toBeFocused();
  await page.keyboard.press('End');
  await expect(page.locator('[data-commit-row]').last()).toBeFocused();
});

test('command dialog traps keyboard focus and Escape restores the prior history row', async ({ page }) => {
  await openFixture(page);
  const first = page.locator('[data-commit-row]').first();
  await first.focus();
  await page.keyboard.press('Control+k');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('combobox')).toBeFocused();
  for (let index = 0; index < 8; index++) await page.keyboard.press('Tab');
  expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(first).toBeFocused();
});

test('repository tabs isolate history filters and restore the original search', async ({ page }) => {
  await openFixture(page);
  const search = page.getByRole('textbox', { name: '搜索主题、作者或 Hash...' });
  await search.fill('Long branch');
  await expect(page.locator('[data-commit-row]').first()).toContainText('Long branch');
  await page.getByText('other-ui-fixture', { exact: true }).click();
  await expect(search).toHaveValue('');
  await expect(page.locator('[data-commit-row]').first()).toContainText('Other repository commit');
  await expect(page.getByText('other-only.ts', { exact: true })).toBeVisible();
  await page.getByText('workspace-ui-fixture', { exact: true }).first().click();
  await expect(search).toHaveValue('Long branch');
  await expect(page.locator('[data-commit-row]').first()).toContainText('Long branch');
  await expect(page.getByText('other-only.ts', { exact: true })).toHaveCount(0);
});

test('commit-file read failures expose a working retry without losing the selected commit', async ({ page }) => {
  await openFixture(page, '&failFiles=1');
  await expect(page.getByRole('alert').filter({ hasText: 'Fixture file load failed' })).toBeVisible();
  await page.getByRole('button', { name: '重试', exact: true }).click();
  await expect(page.getByText('Fixture file load failed')).toHaveCount(0);
  await expect(page.getByText('CommitHistoryView.tsx', { exact: true })).toBeVisible();
  await expect(page.locator('[data-commit-row][aria-current="true"]')).toHaveCount(1);
});
