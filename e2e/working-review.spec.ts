import { test, expect, type Page } from '@playwright/test';

// 提交前审核（working review）端到端：代码块/文件/批量三级审核、意见闭环、
// 提交提醒的两条出口，以及「内容变化后审核不沿用」的核心安全属性。

test.beforeEach(async ({ page, baseURL }) => {
  await page.route('**/*', route => { const url = new URL(route.request().url()); return url.origin !== baseURL || url.pathname.startsWith('/api/') ? route.abort() : route.continue(); });
  await page.setViewportSize({ width: 1440, height: 900 });
});
test.afterEach(async ({ page }) => { await expect(page.locator('html')).toHaveAttribute('data-ui-fixture-network-attempts', '[]'); });

async function open(page: Page) {
  await page.goto('/tests/visual/index.html?automation=1&review=1');
  await expect(page.locator('html')).toHaveAttribute('data-ui-fixture-ready', 'true', { timeout: 45_000 });
  const panel = page.getByRole('region', { name: '提交前审核', exact: true });
  await expect(panel.getByRole('status')).toHaveText(/待审核 · 0\/2/);
  return panel;
}
const fileRow = (page: Page, path: string) => page.locator(`[data-list-row][data-file-path="${path}"]`);
const commits = async (page: Page) => JSON.parse(await page.locator('html').getAttribute('data-review-fixture-commits') || '[]') as string[];

test('代码块审核与意见闭环：通过、加意见、解决后才能通过整份文件', async ({ page }) => {
  const panel = await open(page);
  // 审核通过后按钮 aria-label 变为「重新审核此代码块」，按当前名字分组定位
  await expect(page.getByRole('button', { name: '通过此代码块' })).toHaveCount(2);
  await page.getByRole('button', { name: '通过此代码块' }).first().click();
  await expect(panel.getByRole('status')).toHaveText(/待审核 · 1\/2/);
  await expect(page.getByRole('button', { name: '重新审核此代码块' })).toHaveAttribute('aria-pressed', 'true');
  const approveSecond = page.getByRole('button', { name: '通过此代码块' });
  await expect(approveSecond).toHaveCount(1);
  await expect(approveSecond).toHaveAttribute('aria-pressed', 'false');
  // 第二个代码块先记录意见：通过按钮被意见锁住
  await page.getByRole('button', { name: '记录此代码块的问题' }).nth(1).click();
  const noteText = page.getByRole('textbox', { name: '审核意见内容' });
  await expect(noteText).toBeVisible();
  const save = page.getByRole('button', { name: '保存意见', exact: true });
  await expect(save).toBeDisabled();
  await noteText.fill('这里的命名需要跟着常量走');
  await save.click();
  await expect(page.getByText('审核意见已记录', { exact: true })).toBeVisible();
  await expect(panel.getByRole('status')).toHaveText(/待审核 · 1\/2/);
  await expect(panel.getByText('请先处理 1 条待解决意见')).toBeVisible();
  await expect(page.getByRole('button', { name: '通过此文件', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: '通过此代码块' })).toBeDisabled();
  // 解决意见后锁解除，通过第二个代码块 → 整份文件已审核
  await page.getByRole('checkbox', { name: '标记为已解决' }).click();
  await expect(page.getByText('已解决', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '通过此代码块' }).click();
  await expect(panel.getByRole('status')).toHaveText(/已审核 · 2\/2/);
  await expect(page.getByRole('button', { name: '重新审核', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('文件级审核、筛选与批量审核共用同一套记录', async ({ page }) => {
  const panel = await open(page);
  await fileRow(page, 'notes.md').click();
  await expect(panel.getByRole('status')).toHaveText(/待审核 · 0\/1/);
  await page.getByRole('button', { name: '通过此文件', exact: true }).click();
  await expect(panel.getByRole('status')).toHaveText(/已审核 · 1\/1/);
  await expect(fileRow(page, 'notes.md')).toHaveAttribute('data-review-state', 'approved');
  // 筛选「待审核」后只剩 task.ts
  await page.getByRole('combobox', { name: '筛选审核状态' }).selectOption({ label: '待审核' });
  await expect(fileRow(page, 'notes.md')).toHaveCount(0);
  await expect(fileRow(page, 'task.ts')).toHaveCount(1);
  // 清除筛选后批量审核剩余文件
  await page.getByRole('combobox', { name: '筛选审核状态' }).selectOption({ label: '全部文件' });
  await page.getByRole('button', { name: '全部审核通过', exact: true }).click();
  await expect(fileRow(page, 'task.ts')).toHaveAttribute('data-review-state', 'approved');
  await expect(fileRow(page, 'notes.md')).toHaveAttribute('data-review-state', 'approved');
});

test('文件列表的方向键跨分组移动焦点', async ({ page }) => {
  await open(page);
  await fileRow(page, 'task.ts').click();
  await expect(fileRow(page, 'task.ts')).toBeFocused();
  // 暂存分组 → 未跟踪分组的边界跨越
  await page.keyboard.press('ArrowDown');
  await expect(fileRow(page, 'notes.md')).toBeFocused();
  await page.keyboard.press('End');
  await expect(fileRow(page, 'notes.md')).toBeFocused();
  await page.keyboard.press('Home');
  await expect(fileRow(page, 'task.ts')).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(fileRow(page, 'task.ts')).toBeFocused();
});

test('提交提醒：继续提交放行未审核内容', async ({ page }) => {
  const panel = await open(page);
  await page.locator('#commit-title').fill('feat: reminder flow');
  await page.getByRole('button', { name: /^提交变更/ }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('本次提交还有未审核内容');
  await expect(dialog).toContainText('本次提交包含 1 个尚未审核通过的文件');
  await expect(dialog).toContainText('task.ts');
  await expect(dialog.getByRole('checkbox', { name: /不再提醒/ })).toBeVisible();
  await dialog.getByRole('button', { name: '继续提交', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(await commits(page)).toEqual(['feat: reminder flow']);
  await expect(page.getByText('新提交创建成功')).toBeVisible();
  await expect(page.locator('#commit-title')).toHaveValue('');
  await expect(panel.getByRole('status')).toHaveText(/待审核 · 0\/2/);
});

test('提交提醒：返回审核不打断工作区，也不产生提交', async ({ page }) => {
  const panel = await open(page);
  await page.locator('#commit-title').fill('feat: never committed');
  await page.getByRole('button', { name: /^提交变更/ }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('本次提交还有未审核内容');
  await dialog.getByRole('button', { name: '返回审核', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(await commits(page)).toEqual([]);
  await expect(panel).toBeVisible();
  await expect(fileRow(page, 'task.ts')).toHaveAttribute('aria-current', 'true');
});

test('内容变化后审核记录不沿用，文件回到待审核', async ({ page }) => {
  const panel = await open(page);
  await page.getByRole('button', { name: '通过此文件', exact: true }).click();
  await expect(panel.getByRole('status')).toHaveText(/已审核 · 2\/2/);
  await page.evaluate(() => window.dispatchEvent(new Event('review-fixture-change')));
  await expect(page.locator('html')).toHaveAttribute('data-review-fixture-flipped', '1');
  await expect(panel.getByRole('status')).toHaveText(/待审核 · 0\/2/);
  await expect(page.getByRole('button', { name: '通过此文件', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: '通过此代码块' })).toHaveCount(2);
});
