import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import React from 'react';
import './react19-test-env.mjs';
import { create, act } from 'react-test-renderer';

const root = process.cwd(), saved = new Map();
globalThis.localStorage = { getItem: key => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value), removeItem: key => saved.delete(key) };
let app, tmp;
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const pr = (id, title) => ({ id, number: id, title, state: 'open', head: { ref: `topic-${id}`, sha: `sha-${id}` }, base: { ref: 'main' }, user: { login: 'reviewer' }, labels: [], body: '', html_url: `https://example.invalid/pr/${id}` });

before(async () => {
  tmp = await fs.mkdtemp(path.join(root, '.test-tmp-ui-review-'));
  const bundle = path.join(tmp, 'review.cjs');
  await build({ stdin: { contents: `export { ErrorNotice } from './src/components/ui/ErrorNotice'; export { useWindowChrome } from './src/hooks/useWindowChrome'; export { WindowControls } from './src/components/layout/WindowControls'; export { StatusBar } from './src/components/layout/StatusBar'; export { useToastStore } from './src/stores/toastStore'; export { RightPane } from './src/components/layout/RightPane'; export { LeftSidebar } from './src/components/layout/LeftSidebar'; export { useReviewStore } from './src/stores/reviewStore'; export { EmbeddedTerminalPanel } from './src/components/layout/EmbeddedTerminalPanel'; export * from './src/utils/workflowStatus'; export * from './src/utils/errorGuidance'; export * from './src/utils/keyboardNavigation'; export * from './src/hooks/useWorkspaceLayout'; export * from './src/stores/layoutStore'; export { PullRequestsView } from './src/features/pr/PullRequestsView'; export { useGitHubStore } from './src/stores/githubStore'; export { githubService } from './src/services/github/GitHubService'; export { useRepoStore } from './src/stores/repoStore';`, resolveDir: root }, bundle: true, platform: 'node', format: 'cjs', outfile: bundle, external: ['react', 'react-dom'], alias: { '@': path.join(root, 'src') }, logLevel: 'silent', plugins: [{ name: 'headless-surfaces', setup(build) {
    build.onResolve({ filter: /^@tauri-apps\/api\/window$/ }, () => ({ path: 'window', namespace: 'test-window' }));
    build.onLoad({ filter: /.*/, namespace: 'test-window' }, () => ({ contents: 'export const getCurrentWindow = () => globalThis.__nativeWindow;' }));
    build.onLoad({ filter: /ModalSurface\.tsx$/ }, () => ({ contents: 'export function ModalSurface({ children }) { return children; }', loader: 'jsx' }));
    build.onLoad({ filter: /scroll-area\.tsx$/ }, () => ({ contents: 'import React from "react"; export function ScrollArea({ children }) { return <div>{children}</div>; }', loader: 'jsx' }));
  } }] });
  app = createRequire(import.meta.url)(bundle);
});
after(async () => {
  app?.useGitHubStore.getState().clearRepo(); delete globalThis.window;
  if (tmp && path.dirname(tmp) === root && path.basename(tmp).startsWith('.test-tmp-ui-review-')) await fs.rm(tmp, { recursive: true, force: true, maxRetries: 5 });
});

test('PR requests keep the newest loading state and isolate failures from Actions', async () => {
  const store = app.useGitHubStore, original = app.githubService.getPullRequests;
  const first = deferred(), second = deferred(); let calls = 0;
  store.getState().clearRepo(); store.setState({ currentOwner: 'team', currentRepoName: 'repo', error: 'actions error' });
  app.githubService.getPullRequests = () => ++calls === 1 ? first.promise : second.promise;
  try {
    const a = store.getState().loadPullRequests();
    assert.equal(store.getState().isLoadingPullRequests, true);
    const b = store.getState().loadPullRequests();
    first.resolve([pr(1, 'Stale')]); await a;
    assert.equal(store.getState().isLoadingPullRequests, true);
    assert.deepEqual(store.getState().pullRequests, []);
    second.reject(Error('HTTP 503')); await b;
    assert.equal(store.getState().isLoadingPullRequests, false);
    assert.equal(store.getState().pullRequestsError, 'HTTP 503');
    assert.equal(store.getState().error, 'actions error');
    app.githubService.getPullRequests = async () => [pr(2, 'Fresh')];
    const c = store.getState().loadPullRequests();
    assert.equal(store.getState().pullRequestsError, null); await c;
    assert.equal(store.getState().selectedPR.id, 2);
  } finally { app.githubService.getPullRequests = original; store.getState().clearRepo(); }
});

