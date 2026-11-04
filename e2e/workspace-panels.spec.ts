import { expect, test, type Page } from '@playwright/test';

test.use({ viewport: { width: 1440, height: 900 }, hasTouch: true });
test.beforeEach(async ({ page, baseURL }) => {
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    return url.origin !== baseURL || url.pathname.startsWith('/api/') ? route.abort() : route.continue();
  });
});
test.afterEach(async ({ page }) => {
  await expect(page.locator('html')).toHaveAttribute('data-ui-fixture-network-attempts', '[]');
});

async function open(page: Page, query = 'issues=1') {
  await page.goto(`/tests/visual/index.html?automation=1&panels=1&${query}`);
  await expect(page.locator('html')).toHaveAttribute('data-ui-fixture-ready', 'true');
}

type PanelCommand = {
  view?: 'changes' | 'issues' | 'pullRequests' | 'errors' | 'actions';
  width?: number;
  loadPullRequests?: boolean;
  loading?: 'pr' | 'actions';
  failure?: 'pr' | 'actions';
  syncing?: boolean;
};
async function command(page: Page, detail: PanelCommand) {
  await page.evaluate(detail => window.dispatchEvent(new CustomEvent('workspace-panels-fixture', { detail })), detail);
}

async function showPullRequests(page: Page, width: number) {
  await command(page, { view: 'pullRequests', width });
  await expect(page.locator('input[name="pull-request-search"]')).toBeVisible();
}

for (const lang of ['zh', 'en']) {
  test(`MR filters, count and refresh remain reachable at every supported width (${lang})`, async ({ page }) => {
    await open(page, `issues=1&lang=${lang}`);
    for (const width of [200, 240, 320, 550]) {
      await showPullRequests(page, width);
      const header = page.locator('.workspace-panel-header').first();
      expect(await header.evaluate(el => {
        const bounds = el.getBoundingClientRect();
        const controls = [...el.querySelectorAll('button, select, .panel-count')];
        return controls.every(control => {
          const rect = control.getBoundingClientRect();
          const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
          return rect.width > 0 && rect.left >= bounds.left && rect.right <= bounds.right
            && (control === hit || control.contains(hit));
        });
      })).toBe(true);
      const refresh = header.getByRole('button');
      await refresh.focus();
      await expect(refresh).toBeFocused();
      expect(await header.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
      if (width === 200) {
        await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); });
        await page.mouse.move(1400, 10);
        await expect(page.locator('[data-workspace-view]')).toHaveScreenshot(`mr-minimum-${lang}.png`);
      }
    }
  });
}

test('the shared divider resizes with mouse and touch, cancels cleanly, and retains keyboard reset', async ({ page, context }) => {
  await open(page);
  await expect(page.locator('.issues-row')).toBeVisible();
  const divider = page.locator('.issues-resize-host [role="separator"]');
  let rect = (await divider.boundingBox())!;
  await page.mouse.move(rect.x + rect.width / 2, rect.y + 80);
  await page.mouse.down();
  await page.mouse.move(rect.x + rect.width / 2 + 48, rect.y + 80, { steps: 4 });
  await page.mouse.up();
  await expect(divider).toHaveAttribute('aria-valuenow', '368');
  await divider.dblclick();
  await expect(divider).toHaveAttribute('aria-valuenow', '320');
  rect = (await divider.boundingBox())!;
  const cdp = await context.newCDPSession(page);
  const x = rect.x + rect.width / 2, y = rect.y + 80;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (const delta of [16, 32, 48, 64]) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + delta, y }] });
  }
  await expect(divider).toHaveAttribute('aria-valuenow', '384');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await expect(page.locator('body')).not.toHaveCSS('cursor', 'col-resize');
  await divider.focus();
  await page.keyboard.press('Home');
  await expect(divider).toHaveAttribute('aria-valuenow', '320');
  await page.keyboard.press('End');
  await expect(divider).toHaveAttribute('aria-valuenow', '640');
  await page.keyboard.press('ArrowLeft');
  await expect(divider).toHaveAttribute('aria-valuenow', '624');
});

test('compact empty-state icons align with their text', async ({ page }) => {
  await open(page);
  const panel = page.locator('.issues-detail-panel');
  const icon = (await panel.locator('svg').boundingBox())!;
  const title = (await panel.locator('.text-xs').boundingBox())!;
  expect(Math.abs(icon.x + icon.width / 2 - title.x - title.width / 2)).toBeLessThan(1);
});

test('a short issue list fills the narrow workspace before and after returning from detail', async ({ page }) => {
  await page.setViewportSize({ width: 750, height: 600 });
  await open(page);
  const row = page.locator('.issues-row');
  await expect(row).toBeVisible();
  const fillsHeight = async () => {
    const panel = (await page.locator('.issues-list-panel').boundingBox())!;
    const columns = (await page.locator('.issues-columns').boundingBox())!;
    expect(panel.height).toBeCloseTo(columns.height, 0);
  };
  await fillsHeight();
  await row.click();
  await page.getByRole('button', { name: '返回列表', exact: true }).click();
  await fillsHeight();
});

