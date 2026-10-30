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
  await dialog.getByRole('combobox', { name: '分配到提交: task.ts 原 1 行 → 新 1 行', exact: true }).selectOption({ label: '1. feat: first' });
  await dialog.getByRole('combobox', { name: '分配到提交: task.ts 原 20 行 → 新 20 行', exact: true }).selectOption({ label: '2. feat: second' });
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
  await expect(dialog.getByRole('combobox', { name: '分配到提交: task.ts 原 1 行 → 新 1 行', exact: true })).toHaveCount(0);
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

test('AI proposals preserve manual groups until applied, then remain editable before committing', async ({ page }) => {
  const dialog = await split(page, '&ai=1');
  await dialog.getByRole('button', { name: 'AI 建议分组', exact: true }).click();
  await expect(dialog.getByRole('button', { name: '应用建议并替换当前分组', exact: true })).toBeVisible();
  await expect(dialog.getByLabel('提交标题', { exact: true }).first()).toHaveValue('feat: first');
  await expect(dialog.getByRole('button', { name: '按顺序创建 2 个提交', exact: true })).toBeDisabled();
  expect(await writes(page)).toHaveLength(0);
  await dialog.getByRole('button', { name: '保留当前分组', exact: true }).click();
  await expect(dialog.getByLabel('提交标题', { exact: true }).first()).toHaveValue('feat: first');
  await dialog.getByRole('button', { name: 'AI 建议分组', exact: true }).click();
  await dialog.getByRole('button', { name: '应用建议并替换当前分组', exact: true }).click();
  await expect(dialog.getByLabel('提交标题', { exact: true }).first()).toHaveValue('feat: staged feature');
  await expect(dialog.getByRole('textbox', { name: '详细说明', exact: true }).first()).toHaveValue('实现第一处暂存变更。');
  expect(await writes(page)).toHaveLength(0);
  await dialog.getByRole('combobox', { name: '分配到提交: assets/logo.bin 整体文件 / 元数据', exact: true }).selectOption('');
  await dialog.getByRole('region', { name: '提交 1', exact: true }).getByRole('button', { name: '预览本次提交差异', exact: true }).click();
  await expect(dialog.getByRole('region', { name: '提交差异预览', exact: true })).toContainText('+first feature');
  await dialog.getByRole('button', { name: '按顺序创建 2 个提交', exact: true }).click();
  await expect(dialog.getByText('已创建 2 个提交', { exact: true })).toBeVisible();
  expect(await writes(page)).toEqual([{ title: 'feat: staged feature', units: ['h0:0'] }, { title: 'chore: staged assets', units: ['h0:1'] }]);
});

test('cancelled AI responses cannot overwrite later manual edits', async ({ page }) => {
  const dialog = await split(page, '&ai=1&aiSlow=1');
  await dialog.getByRole('button', { name: 'AI 建议分组', exact: true }).click();
  await dialog.getByRole('button', { name: '取消 AI 分析', exact: true }).click();
  await dialog.getByLabel('提交标题', { exact: true }).first().fill('Manual after cancellation');
  await expect(page.locator('html')).toHaveAttribute('data-hunk-fixture-ai-responses', '1');
  await expect(dialog.getByLabel('提交标题', { exact: true }).first()).toHaveValue('Manual after cancellation');
  await expect(dialog.getByRole('button', { name: '应用建议并替换当前分组', exact: true })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: '按顺序创建 2 个提交', exact: true })).toBeEnabled();
  expect(await writes(page)).toHaveLength(0);
});

