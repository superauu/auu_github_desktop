import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import React from 'react';
import './react19-test-env.mjs';
import { create, act } from 'react-test-renderer';

const root = process.cwd(), originalFetch = globalThis.fetch, storage = new Map();
globalThis.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) };
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const issue = (number = 12, title = 'Issue draft') => ({ id: number, number, title, body: 'Original body', state: 'open', state_reason: null, user: { login: 'author' }, labels: [{ id: 1, name: 'bug', color: '123456' }], assignees: [{ login: 'alice' }], comments: 0, created_at: '2026-10-30T00:00:00Z', updated_at: '2026-10-30T00:00:00Z', closed_at: null });
const text = renderer => JSON.stringify(renderer.toJSON());
let app, tmp;
before(async () => {
  tmp = await fs.mkdtemp(path.join(root, '.test-tmp-issues-'));
  const bundle = path.join(tmp, 'issues.cjs');
  await build({ stdin: { contents: `export * from './src/features/issues/issueLogic'; export * from './src/features/issues/workflowLogic'; export * from './src/services/ai/issueContext'; export { refreshLinkedIssues } from './src/features/issues/refreshLinkedIssues'; export { GitHubService, githubService } from './src/services/github/GitHubService'; export { RelatedIssues } from './src/features/issues/RelatedIssues'; export { IssueEditor } from './src/features/issues/IssueEditor'; export { IssueDetail } from './src/features/issues/IssueDetail'; export { IssuePullRequestCard } from './src/features/issues/IssuePullRequestCard'; export { CurrentBranchIssue } from './src/features/issues/CurrentBranchIssue'; export { CommitComposer, useComposerDraft } from './src/components/layout/CommitComposer'; export { aiCommitService } from './src/services/ai/AiCommitService'; export { useRepoStore } from './src/stores/repoStore'; export { useGitHubStore } from './src/stores/githubStore'; export { useIssueWorkflowStore } from './src/stores/issueWorkflowStore';`, resolveDir: root }, bundle: true, platform: 'node', format: 'cjs', outfile: bundle, external: ['react', 'react-dom'], alias: { '@': path.join(root, 'src') }, logLevel: 'silent', plugins: [{ name: 'headless-modal', setup(builder) {
    builder.onLoad({ filter: /ModalSurface\.tsx$/ }, () => ({ contents: 'export function ModalSurface({children}) { return children; }', loader: 'jsx' }));
  } }] });
  app = createRequire(import.meta.url)(bundle);
  app.useIssueWorkflowStore.persist.setOptions({ storage: { getItem: () => null, setItem() {}, removeItem() {} } });
});
after(async () => {
  globalThis.fetch = originalFetch;
  if (tmp && path.dirname(tmp) === root && path.basename(tmp).startsWith('.test-tmp-issues-')) await fs.rm(tmp, { recursive: true, force: true, maxRetries: 5 });
});
const authenticate = (owner = 'owner', profile = 'one') => app.useGitHubStore.setState({ currentOwner: owner, currentRepoName: 'repo', activeProfileId: profile, isAuthenticated: true, token: `test-${profile}` });

test('issue search is repository-scoped, paginated, excludes PRs and preserves incomplete-result metadata', async () => {
  const service = new app.GitHubService(); service.setToken('test-only'); let called;
  globalThis.fetch = async (url, init) => { called = { url: new URL(url), init }; return json({ items: [issue(), { ...issue(13), pull_request: {} }], total_count: 1201, incomplete_results: true }); };
  const result = await service.searchIssues('owner', 'repo', { query: 'fix "quoted" repo:other/project', state: 'closed', label: 'good first issue', assignee: 'alice', page: 3 });
  assert.equal(called.url.pathname, '/search/issues'); assert.equal(called.url.searchParams.get('page'), '3'); assert.equal(called.url.searchParams.get('per_page'), '30');
  const query = called.url.searchParams.get('q');
  assert.match(query, /^repo:owner\/repo is:issue is:closed /); assert.match(query, /label:"good first issue"/); assert.match(query, /\\"quoted\\"/);
  assert.equal(called.init.headers.Authorization, 'Bearer test-only'); assert.equal(result.items.length, 1); assert.equal(result.incomplete_results, true); assert.equal(result.total_count, 1201);
});

