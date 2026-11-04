import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { build } from 'esbuild';

const root = process.cwd();
let temporary, api;

// 录制数组经 globalThis 注入：makeClient.toString() 会剥掉闭包，桩内拿不到测试文件作用域。
const makeClient = (token) => ({
  token,
  setToken(value) { this.token = value; },
  async verifyToken(value) {
    globalThis.__rec.verifyCalls.push(value);
    if (value === 'bad-token') throw new (globalThis.__rec.apiError)(401, 'Linear 401: Unauthorized');
    return { login: 'alice', id: 1, avatar_url: '', name: 'Alice', email: null, bio: null, public_repos: 0, html_url: 'https://linear.app/alice' };
  },
  async getIssue(owner, repo, number) {
    globalThis.__rec.issueCalls.push([owner, repo, number, this.token]);
    if (this.token === 'stale-token' && globalThis.__rec.issueCalls.length === 1) throw new (globalThis.__rec.apiError)(401, 'Linear 401: expired');
    return { id: 12, number, identifier: 'ENG-12', title: 't', body: null, state: 'open', html_url: '', user: { login: 'a' }, labels: [], assignees: [], comments: 0, created_at: '', updated_at: '', closed_at: null };
  },
  async updateIssue() { throw new Error('must not be routed: capability not declared'); },
});

before(async () => {
  temporary = await fs.mkdtemp(path.join(root, '.test-tmp-task-conn-'));
  const file = path.join(temporary, 'task.cjs');
  globalThis.__rec = { verifyCalls: [], issueCalls: [], refreshCalls: [], apiError: null };
  const linearManifest = { id: 'linear', name: 'Linear', primaryDomain: 'task-tracking', connectionKind: 'task-account',
    domains: [{ domain: 'task-tracking', capabilities: ['task-tracking:list-issues', 'task-tracking:issue-detail'] }] };
  await build({ stdin: { contents: `
    export { useTaskStore } from './src/stores/taskStore';
    export { taskService, bindTaskClient, usesTaskProvider } from './src/services/integrations/taskService';
    export { setPluginEnabled, getTaskPlugin } from './src/services/integrations/plugins';
    export { getIntegrationToken } from './src/services/errors/credentials';
    export { ProviderApiError } from './src/services/collaboration/client';
  `, resolveDir: root }, outfile: file, bundle: true, platform: 'node', format: 'cjs',
    alias: { '@': path.join(root, 'src') }, loader: { '.css': 'empty' }, logLevel: 'silent',
    plugins: [{ name: 'stub-generated-index', setup(builder) {
      builder.onLoad({ filter: /src[\\/]plugins[\\/]index\.ts$/ }, () => ({ loader: 'ts', contents: `
        export const HOSTING_PLUGINS = []; export const ERROR_PLUGINS = []; export const CI_PLUGINS = [];
        export const TASK_PLUGINS = [{
          manifest: ${JSON.stringify(linearManifest)},
          createClient: ({ token }) => makeClient(token),
          oauthRefresh: async (refreshToken) => {
            if (refreshToken === 'rt-fail') throw new Error('refresh rejected');
            globalThis.__rec.refreshCalls.push(refreshToken);
            return { accessToken: 'fresh-token', refreshToken: 'rt-new', expiresAt: Date.now() + 3600_000 };
          },
        }];
        function makeClient(token) { return (${makeClient.toString()})(token); }
      ` }));
    } }] });
  api = createRequire(import.meta.url)(file);
  globalThis.__rec.apiError = api.ProviderApiError;
  globalThis.localStorage = { store: {}, getItem(key) { return this.store[key] ?? null; }, setItem(key, value) { this.store[key] = String(value); }, removeItem(key) { delete this.store[key]; } };
});

after(async () => {
  delete globalThis.localStorage;
  delete globalThis.__rec;
  if (temporary && path.dirname(temporary) === root && path.basename(temporary).startsWith('.test-tmp-task-conn-')) await fs.rm(temporary, { recursive: true, force: true });
});

test('PAT connect verifies the token before persisting anything', async () => {
  await assert.rejects(api.useTaskStore.getState().connectWithToken({ providerId: 'linear', displayName: 'Acme', token: ' bad-token ' }),
    error => error.status === 401);
  assert.deepEqual(api.useTaskStore.getState().connections, []);
  assert.equal(globalThis.__rec.verifyCalls.at(-1), 'bad-token');
  const connection = await api.useTaskStore.getState().connectWithToken({ providerId: 'linear', displayName: ' Acme ', token: ' lin_api_good ' });
  assert.equal(connection.displayName, 'Acme');
  assert.deepEqual(connection.domains, ['task-tracking']);
  assert.equal(api.useTaskStore.getState().getRuntime(connection.id).health, 'connected');
  assert.deepEqual(api.usesTaskProvider('linear'), true);
  assert.deepEqual(api.usesTaskProvider('github'), false);
  await api.useTaskStore.getState().removeConnection(connection.id);
  assert.deepEqual(api.useTaskStore.getState().connections, []);
});