test('changing PR status while loading rejects stale results and repository switches clear loading', async () => {
  const store = app.useGitHubStore, original = app.githubService.getPullRequests;
  const pending = [deferred(), deferred()]; let calls = 0;
  store.setState({ currentOwner: 'team', currentRepoName: 'repo', prFilterState: 'open' });
  app.githubService.getPullRequests = () => pending[calls++].promise;
  try {
    const first = store.getState().loadPullRequests(); store.getState().setPRFilterState('closed');
    pending[0].resolve([pr(1, 'Open')]); await first;
    assert.equal(store.getState().isLoadingPullRequests, true);
    assert.equal(store.getState().selectedPR, null);
    store.getState().clearRepo(); pending[1].resolve([pr(2, 'Old repo')]);
    await new Promise(setImmediate);
    assert.equal(store.getState().isLoadingPullRequests, false);
    assert.deepEqual(store.getState().pullRequests, []);
  } finally { app.githubService.getPullRequests = original; store.getState().clearRepo(); }
});

test('PR search selects details from visible results and removes stale management actions on no match', async () => {
  const store = app.useGitHubStore, first = pr(1, 'First change'), second = pr(2, 'Second change');
  const originalReviews = app.githubService.getPullRequestReviews, originalChecks = app.githubService.getCommitChecks;
  app.githubService.getPullRequestReviews = async () => []; app.githubService.getCommitChecks = async () => [];
  store.setState({ currentOwner: 'team', currentRepoName: 'repo', pullRequests: [first, second], selectedPR: first, prFilterState: 'open' });
  let renderer;
  try {
    await act(async () => { renderer = create(React.createElement(app.PullRequestsView)); });
    const search = renderer.root.findAllByType('input').find(input => input.props.placeholder);
    await act(async () => search.props.onChange({ target: { value: 'Second' } }));
    assert.doesNotMatch(JSON.stringify(renderer.toJSON()), /First change/);
    assert.match(JSON.stringify(renderer.toJSON()), /Second change/);
    await act(async () => search.props.onChange({ target: { value: 'No matching PR' } }));
    assert.doesNotMatch(JSON.stringify(renderer.toJSON()), /Second change/);
    assert.equal(renderer.root.findAllByType('select').length, 0, 'merge controls must disappear with stale details');
    assert.equal(store.getState().selectedPR.id, 1, 'search must not mutate stored selection');
  } finally { await act(async () => renderer?.unmount()); app.githubService.getPullRequestReviews = originalReviews; app.githubService.getCommitChecks = originalChecks; store.getState().clearRepo(); }
});

test('PR loading does not render an empty result and refresh cannot be submitted repeatedly', async () => {
  const store = app.useGitHubStore; store.setState({ currentOwner: 'team', currentRepoName: 'repo', pullRequests: [], selectedPR: null, isLoadingPullRequests: true });
  let renderer;
  try {
    await act(async () => { renderer = create(React.createElement(app.PullRequestsView)); });
    assert.match(JSON.stringify(renderer.toJSON()), /正在加载拉取请求/);
    assert.doesNotMatch(JSON.stringify(renderer.toJSON()), /当前没有拉取请求|未找到符合条件/);
    assert.equal(renderer.root.findAllByType('button').find(b => b.props['aria-busy']).props.disabled, true);
  } finally { await act(async () => renderer?.unmount()); store.getState().clearRepo(); }
});

