import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page, baseURL }) => {
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    return url.origin !== baseURL || url.pathname.startsWith('/api/') ? route.abort() : route.continue();
  });
  await page.setViewportSize({ width: 1440, height: 900 });
});

test('hosting plugins share connection management and GitHub can be disabled', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/tests/visual/index.html?automation=1');
  await expect(page.locator('html')).toHaveAttribute('data-ui-fixture-ready', 'true', { timeout: 45_000 });
  for (const provider of ['GitHub', 'GitLab']) {
    await page.getByRole('button', { name: /打开设置/ }).click();
    await page.getByRole('dialog').getByRole('button', { name: '集成', exact: true }).click();
    await page.getByRole('button', { name: `选择要连接的平台: ${provider}`, exact: true }).click();
    const connection = page.getByRole('dialog', { name: '连接托管平台' });
    await expect(connection.getByRole('combobox')).toHaveValue(provider.toLowerCase());
    await expect(connection.getByLabel('服务器地址', { exact: true })).toHaveValue(`https://${provider.toLowerCase()}.com`);
    await expect(connection.getByLabel('个人访问令牌', { exact: true })).toBeVisible();
    await expect(connection.getByRole('button', { name: '使用平台授权' })).toHaveCount(provider === 'GitHub' ? 1 : 0);
    await connection.getByRole('button', { name: '取消', exact: true }).click();
  }
  await page.getByRole('button', { name: /打开设置/ }).click();
  const settings = page.getByRole('dialog');
  await settings.getByRole('button', { name: '集成', exact: true }).click();
  await settings.getByRole('checkbox', { name: '启用插件 GitHub', exact: true }).uncheck();
  await expect(settings.getByRole('button', { name: '选择要连接的平台: GitHub', exact: true })).toHaveCount(0);
  await settings.getByRole('button', { name: '选择要连接的平台: GitLab', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('combobox').locator('option')).toHaveText(['GitLab', 'Gitea / Forgejo']);
  await expect(page.locator('html')).toHaveAttribute('data-ui-fixture-network-attempts', '[]');
  expect(errors).toEqual([]);
});

for (const prefix of ['', '&instancePrefix=1']) test(`GitLab primary repository supports issues, branches, merge requests and CI with GitHub disabled${prefix ? ' under a relative URL root' : ''}`, async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(`/tests/visual/index.html?automation=1&gitlab=1${prefix}`);
  await expect(page.locator('html')).toHaveAttribute('data-ui-fixture-ready', 'true', { timeout: 45_000 });
  await page.getByRole('listitem', { name: '#12 GitLab primary workflow' }).click();
  const detail = page.locator('[data-issue-detail="12"]');
  await detail.getByRole('textbox', { name: '撰写评论' }).fill('Verified without GitHub');
  await detail.getByRole('button', { name: '发表评论', exact: true }).click();
  await expect(detail.getByText('Verified without GitHub', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '从 Issue 创建分支', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '创建分支', exact: true }).click();
  await page.getByRole('button', { name: '合并请求 0', exact: true }).click();
  await page.getByRole('button', { name: '新建合并请求', exact: true }).click();
  const create = page.getByRole('dialog');
  await expect(create.getByRole('button', { name: '移除关联 group/sub/project#12' })).toBeVisible();
  await create.locator('button[type="submit"]').click();
  await expect(create).toHaveCount(0);
  await expect(page.getByRole('region', { name: '描述中引用的 Issues' })).toContainText('GitLab primary workflow');
  await page.getByRole('button', { name: '合并', exact: true }).click();
  await page.getByRole('dialog', { name: '合并此合并请求' }).getByRole('button', { name: '确认操作', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: /CI\/CD/ }).first().click();
  await expect(page.getByText('GitLab pipeline', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: '查看构建日志', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('GitLab live trace: tests passed');
  await page.getByRole('dialog').getByRole('button', { name: '关闭', exact: true }).click();
  // Cancelling a second account, even after changing platforms, restores GitLab.
  await page.getByRole('button', { name: /打开设置/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: '集成', exact: true }).click();
  await page.getByRole('button', { name: '选择要连接的平台: GitLab', exact: true }).click();
  await page.getByRole('dialog').getByRole('combobox').selectOption('gitea');
  await page.getByRole('dialog').getByRole('button', { name: '取消', exact: true }).click();
  await page.getByRole('button', { name: 'Issues', exact: true }).click();
  await expect(page.getByRole('listitem', { name: '#12 GitLab primary workflow' })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('auu_git_connections') || '{}').profiles)).toHaveLength(1);
  const writes = JSON.parse(await page.locator('html').getAttribute('data-gitlab-fixture-writes') || '[]');
  expect(writes.some((call: { path: string }) => call.path === '/issues/12/notes')).toBe(true);
  expect(writes.some((call: { path: string }) => call.path === '/merge_requests')).toBe(true);
  expect(writes.some((call: { path: string }) => call.path === '/merge_requests/7/merge')).toBe(true);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('auu_git_disabled_plugins') || '[]'))).toContain('github');
  await expect(page.locator('html')).toHaveAttribute('data-ui-fixture-network-attempts', '[]');
  expect(errors).toEqual([]);
});