test('issue counts distinguish the matching total from loaded rows and follow filters', async ({ page }) => {
  await open(page, 'issues=1&issuePages=1');
  await expect(page.locator('.issues-row')).toHaveCount(30);
  const count = page.locator('.workspace-panel-header .panel-count');
  await expect(count).toHaveText('65');
  await expect(count).toHaveAttribute('title', /65.*未加载/);
  await expect(page.locator('.issues-list-footer')).toContainText('已加载 30 条');
  await page.getByRole('textbox', { name: '搜索 Issue', exact: true }).fill('Paginated issue 163');
  await expect(page.locator('.issues-row')).toHaveCount(1);
  await expect(count).toHaveText('1');
});

test('PR and CI loading and retry stay within their panels', async ({ page }) => {
  for (const view of ['pullRequests', 'actions'] as const) {
    await open(page, view === 'pullRequests' ? 'issues=1' : 'gitlab=1');
    await command(page, { view });
    const root = page.locator(`[data-workspace-view="${view}"]`);
    await expect(root).toBeVisible();
    const header = root.locator('.workspace-panel-header').first();
    const before = (await header.boundingBox())!;
    await command(page, { loading: view === 'pullRequests' ? 'pr' : 'actions' });
    const loading = root.locator('.workspace-notice[role="status"]').first();
    await expect(loading).toBeVisible();
    await expect(loading).toHaveAttribute('aria-live', 'polite');
    expect((await header.boundingBox())!.y).toBe(before.y);
    await command(page, { failure: view === 'pullRequests' ? 'pr' : 'actions' });
    const banner = root.locator('.workspace-error');
    await expect(banner).toBeVisible();
    await banner.getByRole('button', { name: '重试', exact: true }).click();
    await expect(banner).toHaveCount(0);
    expect((await header.boundingBox())!.y).toBe(before.y);
  }
});

test('a failed error source keeps healthy cached rows and identifies the failed connection', async ({ page }) => {
  await open(page, 'errors=1');
  await command(page, { view: 'errors' });
  const root = page.locator('[data-workspace-view="errors"]');
  await expect(root.getByRole('button', { name: /FRONTEND-ABC/ })).toBeVisible();
  const banner = root.locator('.workspace-error');
  await expect(banner).toContainText('个人 Sentry');
  await expect(banner.getByRole('button', { name: '重试', exact: true })).toBeEnabled();
  await expect(banner.getByRole('button', { name: '去设置', exact: true })).toBeVisible();
  await command(page, { syncing: true });
  await expect(banner.getByRole('button', { name: '重试', exact: true })).toBeDisabled();
  await expect(root.getByRole('button', { name: /FRONTEND-ABC/ })).toBeVisible();
});

const views = [
  { view: 'changes', query: 'review=1&fileActions=1' },
  { view: 'issues', query: 'issues=1&issueLayout=1' },
  { view: 'pullRequests', query: 'issues=1&workflow=1' },
  { view: 'errors', query: 'errors=1' },
  { view: 'actions', query: 'gitlab=1' },
] as const;
for (const variant of [{ theme: 'dark', lang: 'zh' }, { theme: 'light', lang: 'en' }]) {
  for (const { view, query } of views) {
    test(`desktop panel ${view} ${variant.theme}/${variant.lang}`, async ({ page }) => {
      // 相对日期稳定，保留真实定时器，避免冻结加载、重试和交互。
      await page.addInitScript(() => { Date.now = () => Date.parse('2026-11-05T00:00:00Z'); });
      await page.emulateMedia({ colorScheme: variant.theme as 'dark' | 'light', reducedMotion: 'reduce' });
      await open(page, `${query}&theme=${variant.theme}&lang=${variant.lang}`);
      await command(page, { view, loadPullRequests: view === 'pullRequests' });
      const root = page.locator(`[data-workspace-view="${view}"]`);
      await expect(root).toBeVisible();
      if (view === 'issues') await root.locator('.issues-row').first().click();
      if (view === 'errors') {
        await root.getByRole('button', { name: /FRONTEND-ABC/ }).click();
        await expect(root.getByText('fix(billing): guard missing order data before charge')).toBeVisible();
      }
      if (view === 'actions') await expect(root.getByText('GitLab tests', { exact: true })).toBeVisible();
      if (view === 'changes') {
        await expect(root.locator('[data-file-path][aria-current="true"]')).toHaveCSS('border-left-width', '2px');
        await expect(root.locator('[data-file-path][aria-current="true"]')).toHaveCSS('border-radius', '0px');
        expect((await root.locator('.workspace-divider').first().boundingBox())!.height).toBeGreaterThan(34);
      }
      if (['issues', 'pullRequests', 'errors'].includes(view)) {
        await expect(root.locator('.workspace-detail-title')).toHaveCSS('font-size', '14px');
        expect(await root.locator('.workspace-detail-header').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
      }
      await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); });
      await page.mouse.move(1400, 10);
      await expect(root).toHaveScreenshot(`panel-${view}-${variant.theme}-${variant.lang}.png`);
    });
  }
}
