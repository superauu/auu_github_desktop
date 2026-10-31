import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import React from 'react';
import './react19-test-env.mjs';
import { create, act } from 'react-test-renderer';

const root = process.cwd();
const originalFetch = globalThis.fetch;
const saved = new Map();
globalThis.localStorage = { getItem: key => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value), removeItem: key => saved.delete(key) };
let app, tmp;
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const workflow = { id: 1, name: 'Deploy', path: '.github/workflows/deploy.yml' };
const yaml = `on:
  workflow_dispatch:
    inputs:
      region:
        description: Deployment region
        type: choice
        required: true
        default: ap-southeast-2
        options: [ap-southeast-2, us-east-1]
      dryRun:
        type: boolean
        required: true
        default: false
      count:
        type: number
        default: 0
      environment:
        type: environment
      notes:
        type: string
`;
const flush = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
const openDialog = async () => {
  app.useRepoStore.setState({ branches: [{ name: 'main', isCurrent: true, isRemote: false }, { name: 'topic/test', isCurrent: false, isRemote: false }] });
  app.useGitHubStore.setState({ currentOwner: 'owner', currentRepoName: 'repo', repoDetails: { default_branch: 'main' }, isDispatchModalOpen: true, dispatchTargetWorkflow: workflow });
  let renderer;
  await act(async () => { renderer = create(React.createElement(app.WorkflowDispatchDialog)); });
  return renderer;
};
const submitButton = renderer => renderer.root.findAllByType('button').find(b => b.props.type === 'submit');

const remoteContext = {
  branch: 'topic/path', remote: 'origin', targetBranch: 'topic/path', upstream: 'upstream/main',
  remotes: [
    { name: 'origin', fetchUrl: 'https://example.invalid/fork.git', pushUrl: 'ssh://example.invalid/fork.git' },
    { name: 'upstream', fetchUrl: 'https://example.invalid/team.git', pushUrl: 'ssh://example.invalid/team.git' },
  ],
};
const remoteRepo = { id: 'remote-ui', path: '/remote-ui', name: 'remote-ui', currentBranch: 'main', lastOpenedAt: 0 };
const remoteSubmit = renderer => renderer.root.findAllByType('button').at(-1);

function prFixture({ head = 'topic', owner = 'team', repo = 'project', remote = 'upstream', sourceOwner = 'alice', sourceRepo = 'project' } = {}) {
  const originals = {
    context: app.gitService.getPushContext, defaultBranch: app.githubService.getRepositoryDefaultBranch,
    create: app.githubService.createPullRequest, refresh: app.useGitHubStore.getState().loadPullRequests,
  };
  const repository = { ...remoteRepo, path: '/pr-ui', currentBranch: head, gitHubRemote: remote, gitHubOwner: owner, gitHubRepo: repo };
  const context = { ...remoteContext, branch: head, targetBranch: head, remote: 'origin', remotes: [
    { name: 'origin', fetchUrl: `https://github.com/${sourceOwner}/${sourceRepo}.git`, pushUrl: `https://github.com/${sourceOwner}/${sourceRepo}.git` },
    { name: 'upstream', fetchUrl: 'https://github.com/team/project.git', pushUrl: 'https://github.com/team/project.git' },
  ] };
  app.useRepoStore.setState({ currentRepo: repository, status: null, commits: [{ subject: 'Test PR', body: '' }], branches: [
    { name: head, isCurrent: true, isRemote: false },
    { name: 'origin/master', isCurrent: false, isRemote: true, remoteName: 'origin', remoteBranch: 'master' },
    { name: 'upstream/main', isCurrent: false, isRemote: true, remoteName: 'upstream', remoteBranch: 'main' },
  ] });
  const requests = [], closed = [];
  app.useGitHubStore.setState({ currentOwner: owner, currentRepoName: repo, pullRequests: [], loadPullRequests: async () => {} });
  app.gitService.getPushContext = async () => context;
  app.githubService.getRepositoryDefaultBranch = async targetOwner => targetOwner === 'alice' ? 'master' : 'main';
  app.githubService.createPullRequest = async (...args) => { requests.push(args); return { number: 7, html_url: 'https://example.invalid/pr/7' }; };
  const props = { open: true, onOpenChange: open => closed.push(open) };
  return { repository, context, requests, closed, props, cleanup() {
    app.gitService.getPushContext = originals.context; app.githubService.getRepositoryDefaultBranch = originals.defaultBranch;
    app.githubService.createPullRequest = originals.create;
    app.useGitHubStore.setState({ currentOwner: null, currentRepoName: null, loadPullRequests: originals.refresh });
    app.useRepoStore.setState({ currentRepo: null });
  } };
}

const prBase = renderer => renderer.root.findAllByType('select')[1];
const submitPR = renderer => renderer.root.findByType('form').props.onSubmit({ preventDefault() {} });

test('cross-fork PRs namespace their source and allow the same branch name in different repositories', async () => {
  const fixture = prFixture({ head: 'main' }); let renderer;
  try {
    await act(async () => { renderer = create(React.createElement(app.CreatePullRequestModal, fixture.props)); });
    assert.equal(submitButton(renderer).props.disabled, false);
    await act(async () => submitPR(renderer));
    assert.equal(fixture.requests.length, 1);
    assert.equal(fixture.requests[0][0], 'team');
    assert.equal(fixture.requests[0][2].head, 'alice:main');
    assert.equal(fixture.requests[0][2].headRepo, 'project');
    assert.equal(fixture.requests[0][2].base, 'main');
  } finally { await act(async () => renderer?.unmount()); fixture.cleanup(); }
});