test('issue mutations use explicit PATCH state reasons, preserve empty metadata arrays, and never retry a failed POST', async () => {
  const service = new app.GitHubService(), calls = [];
  globalThis.fetch = async (url, init) => { calls.push({ url, method: init.method, body: JSON.parse(init.body) }); return json(issue()); };
  await service.updateIssue('owner', 'repo', 12, { state: 'closed', state_reason: 'not_planned' });
  await service.updateIssue('owner', 'repo', 12, { state: 'open', state_reason: 'reopened', labels: [], assignees: [] });
  assert.equal(calls[0].method, 'PATCH'); assert.deepEqual(calls[1].body, { state: 'open', state_reason: 'reopened', labels: [], assignees: [] });
  let posts = 0; globalThis.fetch = async () => { posts++; return json({ message: 'Forbidden' }, 403); };
  await assert.rejects(service.createIssueComment('owner', 'repo', 12, 'keep my comment'), error => error.status === 403 && /Forbidden/.test(error.message));
  assert.equal(posts, 1);
});

test('issue detail refuses a PR masquerading as an issue', async () => {
  globalThis.fetch = async () => json({ ...issue(), pull_request: {} });
  await assert.rejects(new app.GitHubService().getIssue('owner', 'repo', 12), /Pull Request/);
});

test('description links support local, cross-repository and URL references but ignore code and deduplicate', () => {
  assert.deepEqual(app.issueReferences('Fixes #12; relates team/project#23; https://github.com/team/project/issues/23\n```\n#99\n```\n`#88` <!-- #77 -->', 'owner', 'repo'), [
    { owner: 'owner', repo: 'repo', number: 12 }, { owner: 'team', repo: 'project', number: 23 },
  ]);
  assert.equal(app.issueReferences('#0 #999999999999999999999999', 'owner', 'repo').length, 0);
});

test('closing directives preserve prose, deduplicate selections and never mistake fenced examples for actual links', () => {
  const reference = { owner: 'owner', repo: 'repo', number: 12 };
  const body = 'Example\n```\nCloses owner/repo#12\n```';
  assert.equal(app.withClosingIssues(body, [reference, reference]), `${body}\n\nCloses owner/repo#12`);
  assert.equal(app.withClosingIssues('Closes owner/repo#12', [reference]), 'Closes owner/repo#12');
  assert.equal(app.issueBranchName(12, '中文 / Fix login?!'), 'issue/12-fix-login');
  assert.equal(app.issueBranchName(12, '中文'), 'issue/12-task');
});

test('timeline PR references accept only GitHub PR links, deduplicate and retain cross-repository identity', () => {
  const pr = { number: 3, title: 'Fix', state: 'open', html_url: 'https://github.com/other/fork/pull/3', pull_request: {} };
  assert.deepEqual(app.referencedPullRequests([
    { event: 'cross-referenced', source: { issue: pr } }, { event: 'cross-referenced', source: { issue: pr } },
    { event: 'cross-referenced', source: { issue: { ...pr, html_url: 'https://evil.example/pull/3' } } },
    { event: 'cross-referenced', source: { issue: { ...pr, pull_request: undefined } } },
  ]), [pr]);
});

test('branch associations are isolated by local repository and survive a fork target reference', () => {
  const store = app.useIssueWorkflowStore; store.setState({ branchIssues: {} });
  const reference = { owner: 'upstream', repo: 'project', number: 12 };
  store.getState().linkBranch('/repo-a', 'issue/12-task', reference);
  assert.deepEqual(store.getState().issueForBranch('/repo-a', 'issue/12-task'), reference);
  assert.equal(store.getState().issueForBranch('/repo-b', 'issue/12-task'), undefined);
  assert.equal(store.getState().issueForBranch('/repo-a', 'other-branch'), undefined);
  store.setState({ branchIssues: { '["/repo-a","bad"]': { owner: 123, repo: 'repo', number: 12 } } });
  assert.equal(store.getState().issueForBranch('/repo-a', 'bad'), undefined);
});