test('queued, waiting, cancelled, skipped, neutral and unknown workflow results are never failures', () => {
  for (const [status, conclusion] of [['queued', null], ['waiting', null], ['pending', null], ['completed', 'cancelled'], ['completed', 'skipped'], ['completed', 'neutral'], ['completed', null]]) {
    const result = app.workflowStatus(status, conclusion);
    assert.notEqual(result.variant, 'destructive'); assert.notEqual(result.key, 'actions.failed');
  }
  assert.equal(app.workflowStatus('completed', 'failure').variant, 'destructive');
  assert.equal(app.workflowStatus('completed', 'timed_out').key, 'ui.actions.timedOut');
  assert.equal(app.workflowStatus('completed', 'success').variant, 'success');
});

test('row activation ignores nested controls, moves within its list and supports keyboard context menus', () => {
  let activated = 0, focused = 0, dispatched;
  const next = { getClientRects: () => [1], focus: () => focused++ };
  const row = { click: () => activated++, getClientRects: () => [1], closest: () => ({ querySelectorAll: () => [row, next] }), getBoundingClientRect: () => ({ left: 10, top: 20, height: 30 }), dispatchEvent: event => { dispatched = event; } };
  const event = key => ({ key, target: row, currentTarget: row, preventDefault() {} });
  app.handleRowKeyDown(event('Enter')); app.handleRowKeyDown({ ...event(' '), target: {} });
  assert.equal(activated, 1);
  app.handleRowKeyDown(event('ArrowDown')); assert.equal(focused, 1);
  const original = globalThis.MouseEvent; globalThis.MouseEvent = class { constructor(type, options) { this.type = type; Object.assign(this, options); } };
  try { app.handleRowKeyDown({ ...event('F10'), shiftKey: true }); assert.equal(dispatched.type, 'contextmenu'); assert.equal(dispatched.clientY, 35); }
  finally { if (original) globalThis.MouseEvent = original; else delete globalThis.MouseEvent; }
});

test('laptop layout keeps the inspector inline and honors explicit drawer and inline choices', async () => {
  globalThis.window = { innerWidth: 1280, addEventListener() {}, removeEventListener() {} };
  app.useLayoutStore.getState().resetLayout(); app.useRepoStore.setState({ currentRepo: { path: '/repo' }, activeTab: 'changes', isLeftSidebarCollapsed: false, isRightPaneCollapsed: false });
  let result, renderer;
  function Probe() { result = app.useWorkspaceLayout(); return null; }
  try {
    await act(async () => { renderer = create(React.createElement(Probe)); });
    assert.equal(result.inspectorOverlay, false);
    assert.ok(result.panels.right >= 220);
    assert.ok(result.panels.left >= 200); assert.ok(result.panels.files >= 220);
    assert.ok(1280 - result.panels.left - result.panels.right - result.panels.files - 18 >= 500);
    await act(async () => app.useLayoutStore.getState().setInspectorPresentation('drawer'));
    assert.equal(result.inspectorOverlay, true);
    window.innerWidth = 900;
    await act(async () => app.useLayoutStore.getState().setInspectorPresentation('inline'));
    assert.equal(result.inspectorOverlay, false);
    assert.ok(900 - result.panels.left - result.panels.right - result.panels.files - 18 >= 320);
  } finally { await act(async () => renderer?.unmount()); app.useLayoutStore.getState().resetLayout(); app.useRepoStore.setState({ currentRepo: null }); delete globalThis.window; }
});