test('PR source selection supports renamed published branches and same-organization forks', async () => {
  const fixture = prFixture({ head: 'topic/local', sourceOwner: 'team', sourceRepo: 'project-fork' }); let renderer;
  try {
    await act(async () => { renderer = create(React.createElement(app.CreatePullRequestModal, fixture.props)); });
    await act(async () => renderer.root.findByProps({ 'aria-label': '来源仓库中的分支' }).props.onChange({ target: { value: 'review/published' } }));
    await act(async () => submitPR(renderer));
    assert.equal(fixture.requests[0][2].head, 'team:review/published');
    assert.equal(fixture.requests[0][2].headRepo, 'project-fork');
  } finally { await act(async () => renderer?.unmount()); fixture.cleanup(); }
});

test('same-repository PRs use an unqualified head and reject the identical target branch', async () => {
  const fixture = prFixture({ head: 'main', sourceOwner: 'team' }); let renderer;
  try {
    await act(async () => { renderer = create(React.createElement(app.CreatePullRequestModal, fixture.props)); });
    assert.ok(renderer.root.findAllByType('button').some(button => button.props.onClick && button.props.type === 'button' && button.props.title));
    assert.equal(submitButton(renderer).props.disabled, true);
    await act(async () => submitPR(renderer)); assert.equal(fixture.requests.length, 0);
    await act(async () => renderer.root.findByProps({ 'aria-label': '来源仓库中的分支' }).props.onChange({ target: { value: 'topic' } }));
    await act(async () => submitPR(renderer));
    assert.equal(fixture.requests[0][2].head, 'topic'); assert.equal(fixture.requests[0][2].headRepo, undefined);
  } finally { await act(async () => renderer?.unmount()); fixture.cleanup(); }
});

test('Commit and Push reports a preference warning alongside push success without reporting a push failure', async () => {
  const methods = ['getStatus', 'commit', 'getBranchCommitHash', 'push', 'getPushContext'];
  const reviewBeforeCommit = app.useSettingsStore.getState().reviewBeforeCommit;
  app.useSettingsStore.setState({ reviewBeforeCommit: false });
  const originals = Object.fromEntries(methods.map(name => [name, app.gitService[name]]));
  const refreshStatus = app.useRepoStore.getState().refreshStatus;
  const status = { currentBranch: 'main', ahead: 0, behind: 0, isClean: false, staged: [{ path: 'a.txt', status: 'modified', staged: true }], unstaged: [], untracked: [] };
  app.useRepoStore.setState({ currentRepo: remoteRepo, status, refreshStatus: async () => {} });
  app.useToastStore.setState({ toasts: [] });
  let pushed = 0, renderer;
  app.gitService.getStatus = async () => status;
  app.gitService.commit = async () => 'committed';
  app.gitService.getBranchCommitHash = async () => 'new-sha';
  app.gitService.push = async () => { pushed++; return { preferenceError: 'config is locked' }; };
  app.gitService.getPushContext = async () => remoteContext;
  const noop = () => {};
  const draftState = { title: 'Commit', body: '', busy: false, setBusy: noop, operation: { current: false }, scopeSignature: { current: '' }, setTitle: noop, setBody: noop, amend: false, setAmend: noop, amendCommit: null, setAmendCommit: noop, origin: null, setOrigin: noop };
  try {
    await act(async () => { renderer = create(React.createElement(app.CommitComposer, { draftState, onOpenAiSettings: noop })); });
    await act(async () => {
      renderer.root.findAllByType('button').find(button => button.props.className.includes('glass-button-outline') && button.props.className.includes('w-full') && !button.props.className.includes('min-h-9')).props.onClick();
      await Promise.resolve();
      app.useRemoteDialogStore.getState().settle({ remote: 'origin', branch: 'main', targetBranch: 'main', setUpstream: false, rememberRemote: true });
    });
    assert.equal(pushed, 1);
    const toasts = app.useToastStore.getState().toasts;
    assert.ok(toasts.some(toast => toast.type === 'warning' && /推送已成功|Push succeeded/.test(toast.title)));
    assert.ok(toasts.some(toast => toast.type === 'success' && /推送|Push/.test(toast.title)));
    assert.ok(!toasts.some(toast => toast.type === 'error'));
  } finally {
    await act(async () => renderer?.unmount());
    Object.assign(app.gitService, originals);
    app.useSettingsStore.setState({ reviewBeforeCommit });
    app.useRepoStore.setState({ currentRepo: null, refreshStatus });
    app.useRemoteDialogStore.getState().settle(null);
  }
});