test('related issue reads discard old account replies and retain the new account loading state', async () => {
  authenticate(); const old = deferred(), next = deferred(); let calls = 0, renderer;
  globalThis.fetch = () => (++calls === 1 ? old.promise : next.promise);
  try {
    await act(async () => { renderer = create(React.createElement(app.RelatedIssues, { body: 'Closes #12', owner: 'owner', repo: 'repo' })); });
    await act(async () => authenticate('owner', 'two'));
    await act(async () => old.resolve(json(issue(12, 'OLD ACCOUNT RESULT'))));
    assert.doesNotMatch(text(renderer), /OLD ACCOUNT RESULT/);
    assert.match(text(renderer), /加载/);
    await act(async () => next.resolve(json(issue(12, 'CURRENT ACCOUNT RESULT'))));
    assert.match(text(renderer), /CURRENT ACCOUNT RESULT/);
  } finally { if (renderer) await act(async () => renderer.unmount()); }
});

test('failed issue edits retain all draft fields and retry submits exactly the reviewed metadata', async () => {
  authenticate(); let renderer, saves = 0, result;
  globalThis.fetch = async (url, init) => {
    if (url.includes('/labels?')) return json(issue().labels);
    if (url.includes('/assignees?')) return json(issue().assignees);
    const data = JSON.parse(init.body); saves++;
    if (saves === 1) return json({ message: 'Write denied' }, 403);
    assert.equal(data.title, 'Edited title'); assert.equal(data.body, 'Edited body'); assert.deepEqual(data.labels, ['bug']); assert.deepEqual(data.assignees, ['alice']);
    return json({ ...issue(), title: data.title, body: data.body });
  };
  try {
    await act(async () => { renderer = create(React.createElement(app.IssueEditor, { issue: issue(), onClose() {}, onSaved(value) { result = value; } })); });
    await act(async () => { renderer.root.findByType('textarea').props.onChange({ target: { value: 'Edited body' } }); renderer.root.findAllByType('input').find(input => input.props.maxLength === 256).props.onChange({ target: { value: 'Edited title' } }); });
    await act(async () => renderer.root.findByType('form').props.onSubmit({ preventDefault() {} }));
    assert.match(text(renderer), /Write denied/); assert.equal(renderer.root.findByType('textarea').props.value, 'Edited body'); assert.equal(result, undefined);
    await act(async () => renderer.root.findByType('form').props.onSubmit({ preventDefault() {} }));
    assert.equal(saves, 2); assert.equal(result.title, 'Edited title');
  } finally { if (renderer) await act(async () => renderer.unmount()); }
});

test('issue state changes wait for server confirmation; failure preserves open state and comment draft', async () => {
  authenticate(); let renderer, updates = 0;
  globalThis.fetch = async (url, init) => {
    if (init?.method === 'PATCH') { updates++; return json({ message: 'State change denied' }, 403); }
    return json(url.includes('/comments?') || url.includes('/timeline?') ? [] : issue());
  };
  try {
    await act(async () => { renderer = create(React.createElement(app.IssueDetail, { number: 12, onChanged() {} })); });
    await act(async () => renderer.root.findByType('textarea').props.onChange({ target: { value: 'Unsent comment' } }));
    const close = renderer.root.findAllByType('button').find(button => button.children.includes('关闭为已完成'));
    await act(async () => { await close.props.onClick(); await new Promise(resolve => setTimeout(resolve, 0)); });
    assert.equal(updates, 1); assert.match(text(renderer), /State change denied/); assert.doesNotMatch(text(renderer), /重新打开/);
    assert.equal(renderer.root.findByType('textarea').props.value, 'Unsent comment');
  } finally { if (renderer) await act(async () => renderer.unmount()); }
});

test('an issue write completing after account switch cannot select or close a new-account view', async () => {
  authenticate(); const gate = deferred(); let renderer, saved = 0;
  globalThis.fetch = async (url, init) => init?.method === 'PATCH' ? gate.promise : json(url.includes('/labels?') ? issue().labels : issue().assignees);
  try {
    await act(async () => { renderer = create(React.createElement(app.IssueEditor, { issue: issue(), onClose() {}, onSaved() { saved++; } })); });
    let submitting;
    await act(async () => { submitting = renderer.root.findByType('form').props.onSubmit({ preventDefault() {} }); });
    await act(async () => authenticate('owner', 'two'));
    await act(async () => { gate.resolve(json(issue())); await submitting; });
    assert.equal(saved, 0);
  } finally { if (renderer) await act(async () => renderer.unmount()); }
});

