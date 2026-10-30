import { test, expect, type Page } from '@playwright/test';

test.beforeEach(async ({ page, baseURL }) => {
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    return url.origin !== baseURL || url.pathname.startsWith('/api/') ? route.abort() : route.continue();
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/tests/visual/index.html?automation=1&issues=1');
  await expect(page.locator('html')).toHaveAttribute('data-ui-fixture-ready', 'true', { timeout: 45_000 });
  await expect(page.getByRole('listitem', { name: '#12 Connect issue and PR workflow' })).toBeVisible();
});
test.afterEach(async ({ page }) => {
  await expect(page.locator('html')).toHaveAttribute('data-ui-fixture-network-attempts', '[]');
});
const selectIssue = async (page: Page) => {
  await page.getByRole('listitem', { name: '#12 Connect issue and PR workflow' }).click();
  await expect(page.locator('[data-issue-detail="12"]')).toBeVisible();
};
async function writes(page: Page) { return JSON.parse(await page.locator('html').getAttribute('data-issue-fixture-writes') || '[]') as { kind: string; data: Record<string, unknown> }[]; }

test('create, edit, discuss, close and reopen an issue without losing metadata', async ({ page }) => {
  await page.getByRole('button', { name: '新建 Issue', exact: true }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByLabel('标题', { exact: true }).fill('Handle empty repository');
  await dialog.getByLabel('描述（Markdown）').fill('Steps to reproduce\n1. Open an empty repository.');
  await dialog.getByLabel('enhancement', { exact: true }).check();
  await dialog.getByLabel('reviewer', { exact: true }).check();
  await dialog.getByRole('button', { name: '保存', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const detail = page.locator('[data-issue-detail="14"]');
  await expect(detail.getByRole('heading', { name: 'Handle empty repository' })).toBeVisible();
  await detail.getByRole('button', { name: '编辑 Issue' }).click();
  dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('enhancement', { exact: true })).toBeChecked();
  await expect(dialog.getByLabel('reviewer', { exact: true })).toBeChecked();
  await dialog.getByLabel('标题', { exact: true }).fill('Handle empty repository safely');
  await dialog.getByRole('button', { name: '保存', exact: true }).click();
  await detail.getByRole('textbox', { name: '撰写评论' }).fill('Verified with a new repository.');
  await detail.getByRole('button', { name: '发表评论' }).click();
  await expect(detail.getByText('Verified with a new repository.', { exact: true })).toBeVisible();
  await detail.getByRole('button', { name: '关闭为不计划处理' }).click();
  await expect(detail.getByRole('button', { name: '重新打开' })).toBeVisible();
  await detail.getByRole('button', { name: '重新打开' }).click();
  await expect(detail.getByRole('button', { name: '关闭为已完成' })).toBeVisible();
  const calls = await writes(page);
  expect(calls.filter(call => call.kind === 'comment')).toHaveLength(1);
  expect(calls.find(call => call.kind === 'create-issue')?.data).toMatchObject({ labels: ['enhancement'], assignees: ['reviewer'] });
  expect(calls.filter(call => call.kind === 'update-issue').map(call => call.data.state_reason).filter(Boolean)).toEqual(['not_planned', 'reopened']);
});

test('an issue branch is carried into PR creation and both views can navigate the resulting link', async ({ page }) => {
  await selectIssue(page);
  await page.getByRole('button', { name: '从 Issue 创建分支' }).click();
  const branchDialog = page.getByRole('dialog');
  await expect(branchDialog.getByRole('textbox').first()).toHaveValue('issue/12-connect-issue-and-pr-workflow');
  await branchDialog.getByRole('button', { name: '创建分支', exact: true }).click();
  await expect(branchDialog).toHaveCount(0);
  await page.getByRole('button', { name: '拉取请求 0', exact: true }).click();
  await page.getByRole('button', { name: '新建拉取请求', exact: true }).click();
  const prDialog = page.getByRole('dialog');
  await expect(prDialog.getByRole('button', { name: '移除关联 fixture/project#12' })).toBeVisible();
  const submit = prDialog.locator('button[type="submit"]');
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(prDialog).toHaveCount(0);
  await expect(page.getByRole('region', { name: '描述中引用的 Issues' })).toBeVisible();
  await page.getByRole('region', { name: '描述中引用的 Issues', exact: true }).getByRole('button', { name: 'fixture/project#12 · Connect issue and PR workflow', exact: true }).click();
  const detail = page.locator('[data-issue-detail="12"]');
  await expect(detail.getByRole('button', { name: /fixture\/project#100/ })).toBeVisible();
  await detail.getByRole('button', { name: /fixture\/project#100/ }).click();
  await expect(page.getByRole('region', { name: '描述中引用的 Issues' })).toBeVisible();
  await page.getByRole('button', { name: '合并', exact: true }).click();
  await page.getByRole('dialog', { name: '合并拉取请求' }).getByRole('button', { name: '确认操作', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('region', { name: '当前任务', exact: true })).toContainText('已关闭');
  await page.getByRole('button', { name: 'Issues', exact: true }).click();
  await page.getByRole('combobox', { name: '状态', exact: true }).selectOption('closed');
  await selectIssue(page);
  await expect(page.locator('[data-issue-detail="12"]').getByRole('button', { name: '重新打开' })).toBeVisible();
  await page.locator('[data-issue-detail="12"]').getByRole('button', { name: /fixture\/project#100/ }).click();
  await expect(page.getByRole('region', { name: '描述中引用的 Issues' }).getByText('已关闭', { exact: true })).toBeVisible();
  const calls = await writes(page);
  expect(calls.find(call => call.kind === 'create-branch')?.data.name).toBe('issue/12-connect-issue-and-pr-workflow');
  expect(calls.find(call => call.kind === 'create-pr')?.data).toMatchObject({ head: 'issue/12-connect-issue-and-pr-workflow', base: 'main' });
  expect(calls.find(call => call.kind === 'create-pr')?.data.body).toContain('Closes fixture/project#12');
  expect(calls.filter(call => call.kind === 'update-issue')).toHaveLength(0);
  expect(calls.filter(call => call.kind === 'merge-pr')).toHaveLength(1);
});

test('filters, keyboard selection and a narrow issue detail layout remain usable', async ({ page }) => {
  await page.getByRole('combobox', { name: '状态', exact: true }).selectOption('closed');
  await expect(page.getByRole('listitem', { name: '#13 Completed keyboard navigation' })).toBeVisible();
  await expect(page.getByRole('listitem', { name: '#12 Connect issue and PR workflow' })).toHaveCount(0);
  await page.getByRole('combobox', { name: '状态', exact: true }).selectOption('open');
  await page.getByRole('textbox', { name: '搜索 Issue', exact: true }).fill('No matching result');
  await expect(page.getByText('没有符合条件的 Issue', { exact: true })).toBeVisible();
  await page.getByRole('textbox', { name: '搜索 Issue', exact: true }).fill('');
  await page.setViewportSize({ width: 750, height: 600 });
  const row = page.getByRole('listitem', { name: '#12 Connect issue and PR workflow' });
  await row.focus(); await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: '返回列表' })).toBeVisible();
  await expect(page.locator('[data-issue-detail="12"]')).toBeVisible();
  await expect(page.getByRole('button', { name: '创建关联 PR', exact: true })).toBeVisible();
  expect(await page.locator('[data-issues-workspace]').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/issues-narrow.png' });
  await page.getByRole('button', { name: '返回列表' }).click();
  await expect(row).toBeVisible();
});

for (const scenario of [{ theme: 'dark', width: 1440, height: 900 }, { theme: 'light', width: 750, height: 600 }]) {
  test(`issue detail ${scenario.theme} ${scenario.width}x${scenario.height}`, async ({ page }) => {
    await page.setViewportSize({ width: scenario.width, height: scenario.height });
    await page.emulateMedia({ colorScheme: scenario.theme as 'dark' | 'light', reducedMotion: 'reduce' });
    await page.goto(`/tests/visual/index.html?automation=1&issues=1&theme=${scenario.theme}`);
    await expect(page.locator('html')).toHaveAttribute('data-ui-fixture-ready', 'true');
    await selectIssue(page);
    await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); });
    await page.mouse.move(-1, -1);
    await expect(page).toHaveScreenshot(`issues-${scenario.theme}-${scenario.width}x${scenario.height}.png`);
  });
}

test('the current task follows branch switches and issue drafts only replace text after preview', async ({ page }) => {
  await selectIssue(page);
  await page.getByRole('button', { name: '关联当前分支', exact: true }).click();
  const banner = page.getByRole('region', { name: '当前任务', exact: true });
  await expect(banner).toContainText('Connect issue and PR workflow');
  await page.getByRole('button', { name: /^分支 feature\// }).click();
  await page.getByRole('button', { name: 'main', exact: true }).click();
  await expect(banner).toHaveCount(0);
  await page.getByRole('button', { name: '分支 main', exact: true }).click();
  await page.getByRole('button', { name: 'feature/workspace-review-with-an-intentionally-long-branch-name', exact: true }).click();
  await expect(banner).toBeVisible();
  await page.getByRole('button', { name: '工作区变更 3', exact: true }).click();
  const title = page.getByLabel('提交标题', { exact: true });
  await title.fill('Keep my current draft');
  await page.getByRole('button', { name: '根据 Issue 拟提交说明', exact: true }).click();
  const preview = page.getByRole('dialog', { name: '预览生成的说明' });
  await expect(title).toHaveValue('Keep my current draft');
  await expect(preview).toContainText('Refs fixture/project#12');
  await preview.getByRole('button', { name: '替换草稿', exact: true }).click();
  await expect(title).toHaveValue('fix: Connect issue and PR workflow');
  const context = page.getByLabel('生成说明时参考 Issue 背景', { exact: true });
  await expect(context).not.toBeChecked();
  await context.check();
  await page.getByRole('button', { name: '生成提交说明', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '预览生成的说明' })).toContainText('Refs fixture/project#12');
  await page.getByRole('dialog').getByRole('button', { name: '保留原稿', exact: true }).click();
  expect((await writes(page)).find(call => call.kind === 'generate-commit')?.data.issueContext).toMatchObject([{ owner: 'fixture', repo: 'project', number: 12 }]);
  await banner.getByRole('button', { name: /fixture\/project#12/ }).click();
  await page.getByRole('button', { name: '创建关联 PR', exact: true }).click();
  const pr = page.getByRole('dialog', { name: '创建拉取请求' });
  await pr.getByPlaceholder('标题，例如：修复登录超时问题').fill('Keep PR title');
  await pr.getByRole('button', { name: '根据 Issue 拟 PR 草稿', exact: true }).click();
  const proposal = page.getByRole('dialog', { name: '根据 Issue 拟 PR 草稿' });
  await expect(page.getByPlaceholder('标题，例如：修复登录超时问题')).toHaveValue('Keep PR title');
  await expect(proposal).toContainText('Closes fixture/project#12');
  await proposal.getByRole('button', { name: '使用此说明', exact: true }).click();
  await expect(pr.getByPlaceholder('标题，例如：修复登录超时问题')).toHaveValue('Connect issue and PR workflow');
  await expect(pr.getByPlaceholder('描述本次变更的内容与动机...')).toHaveValue(/- \[ \]/);
  await pr.getByRole('button', { name: '取消', exact: true }).click();
  await banner.getByRole('button', { name: '解除当前分支关联', exact: true }).click();
  await expect(banner).toHaveCount(0);
});

test('the Issue workflow shows partial CI honestly, retries, and preserves a discussion draft on refresh', async ({ page }) => {
  await page.goto('/tests/visual/index.html?automation=1&issues=1&workflow=1&failLegacy=1');
  await selectIssue(page);
  const card = page.locator('[data-issue-pr="90"]');
  await expect(card.locator('[data-ci-state="unknown"]')).toBeVisible();
  await expect(card).toContainText('Legacy CI permission denied');
  const comment = page.getByRole('textbox', { name: '撰写评论', exact: true });
  await comment.fill('Keep discussion draft during refresh');
  await card.getByRole('button', { name: '刷新 PR 工作流', exact: true }).click();
  await expect(card.locator('[data-ci-state="passing"]')).toBeVisible();
  await expect(card).toContainText('1 批准');
  await page.getByRole('region', { name: 'Issue 详情', exact: true }).getByRole('button', { name: '刷新 Issue 状态', exact: true }).click();
  await expect(comment).toHaveValue('Keep discussion draft during refresh');
  await expect(card.locator('[data-ci-state="passing"]')).toBeVisible();
  await page.screenshot({ path: 'test-results/issue-workflow.png' });
});

test('linked issue workflow dashboard dark 1440x900', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await page.goto('/tests/visual/index.html?automation=1&issues=1&workflow=1');
  await selectIssue(page);
  await expect(page.locator('[data-current-issue]')).toContainText('Connect issue and PR workflow');
  await expect(page.locator('[data-issue-pr="90"] [data-ci-state="passing"]')).toBeVisible();
  await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); });
  await page.mouse.move(-1, -1);
  await expect(page).toHaveScreenshot('issue-workflow-dark-1440x900.png');
});