for (const scenario of ['aiInvalid', 'aiStale', 'aiStaleOnApply']) test(`AI ${scenario} preserves the manual plan and creates no commits`, async ({ page }) => {
  const dialog = await split(page, `&ai=1&${scenario}=1`);
  await dialog.getByRole('button', { name: 'AI 建议分组', exact: true }).click();
  if (scenario === 'aiStaleOnApply') await dialog.getByRole('button', { name: '应用建议并替换当前分组', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText(scenario === 'aiInvalid' ? 'AI 分组无效' : '暂存区已变化');
  await expect(dialog.getByLabel('提交标题', { exact: true }).first()).toHaveValue('feat: first');
  await expect(dialog.getByLabel('提交标题', { exact: true }).first()).toBeEnabled();
  expect(await writes(page)).toHaveLength(0);
});

test('reloading a snapshot discards an in-flight AI result and starts with fresh groups', async ({ page }) => {
  const dialog = await split(page, '&ai=1&aiSlow=1');
  await dialog.getByRole('button', { name: 'AI 建议分组', exact: true }).click();
  await dialog.getByRole('button', { name: '重新读取并清空分组', exact: true }).click();
  await expect(dialog.getByLabel('提交标题', { exact: true })).toHaveValue('');
  await expect(page.locator('html')).toHaveAttribute('data-hunk-fixture-ai-responses', '1');
  await expect(dialog.getByRole('button', { name: '应用建议并替换当前分组', exact: true })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'AI 建议分组', exact: true })).toBeEnabled();
  expect(await writes(page)).toHaveLength(0);
});

async function reopen(page: Page) {
  await page.getByRole('dialog', { name: '规划代码块提交' }).getByRole('button', { name: '关闭', exact: true }).last().click();
  await page.getByRole('button', { name: '按暂存代码块规划提交', exact: true }).click();
  return page.getByRole('dialog', { name: '规划代码块提交' });
}

test('saved groups restore only on request, preserving order, messages and unassigned units', async ({ page }) => {
  let dialog = await split(page, '&ai=1');
  await dialog.getByLabel('详细说明', { exact: true }).first().fill('Persist this explanation');
  await dialog.getByRole('region', { name: '提交 2', exact: true }).getByRole('button', { name: '向前移动此提交', exact: true }).click();
  await expect(dialog.getByRole('status').filter({ hasText: '规划草稿已保存在本机' })).toBeVisible();
  dialog = await reopen(page);
  await expect(dialog.getByRole('region', { name: '发现提交规划草稿', exact: true })).toContainText('暂存快照匹配');
  await expect(dialog.getByLabel('提交标题', { exact: true })).toHaveValue('');
  await expect(dialog.getByLabel('提交标题', { exact: true })).toBeDisabled();
  await expect(dialog.getByRole('button', { name: 'AI 建议分组', exact: true })).toBeDisabled();
  expect(await writes(page)).toHaveLength(0);
  await dialog.getByRole('button', { name: '恢复草稿', exact: true }).click();
  await expect(dialog.getByLabel('提交标题', { exact: true }).first()).toHaveValue('feat: second');
  await expect(dialog.getByRole('textbox', { name: '详细说明', exact: true }).nth(1)).toHaveValue('Persist this explanation');
  await expect(dialog.getByRole('combobox', { name: '分配到提交: task.ts 原 20 行 → 新 20 行', exact: true }).locator('option:checked')).toHaveText('1. feat: second');
  await expect(dialog.getByText('1 个块暂不提交', { exact: true })).toBeVisible();
  expect(await writes(page)).toHaveLength(0);
  await expect(dialog.getByRole('button', { name: '按顺序创建 2 个提交', exact: true })).toBeEnabled();
  await expect(page.locator('#commit-title')).toHaveValue('Existing ordinary draft');
});

test('a fresh page can recover a saved plan, then submission clears the draft before writing', async ({ page }) => {
  await split(page, '&draftReload=1');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-ui-fixture-ready', 'true');
  await page.getByRole('button', { name: '按暂存代码块规划提交', exact: true }).click();
  let dialog = page.getByRole('dialog', { name: '规划代码块提交' });
  await dialog.getByRole('button', { name: '恢复草稿', exact: true }).click();
  await expect(dialog.getByLabel('提交标题', { exact: true }).first()).toHaveValue('feat: first');
  expect(await writes(page)).toHaveLength(0);
  await dialog.getByRole('button', { name: '按顺序创建 2 个提交', exact: true }).click();
  await expect(dialog.getByText('已创建 2 个提交', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('auugit-hunk-plan-drafts'))).toBeNull();
  dialog = await reopen(page);
  await expect(dialog.getByText('1 个暂存块', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: '恢复草稿', exact: true })).toHaveCount(0);
});