test('opening a closed linked PR outside the loaded page invalidates pending list replies', async () => {
  authenticate(); const gate = deferred(), store = app.useGitHubStore;
  store.setState({ prFilterState: 'open', pullRequests: [], selectedPR: null });
  globalThis.fetch = () => gate.promise;
  const pending = store.getState().loadPullRequests();
  const linked = { id: 999, number: 999, state: 'closed', title: 'Older merged PR', merged_at: '2026-10-30T00:00:00Z' };
  store.getState().openPullRequest(linked);
  gate.resolve(json([{ id: 1, number: 1, state: 'open' }])); await pending;
  assert.equal(store.getState().selectedPR, linked); assert.equal(store.getState().prFilterState, 'closed');
  assert.deepEqual(store.getState().pullRequests, [linked]); assert.equal(store.getState().isLoadingPullRequests, false);
});

test('CI summary combines traditional statuses and checks without treating skipped, cancelled or partial reads as all passing', () => {
  const run = conclusion => ({ id: 1, status: 'completed', conclusion });
  assert.equal(app.summarizeCI([], []), 'none');
  assert.equal(app.summarizeCI([run('success')], [{ state: 'failure' }]), 'failed');
  assert.equal(app.summarizeCI([run('success')], [{ state: 'pending' }]), 'running');
  for (const conclusion of ['cancelled', 'timed_out', 'stale', 'startup_failure', 'action_required']) assert.equal(app.summarizeCI([run(conclusion)], []), 'failed');
  for (const conclusion of ['skipped', 'neutral']) assert.equal(app.summarizeCI([run(conclusion)], []), 'neutral');
  assert.equal(app.summarizeCI([run('success')], [], true), 'unknown');
  assert.equal(app.summarizeCI([run(null)], []), 'unknown');
  assert.equal(app.summarizeCI([run('success')], [{ state: 'success' }]), 'passing');
});

test('review summaries preserve decisive opinions across comments and clear dismissed approvals', () => {
  const review = (id, login, state) => ({ id, user: { login }, state });
  assert.deepEqual(app.summarizeReviews([review(1, 'Alice', 'APPROVED'), review(2, 'alice', 'COMMENTED'), review(3, 'bob', 'CHANGES_REQUESTED')]), { approved: 1, changesRequested: 1 });
  assert.deepEqual(app.summarizeReviews([review(3, 'alice', 'DISMISSED'), review(1, 'Alice', 'APPROVED'), review(2, 'bob', 'PENDING')]), { approved: 0, changesRequested: 0 });
});

test('CI endpoints pin both APIs to the exact PR head SHA and merging submits the expected SHA', async () => {
  const service = new app.GitHubService(), calls = [];
  globalThis.fetch = async (url, init) => { calls.push({ url, init }); return json({}); };
  await service.getWorkflowCheckRuns('owner', 'repo', 'abc123');
  await service.getWorkflowCommitStatuses('owner', 'repo', 'abc123');
  await service.mergePullRequest('owner', 'repo', 3, { expectedHeadSha: 'abc123' });
  assert.match(calls[0].url, /commits\/abc123\/check-runs\?filter=latest&per_page=100$/);
  assert.match(calls[1].url, /commits\/abc123\/status\?per_page=100$/);
  assert.equal(JSON.parse(calls[2].init.body).sha, 'abc123');
});

