import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page, baseURL }) => {
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    return url.origin !== baseURL || url.pathname.startsWith('/api/') ? route.abort() : route.continue();
  });
  await page.setViewportSize({ width: 1440, height: 900 });
});

test('a Linear task connection lights up Issues without any hosting account', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/tests/visual/index.html?automation=1&linear=1');
  await expect(page.locator('html')).toHaveAttribute('data-ui-fixture-ready', 'true', { timeout: 45_000 });
  // 任务连接独立点亮 Issues 导航；合并请求/CI 仍不出现（任务连接不贡献这些域）。
  await page.getByRole('button', { name: 'Issues', exact: true }).click();
  await expect(page.getByText('Acme Linear', { exact: true })).toBeVisible();
  await expect(page.getByRole('listitem', { name: /#12 Linear task without hosting account/ })).toBeVisible();
  // 详情：identifier 展示、外链指向 linear.app、任务能力按钮可用（Linear 声明了评论/更新）。
  await page.getByRole('listitem', { name: /#12 Linear task without hosting account/ }).click();
  const detail = page.locator('[data-issue-detail="12"]');
  await expect(detail.getByText(/ENG-12 · Alice/)).toBeVisible();
  await expect(detail.getByRole('link', { name: /Linear/ })).toHaveAttribute('href', 'https://linear.app/issue/ENG-12');
  // 任务能力按 Linear manifest 判定：编辑/评论可用；评论按钮需先填文本。
  await expect(detail.getByRole('button', { name: /编辑 Issue/ })).toBeEnabled();
  await detail.getByRole('textbox', { name: '撰写评论' }).fill('Verified via Linear fixture');
  await expect(detail.getByRole('button', { name: '发表评论', exact: true })).toBeEnabled();
  await expect(detail.getByRole('button', { name: '关闭为已完成', exact: true })).toBeEnabled();
  // 「关闭为不计划处理」按能力声明禁用（Linear 不声明 close-state-reason），title 给出原因。
  const notPlanned = detail.getByRole('button', { name: '关闭为不计划处理', exact: true });
  await expect(notPlanned).toBeDisabled();
  await expect(notPlanned).toHaveAttribute('title', /不计划处理/);
  // 从 Issue 创建分支：默认名带 identifier，分支关联持久化。
  await detail.getByRole('button', { name: '从 Issue 创建分支', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '创建分支', exact: true }).click();
  const links = JSON.parse(await page.evaluate(() => localStorage.getItem('auugit-issue-branches') || '{}'));
  // zustand persist 包装：{ state: { branchIssues } }。
  const stored = Object.values(links.state?.branchIssues ?? {})[0] as { identifier?: string; providerId?: string } | undefined;
  expect(stored?.identifier).toBe('ENG-12');
  expect(stored?.providerId).toBe('linear');
  // 单一来源时不出现来源过滤器；新建 Issue 直接在任务平台打开编辑器（默认上次选择）。
  await expect(page.locator('select[name="issue-source"]')).toHaveCount(0);
  await page.getByRole('button', { name: '新建 Issue', exact: true }).click();
  const editor = page.getByRole('dialog');
  await expect(editor.getByRole('textbox', { name: '标题' })).toBeVisible();
  await editor.getByRole('button', { name: '取消', exact: true }).click();
  // 设置 → 集成：Linear 卡片在任务追踪分组且有连接；管理行提供测试/删除。
  await page.getByRole('button', { name: /打开设置/ }).click();
  const settings = page.getByRole('dialog');
  await settings.getByRole('button', { name: '集成', exact: true }).click();
  await settings.getByRole('button', { name: '选择要连接的平台: Linear', exact: true }).click();
  await expect(settings.getByRole('button', { name: '使用浏览器授权（推荐）' })).toBeVisible();
  await expect(settings.getByText('Acme Linear', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('auu_git_task_connections') || '[]'))).toHaveLength(1);
  expect(errors).toEqual([]);
});