test('reopening PR creation after changing the collaboration remote resets the submitted base', async () => {
  const fixture = prFixture({ owner: 'alice', remote: 'origin' }); let renderer;
  try {
    await act(async () => { renderer = create(React.createElement(app.CreatePullRequestModal, fixture.props)); });
    assert.equal(prBase(renderer).props.value, 'master');
    await act(async () => renderer.update(React.createElement(app.CreatePullRequestModal, { ...fixture.props, open: false })));
    await act(async () => {
      app.useRepoStore.setState({ currentRepo: { ...fixture.repository, gitHubRemote: 'upstream', gitHubOwner: 'team' } });
      app.useGitHubStore.setState({ currentOwner: 'team' });
      renderer.update(React.createElement(app.CreatePullRequestModal, fixture.props));
    });
    assert.equal(prBase(renderer).props.value, 'main');
    assert.deepEqual(prBase(renderer).findAllByType('option').map(option => option.props.value), ['main']);
    await act(async () => submitPR(renderer)); assert.equal(fixture.requests[0][2].base, 'main');
  } finally { await act(async () => renderer?.unmount()); fixture.cleanup(); }
});

test('late PR base responses and completed submissions cannot overwrite a different target session', async () => {
  const fixture = prFixture({ owner: 'alice', remote: 'origin' }); const oldDefault = deferred(); let renderer;
  app.githubService.getRepositoryDefaultBranch = owner => owner === 'alice' ? oldDefault.promise : Promise.resolve('main');
  try {
    await act(async () => { renderer = create(React.createElement(app.CreatePullRequestModal, fixture.props)); });
    assert.equal(submitButton(renderer).props.disabled, true);
    await act(async () => {
      app.useRepoStore.setState({ currentRepo: { ...fixture.repository, gitHubRemote: 'upstream', gitHubOwner: 'team' } });
      app.useGitHubStore.setState({ currentOwner: 'team' });
    });
    await act(async () => oldDefault.resolve('master'));
    assert.equal(prBase(renderer).props.value, 'main');
    const creation = deferred(); app.githubService.createPullRequest = () => creation.promise;
    let submission;
    await act(async () => { submission = submitPR(renderer); });
    await act(async () => {
      app.useRepoStore.setState({ currentRepo: { ...fixture.repository, gitHubRemote: 'origin' } });
      app.useGitHubStore.setState({ currentOwner: 'alice' });
    });
    await act(async () => { creation.resolve({ number: 7, html_url: 'https://example.invalid/pr/7' }); await submission; });
    assert.deepEqual(fixture.closed, []); assert.equal(prBase(renderer).props.value, 'master');
  } finally { await act(async () => renderer?.unmount()); fixture.cleanup(); }
});

test('GitHub PR requests include head_repo for a cross-repository source and retain specific validation errors', async () => {
  const fixture = prFixture(); let renderer;
  try {
    app.githubService.createPullRequest = async () => { throw Error('Validation Failed: source branch does not exist'); };
    await act(async () => { renderer = create(React.createElement(app.CreatePullRequestModal, fixture.props)); });
    await act(async () => submitPR(renderer));
    assert.match(JSON.stringify(renderer.toJSON()), /source branch does not exist/);
    // Exercise the real transport separately below; no GitHub request leaves this test.
  } finally { await act(async () => renderer?.unmount()); fixture.cleanup(); }
  let sent;
  globalThis.fetch = async (_url, init) => { sent = JSON.parse(init.body); return new Response(JSON.stringify({ number: 7 })); };
  try {
    await app.githubService.createPullRequest('team', 'project', { title: 'PR', head: 'team:topic', headRepo: 'project-fork', base: 'main' });
    assert.equal(sent.head, 'team:topic'); assert.equal(sent.head_repo, 'project-fork');
  } finally { globalThis.fetch = originalFetch; }
});

test('all branch push entry points share a cancellable chooser and keep push preference separate from pull tracking', async () => {
  const originalContext = app.gitService.getPushContext, originalPush = app.useRepoStore.getState().push;
  const calls = []; let renderer;
  app.gitService.getPushContext = async () => remoteContext;
  app.useRepoStore.setState({ currentRepo: remoteRepo, status: null, push: async (...args) => { calls.push(args); } });
  try {
    let cancelled;
    await act(async () => { renderer = create(React.createElement(app.RemoteOperationDialog)); cancelled = app.pushFromUi('topic/path'); });
    assert.equal(renderer.root.findByType('select').props.value, 'origin');
    assert.equal(renderer.root.findAllByType('input').filter(input => input.props.type === 'checkbox')[1].props.checked, false);
    await act(async () => renderer.root.findAllByType('button').at(-2).props.onClick());
    assert.equal(await cancelled, false); assert.deepEqual(calls, []);
    let accepted;
    await act(async () => { accepted = app.pushFromUi('topic/path'); });
    await act(async () => renderer.root.findByType('select').props.onChange({ target: { value: 'upstream' } }));
    await act(async () => renderer.root.findAllByType('input').find(input => input.props.type !== 'checkbox').props.onChange({ target: { value: 'review/topic' } }));
    await act(async () => renderer.root.findAllByType('input').filter(input => input.props.type === 'checkbox')[0].props.onChange({ target: { checked: true } }));
    await act(async () => remoteSubmit(renderer).props.onClick());
    assert.equal(await accepted, true);
    assert.equal(calls.length, 1); assert.equal(calls[0][0], 'upstream'); assert.equal(calls[0][1], 'topic/path');
    assert.equal(calls[0][2].targetBranch, 'review/topic'); assert.equal(calls[0][2].rememberRemote, true); assert.equal(calls[0][2].setUpstream, false);
  } finally {
    await act(async () => { renderer?.unmount(); app.useRemoteDialogStore.getState().settle(null); });
    app.gitService.getPushContext = originalContext; app.useRepoStore.setState({ push: originalPush, currentRepo: null });
  }
});

