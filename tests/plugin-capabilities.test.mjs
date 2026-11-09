import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import React from 'react';
import './react19-test-env.mjs';
import { create, act } from 'react-test-renderer';
import { checkPluginComposition, composePlugins, pluginCatalog } from '../scripts/plugin-composition.mjs';

const root = process.cwd(); let temporary, api;
before(async () => {
  temporary = await fs.mkdtemp(path.join(root, '.test-tmp-plugin-caps-'));
  const file = path.join(temporary, 'app.cjs');
  await build({ stdin: { contents: `export { IssueDetail } from './src/features/issues/IssueDetail'; export { CurrentBranchIssue } from './src/features/issues/CurrentBranchIssue'; export { RelatedIssues } from './src/features/issues/RelatedIssues'; export { useIssueWorkflowStore } from './src/stores/issueWorkflowStore'; export { IntegrationsSection } from './src/components/settings/IntegrationsSection'; export { useCollaborationStore } from './src/stores/collaborationStore'; export { useRepoStore } from './src/stores/repoStore'; export { bindCollaborationClient, collaborationService } from './src/services/collaboration/CollaborationService'; export { useCollaborationCapabilities } from './src/features/integrations/useCollaborationCapabilities'; export { activeProviderId } from './src/stores/collaboration/activeProvider';`, resolveDir: root }, outfile: file, bundle: true,
    platform: 'node', format: 'cjs', external: ['react', 'react-dom'], alias: { '@': path.join(root, 'src') }, loader: { '.css': 'empty' }, logLevel: 'silent', plugins: [{ name: 'read-only-tasks', setup(builder) {
      builder.onLoad({ filter: /src[\\/]plugins[\\/]index\.ts$/ }, () => ({ loader: 'ts', contents: `
        export const HOSTING_PLUGINS = [{ manifest: { id: 'tasks', name: 'Tasks', connectionKind: 'hosting-account', primaryDomain: 'task-tracking', domains: [{ domain: 'task-tracking', capabilities: ['task-tracking:list-issues', 'task-tracking:issue-detail'] }] } }, { manifest: { id: 'builds', name: 'Builds', connectionKind: 'hosting-account', primaryDomain: 'ci-cd', domains: [{ domain: 'ci-cd', capabilities: ['ci-cd:list-pipelines'] }] } }]; export const ERROR_PLUGINS = []; export const TASK_PLUGINS = []; export const CI_PLUGINS = [];
      ` }));
    } }] });
  api = createRequire(import.meta.url)(file);
});
after(async () => { if (temporary && path.dirname(temporary) === root && path.basename(temporary).startsWith('.test-tmp-plugin-caps-')) await fs.rm(temporary, { recursive: true, force: true }); });