test('oauth tokens refresh atomically and update the bound client on 401', async () => {
  // 即将过期（<60s）：首个 401 触发轮转刷新并落盘新令牌，重试携带新令牌。
  const stale = await api.useTaskStore.getState().connectWithOAuth({
    providerId: 'linear', displayName: 'OAuth', tokenSet: { accessToken: 'stale-token', refreshToken: 'rt-old', expiresAt: Date.now() + 30_000 },
  });
  api.bindTaskClient(makeClient('stale-token'), stale.id, api.getTaskPlugin('linear').manifest);
  const issue = await api.taskService.getIssue('ENG', 'linear', 12);
  assert.equal(issue.identifier, 'ENG-12');
  assert.deepEqual(globalThis.__rec.refreshCalls, ['rt-old']);
  assert.equal(globalThis.__rec.issueCalls.at(-1)[3], 'fresh-token');
  // keyring 里已是轮转后的新令牌集（先落盘再重试）。
  const stored = JSON.parse(await api.getIntegrationToken(stale.id));
  assert.equal(stored.accessToken, 'fresh-token');
  assert.equal(stored.refreshToken, 'rt-new');
  await api.useTaskStore.getState().removeConnection(stale.id);
});

test('expired tokens that fail to refresh degrade to error and return null', async () => {
  const state = api.useTaskStore.getState();
  await state.connectWithOAuth({
    providerId: 'linear', displayName: 'expired', tokenSet: { accessToken: 'dead-token', refreshToken: 'rt-fail', expiresAt: Date.now() - 1000 },
  });
  // zustand state 是快照：连接变更后必须重读 getState()，否则清理指向旧数组。
  const connection = api.useTaskStore.getState().connections[0];
  const token = await api.useTaskStore.getState().ensureFreshToken(connection.id);
  assert.equal(token, null);
  assert.equal(api.useTaskStore.getState().getRuntime(connection.id).health, 'error');
  await api.useTaskStore.getState().removeConnection(connection.id);
});

test('capability double-check routes task operations through the bound manifest', async () => {
  const connection = await api.useTaskStore.getState().connectWithToken({ providerId: 'linear', displayName: 'routing', token: 'lin_api_ok' });
  api.bindTaskClient(makeClient('lin_api_ok'), connection.id, api.getTaskPlugin('linear').manifest);
  // issue-detail 已声明 → 放行；update-issue 未声明 → 双检拒绝。
  await api.taskService.getIssue('ENG', 'linear', 12);
  // 双检在代理调用里同步抛出——用 assert.throws（仓库既有模式），不走 assert.rejects。
  assert.throws(() => api.taskService.updateIssue('ENG', 'linear', 12, { title: 'x' }),
    error => error.key === 'connections.errors.capabilityUnavailable');
  // 无绑定 → 明确的未连接错误。
  api.bindTaskClient(null, null);
  assert.throws(() => api.taskService.getIssue('ENG', 'linear', 12),
    error => error.key === 'connections.errors.noTaskConnected');
  await api.useTaskStore.getState().removeConnection(connection.id);
});

test('reconnecting the same account upserts instead of stacking connections', async () => {
  const state = api.useTaskStore.getState();
  for (const leftover of api.useTaskStore.getState().connections) await api.useTaskStore.getState().removeConnection(leftover.id);
  const first = await state.connectWithToken({ providerId: 'linear', displayName: 'First', token: 'lin_api_one' });
  const second = await state.connectWithToken({ providerId: 'linear', displayName: 'Second', token: 'lin_api_two' });
  assert.equal(second.id, first.id, '同一账号必须复用既有连接');
  assert.equal(second.displayName, 'Second');
  assert.equal(api.useTaskStore.getState().connections.length, 1);
  // keyring 里是后一次的令牌。
  assert.equal(JSON.parse(await api.getIntegrationToken(first.id)).accessToken, 'lin_api_two');
  await api.useTaskStore.getState().removeConnection(first.id);
});

test('disabling the plugin clears connection domains and unbinds the channel', async () => {
  // 防御性清理：前序测试失败可能遗留连接，先清场再断言本测试的隔离语义。
  for (const leftover of api.useTaskStore.getState().connections) await api.useTaskStore.getState().removeConnection(leftover.id);
  const connection = await api.useTaskStore.getState().connectWithToken({ providerId: 'linear', displayName: 'isolation', token: 'lin_api_ok' });
  api.bindTaskClient(makeClient('t'), connection.id, api.getTaskPlugin('linear').manifest);
  api.setPluginEnabled('linear', false);
  assert.deepEqual(api.useTaskStore.getState().connections.find(item => item.id === connection.id).domains, []);
  assert.equal(api.useTaskStore.getState().activeConnection(), null);
  assert.equal(api.getTaskPlugin('linear'), null);
  api.setPluginEnabled('linear', true);
  assert.equal(api.getTaskPlugin('linear')?.manifest.id, 'linear');
  assert.equal(api.useTaskStore.getState().activeConnection()?.id, connection.id);
  await api.useTaskStore.getState().removeConnection(connection.id);
  assert.deepEqual(api.useTaskStore.getState().connections, []);
});