test('changing repositories cancels pending remote selection and late configuration responses are ignored', async () => {
  const original = app.gitService.getPushContext; const waiting = deferred(); let renderer;
  app.gitService.getPushContext = () => waiting.promise;
  app.useRepoStore.setState({ currentRepo: remoteRepo, status: null });
  try {
    let result;
    await act(async () => { renderer = create(React.createElement(app.RemoteOperationDialog)); result = app.pushFromUi(); });
    assert.equal(app.useRemoteDialogStore.getState().pending, null);
    await act(async () => app.useRepoStore.setState({ currentRepo: { ...remoteRepo, path: '/another' } }));
    await act(async () => waiting.resolve(remoteContext));
    assert.equal(await result, false);
    assert.equal(renderer.toJSON(), null);
  } finally {
    await act(async () => { renderer?.unmount(); app.useRemoteDialogStore.getState().settle(null); });
    app.gitService.getPushContext = original; app.useRepoStore.setState({ currentRepo: null });
  }
});

test('single-remote pushes skip selection while explicit destinations and force pushes still confirm', async () => {
  const original = app.gitService.getPushContext;
  const context = { ...remoteContext, remotes: [remoteContext.remotes[0]], upstream: 'origin/review/topic', targetBranch: 'review/topic' };
  app.gitService.getPushContext = async () => context;
  app.useRepoStore.setState({ currentRepo: remoteRepo, status: null });
  let renderer;
  try {
    assert.deepEqual(await app.chooseRemoteTarget(remoteRepo.path, 'topic/path'), { remote: 'origin', branch: 'topic/path', targetBranch: 'review/topic', setUpstream: false });
    assert.equal(app.useRemoteDialogStore.getState().pending, null);
    context.upstream = undefined;
    assert.equal((await app.chooseRemoteTarget(remoteRepo.path, 'topic/path')).setUpstream, true);
    let choice;
    await act(async () => { renderer = create(React.createElement(app.RemoteOperationDialog)); choice = app.chooseRemoteTarget(remoteRepo.path, 'topic/path', false, 'branch', undefined, true); });
    assert.equal(renderer.root.findByType('select').props.value, 'origin');
    await act(async () => app.useRemoteDialogStore.getState().settle(null)); assert.equal(await choice, null);
    await act(async () => { choice = app.chooseRemoteTarget(remoteRepo.path, 'topic/path', true); });
    assert.equal(remoteSubmit(renderer).props.disabled, false);
    await act(async () => remoteSubmit(renderer).props.onClick()); assert.equal((await choice).forceWithLease, true);
  } finally { await act(async () => { renderer?.unmount(); app.useRemoteDialogStore.getState().settle(null); }); app.gitService.getPushContext = original; app.useRepoStore.setState({ currentRepo: null }); }
});

test('remote defaults and existing tracking are restored on reopen and follow the selected destination', async () => {
  const original = app.gitService.getPushContext;
  app.gitService.getPushContext = async () => ({ ...remoteContext, pushRemote: 'origin', upstream: 'origin/topic/path' });
  app.useRepoStore.setState({ currentRepo: remoteRepo, status: null });
  const checks = renderer => renderer.root.findAllByType('input').filter(input => input.props.type === 'checkbox').map(input => input.props.checked);
  let renderer, choice;
  try {
    await act(async () => { renderer = create(React.createElement(app.RemoteOperationDialog)); choice = app.chooseRemoteTarget(remoteRepo.path, 'topic/path'); });
    assert.deepEqual(checks(renderer), [true, true]);
    await act(async () => renderer.root.findByType('select').props.onChange({ target: { value: 'upstream' } }));
    assert.deepEqual(checks(renderer), [false, false]);
    await act(async () => renderer.root.findByType('select').props.onChange({ target: { value: 'origin' } }));
    assert.deepEqual(checks(renderer), [true, true]);
    await act(async () => app.useRemoteDialogStore.getState().settle(null)); await choice;
    await act(async () => { choice = app.chooseRemoteTarget(remoteRepo.path, 'topic/path'); });
    assert.deepEqual(checks(renderer), [true, true]);
    await act(async () => renderer.root.findAllByType('input').filter(input => input.props.type === 'checkbox')[1].props.onChange({ target: { checked: false } }));
    await act(async () => remoteSubmit(renderer).props.onClick());
    const selection = await choice; assert.equal(selection.rememberRemote, true); assert.equal(selection.unsetUpstream, true); assert.equal(selection.setUpstream, false);
  } finally { await act(async () => { renderer?.unmount(); app.useRemoteDialogStore.getState().settle(null); }); app.gitService.getPushContext = original; app.useRepoStore.setState({ currentRepo: null }); }
});

