import { expect, test, type Page } from '@playwright/test';

const working = 'src/long/directory/working-file.ts';
const conflict = 'src/long/directory/conflicted-file.ts';
const row = (page: Page, path: string) => page.locator(`[data-list-row][data-file-path="${path}"]`);
const writes = async (page: Page) => JSON.parse(await page.locator('html').getAttribute('data-file-actions-fixture-writes') || '[]');
async function open(page: Page, query = '') {
  await page.goto(`/tests/visual/index.html?automation=1&review=1&fileActions=1${query}`);
  await expect(page.locator('html')).toHaveAttribute('data-ui-fixture-ready', 'true');
  await expect(row(page, working)).toHaveAttribute('data-review-state', 'pending');
  await page.evaluate(() => document.fonts.ready);
}
async function resize(page: Page, width: number) {
  await page.evaluate(value => window.dispatchEvent(new CustomEvent('file-actions-fixture-width', { detail: value })), width);
  await expect(page.locator('.glass-file-list')).toHaveCSS('width', `${width}px`);
}

test.beforeEach(async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route('**/*', route => { const url = new URL(route.request().url()); return url.origin !== baseURL || url.pathname.startsWith('/api/') ? route.abort() : route.continue(); });
});
test.afterEach(async ({ page }) => { await expect(page.locator('html')).toHaveAttribute('data-ui-fixture-network-attempts', '[]'); });

for (const variant of [{ theme: 'dark', lang: 'zh' }, { theme: 'light', lang: 'en' }]) {
  test(`file names and aligned review markers survive hover, focus and panel resize (${variant.theme}/${variant.lang})`, async ({ page }) => {
    await open(page, `&theme=${variant.theme}&lang=${variant.lang}`);
    for (const width of [160, 239, 240, 260, 319, 320, 359, 360, 500]) {
      await resize(page, width);
      await page.mouse.move(1400, 10);
      await page.locator('body').click({ position: { x: 1400, y: 10 } });
      const rows = page.locator('[data-working-file-group] [data-list-row]');
      const edges: number[] = [];
      for (const item of await rows.all()) {
        const marker = item.locator('[data-working-review-state]');
        const before = (await marker.boundingBox())!;
        const filename = (await item.locator('span[title]').filter({ has: page.locator('span.truncate') }).boundingBox())!;
        expect(filename.width).toBeGreaterThan(20);
        const bounds = (await item.boundingBox())!;
        expect(before.x + before.width).toBeLessThanOrEqual(bounds.x + bounds.width);
        edges.push(before.x + before.width);
        await item.hover();
        expect((await marker.boundingBox())!.x).toBeCloseTo(before.x, 1);
        await item.focus();
        expect((await marker.boundingBox())!.x).toBeCloseTo(before.x, 1);
        await expect(item.locator('[data-working-file-actions]')).toHaveCSS('opacity', '1');
      }
      expect(Math.max(...edges) - Math.min(...edges)).toBeLessThan(1);
      expect(await page.locator('.glass-file-list').evaluate(element => element.scrollWidth)).toBeLessThanOrEqual(width);
      if ([160, 260, 500].includes(width)) await page.locator('.glass-file-list').screenshot({ path: `test-results/file-actions-${variant.theme}-${variant.lang}-${width}.png` });
    }
    await page.screenshot({ path: `test-results/file-actions-${variant.theme}-${variant.lang}.png` });
  });
}

