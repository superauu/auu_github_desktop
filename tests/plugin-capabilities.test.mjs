import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import React from 'react';
import './react19-test-env.mjs';
import { create, act } from 'react-test-renderer';
import { checkPluginComposition, composePlugins } from '../scripts/plugin-composition.mjs';

const root = process.cwd(); let temporary, api;
before(async () => {
  temporary = await fs.mkdtemp(path.join(root, '.test-tmp-plugin-caps-'));
  const file = path.join(temporary, 'app.cjs');
  await build({ stdin: { contents: `export { IssueDetail } from './src/features/issues/IssueDetail'; export { CurrentBranchIssue } from './src/features/issues/CurrentBranchIssue'; export { RelatedIssues } from './src/features/issues/RelatedIssues'; export { useIssueWorkflowStore } from './src/stores/issueWorkflowStore'; export { IntegrationsSection } from './src/components/settings/IntegrationsSection'; export { useCollaborationStore } from './src/stores/collaborationStore'; export { useRepoStore } from './src/stores/repoStore'; export { bindCollaborationClient, collaborationService } from './src/services/collaboration/CollaborationService';`, resolveDir: root }, outfile: file, bundle: true,
    platform: 'node', format: 'cjs', external: ['react', 'react-dom'], alias: { '@': path.join(root, 'src') }, loader: { '.css': 'empty' }, logLevel: 'silent', plugins: [{ name: 'read-only-tasks', setup(builder) {
      builder.onLoad({ filter: /src[\\/]plugins[\\/]index\.ts$/ }, () => ({ loader: 'ts', contents: `
        export const HOSTING_PLUGINS = [{ manifest: { id: 'tasks', name: 'Tasks', connectionKind: 'hosting-account', primaryDomain: 'task-tracking', domains: [{ domain: 'task-tracking', capabilities: ['task-tracking:list-issues', 'task-tracking:issue-detail'] }] } }, { manifest: { id: 'builds', name: 'Builds', connectionKind: 'hosting-account', primaryDomain: 'ci-cd', domains: [{ domain: 'ci-cd', capabilities: ['ci-cd:list-pipelines'] }] } }]; export const ERROR_PLUGINS = [];
      ` }));
    } }] });
  api = createRequire(import.meta.url)(file);
});
after(async () => { if (temporary && path.dirname(temporary) === root && path.basename(temporary).startsWith('.test-tmp-plugin-caps-')) await fs.rm(temporary, { recursive: true, force: true }); });

test('read-only task plugins keep local branch work and disable issue writes and PR creation', async () => {
  const issue = { id: 12, number: 12, title: 'Read-only task', state: 'open', body: 'Task details', labels: [], assignees: [], comments: 0, user: { login: 'alice' }, created_at: 't', updated_at: 't' };
  api.bindCollaborationClient({ verifyToken: async () => ({}), setToken() {}, taskTracking: { getIssue: async () => issue, getIssueComments: async () => [], getIssueTimeline: async () => [] } });
  api.useCollaborationStore.setState({ providerId: 'tasks', server: 'https://tasks.example', currentOwner: 'team', currentRepoName: 'project', isAuthenticated: true });
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
test('all build profiles come from the checked composition catalog', () => {
  checkPluginComposition();
  const gitlab = composePlugins('gitlab'); assert.match(gitlab.data, /gitlabPlugin/); assert.doesNotMatch(gitlab.data, /github|gitea|sentry/); assert.doesNotMatch(gitlab.ui, /AuthDialog/); assert.deepEqual(gitlab.nativeFeatures, []);
  assert.match(composePlugins('none').data, /HOSTING_PLUGINS: readonly HostingPlugin\[\] = \[\]/);
  assert.throws(() => composePlugins('unknown')); assert.throws(() => composePlugins('gitlab,gitlab'));
});

test('task-only and CI-only plugins are reachable from connection settings', async () => {
  let renderer;
  const selected = [];
  try {
    await act(async () => { renderer = create(React.createElement(api.IntegrationsSection, { onManageAccounts: id => selected.push(id) })); });
    for (const name of ['Tasks', 'Builds']) {
      const button = renderer.root.findAllByType('button').find(button => button.props['aria-label']?.endsWith(`: ${name}`));
      assert.ok(button, `${name} connection entry`);
      await act(async () => button.props.onClick());
    }
    assert.deepEqual(selected, ['tasks', 'builds']);
  } finally { await act(async () => renderer?.unmount()); }
});

test('CI-only plugins skip persisted branch-task and related-task reads', async () => {
  api.bindCollaborationClient({ verifyToken: async () => ({}), setToken() {}, ciCd: {} });
  api.useCollaborationStore.setState({ providerId: 'builds', server: 'https://builds.example', currentOwner: 'team', currentRepoName: 'project', isAuthenticated: true });
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