test('Git activity recognizes subcommands after global options and restarts the phase timer', async () => {
  assert.equal(app.getGitCommand(['--literal-pathspecs', 'commit', '-m', 'message']), 'commit');
  assert.equal(app.getGitCommand(['-c', 'core.quotepath=false', '--literal-pathspecs', 'add', '--all']), 'add');
  assert.equal(app.isReadOnlyGitCommand(['--literal-pathspecs', 'diff', 'HEAD']), true);
  assert.equal(app.isReadOnlyGitCommand(['--literal-pathspecs', 'commit', '--only']), false);
  const gate = deferred();
  const running = app.serializeGitWrite('phase/repo', () => gate.promise, 'transaction');
  await Promise.resolve();
  const startedAt = app.getGitWriteActivity('phase/repo').startedAt;
  await new Promise(resolve => setTimeout(resolve, 10));
  app.updateGitWriteCommand('phase/repo', 'commit');
  const commit = app.getGitWriteActivity('phase/repo');
  assert.equal(commit.command, 'commit'); assert.equal(commit.startedAt, startedAt); assert.ok(commit.phaseStartedAt > startedAt);
  gate.resolve(); await running; assert.equal(app.getGitWriteActivity('phase/repo'), null);
});

test('repeated clicks during a direct push never enqueue another push', async () => {
  const originalContext = app.gitService.getPushContext, originalPush = app.useRepoStore.getState().push;
  const gate = deferred(); let pushes = 0;
  app.gitService.getPushContext = async () => ({ ...remoteContext, remotes: [remoteContext.remotes[0]] });
  app.useRepoStore.setState({ currentRepo: remoteRepo, status: null, push: async () => { pushes++; await gate.promise; } });
  try {
    const first = app.pushFromUi(); await Promise.resolve();
    assert.equal(await app.pushFromUi(), false); assert.equal(pushes, 1);
    gate.resolve(); assert.equal(await first, true);
    assert.equal(await app.pushFromUi(), true); assert.equal(pushes, 2);
  } finally { gate.resolve(); app.gitService.getPushContext = originalContext; app.useRepoStore.setState({ currentRepo: null, push: originalPush }); }
});

test('remote configuration failures support retry and force push always shows its destination before proceeding', async () => {
  const original = app.gitService.getPushContext; let attempts = 0, renderer;
  app.gitService.getPushContext = async () => { if (++attempts === 1) throw Error('remote config unavailable'); return remoteContext; };
  app.useRepoStore.setState({ currentRepo: remoteRepo, status: null });
  try {
    let result;
    await act(async () => { renderer = create(React.createElement(app.RemoteOperationDialog)); result = app.chooseRemoteTarget(remoteRepo.path, 'topic/path', true); });
    assert.match(JSON.stringify(renderer.toJSON()), /remote config unavailable/); assert.equal(remoteSubmit(renderer).props.disabled, true);
    await act(async () => renderer.root.findAllByType('button')[0].props.onClick());
    assert.equal(attempts, 2); assert.equal(remoteSubmit(renderer).props.disabled, false);
    assert.match(JSON.stringify(renderer.toJSON()), /ssh:\/\/example.invalid\/fork.git/);
    assert.equal(renderer.root.findAllByProps({ role: 'alert' }).length, 1);
    await act(async () => remoteSubmit(renderer).props.onClick());
    assert.equal((await result).forceWithLease, true);
  } finally {
    await act(async () => { renderer?.unmount(); app.useRemoteDialogStore.getState().settle(null); });
    app.gitService.getPushContext = original; app.useRepoStore.setState({ currentRepo: null });
  }
});

test('push CI observation follows the actual destination repository and never turns a completed push into a failure', async () => {
  const original = app.gitService.getPushContext, watch = app.useGitHubStore.getState().watchPushChecks;
  const seen = [];
  app.gitService.getPushContext = async () => ({ ...remoteContext, remotes: [
    { name: 'origin', fetchUrl: 'https://github.com/fork/project.git', pushUrl: 'https://github.com/fork/project.git' },
    { name: 'upstream', fetchUrl: 'https://github.com/team/project.git', pushUrl: 'https://github.com/team/project.git' },
  ] });
  app.useGitHubStore.setState({ currentOwner: 'team', currentRepoName: 'project', watchPushChecks: sha => seen.push(sha) });
  try {
    await app.watchPushedCommit('/repo', 'origin', 'topic/path', 'fork-sha', () => true);
    assert.deepEqual(seen, []);
    await app.watchPushedCommit('/repo', 'upstream', 'topic/path', 'team-sha', () => true);
    assert.deepEqual(seen, ['team-sha']);
    await app.watchPushedCommit('/repo', 'upstream', 'topic/path', 'stale-sha', () => false);
    assert.deepEqual(seen, ['team-sha']);
    app.gitService.getPushContext = async () => { throw Error('metadata unavailable'); };
    await app.watchPushedCommit('/repo', 'upstream', 'topic/path', 'succeeded-sha', () => true);
  } finally {
    app.gitService.getPushContext = original;
    app.useGitHubStore.setState({ currentOwner: null, currentRepoName: null, watchPushChecks: watch });
  }
});