test('sidebar can repeatedly collapse and expand while the review badge updates without changing hook order', async () => {
  const repo = app.useRepoStore, previous = repo.getState();
  globalThis.window = { innerWidth: 1412, addEventListener() {}, removeEventListener() {} };
  repo.setState({ currentRepo: null, status: null, branches: [], tags: [], stashes: [], isLeftSidebarCollapsed: false });
  let renderer;
  try {
    await act(async () => { renderer = create(React.createElement(app.LeftSidebar)); });
    for (let i = 0; i < 3; i++) {
      await act(async () => repo.getState().toggleLeftSidebar());
      assert.equal(renderer.toJSON(), null);
      await act(async () => app.useReviewStore.setState({ badgeCount: i + 1 }));
      await act(async () => repo.getState().toggleLeftSidebar());
      assert.notEqual(renderer.toJSON(), null);
      assert.match(JSON.stringify(renderer.toJSON()), /提交历史/);
      assert.doesNotMatch(JSON.stringify(renderer.toJSON()), /提交历史 · 阶段复核/);
    }
    await act(async () => repo.getState().toggleLeftSidebar());
    await act(async () => renderer.update(React.createElement(app.LeftSidebar, { inDrawer: true })));
    assert.notEqual(renderer.toJSON(), null, 'drawer navigation remains available when inline navigation is collapsed');
  } finally { await act(async () => renderer?.unmount()); repo.setState(previous, true); delete globalThis.window; }
});

test('Git diagnostics identify recoverable causes without recommending destructive operations', () => {
  for (const [message, kind] of [['spawn git ENOENT', 'git'], ['spawn C:\\Missing\\git.exe ENOENT', 'git'], ['not a git repository', 'directory'], ['Authentication failed', 'auth'], ['rejected non-fast-forward', 'rejected'], ['fatal: Unable to create index.lock', 'lock'], ['CONFLICT (content)', 'conflict'], ['Could not resolve host', 'network']]) assert.equal(app.errorGuidance(message), kind);
  assert.equal(app.errorGuidance('unrecognized response'), 'generic');
});

test('workflow loading finishes before jobs and an older job response cannot end a newer loading state', async () => {
  const store = app.useGitHubStore, originalRuns = app.githubService.getWorkflowRuns, originalJobs = app.githubService.getRunJobs;
  const oldJobs = deferred(), newJobs = deferred(); let calls = 0;
  store.getState().clearRepo(); store.setState({ currentOwner: 'team', currentRepoName: 'repo' });
  app.githubService.getWorkflowRuns = async () => [{ id: 1 }];
  app.githubService.getRunJobs = () => ++calls === 1 ? oldJobs.promise : newJobs.promise;
  try {
    const first = store.getState().selectWorkflow({ id: 1 });
    await new Promise(setImmediate);
    assert.equal(store.getState().isLoadingRuns, false); assert.equal(store.getState().isLoadingJobs, true);
    const second = store.getState().selectRun({ id: 2 });
    oldJobs.resolve([{ id: 'old' }]); await first;
    assert.equal(store.getState().isLoadingJobs, true); assert.deepEqual(store.getState().selectedRunJobs, []);
    newJobs.resolve([{ id: 'new' }]); await second;
    assert.equal(store.getState().isLoadingJobs, false); assert.equal(store.getState().selectedRunJobs[0].id, 'new');
  } finally { app.githubService.getWorkflowRuns = originalRuns; app.githubService.getRunJobs = originalJobs; store.getState().clearRepo(); }
});


test('Git error feedback keeps diagnostics available and opens the relevant settings panel', async () => {
  let event, renderer;
  globalThis.window = { dispatchEvent: value => { event = value; } };
  try {
    await act(async () => { renderer = create(React.createElement(app.ErrorNotice, { error: 'spawn git ENOENT' })); });
    assert.match(JSON.stringify(renderer.toJSON()), /找不到 Git 执行程序/);
    assert.match(JSON.stringify(renderer.toJSON()), /spawn git ENOENT/);
    assert.notEqual(renderer.root.findByType('details').props.open, true);
    renderer.root.findByType('button').props.onClick();
    assert.equal(event.type, 'auugit:open-settings'); assert.equal(event.detail, 'git');
  } finally { await act(async () => renderer?.unmount()); delete globalThis.window; }
});

