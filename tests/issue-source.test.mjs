import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { build } from 'esbuild';

const root = process.cwd();
let temporary, api;
const linearManifest = { id: 'linear', name: 'Linear', primaryDomain: 'task-tracking', connectionKind: 'task-account',
  domains: [{ domain: 'task-tracking', capabilities: ['task-tracking:list-issues', 'task-tracking:issue-detail'] }] };
const githubManifest = { id: 'github', name: 'GitHub', primaryDomain: 'code-hosting', connectionKind: 'hosting-account',
  domains: [{ domain: 'task-tracking', capabilities: ['task-tracking:list-issues', 'task-tracking:issue-detail', 'task-tracking:create-issue', 'task-tracking:update-issue', 'task-tracking:comment', 'task-tracking:close-state-reason'] }] };

before(async () => {
  temporary = await fs.mkdtemp(path.join(root, '.test-tmp-issue-source-'));
  const file = path.join(temporary, 'issue-source.cjs');
  await build({ stdin: { contents: `
    export { scopeIssueReference, externalIssueUrl } from './src/services/integrations/links';
    export { withClosingIssues, issueLabel, issueBranchName, mergeIssuePages } from './src/features/issues/issueLogic';
    export { useIssueWorkflowStore } from './src/stores/issueWorkflowStore';
    export { useTaskStore } from './src/stores/taskStore';
    export { useIntegrationStore } from './src/stores/integrationStore';
    export { bindCollaborationClient, collaborationService } from './src/services/collaboration/CollaborationService';
    export { taskService, bindTaskClient, issueClientFor, usesTaskProvider } from './src/services/integrations/taskService';
    export { getTaskPlugin, getHostingPlugin } from './src/services/integrations/plugins';
  `, resolveDir: root }, outfile: file, bundle: true, platform: 'node', format: 'cjs',
    alias: { '@': path.join(root, 'src') }, loader: { '.css': 'empty' }, logLevel: 'silent',
    plugins: [{ name: 'stub-generated-index', setup(builder) {
      builder.onLoad({ filter: /src[\\/]plugins[\\/]index\.ts$/ }, () => ({ loader: 'ts', contents: `
        export const HOSTING_PLUGINS = [{
          manifest: ${JSON.stringify(githubManifest)},
          issuePath: (number) => '/issues/' + number,
          createClient: () => ({ setToken() {}, verifyToken: async () => ({}), getIssue: async () => ({ via: 'hosting' }) }),
        }];
        export const ERROR_PLUGINS = []; export const CI_PLUGINS = [];
        export const TASK_PLUGINS = [{
          manifest: ${JSON.stringify(linearManifest)},
          createClient: ({ token }) => ({ token, setToken() {}, verifyToken: async () => ({}), getIssue: async () => ({ via: 'task', token }) }),
          issueUrl: (reference) => reference.identifier ? 'https://linear.app/issue/' + reference.identifier : '',
        }];
      ` }));
    } }] });
  api = createRequire(import.meta.url)(file);
  globalThis.localStorage = { store: {}, getItem(key) { return this.store[key] ?? null; }, setItem(key, value) { this.store[key] = String(value); }, removeItem(key) { delete this.store[key]; } };
});

after(async () => {
  delete globalThis.localStorage;
  if (temporary && path.dirname(temporary) === root && path.basename(temporary).startsWith('.test-tmp-issue-source-')) await fs.rm(temporary, { recursive: true, force: true });
});

test('task references keep their explicit provider and build identifier URLs', () => {
  // 托管绑定存在也不得套到任务引用上（GitHub 仓库挂 Linear 任务是常态）。
  api.useIntegrationStore.setState({ binding: { providerId: 'github', server: 'https://github.example', host: 'github.example', ownerPath: 'o', repo: 'r', remoteName: 'origin' } });
  const taskRef = { owner: 'all', repo: 'linear', number: 12, providerId: 'linear', server: 'https://linear.app', identifier: 'ENG-12' };
  const scoped = api.scopeIssueReference(taskRef);
  assert.equal(scoped.providerId, 'linear');
  assert.equal(scoped.server, 'https://linear.app');
  assert.equal(api.externalIssueUrl(taskRef), 'https://linear.app/issue/ENG-12');
  // 无 identifier 且 owner 为工作区占位：无法构造 URL，返回空由 UI 降级。
  assert.equal(api.externalIssueUrl({ owner: 'all', repo: 'linear', number: 12, providerId: 'linear', server: 'https://linear.app' }), '');
  // 托管引用维持既有行为：绑定落款 + issuePath 拼接。
  const hosted = api.scopeIssueReference({ owner: 'o', repo: 'r', number: 3 });
  assert.equal(hosted.providerId, 'github');
  assert.equal(api.externalIssueUrl({ owner: 'o', repo: 'r', number: 3 }), 'https://github.example/o/r/issues/3');
});