before(async () => {
  tmp = await fs.mkdtemp(path.join(root, '.test-tmp-ux-'));
  const bundle = path.join(tmp, 'ux.cjs');
  await build({ stdin: { contents: `export { useSettingsStore } from './src/stores/settingsStore'; export { CommitComposer } from './src/components/layout/CommitComposer'; export { CreatePullRequestModal } from './src/features/pr/CreatePullRequestModal'; export { useToastStore } from './src/stores/toastStore'; export * from './src/services/git/PushChecks'; export * from './src/stores/remoteDialogStore'; export * from './src/services/git/RemoteActions'; export { RemoteOperationDialog } from './src/features/git/RemoteOperationDialog'; export * from './src/services/github/WorkflowInputs'; export * from './src/services/git/GitQueue'; export { githubService } from './src/services/github/GitHubService'; export { useGitHubStore } from './src/stores/githubStore'; export { useRepoStore } from './src/stores/repoStore'; export { ErrorBoundary } from './src/components/ui/ErrorBoundary'; export { WorkflowDispatchDialog } from './src/features/actions/WorkflowDispatchDialog'; export { RecoveryCenterDialog } from './src/features/git/RecoveryCenterDialog'; export { branchSafetyService } from './src/services/git/BranchSafetyService'; export { historyWorkflowService } from './src/services/git/HistoryWorkflowService'; export { gitService } from './src/services/git/GitService'; export { useConfirmStore } from './src/stores/confirmStore';`, resolveDir: root },
    bundle: true, platform: 'node', format: 'cjs', outfile: bundle, external: ['react', 'react-dom'], alias: { '@': path.join(root, 'src') }, logLevel: 'silent',
    plugins: [{ name: 'headless-modal', setup(build) { build.onLoad({ filter: /ModalSurface\.tsx$/ }, () => ({ contents: 'export function ModalSurface({ children }) { return children; }', loader: 'jsx' })); } }],
  });
  app = createRequire(import.meta.url)(bundle);
});
after(async () => {
  globalThis.fetch = originalFetch;
  app?.useGitHubStore.getState().clearRepo();
  if (tmp && path.dirname(tmp) === root && path.basename(tmp).startsWith('.test-tmp-ux-')) await fs.rm(tmp, { recursive: true, force: true, maxRetries: 5 });
});

test('workflow inputs preserve false and zero, enforce declared choices and ignore unknown keys', () => {
  const inputs = app.parseWorkflowInputs(yaml);
  assert.deepEqual(inputs.map(input => input.type), ['choice', 'boolean', 'number', 'environment', 'string']);
  assert.equal(inputs[0].description, 'Deployment region');
  assert.deepEqual(app.workflowInputValues(inputs, { unknown: 'secret' }), { region: 'ap-southeast-2', dryRun: 'false', count: '0' });
  assert.throws(() => app.workflowInputValues(inputs, { region: '' }), /dispatch.requiredInput/);
  assert.throws(() => app.workflowInputValues(inputs, { region: 'invalid' }), /dispatch.invalidInput/);
  assert.throws(() => app.workflowInputValues(inputs, { count: 'NaN' }), /dispatch.invalidInput/);
  assert.throws(() => app.workflowInputValues(inputs, { dryRun: 'yes' }), /dispatch.invalidInput/);
  assert.deepEqual(app.workflowInputValues(inputs, { notes: '  keep whitespace  ' }).notes, '  keep whitespace  ');
});

test('manual triggers support shorthand, null and quoted keys while invalid definitions fail closed', () => {
  for (const content of ['on: workflow_dispatch', 'on: [push, workflow_dispatch]', 'on:\n  workflow_dispatch:', '"on": {workflow_dispatch: {inputs: {}}}']) assert.deepEqual(app.parseWorkflowInputs(content), []);
  for (const content of ['on: push', 'on: {push: {}}']) assert.throws(() => app.parseWorkflowInputs(content), /dispatch.notManual/);
  for (const content of ['[]', 'on: {workflow_dispatch: string}', 'on: {workflow_dispatch: {inputs: []}}', 'on: {workflow_dispatch: {inputs: {a: {type: choice, options: []}}}}', 'on: {workflow_dispatch: {inputs: {a: {type: unknown}}}}']) assert.throws(() => app.parseWorkflowInputs(content), /dispatch.invalidDefinition/);
  assert.throws(() => app.parseWorkflowInputs('on: [broken'));
});

test('workflow YAML requests encode the selected branch and reject unavailable file content', async () => {
  let request;
  globalThis.fetch = async (url, init) => { request = { url, init }; return new Response(JSON.stringify({ encoding: 'base64', content: Buffer.from('on: workflow_dispatch # 中文').toString('base64') })); };
  const data = await app.githubService.getWorkflowYaml('owner', 'repo', workflow.path, 'topic/test #1');
  assert.equal(data.content, 'on: workflow_dispatch # 中文');
  assert.equal(new URL(request.url).searchParams.get('ref'), 'topic/test #1');
  assert.equal(request.init.cache, 'no-store');
  assert.ok(request.init.signal);
  globalThis.fetch = async () => new Response(JSON.stringify({ encoding: 'none', content: '' }));
  await assert.rejects(app.githubService.getWorkflowYaml('owner', 'repo', workflow.path), /无法读取工作流参数定义/);
  globalThis.fetch = originalFetch;
});