test('Issue templates keep task background bounded, preserve user prose and never claim unperformed validation', () => {
  const context = app.toIssueContext({ owner: 'owner', repo: 'repo', number: 12 }, { ...issue(), title: 'Fix\nlogin', body: 'x'.repeat(5000) });
  assert.equal(context.title, 'Fix login'); assert.equal(context.body.length, 2000);
  assert.match(app.issueCommitDraft(context, true), /^fix: Fix login\n\nRefs owner\/repo#12$/);
  const draft = app.issuePRDraft([context]);
  assert.equal(draft.title, 'Fix login'); assert.match(draft.body, /- \[ \]/); assert.doesNotMatch(draft.body, /x{100}|全部通过|Closes/);
  assert.equal(app.withIssueReferences('User prose', [context, context]), 'User prose\n\nRefs owner/repo#12');
  assert.equal(JSON.parse(app.issuePromptContext(Array(8).fill(context)).split('\n')[2]).length, 5);
});

test('merge reconciliation only invalidates referenced tasks, never marks them closed, and stops after scope changes', () => {
  const originalTimeout = globalThis.setTimeout, scheduled = [], store = app.useIssueWorkflowStore;
  let current = true;
  globalThis.setTimeout = (callback, delay) => { scheduled.push({ callback, delay }); return 0; };
  try {
    store.setState({ revisions: {} });
    app.refreshLinkedIssues({ body: 'Closes #12\nCloses other/project#5' }, 'owner', 'repo', () => current);
    assert.deepEqual(store.getState().revisions, { 'owner/repo#12': 1, 'other/project#5': 1 });
    assert.deepEqual(scheduled.map(item => item.delay), [1500, 5000]);
    scheduled[0].callback(); assert.equal(store.getState().revisions['owner/repo#12'], 2);
    current = false; scheduled[1].callback(); assert.equal(store.getState().revisions['owner/repo#12'], 2);
  } finally { globalThis.setTimeout = originalTimeout; }
});

test('PR cards discard older head-SHA checks and expose partial CI read failures', async () => {
  authenticate(); let renderer;
  const oldChecks = deferred(), currentChecks = deferred(); let head = 'old';
  globalThis.fetch = async url => {
    if (url.includes('/pulls/')) return url.includes('/reviews?') ? json([]) : json({ id: 1, number: 3, title: 'Linked PR', state: 'open', head: { sha: head, ref: 'topic' }, base: { ref: 'main' } });
    if (url.includes('/check-runs?')) return url.includes('/old/') ? oldChecks.promise : currentChecks.promise;
    return json({ message: 'Status permission denied' }, 403);
  };
  const props = refresh => ({ url: 'https://github.com/owner/repo/pull/3', refresh });
  try {
    await act(async () => { renderer = create(React.createElement(app.IssuePullRequestCard, props(0))); });
    head = 'new'; await act(async () => renderer.update(React.createElement(app.IssuePullRequestCard, props(1))));
    await act(async () => oldChecks.resolve(json({ total_count: 1, check_runs: [{ id: 1, name: 'OLD CHECK', status: 'completed', conclusion: 'failure' }] })));
    assert.doesNotMatch(text(renderer), /OLD CHECK/);
    await act(async () => currentChecks.resolve(json({ total_count: 1, check_runs: [{ id: 2, name: 'CURRENT CHECK', status: 'completed', conclusion: 'success' }] })));
    assert.match(text(renderer), /CURRENT CHECK/); assert.match(text(renderer), /Status permission denied/); assert.equal(renderer.root.findByProps({ 'data-ci-state': 'unknown' }).children.join(''), 'CI: 状态不完整');
  } finally { if (renderer) await act(async () => renderer.unmount()); }
});

test('refreshing an Issue keeps an active edit form and its unsent text intact', async () => {
  authenticate(); let renderer;
  const store = app.useIssueWorkflowStore; store.setState({ revisions: {} });
  globalThis.fetch = async url => json(url.includes('/labels?') ? issue().labels : url.includes('/assignees?') ? issue().assignees : url.includes('/comments?') || url.includes('/timeline?') ? [] : issue());
  try {
    await act(async () => { renderer = create(React.createElement(app.IssueDetail, { number: 12, onChanged() {} })); });
    await act(async () => renderer.root.findAllByType('button').find(button => button.children.includes('编辑 Issue')).props.onClick());
    const editor = () => renderer.root.findByType(app.IssueEditor);
    await act(async () => editor().findByType('textarea').props.onChange({ target: { value: 'Keep this unsent edit' } }));
    await act(async () => store.getState().refreshIssues([{ owner: 'owner', repo: 'repo', number: 12 }]));
    assert.equal(editor().findByType('textarea').props.value, 'Keep this unsent edit');
  } finally { if (renderer) await act(async () => renderer.unmount()); }
});

test('local commit templates are previewed before replacing a draft and unlinking never changes another branch', async () => {
  authenticate(); let renderer;
  const reference = { owner: 'owner', repo: 'repo', number: 12 }, store = app.useIssueWorkflowStore;
  store.setState({ branchIssues: {}, revisions: {} }); store.getState().linkBranch('/repo', 'topic', reference); store.getState().linkBranch('/repo', 'other', reference);
  app.useRepoStore.setState({ currentRepo: { path: '/repo', currentBranch: 'topic' }, branches: [{ name: 'topic', isCurrent: true, isRemote: false }], status: { currentBranch: 'topic', staged: [], unstaged: [], untracked: [] } });
  globalThis.fetch = async () => json(issue());
  function Host() { return React.createElement(app.CommitComposer, { onOpenAiSettings() {}, draftState: app.useComposerDraft('/repo', 'topic') }); }
  try {
    await act(async () => { renderer = create(React.createElement(Host)); });
    await act(async () => renderer.root.findByProps({ id: 'commit-title' }).props.onChange({ target: { value: 'Original draft' } }));
    await act(async () => renderer.root.findAllByType('button').find(button => button.children.includes('根据 Issue 拟提交说明')).props.onClick());
    assert.equal(renderer.root.findByProps({ id: 'commit-title' }).props.value, 'Original draft');
    assert.match(text(renderer), /Refs owner\/repo#12/);
    await act(async () => renderer.root.findAllByType('button').find(button => button.children.includes('替换草稿')).props.onClick());
    assert.equal(renderer.root.findByProps({ id: 'commit-title' }).props.value, 'fix: Issue draft');
    await act(async () => store.getState().unlinkBranch('/repo', 'topic'));
    assert.equal(store.getState().issueForBranch('/repo', 'topic'), undefined); assert.deepEqual(store.getState().issueForBranch('/repo', 'other'), reference);
  } finally { if (renderer) await act(async () => renderer.unmount()); }
});

test('switching branches invalidates in-flight generation and preserves the new branch draft', async () => {
  authenticate(); let renderer, pending;
  const gate = deferred(), originalGenerate = app.aiCommitService.generateCommitMessageResult;
  const store = app.useIssueWorkflowStore;
  store.setState({ branchIssues: {}, revisions: {} });
  store.getState().linkBranch('/race-repo', 'topic', { owner: 'owner', repo: 'repo', number: 12 });
  store.getState().linkBranch('/race-repo', 'other', { owner: 'owner', repo: 'repo', number: 13 });
  const status = branch => ({ currentBranch: branch, staged: [], unstaged: [{ path: 'task.ts', staged: false, status: 'modified' }], untracked: [] });
  app.useRepoStore.setState({ currentRepo: { path: '/race-repo', currentBranch: 'topic' }, branches: [{ name: 'topic', isCurrent: true, isRemote: false }], status: status('topic') });
  globalThis.fetch = async url => json(issue(url.endsWith('/13') ? 13 : 12));
  app.aiCommitService.generateCommitMessageResult = () => gate.promise;
  function Host() {
    const branch = app.useRepoStore(state => state.currentRepo.currentBranch);
    return React.createElement(app.CommitComposer, { onOpenAiSettings() {}, draftState: app.useComposerDraft('/race-repo', branch) });
  }
  try {
    await act(async () => { renderer = create(React.createElement(Host)); });
    await act(async () => { pending = renderer.root.findAllByType('button').find(button => button.children.includes('生成提交说明')).props.onClick(); });
    // Reproduce the interval after checkout but before refs and status refresh.
    await act(async () => app.useRepoStore.setState({ currentRepo: { path: '/race-repo', currentBranch: 'other' } }));
    await act(async () => renderer.root.findByProps({ id: 'commit-title' }).props.onChange({ target: { value: 'Other branch draft' } }));
    await act(async () => { gate.resolve({ message: 'OLD AI RESULT', source: 'builtin', fallback: false }); await pending; });
    assert.equal(renderer.root.findByProps({ id: 'commit-title' }).props.value, 'Other branch draft');
    assert.doesNotMatch(text(renderer), /OLD AI RESULT/);
  } finally { app.aiCommitService.generateCommitMessageResult = originalGenerate; if (renderer) await act(async () => renderer.unmount()); }
});