test('dismissing an inspector error preserves the commit draft and commit actions', async () => {
  const store = app.useRepoStore, previous = store.getState();
  globalThis.window = { innerWidth: 1412, addEventListener() {}, removeEventListener() {} };
  store.setState({ currentRepo: { path: '/inspector-error-test', currentBranch: 'main' }, activeTab: 'changes', isRightPaneCollapsed: false, errorMessage: 'fatal: could not read remote' });
  let renderer;
  try {
    await act(async () => { renderer = create(React.createElement(app.RightPane, { overlay: false, open: true, onClose() {}, onOpenAiSettings() {} })); });
    await act(async () => renderer.root.findByProps({ id: 'commit-title' }).props.onChange({ target: { value: 'Keep this draft' } }));
    assert.equal(renderer.root.findAllByProps({ role: 'alert' }).length, 1);
    assert.match(JSON.stringify(renderer.toJSON()), /提交变更/);
    assert.match(JSON.stringify(renderer.toJSON()), /提交并推送/);
    await act(async () => renderer.root.findByProps({ 'aria-label': '关闭错误提示' }).props.onClick());
    assert.equal(store.getState().errorMessage, null);
    assert.equal(renderer.root.findAllByProps({ role: 'alert' }).length, 0);
    assert.equal(renderer.root.findByProps({ id: 'commit-title' }).props.value, 'Keep this draft');
  } finally { await act(async () => renderer?.unmount()); store.setState(previous, true); delete globalThis.window; }
});

test('external terminal is unavailable in web preview and available in the desktop app', async () => {
  const store = app.useRepoStore, previous = store.getState();
  const originalFrame = globalThis.requestAnimationFrame, originalCancel = globalThis.cancelAnimationFrame;
  globalThis.requestAnimationFrame = () => 1; globalThis.cancelAnimationFrame = () => {};
  globalThis.window = {};
  let renderer, opened = 0;
  store.setState({ currentRepo: { path: '/terminal-test' }, openTerminal: () => { opened++; } });
  try {
    await act(async () => { renderer = create(React.createElement(app.EmbeddedTerminalPanel, { open: true, onClose() {} })); });
    const external = () => renderer.root.findByProps({ 'aria-label': '在独立外部系统终端中打开' });
    assert.equal(external().props.disabled, true);
    await act(async () => { window.__TAURI_INTERNALS__ = {}; renderer.update(React.createElement(app.EmbeddedTerminalPanel, { open: true, onClose() {} })); });
    assert.equal(external().props.disabled, false);
    await act(async () => external().props.onClick());
    assert.equal(opened, 1);
  } finally {
    await act(async () => renderer?.unmount()); store.setState(previous, true); delete globalThis.window;
    if (originalFrame) globalThis.requestAnimationFrame = originalFrame; else delete globalThis.requestAnimationFrame;
    if (originalCancel) globalThis.cancelAnimationFrame = originalCancel; else delete globalThis.cancelAnimationFrame;
  }
});

test('browser window controls stay inert and the status bar keeps its history action', async () => {
  globalThis.window = {};
  let chrome, renderer, historyOpened = 0;
  function Probe() { chrome = app.useWindowChrome(); return React.createElement(app.WindowControls, { chrome }); }
  try {
    await act(async () => { renderer = create(React.createElement(Probe)); });
    assert.equal(renderer.root.findAllByType('button').length, 3);
    assert.ok(renderer.root.findAllByType('button').every(button => button.props.disabled));
    assert.equal(chrome.desktop, false);
    await act(async () => chrome.perform('close'));
    await act(async () => renderer.unmount());
    await act(async () => { renderer = create(React.createElement(app.StatusBar, { onOpenHistory: () => { historyOpened++; } })); });
    assert.equal(renderer.root.findByType('footer').props['aria-label'], '窗口状态栏');
    await act(async () => renderer.root.findAllByType('button').find(button => button.props.title === '最近操作').props.onClick());
    assert.equal(historyOpened, 1);
  } finally { await act(async () => renderer?.unmount()); delete globalThis.window; }
});