test('dispatch dialog loads real fields, submits declared names, and resets on reopening', async () => {
  const originalYaml = app.githubService.getWorkflowYaml, originalDispatch = app.githubService.dispatchWorkflow;
  let sent, renderer;
  app.githubService.getWorkflowYaml = async () => ({ content: yaml });
  app.githubService.dispatchWorkflow = async (...args) => { sent = args; };
  const originalRefresh = app.useGitHubStore.getState().refreshActions;
  app.useGitHubStore.setState({ refreshActions: async () => {} });
  try {
    renderer = await openDialog(); await flush();
    assert.equal(submitButton(renderer).props.disabled, false);
    const notes = renderer.root.findByProps({ id: 'workflow-input-notes' }).findByType('input');
    act(() => notes.props.onChange({ target: { value: 'hello' } }));
    await act(async () => { await renderer.root.findByType('form').props.onSubmit({ preventDefault() {} }); });
    assert.deepEqual(sent, ['owner', 'repo', 1, { ref: 'main', inputs: { region: 'ap-southeast-2', dryRun: 'false', count: '0', notes: 'hello' } }]);
    assert.equal(app.useGitHubStore.getState().isDispatchModalOpen, false);
    act(() => app.useGitHubStore.getState().openDispatchModal(workflow)); await flush();
    assert.equal(renderer.root.findByProps({ id: 'workflow-input-notes' }).findByType('input').props.value, '');
  } finally {
    if (renderer) act(() => renderer.unmount());
    app.githubService.getWorkflowYaml = originalYaml; app.githubService.dispatchWorkflow = originalDispatch;
    app.useGitHubStore.setState({ refreshActions: originalRefresh });
  }
});

test('switching branches aborts old loads and never enables submission with stale inputs', async () => {
  const original = app.githubService.getWorkflowYaml;
  const main = deferred(), topic = deferred();
  const requests = [];
  app.githubService.getWorkflowYaml = (...args) => { requests.push(args); return args[3] === 'main' ? main.promise : topic.promise; };
  let renderer;
  try {
    renderer = await openDialog();
    assert.equal(submitButton(renderer).props.disabled, true);
    act(() => renderer.root.findAllByType('select')[0].props.onChange({ target: { value: 'topic/test' } }));
    assert.equal(requests[0][4].aborted, true);
    await act(async () => main.resolve({ content: yaml }));
    assert.equal(submitButton(renderer).props.disabled, true);
    await act(async () => topic.resolve({ content: 'on: workflow_dispatch' }));
    assert.equal(submitButton(renderer).props.disabled, false);
    assert.equal(renderer.root.findAllByType('input').length, 0);
  } finally { if (renderer) act(() => renderer.unmount()); app.githubService.getWorkflowYaml = original; }
});

test('failed workflow loads can retry and dispatch failures remain visible without closing the dialog', async () => {
  const originalYaml = app.githubService.getWorkflowYaml, originalDispatch = app.githubService.dispatchWorkflow;
  let attempt = 0, renderer;
  app.githubService.getWorkflowYaml = async () => { if (++attempt === 1) throw new Error('offline'); return { content: 'on: workflow_dispatch' }; };
  app.githubService.dispatchWorkflow = async () => { throw new Error('permission denied'); };
  try {
    renderer = await openDialog(); await flush();
    assert.equal(submitButton(renderer).props.disabled, true);
    assert.match(JSON.stringify(renderer.toJSON()), /offline/);
    const retry = renderer.root.findAllByType('button').find(button => button.props.type === 'button' && button.props.onClick && !button.props.disabled);
    await act(async () => retry.props.onClick()); await flush();
    assert.equal(submitButton(renderer).props.disabled, false);
    await act(async () => renderer.root.findByType('form').props.onSubmit({ preventDefault() {} }));
    assert.equal(app.useGitHubStore.getState().isDispatchModalOpen, true);
    assert.match(JSON.stringify(renderer.toJSON()), /permission denied/);
  } finally { if (renderer) act(() => renderer.unmount()); app.githubService.getWorkflowYaml = originalYaml; app.githubService.dispatchWorkflow = originalDispatch; }
});

test('cancelling queued writes skips their callbacks while active and other repositories finish', async () => {
  const gate = deferred(); let skipped = false;
  const running = app.serializeGitWrite('ux/repo', () => gate.promise, 'fetch');
  await Promise.resolve();
  const second = app.serializeGitWrite('ux/repo', () => { skipped = true; }, 'commit');
  const rejected = assert.rejects(second, /cancelled by user/);
  const snapshot = app.getGitWriteActivity('ux/repo');
  assert.equal(snapshot.command, 'fetch'); assert.ok(snapshot.startedAt); assert.equal(snapshot.queued, 1);
  assert.equal(app.getGitWriteActivity('ux/repo'), snapshot);
  app.cancelQueuedGitWrites('ux/repo', 'cancelled by user');
  assert.equal(app.getPendingGitWrites('ux/repo'), 1);
  assert.equal(app.getGitWriteActivity('ux/repo').queued, 0);
  assert.equal(await app.serializeGitWrite('ux/other', async () => 42), 42);
  app.updateGitWriteCommand('ux/repo', 'pull');
  assert.equal(app.getGitWriteActivity('ux/repo').command, 'pull');
  gate.resolve('done');
  assert.equal(await running, 'done'); await rejected;
  assert.equal(skipped, false); assert.equal(app.getGitWriteActivity('ux/repo'), null);
  assert.equal(await app.serializeGitWrite('ux/repo', async () => 'next'), 'next');
});