test('read-only task plugins keep local branch work and disable issue writes and PR creation', async () => {
  const issue = { id: 12, number: 12, title: 'Read-only task', state: 'open', body: 'Task details', labels: [], assignees: [], comments: 0, user: { login: 'alice' }, created_at: 't', updated_at: 't' };
  api.bindCollaborationClient({ verifyToken: async () => ({}), setToken() {}, taskTracking: { getIssue: async () => issue, getIssueComments: async () => [], getIssueTimeline: async () => [] } });
  api.useCollaborationStore.setState({ providerId: 'tasks', server: 'https://tasks.example', currentOwner: 'team', currentRepoName: 'project', isAuthenticated: true, profiles: [{ id: 'tasks-default', label: 'tasks', providerId: 'tasks', server: 'https://tasks.example' }] });
  api.useRepoStore.setState({ currentRepo: { path: '/local-repo', currentBranch: 'topic' }, branches: [] });
  let renderer;
  try {
    await act(async () => { renderer = create(React.createElement(api.IssueDetail, { number: 12, onChanged() {} })); });
    for (const label of ['编辑 Issue', '创建关联 PR', '发表评论', '关闭为已完成', '关闭为不计划处理']) {
      const button = renderer.root.findAllByType('button').find(button => button.children.includes(label));
      assert.ok(button, label); assert.equal(button.props.disabled, true, label);
    }
    assert.equal(renderer.root.findAllByType('button').find(button => button.children.includes('从 Issue 创建分支')).props.disabled, false);
    assert.throws(() => api.collaborationService.createPullRequest('team', 'project', {}), error => error.key === 'connections.errors.capabilityUnavailable');
  } finally { await act(async () => renderer?.unmount()); }
});
test('workspace capabilities follow connected accounts and disappear when the last account is removed', async () => {
  const Probe = () => { const { can, connected, taskTracking, codeHosting, ciCd } = api.useCollaborationCapabilities();
    return React.createElement('div', { 'data-connected': String(connected), 'data-task': String(taskTracking || can('task-tracking:list-issues')), 'data-hosting': String(codeHosting), 'data-ci': String(ciCd) }); };
  let renderer;
  api.useCollaborationStore.setState({ providerId: null, server: '', profiles: [] });
  try {
    await act(async () => { renderer = create(React.createElement(Probe)); });
    assert.equal(renderer.toJSON().props['data-connected'], 'false');
    assert.equal(renderer.toJSON().props['data-task'], 'false');
    assert.equal(renderer.toJSON().props['data-hosting'], 'false');
    api.useCollaborationStore.setState({ profiles: [{ id: 'probe', label: 'probe', providerId: 'tasks', server: 'https://tasks.example' }] });
    await act(async () => {});
    assert.equal(renderer.toJSON().props['data-connected'], 'true');
    assert.equal(renderer.toJSON().props['data-task'], 'true');
    assert.equal(renderer.toJSON().props['data-hosting'], 'false');
    assert.equal(renderer.toJSON().props['data-ci'], 'false');
    api.useCollaborationStore.setState({ profiles: [] });
    await act(async () => {});
    assert.equal(renderer.toJSON().props['data-connected'], 'false');
    assert.equal(renderer.toJSON().props['data-task'], 'false');
  } finally { api.useCollaborationStore.setState({ profiles: [] }); await act(async () => { renderer?.unmount(); }); }
});
test('provider semantics follow the active account, falling back to the session platform', () => {
  assert.equal(api.activeProviderId({ providerId: 'github', activeProfileId: 'gitlab-account', profiles: [{ id: 'gitlab-account', providerId: 'gitlab' }] }), 'gitlab');
  assert.equal(api.activeProviderId({ providerId: 'github', activeProfileId: 'missing', profiles: [{ id: 'gitlab-account', providerId: 'gitlab' }] }), 'github');
  assert.equal(api.activeProviderId({ providerId: null, activeProfileId: null, profiles: [] }), null);
});
test('all build profiles come from the checked composition catalog', () => {
  checkPluginComposition();
  const gitlab = composePlugins('gitlab'); assert.match(gitlab.data, /gitlabPlugin/); assert.doesNotMatch(gitlab.data, /github|gitea|sentry/); assert.doesNotMatch(gitlab.ui, /AuthDialog/); assert.deepEqual(gitlab.nativeFeatures, []);
  assert.match(composePlugins('none').data, /HOSTING_PLUGINS: readonly HostingPlugin\[\] = \[\]/);
  assert.throws(() => composePlugins('unknown')); assert.throws(() => composePlugins('gitlab,gitlab'));
});
test('plugin composition accepts independent task and ci kinds', async () => {
  const fixtureRoot = await fs.mkdtemp(path.join(root, '.test-tmp-plugin-comp-'));
  try {
    for (const mod of ['jira', 'jenkins', 'gitea']) {
      await fs.mkdir(path.join(fixtureRoot, 'src/plugins', mod), { recursive: true });
      await fs.writeFile(path.join(fixtureRoot, 'src/plugins', mod, 'index.ts'), `export const ${mod}Plugin = { manifest: { id: '${mod}' } };\n`);
    }
    await fs.writeFile(path.join(fixtureRoot, 'plugins.config.json'), JSON.stringify({ plugins: [
      { id: 'jira', kind: 'task', module: './jira' },
      { id: 'jenkins', kind: 'ci', module: './jenkins' },
      { id: 'gitea', kind: 'hosting', module: './gitea' },
    ] }));
    const full = composePlugins(undefined, fixtureRoot).data;
    assert.match(full, /HOSTING_PLUGINS: readonly HostingPlugin\[\] = \[giteaPlugin\]/);
    assert.match(full, /TASK_PLUGINS: readonly AuxPlugin\[\] = \[jiraPlugin\]/);
    assert.match(full, /CI_PLUGINS: readonly CiPlugin\[\] = \[jenkinsPlugin\]/);
    const selective = composePlugins('jira', fixtureRoot).data;
    assert.match(selective, /TASK_PLUGINS: readonly AuxPlugin\[\] = \[jiraPlugin\]/);
    assert.match(selective, /CI_PLUGINS: readonly CiPlugin\[\] = \[\]/);
    assert.doesNotMatch(selective, /jenkinsPlugin|giteaPlugin/);
    assert.deepEqual(composePlugins('jenkins', fixtureRoot).nativeFeatures, []);
    assert.equal(pluginCatalog(fixtureRoot).map(plugin => plugin.kind).join(','), 'task,ci,hosting');
    for (const broken of [{ id: 'ops', kind: 'deploy', module: './jira' }, { id: 'jira', kind: 'task', module: './missing' }]) {
      await fs.writeFile(path.join(fixtureRoot, 'plugins.config.json'), JSON.stringify({ plugins: [broken] }));
      assert.throws(() => pluginCatalog(fixtureRoot), /Invalid or duplicate plugin declaration|Plugin module missing/);
    }
  } finally { await fs.rm(fixtureRoot, { recursive: true, force: true }); }
});