test('keyboard reveals inline actions and conflict menu restores focus without selecting another file', async ({ page }) => {
  await open(page); await resize(page, 320);
  await page.mouse.move(1400, 10);
  await expect(row(page, 'notes.md').locator('[data-working-file-actions]')).toHaveCSS('pointer-events', 'none');
  await row(page, working).focus();
  await page.keyboard.press('Tab'); // selection checkbox
  await page.keyboard.press('Tab'); // discard
  await expect(row(page, working).getByRole('button', { name: '放弃修改 (Discard)', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(row(page, working).getByRole('button', { name: '暂存此文件 (Stage)', exact: true })).toBeFocused();
  const trigger = row(page, conflict).getByRole('button', { name: `变更操作: ${conflict}`, exact: true });
  await trigger.focus(); await page.keyboard.press('Enter');
  await expect(page.getByRole('menuitem')).toHaveCount(5);
  await expect(page.getByRole('menuitem', { name: '采用当前更改 (Ours)', exact: true })).toBeVisible();
  await page.keyboard.press('Escape'); await expect(trigger).toBeFocused();
  await expect(row(page, working)).toHaveAttribute('aria-current', 'true');
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  expect(await writes(page)).toEqual([]);
});

test('inline and compact actions stage the intended file, block duplicate writes and support unstage', async ({ page }) => {
  await open(page); await resize(page, 320);
  await row(page, working).hover();
  const stage = row(page, working).getByRole('button', { name: '暂存此文件 (Stage)', exact: true });
  await stage.click();
  await expect(stage).toBeDisabled();
  await row(page, 'notes.md').hover();
  await expect(row(page, 'notes.md').getByRole('button', { name: '跟踪并暂存', exact: true })).toBeDisabled();
  await expect(page.locator('[data-working-file-group="staged"]').locator(`[data-file-path="${working}"]`)).toHaveCount(1);
  await expect(row(page, working)).toBeFocused();
  expect(await writes(page)).toEqual([{ action: 'stage', path: working }]);
  await resize(page, 160);
  const trigger = row(page, working).getByRole('button', { name: `变更操作: ${working}`, exact: true });
  await trigger.focus(); await page.keyboard.press('Enter');
  await page.getByRole('menuitem', { name: '取消暂存', exact: true }).click();
  await expect(page.locator('[data-working-file-group="unstaged"]').locator(`[data-file-path="${working}"]`)).toHaveCount(1);
  await expect(row(page, working)).toBeFocused();
  expect(await writes(page)).toEqual([{ action: 'stage', path: working }, { action: 'unstage', path: working }]);
});

test('conflict menu keeps all five operations available and routes writes to that conflict only', async ({ page }) => {
  await open(page); await resize(page, 160);
  const trigger = row(page, conflict).getByRole('button', { name: `变更操作: ${conflict}`, exact: true });
  for (const label of ['采用当前更改 (Ours)', '采用传入更改 (Theirs)', '重置回冲突标记 (Reset Markers)']) {
    await trigger.focus(); await page.keyboard.press('Enter');
    await page.getByRole('menuitem', { name: label, exact: true }).click();
    await expect(page.locator('[data-working-file-group="staged"] button').first()).toBeEnabled();
    await expect(trigger).toBeFocused();
  }
  expect(await writes(page)).toEqual(['ours', 'theirs', 'reset'].map(action => ({ action, path: conflict })));
  await trigger.focus(); await page.keyboard.press('Enter');
  await page.getByRole('menuitem', { name: '打开解决冲突工作台', exact: true }).click();
  await expect(row(page, conflict)).toHaveAttribute('aria-current', 'true');
  await trigger.focus(); await page.keyboard.press('Enter');
  await page.getByRole('menuitem', { name: '冲突已全部解决，暂存此文件 (Stage)', exact: true }).click();
  await expect(page.locator('[data-working-file-group="staged"]').locator(`[data-file-path="${conflict}"]`)).toHaveCount(1);
  expect((await writes(page)).at(-1)).toEqual({ action: 'stage', path: conflict });
});

test('failed file actions report the error and allow retry without changing groups', async ({ page }) => {
  await open(page, '&actionFailure=1'); await resize(page, 320);
  const stage = row(page, working).getByRole('button', { name: '暂存此文件 (Stage)', exact: true });
  await row(page, working).hover(); await stage.click();
  await expect(page.getByRole('alert')).toContainText(`暂存失败: ${working}`);
  await page.getByRole('alert').locator('summary').click();
  await expect(page.getByText('Fixture index locked', { exact: true })).toBeVisible();
  await expect(stage).toBeEnabled();
  await stage.focus(); await page.keyboard.press('Enter');
  await expect.poll(() => writes(page)).toHaveLength(2);
  await expect(stage).toBeEnabled();
  await expect(page.locator('[data-working-file-group="unstaged"]').locator(`[data-file-path="${working}"]`)).toHaveCount(1);
});