test('failed writes release activity and the next queued operation still runs', async () => {
  const first = app.serializeGitWrite('ux/failing', async () => { throw new Error('failed'); });
  const rejected = assert.rejects(first, /failed/);
  const second = app.serializeGitWrite('ux/failing', async () => 'recovered');
  await rejected; assert.equal(await second, 'recovered');
  assert.equal(app.getPendingGitWrites('ux/failing'), 0); assert.equal(app.getGitWriteActivity('ux/failing'), null);
});

test('view errors show diagnostics and retry remounts only the failed subtree', () => {
  let fail = true, renderer;
  function View() { if (fail) throw new Error('render failure'); return React.createElement('p', null, 'recovered view'); }
  const originalError = console.error; console.error = () => {};
  try {
    act(() => { renderer = create(React.createElement('main', null, React.createElement('nav', null, 'navigation'), React.createElement(app.ErrorBoundary, null, React.createElement(View)))); });
    assert.equal(renderer.root.findByType('nav').children[0], 'navigation');
    assert.equal(renderer.root.findByProps({ role: 'alert' }).type, 'div');
    assert.match(renderer.root.findByType('pre').children[0], /render failure/);
    fail = false;
    act(() => renderer.root.findAllByType('button')[0].props.onClick());
    assert.match(JSON.stringify(renderer.toJSON()), /recovered view/);
    assert.equal(renderer.root.findAllByProps({ role: 'alert' }).length, 0);
  } finally { console.error = originalError; if (renderer) act(() => renderer.unmount()); }
});

async function withRecoveryDialog(check) {
  const point = { ref: 'refs/auugit/recovery/123-abc/manual/main', hash: 'a'.repeat(40), branch: 'main', operation: 'manual', timestamp: 123, name: '旧名称' };
  let points = [point], renderer;
  const calls = { create: [], rename: [], remove: [] };
  const savedSafety = { ...app.branchSafetyService };
  const getStatus = app.gitService.getStatus, reflog = app.historyWorkflowService.reflog;
  app.branchSafetyService.list = async () => points;
  app.branchSafetyService.create = async (repo, name) => { calls.create.push([repo, name]); };
  app.branchSafetyService.rename = async (repo, saved, name) => { calls.rename.push([repo, saved.ref, name]); points = points.map(item => item.ref === saved.ref ? { ...item, name: name.trim() || undefined } : item); };
  app.branchSafetyService.remove = async (repo, saved) => { calls.remove.push([repo, saved.ref]); points = points.filter(item => item.ref !== saved.ref); };
  app.gitService.getStatus = async () => ({ currentBranch: 'main' });
  app.historyWorkflowService.reflog = async () => [];
  try {
    await act(async () => { renderer = create(React.createElement(app.RecoveryCenterDialog, { repoPath: 'recovery-test', onClose() {} })); });
    await check(renderer, calls, point);
  } finally {
    app.useConfirmStore.getState().settle(false);
    if (renderer) act(() => renderer.unmount());
    Object.assign(app.branchSafetyService, savedSafety); app.gitService.getStatus = getStatus; app.historyWorkflowService.reflog = reflog;
  }
}

test('recovery UI accepts a name at creation and supports cancelling or saving a rename', async () => {
  await withRecoveryDialog(async (renderer, calls) => {
    act(() => renderer.root.findAllByType('input')[0].props.onChange({ target: { value: '重构之前' } }));
    await act(async () => { renderer.root.findByType('form').props.onSubmit({ preventDefault() {} }); });
    assert.deepEqual(calls.create, [['recovery-test', '重构之前']]);
    assert.equal(renderer.root.findAllByType('input')[0].props.value, '');
    const rename = () => renderer.root.findAllByType('button').find(button => button.children.includes('改名'));
    act(() => rename().props.onClick());
    act(() => renderer.root.findAllByType('input')[1].props.onChange({ target: { value: '取消的名称' } }));
    act(() => renderer.root.findAllByType('button').find(button => button.children.includes('取消')).props.onClick());
    assert.equal(calls.rename.length, 0); assert.match(JSON.stringify(renderer.toJSON()), /旧名称/);
    act(() => rename().props.onClick());
    act(() => renderer.root.findAllByType('input')[1].props.onChange({ target: { value: '合并之前' } }));
    await act(async () => { renderer.root.findAllByType('form')[1].props.onSubmit({ preventDefault() {} }); });
    assert.equal(calls.rename[0][2], '合并之前'); assert.match(JSON.stringify(renderer.toJSON()), /合并之前/);
  });
});

test('recovery deletion identifies the point, requires confirmation, and cancellation leaves it listed', async () => {
  await withRecoveryDialog(async (renderer, calls, point) => {
    const remove = () => renderer.root.findAllByType('button').find(button => button.children.includes('删除恢复点'));
    await act(async () => remove().props.onClick());
    assert.equal(calls.remove.length, 0);
    assert.match(app.useConfirmStore.getState().pending.description, /旧名称/);
    assert.match(app.useConfirmStore.getState().pending.detail, /main/);
    await act(async () => app.useConfirmStore.getState().settle(false));
    assert.equal(calls.remove.length, 0); assert.match(JSON.stringify(renderer.toJSON()), /旧名称/);
    await act(async () => remove().props.onClick());
    await act(async () => app.useConfirmStore.getState().settle(true));
    assert.deepEqual(calls.remove, [['recovery-test', point.ref]]);
    assert.doesNotMatch(JSON.stringify(renderer.toJSON()), /旧名称/);
  });
});
