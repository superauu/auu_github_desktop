import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page, baseURL }) => {
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    return url.origin !== baseURL || url.pathname.startsWith('/api/') ? route.abort() : route.continue();
  });
  await page.setViewportSize({ width: 1440, height: 900 });
});

test('independent ci-cd source supports stages, logs, native parameter dispatch and cancellation without hosting', async ({ page }, testInfo) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/tests/visual/index.html?automation=1&jenkins=1');
  await expect(page.locator('html')).toHaveAttribute('data-ui-fixture-ready', 'true', { timeout: 45000 });
  await page.getByRole('button', { name: /^CI\/CD/ }).click();
  const view = page.locator('[data-ci-domain-provider="jenkins"]');
  await expect(view.getByRole('listitem').filter({ hasText: '#1 success' })).toBeVisible();
  await view.getByRole('listitem').filter({ hasText: '#1 success' }).click();
  await expect(view.getByRole('region', { name: '构建阶段' }).getByText('Prepare', { exact: true })).toBeVisible();
  await expect(view.getByText('运行记录', { exact: true })).toBeVisible();
  const handle = view.getByRole('separator');
  const width = Number(await handle.getAttribute('aria-valuenow'));
  const handleBox = await handle.boundingBox();
  expect(handleBox).not.toBeNull();
  await page.mouse.move(handleBox!.x + handleBox!.width / 2, handleBox!.y + handleBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(handleBox!.x + handleBox!.width / 2 + 80, handleBox!.y + handleBox!.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(handle).toHaveAttribute('aria-valuenow', String(width + 80));
  const historyBounds = await view.locator('[data-ci-panel="history"]').boundingBox();
  const stageBounds = await view.locator('[data-ci-panel="stages"]').boundingBox();
  expect(stageBounds!.y - historyBounds!.y - historyBounds!.height).toBeGreaterThanOrEqual(8);
  await handle.dblclick();
  await expect(handle).toHaveAttribute('aria-valuenow', String(width));
  await page.screenshot({ path: testInfo.outputPath('jenkins-dashboard.png') });
  await view.getByRole('button', { name: '查看构建日志', exact: true }).click();
  const logs = page.getByRole('dialog', { name: '查看构建日志' });
  await expect(logs.getByTestId('ci-build-logs')).toContainText('中文日志');
  await logs.getByRole('button', { name: '关闭', exact: true }).click();
  await view.getByRole('button', { name: '手动运行: auugit-mock', exact: true }).click();
  const dispatch = page.getByRole('dialog');
  await expect(dispatch.getByLabel('SCENARIO')).toBeVisible();
  await dispatch.getByLabel('SCENARIO').selectOption('failure');
  await dispatch.getByRole('button', { name: '运行工作流', exact: true }).click();
  await expect(view.getByRole('listitem').filter({ hasText: '#3 failure' })).toContainText('失败');
  await view.getByRole('listitem').filter({ hasText: '#2 long' }).click();
  await view.getByRole('button', { name: '取消运行', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '取消运行', exact: true }).click();
  await expect(view.getByRole('listitem').filter({ hasText: '#2 long' })).toContainText('已取消');
  await view.getByRole('listitem').filter({ hasText: 'queue #7' }).click();
  await view.getByRole('button', { name: '取消运行', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '取消运行', exact: true }).click();
  await expect(view.getByRole('listitem').filter({ hasText: 'queue #7' })).toHaveCount(0);
  const settings = await page.evaluate(() => localStorage.getItem('auu_git_ci_connections') ?? '');
  expect(settings).not.toContain('fixture-token');
  expect(errors).toEqual([]);
});

test('Jenkins connects from settings, maps the current repository, and loses CI navigation when disabled', async ({ page }) => {
  await page.goto('/tests/visual/index.html?automation=1&jenkins=1&unconnected=1');
  await expect(page.locator('html')).toHaveAttribute('data-ui-fixture-ready', 'true', { timeout: 45000 });
  await expect(page.getByRole('button', { name: /^CI\/CD/ })).toHaveCount(0);
  await page.getByRole('button', { name: /打开设置/ }).click();
  const settings = page.getByRole('dialog');
  await settings.getByRole('button', { name: '集成', exact: true }).click();
  await settings.getByRole('button', { name: '选择要连接的平台: Jenkins', exact: true }).click();
  await settings.getByRole('button', { name: '添加连接', exact: true }).click();
  const form = page.getByRole('dialog', { name: '添加连接', exact: true });
  await form.getByLabel('显示名', { exact: true }).fill('UI Jenkins');
  await form.getByLabel('服务地址').fill('https://ci.fixture.test');
  await form.getByLabel('用户名').fill('alice');
  await form.getByLabel('个人访问令牌', { exact: true }).fill('fixture-token');
  await form.getByLabel('Job 路径（每行一个）').fill('auugit-mock');
  await form.getByRole('button', { name: '保存连接', exact: true }).click();
  await expect(form).toHaveCount(0);
  const card = page.getByTestId('provider-expanded-jenkins');
  await expect(card.getByText('UI Jenkins', { exact: true })).toBeVisible();
  await card.getByRole('button', { pressed: true }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: /^CI\/CD/ })).toHaveCount(0);
});