test('closing directives become plain refs for task issues and stay Closes for hosting', () => {
  assert.equal(api.withClosingIssues('body', [{ owner: 'o', repo: 'r', number: 1 }]), 'body\n\nCloses o/r#1');
  assert.equal(api.withClosingIssues('body', [{ owner: 'all', repo: 'linear', number: 12, providerId: 'linear', server: 'https://linear.app', identifier: 'ENG-12' }]), 'body\n\nRefs ENG-12');
  assert.equal(api.issueLabel({ owner: 'all', repo: 'linear', number: 12, providerId: 'linear', identifier: 'ENG-12' }), 'ENG-12');
  assert.equal(api.issueLabel({ owner: 'o', repo: 'r', number: 1 }), 'o/r#1');
  assert.equal(api.issueBranchName('ENG-12', 'Fix login timeout'), 'issue/ENG-12-fix-login-timeout');
});

test('branch-issue association accepts task refs only while the task connection lives', async () => {
  const store = api.useIssueWorkflowStore.getState();
  const taskRef = { owner: 'all', repo: 'linear', number: 12, providerId: 'linear', server: 'https://linear.app', identifier: 'ENG-12' };
  store.linkBranch('/repo', 'issue/ENG-12-x', taskRef);
  // 无任务连接：关联被隐藏（防串平台陈旧引用复活）。
  assert.equal(api.useIssueWorkflowStore.getState().issueForBranch('/repo', 'issue/ENG-12-x'), undefined);
  await api.useTaskStore.getState().connectWithToken({ providerId: 'linear', displayName: 'Linear', token: 'lin_api_ok' });
  const restored = api.useIssueWorkflowStore.getState().issueForBranch('/repo', 'issue/ENG-12-x');
  assert.equal(restored?.identifier, 'ENG-12');
  // 断开连接后再次隐藏。
  const connection = api.useTaskStore.getState().connections[0];
  await api.useTaskStore.getState().removeConnection(connection.id);
  assert.equal(api.useIssueWorkflowStore.getState().issueForBranch('/repo', 'issue/ENG-12-x'), undefined);
  store.unlinkBranch('/repo', 'issue/ENG-12-x');
});

test('merged issue pages sort by updated time across sources and keep source keys', () => {
  const issue = (number, updated_at) => ({ id: number, number, title: 't' + number, body: null, state: 'open', html_url: '', user: { login: 'a' }, labels: [], assignees: [], comments: 0, created_at: '', updated_at, closed_at: null });
  const merged = api.mergeIssuePages([
    { key: 'repo-key', items: [issue(1, '2026-01-01T00:00:00Z'), issue(2, '2026-03-01T00:00:00Z')] },
    { key: 'task-key', items: [issue(3, '2026-02-01T00:00:00Z')] },
  ]);
  assert.deepEqual(merged.map(row => [row.key, row.issue.number]), [['repo-key', 2], ['task-key', 3], ['repo-key', 1]]);
});

test('issue client routing sends task refs to the task channel and hosting refs to collaboration', async () => {
  const connection = await api.useTaskStore.getState().connectWithToken({ providerId: 'linear', displayName: 'Linear', token: 'lin_api_route' });
  const plugin = api.getTaskPlugin('linear');
  api.bindTaskClient(plugin.createClient({ token: 'lin_api_route' }), connection.id, plugin.manifest);
  assert.deepEqual(api.usesTaskProvider('linear'), true);
  assert.deepEqual(api.usesTaskProvider('github'), false);
  const taskIssue = await api.issueClientFor('linear').getIssue('all', 'linear', 12);
  assert.equal(taskIssue.via, 'task');
  // 托管通道需先绑定客户端（运行时由 Git remote 驱动，这里手动等价操作）。
  api.bindCollaborationClient(api.getHostingPlugin('github').createClient('https://github.example', null), githubManifest);
  const hostedIssue = await api.issueClientFor('github').getIssue('o', 'r', 3);
  assert.equal(hostedIssue.via, 'hosting');
  await api.useTaskStore.getState().removeConnection(connection.id);
});