test('task-only and CI-only plugins are reachable from connection settings', async () => {
  let renderer;
  const selected = [];
  try {
    await act(async () => { renderer = create(React.createElement(api.IntegrationsSection, { onManageAccounts: id => selected.push(id) })); });
    // 卡片点击是展开（连接信息合并进卡片），托管平台的「添加连接」才进入账号流程。
    for (const name of ['Tasks', 'Builds']) {
      const button = renderer.root.findAllByType('button').find(button => button.props['aria-label']?.endsWith(`: ${name}`));
      assert.ok(button, `${name} connection entry`);
      await act(async () => button.props.onClick());
      const add = renderer.root.findAllByType('button').find(button => button.props['aria-label'] === '添加连接');
      assert.ok(add, `${name} add-connection action`);
      await act(async () => add.props.onClick());
    }
    assert.deepEqual(selected, ['tasks', 'builds']);
  } finally { await act(async () => renderer?.unmount()); }
});

test('CI-only plugins skip persisted branch-task and related-task reads', async () => {
  api.bindCollaborationClient({ verifyToken: async () => ({}), setToken() {}, ciCd: {} });
  api.useCollaborationStore.setState({ providerId: 'builds', server: 'https://builds.example', currentOwner: 'team', currentRepoName: 'project', isAuthenticated: true, profiles: [{ id: 'builds-default', label: 'builds', providerId: 'builds', server: 'https://builds.example' }] });
  api.useRepoStore.setState({ currentRepo: { path: '/local-repo', currentBranch: 'topic' }, branches: [] });
  api.useIssueWorkflowStore.setState({ branchIssues: { [JSON.stringify(['/local-repo', 'topic'])]: { owner: 'team', repo: 'project', number: 12 } } });
  let renderer;
  try {
    await act(async () => { renderer = create(React.createElement(React.Fragment, null,
      React.createElement(api.CurrentBranchIssue), React.createElement(api.RelatedIssues, { body: 'Closes #12', owner: 'team', repo: 'project' })));
    });
    assert.equal(renderer.toJSON(), null);
  } finally { await act(async () => renderer?.unmount()); }
});