for (const scenario of ['draftHead', 'draftIndex']) test(`a ${scenario} change prevents stale draft restoration`, async ({ page }) => {
  await split(page, '&draftReload=1');
  const dialog = await open(page, `&draftReload=1&${scenario}=1`);
  await expect(dialog.getByRole('region', { name: '发现提交规划草稿', exact: true })).toContainText('不能恢复旧分配');
  await expect(dialog.getByRole('button', { name: '恢复草稿', exact: true })).toHaveCount(0);
  await dialog.getByRole('button', { name: '丢弃草稿并重新规划', exact: true }).click();
  await expect(dialog.getByLabel('提交标题', { exact: true })).toBeEnabled();
  await expect(dialog.getByLabel('提交标题', { exact: true })).toHaveValue('');
  expect(await writes(page)).toHaveLength(0);
});

test('restoration verifies live Git state again before applying any saved assignments', async ({ page }) => {
  await split(page, '&draftReload=1');
  const dialog = await open(page, '&draftReload=1&draftRestoreStale=1');
  await dialog.getByRole('button', { name: '恢复草稿', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('暂存区已变化');
  await expect(dialog.getByLabel('提交标题', { exact: true })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: '恢复草稿', exact: true })).toHaveCount(0);
  await dialog.getByRole('button', { name: '重新读取并清空分组', exact: true }).click();
  await expect(dialog.getByLabel('提交标题', { exact: true })).toHaveValue('');
  expect(await writes(page)).toHaveLength(0);
});

test('explicit reload clears saved grouping instead of offering it again', async ({ page }) => {
  let dialog = await split(page);
  await dialog.getByRole('button', { name: '重新读取并清空分组', exact: true }).click();
  await expect(dialog.getByLabel('提交标题', { exact: true })).toHaveValue('');
  dialog = await reopen(page);
  await expect(dialog.getByLabel('提交标题', { exact: true })).toBeEnabled();
  await expect(dialog.getByRole('button', { name: '恢复草稿', exact: true })).toHaveCount(0);
  expect(await writes(page)).toHaveLength(0);
});

test('storage quota failure explains draft loss and leaves manual planning usable', async ({ page }) => {
  const dialog = await split(page, '&draftQuota=1');
  await expect(dialog.getByRole('status').filter({ hasText: '本机草稿无法读取或保存' })).toBeVisible();
  await expect(dialog.getByLabel('提交标题', { exact: true }).first()).toHaveValue('feat: first');
  await expect(dialog.getByRole('button', { name: '按顺序创建 2 个提交', exact: true })).toBeEnabled();
  expect(await writes(page)).toHaveLength(0);
});

test('closing during restore prevents a late verification from populating a reopened planner', async ({ page }) => {
  await split(page, '&draftRestoreSlow=1');
  let dialog = await reopen(page);
  await dialog.getByRole('button', { name: '恢复草稿', exact: true }).click();
  dialog = await reopen(page);
  await expect(page.locator('html')).toHaveAttribute('data-hunk-fixture-draft-checks', '1');
  await expect(dialog.getByRole('button', { name: '恢复草稿', exact: true })).toBeVisible();
  await expect(dialog.getByLabel('提交标题', { exact: true })).toHaveValue('');
  await expect(dialog.getByLabel('提交标题', { exact: true })).toBeDisabled();
  expect(await writes(page)).toHaveLength(0);
});

test('applied AI groups survive reopening without another model request', async ({ page }) => {
  let dialog = await open(page, '&ai=1');
  await dialog.getByRole('button', { name: 'AI 建议分组', exact: true }).click();
  await dialog.getByRole('button', { name: '应用建议并替换当前分组', exact: true }).click();
  await expect(dialog.getByRole('textbox', { name: '提交标题', exact: true }).first()).toHaveValue('feat: staged feature');
  dialog = await reopen(page);
  await dialog.getByRole('button', { name: '恢复草稿', exact: true }).click();
  await expect(dialog.getByRole('textbox', { name: '提交标题', exact: true }).first()).toHaveValue('feat: staged feature');
  await expect(dialog.getByRole('region', { name: '提交 1', exact: true })).toContainText('第一处功能改动可独立审核');
  await expect(page.locator('html')).toHaveAttribute('data-hunk-fixture-ai-requests', '1');
  expect(await writes(page)).toHaveLength(0);
});