test('native window controls handle commands, resizing, focus, duplicate clicks and errors', async () => {
  globalThis.window = { __TAURI_INTERNALS__: {} };
  let chrome, renderer, resized, focusChanged, maximized = false, minimized = 0, closed = 0, toggled = 0, disposed = 0;
  const toggleDone = deferred();
  globalThis.__nativeWindow = {
    isMaximized: async () => maximized, isFocused: async () => true,
    onResized: async callback => { resized = callback; return () => { disposed++; }; },
    onFocusChanged: async callback => { focusChanged = callback; return () => { disposed++; }; },
    minimize: async () => { minimized++; }, close: async () => { closed++; },
    toggleMaximize: async () => { toggled++; await toggleDone.promise; maximized = !maximized; },
  };
  function Probe() { chrome = app.useWindowChrome(); return React.createElement(app.WindowControls, { chrome }); }
  try {
    await act(async () => { renderer = create(React.createElement(Probe)); });
    await act(async () => { await chrome.perform('minimize'); await chrome.perform('close'); });
    assert.equal(minimized, 1); assert.equal(closed, 1);
    let pending;
    await act(async () => { pending = chrome.perform('toggleMaximize'); });
    assert.ok(renderer.root.findAllByType('button').every(button => button.props.disabled));
    await act(async () => chrome.perform('toggleMaximize'));
    assert.equal(toggled, 1);
    await act(async () => { toggleDone.resolve(); await pending; });
    assert.equal(chrome.maximized, true);
    assert.ok(renderer.root.findByProps({ 'aria-label': '还原窗口' }));
    await act(async () => { maximized = false; resized(); focusChanged({ payload: false }); });
    assert.equal(chrome.maximized, false); assert.equal(chrome.focused, false);
    globalThis.__nativeWindow.minimize = async () => { throw Error('native command rejected'); };
    await act(async () => chrome.perform('minimize'));
    assert.equal(chrome.pending, false);
    assert.match(JSON.stringify(app.useToastStore.getState().toasts), /native command rejected/);
  } finally { await act(async () => renderer?.unmount()); assert.equal(disposed, 2); delete globalThis.window; delete globalThis.__nativeWindow; }
});

test('titlebar drag ignores interactive controls and right clicks, and supports double-click maximize', async () => {
  globalThis.window = { __TAURI_INTERNALS__: {} };
  let chrome, renderer, dragged = 0, toggled = 0;
  globalThis.__nativeWindow = {
    isMaximized: async () => false, isFocused: async () => true,
    onResized: async () => () => {}, onFocusChanged: async () => () => {},
    startDragging: async () => { dragged++; }, toggleMaximize: async () => { toggled++; },
  };
  function Probe() { chrome = app.useWindowChrome(); return null; }
  const event = (button, detail, interactive = false) => ({ button, detail, target: { closest: () => interactive ? {} : null } });
  try {
    await act(async () => { renderer = create(React.createElement(Probe)); });
    await act(async () => { chrome.drag(event(2, 1)); chrome.drag(event(0, 1, true)); chrome.drag(event(0, 2, true)); });
    assert.equal(dragged, 0); assert.equal(toggled, 0);
    await act(async () => chrome.drag(event(0, 1)));
    assert.equal(dragged, 1);
    await act(async () => chrome.drag(event(0, 2)));
    assert.equal(toggled, 1);
  } finally { await act(async () => renderer?.unmount()); delete globalThis.window; delete globalThis.__nativeWindow; }
});