test('read-only CI account keeps trigger errors visible and does not claim a successful build submission', async ({ page }) => {
  await page.goto('/tests/visual/index.html?automation=1&jenkins=1&readonly=1');
  await expect(page.locator('html')).toHaveAttribute('data-ui-fixture-ready', 'true', { timeout: 45000 });
  await page.getByRole('button', { name: /^CI\/CD/ }).click();
  await page.getByRole('button', { name: '手动运行: auugit-mock', exact: true }).click();
  const form = page.getByRole('dialog', { name: /手动运行工作流/ });
  await expect(form.getByLabel('SCENARIO')).toBeVisible();
  await form.getByRole('button', { name: '运行工作流', exact: true }).click();
  await expect(form.getByRole('alert')).toContainText('403');
  await expect(form.getByRole('button', { name: '运行工作流', exact: true })).toBeEnabled();
  await expect(page.locator('[data-ci-domain-provider="jenkins"]').getByRole('listitem').filter({ hasText: '#3 success' })).toHaveCount(0);
});

test('CI source selection preserves existing GitHub Actions and independent connection settings', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/tests/visual/index.html?automation=1&jenkins=1&hosting=1');
  await expect(page.locator('html')).toHaveAttribute('data-ui-fixture-ready', 'true', { timeout: 45000 });
  await page.getByRole('button', { name: /^CI\/CD/ }).click();
  await expect(page.locator('[data-ci-domain-provider="jenkins"]')).toBeVisible();
  await page.getByLabel('CI 来源').selectOption('hosting');
  await page.getByRole('button', { name: '刷新', exact: true }).click();
  await expect(page.getByRole('listitem', { name: 'Existing GitHub Actions', exact: true })).toBeVisible();
  await page.getByLabel('CI 来源').selectOption({ label: 'Local Jenkins' });
  await expect(page.locator('[data-ci-domain-provider="jenkins"]')).toBeVisible();
  await page.getByRole('button', { name: /打开设置/ }).click();
  const settings = page.getByRole('dialog');
  await settings.getByRole('button', { name: '集成', exact: true }).click();
  await settings.getByRole('button', { name: '选择要连接的平台: Jenkins', exact: true }).click();
  await expect(settings.getByText('Local Jenkins', { exact: true })).toBeVisible();
  await settings.getByRole('button', { name: '添加连接', exact: true }).click();
  const connection = page.getByRole('dialog', { name: '添加连接', exact: true });
  await expect(connection.getByLabel('服务地址')).toBeVisible();
  await expect(connection.getByLabel('用户名')).toBeVisible();
  await expect(connection.getByLabel('Job 路径（每行一个）')).toBeVisible();
  await connection.getByRole('button', { name: '取消', exact: true }).click();
  expect(errors).toEqual([]);
});
