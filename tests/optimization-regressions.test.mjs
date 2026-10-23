import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import React from 'react';
import { create, act } from 'react-test-renderer';

const root = process.cwd();
const saved = new Map();
globalThis.localStorage = { getItem: key => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value), removeItem: key => saved.delete(key) };
let app, tmp;
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const patch = text => `diff --git a/file b/file\n--- a/file\n+++ b/file\n@@ -1 +1 @@\n-old\n+${text}\n`;
const turn = () => new Promise(setImmediate);

before(async () => {
  tmp = await fs.mkdtemp(path.join(root, '.test-tmp-optimization-'));
  const bundle = path.join(tmp, 'optimization.cjs');
  await build({ stdin: { contents: `export { RepositoryPermissions } from './src/components/settings/RepositoryPermissions'; export * from './src/services/git/DiffCache'; export * from './src/services/git/ExternalChangePoller'; export * from './src/services/git/GitQueue'; export * from './src/services/updater/UpdateService'; export { useToastStore } from './src/stores/toastStore'; export { useConfirmStore } from './src/stores/confirmStore'; export { useRepoStore } from './src/stores/repoStore'; export { UpdateDialog } from './src/components/layout/UpdateDialog'; export { OperationHistoryDialog } from './src/components/layout/OperationHistoryDialog'; export { executeGit } from './src/services/git/GitExecutor';`, resolveDir: root }, bundle: true, platform: 'node', format: 'cjs', outfile: bundle,
    external: ['react', 'react-dom'], alias: { '@': path.join(root, 'src') }, logLevel: 'silent', plugins: [
      { name: 'test-updater', setup(build) {
        build.onResolve({ filter: /^@tauri-apps\/plugin-updater$/ }, () => ({ path: 'updater', namespace: 'test-updater' }));
        build.onLoad({ filter: /.*/, namespace: 'test-updater' }, () => ({ contents: 'export const check = options => globalThis.__updaterCheck(options);' }));
        build.onLoad({ filter: /ModalSurface\.tsx$/ }, () => ({ contents: 'export function ModalSurface({ children }) { return children; }', loader: 'jsx' }));
      } },
    ],
  });
  app = createRequire(import.meta.url)(bundle);
});
after(async () => {
  delete globalThis.window; delete globalThis.__updaterCheck;
  app?.useConfirmStore.getState().settle(false);
  if (tmp && path.dirname(tmp) === root && path.basename(tmp).startsWith('.test-tmp-optimization-')) await fs.rm(tmp, { recursive: true, force: true, maxRetries: 5 });
});

test('diff parsing cache reuses identical results but detects same-length edits and separates staging modes', () => {
  const cache = new app.DiffCache();
  const first = cache.parse('worktree', patch('one'));
  assert.equal(cache.parse('worktree', patch('one')), first);
  const second = cache.parse('worktree', patch('two'));
  assert.notEqual(second, first); assert.ok(second.some(line => line.content === '+two'));
  assert.notEqual(cache.parse('index', patch('two')), second);
  assert.equal(cache.parse('worktree', patch('two')), second);
});

test('diff parsing cache evicts old keys and skips oversized entries', () => {
  const cache = new app.DiffCache(10000, 2), raw = patch('one');
  const first = cache.parse('a', raw); cache.parse('b', raw); cache.parse('c', raw);
  assert.notEqual(cache.parse('a', raw), first);
  const tiny = new app.DiffCache(10, 2);
  assert.notEqual(tiny.parse('a', raw), tiny.parse('a', raw));
});

function fakeClock() {
  let now = 0, id = 0;
  const timers = new Map();
  return { now: () => now, setNow(value) { now = value; }, timers,
    schedule(callback, delay) { const key = ++id; timers.set(key, { callback, delay }); return key; },
    cancel(key) { timers.delete(key); },
    async fire() { const [key, timer] = timers.entries().next().value; timers.delete(key); timer.callback(); await turn(); },
    delay() { return [...timers.values()][0]?.delay; },
  };
}

test('repository polling backs off while idle, debounces focus bursts, and resumes after activity', async () => {
  const clock = fakeClock(); let checks = 0;
  const poller = app.createExternalChangePoller({ check: async () => { checks++; }, canCheck: () => true, now: clock.now, schedule: clock.schedule, cancel: clock.cancel });
  assert.equal(clock.delay(), 10000);
  clock.setNow(2 * 60000); await clock.fire(); assert.equal(clock.delay(), 30000);
  clock.setNow(5 * 60000); await clock.fire(); assert.equal(clock.delay(), 60000);
  poller.touch(); assert.equal(clock.delay(), 10000);
  poller.wake(); poller.wake(); poller.wake(); assert.equal(clock.timers.size, 1); assert.equal(clock.delay(), 200);
  await clock.fire(); assert.equal(checks, 3); assert.equal(clock.delay(), 10000);
  poller.stop(); assert.equal(clock.timers.size, 0);
});

test('repository polling skips hidden/busy windows and never overlaps checks, even during focus changes', async () => {
  const clock = fakeClock(), gate = deferred(); let canCheck = false, checks = 0;
  const poller = app.createExternalChangePoller({ check: async () => { checks++; await gate.promise; }, canCheck: () => canCheck, now: clock.now, schedule: clock.schedule, cancel: clock.cancel });
  await clock.fire(); assert.equal(checks, 0);
  canCheck = true; await clock.fire(); assert.equal(checks, 1); assert.equal(clock.timers.size, 0);
  poller.wake(); poller.wake(); assert.equal(clock.timers.size, 0);
  gate.resolve(); await turn(); assert.equal(clock.delay(), 200);
  poller.stop(); assert.equal(clock.timers.size, 0);
});

test('notifications remain in session history after dismissal, bounded to 100 entries without disk persistence', () => {
  const store = app.useToastStore;
  store.setState({ toasts: [], history: [] });
  const id = store.getState().addToast({ type: 'error', title: 'fetch failed', description: 'offline', duration: 0 });
  store.getState().removeToast(id);
  assert.equal(store.getState().toasts.length, 0); assert.equal(store.getState().history[0].description, 'offline');
  for (let i = 0; i < 110; i++) store.getState().record({ type: 'success', title: `operation ${i}` });
  assert.equal(store.getState().history.length, 100); assert.equal(store.getState().history[0].title, 'operation 109');
  assert.ok(![...saved.values()].some(value => value.includes('operation 109')));
  store.getState().clearHistory(); assert.equal(store.getState().history.length, 0);
});

test('completed notification actions are consumed in both toast and operation history', () => {
  const store = app.useToastStore;
  const id = store.getState().addToast({ type: 'success', title: 'undo available', duration: 0, action: { label: 'Undo', onClick: () => {} } });
  store.getState().consumeAction(id);
  assert.equal(store.getState().toasts.find(entry => entry.id === id).action, undefined);
  assert.equal(store.getState().history.find(entry => entry.id === id).action, undefined);
});

test('operation history filters failures, preserves retry errors, and opens recovery for the recorded repository', async () => {
  let recovered, renderer;
  app.useToastStore.setState({ history: [] });
  app.useToastStore.getState().record({ type: 'success', title: 'success example' });
  app.useToastStore.getState().record({ type: 'error', title: 'failure example', repoPath: 'original-repo', description: 'offline', action: { label: 'Retry fetch', onClick: async () => { throw new Error('still offline'); } } });
  act(() => { renderer = create(React.createElement(app.OperationHistoryDialog, { onClose() {}, onRecovery: path => { recovered = path; } })); });
  try {
    act(() => renderer.root.findByType('select').props.onChange({ target: { value: 'errors' } }));
    assert.doesNotMatch(JSON.stringify(renderer.toJSON()), /success example/);
    const retry = renderer.root.findAllByType('button').find(button => button.children.includes('Retry fetch'));
    await act(async () => retry.props.onClick()); assert.match(JSON.stringify(renderer.toJSON()), /still offline/);
    const recovery = renderer.root.findAllByType('button').find(button => button.children.includes('此仓库的恢复中心'));
    act(() => recovery.props.onClick()); assert.equal(recovered, 'original-repo');
  } finally { act(() => renderer.unmount()); }
});

test('Git failures record the repository and retry fetch using its original path without logging raw arguments', async () => {
  let calls = 0; const paths = [];
  globalThis.window = { __TAURI_INTERNALS__: { invoke: async (_command, args) => {
    paths.push(args.cwd); return ++calls === 1 ? { exitCode: 1, stdout: '', stderr: 'offline' } : { exitCode: 0, stdout: '', stderr: '' };
  } } };
  app.useToastStore.setState({ history: [] });
  await assert.rejects(app.executeGit(['fetch', 'origin'], 'original-repo'), /offline/);
  const failed = app.useToastStore.getState().history[0];
  assert.equal(failed.repoPath, 'original-repo'); assert.equal(failed.type, 'error'); assert.ok(failed.action);
  await failed.action.onClick(); assert.deepEqual(paths, ['original-repo', 'original-repo']);
  assert.equal(app.useToastStore.getState().history[0].type, 'success');
  delete globalThis.window;
});

test('update checks and downloads are deduplicated, show byte progress, and never install automatically', async () => {
  const checkGate = deferred(), downloadGate = deferred(); let checks = 0, downloads = 0, installs = 0, progress;
  globalThis.window = { __TAURI_INTERNALS__: { invoke: async () => {} } };
  const update = { version: '9.9.9', body: '# Release notes', download: async callback => { downloads++; progress = callback; await downloadGate.promise; }, install: async () => { installs++; } };
  globalThis.__updaterCheck = async options => { assert.equal(options.timeout, 20000); checks++; return checkGate.promise; };
  const a = app.checkForUpdates(), b = app.checkForUpdates();
  await turn(); assert.equal(checks, 1); checkGate.resolve(update); await Promise.all([a, b]);
  assert.equal(app.useUpdateStore.getState().phase, 'available'); assert.equal(downloads, 0); assert.equal(installs, 0);
  app.openUpdateDialog(); app.deferUpdate(); assert.equal(app.useUpdateStore.getState().visible, false); assert.equal(app.useUpdateStore.getState().version, '9.9.9');
  const first = app.downloadUpdate(), second = app.downloadUpdate();
  assert.equal(downloads, 1);
  progress({ event: 'Started', data: { contentLength: 1000 } }); progress({ event: 'Progress', data: { chunkLength: 250 } });
  assert.equal(app.useUpdateStore.getState().total, 1000); assert.equal(app.useUpdateStore.getState().downloaded, 250);
  progress({ event: 'Finished' }); assert.equal(app.useUpdateStore.getState().phase, 'downloading');
  downloadGate.resolve(); await Promise.all([first, second]);
  assert.equal(app.useUpdateStore.getState().phase, 'ready'); assert.equal(installs, 0);
  globalThis.__testUpdate = update;
});

test('update install waits for Git tasks in every repository and rechecks after confirmation', async () => {
  const gate = deferred();
  const task = app.serializeGitWrite('other-repo', () => gate.promise, 'push'); await Promise.resolve();
  await app.installUpdate(); assert.equal(app.useConfirmStore.getState().pending, null); assert.equal(app.useUpdateStore.getState().phase, 'ready');
  gate.resolve(); await task;
  const install = app.installUpdate(); await turn(); assert.ok(app.useConfirmStore.getState().pending);
  const late = deferred(), lateTask = app.serializeGitWrite('late-repo', () => late.promise, 'push'); await Promise.resolve();
  app.useConfirmStore.getState().settle(true); await install;
  assert.equal(app.useUpdateStore.getState().phase, 'ready');
  late.resolve(); await lateTask;
});

test('update install supports declining, surfaces install errors, retries downloads, and restarts only on explicit acceptance', async () => {
  const update = globalThis.__testUpdate;
  const decline = app.installUpdate(); await turn(); app.useConfirmStore.getState().settle(false); await decline;
  assert.equal(app.useUpdateStore.getState().phase, 'ready');
  update.install = async () => { throw new Error('installer failed'); };
  const fail = app.installUpdate(); await turn(); app.useConfirmStore.getState().settle(true); await fail;
  assert.equal(app.useUpdateStore.getState().phase, 'error'); assert.equal(app.useUpdateStore.getState().error, 'installer failed');
  update.download = async callback => { callback({ event: 'Started', data: {} }); callback({ event: 'Progress', data: { chunkLength: 500 } }); };
  await app.downloadUpdate(); assert.equal(app.useUpdateStore.getState().phase, 'ready'); assert.equal(app.useUpdateStore.getState().total, null);
  let installed = 0, restarted = 0;
  update.install = async options => { assert.equal(options.restartAfterInstall, true); installed++; };
  globalThis.window.__TAURI_INTERNALS__.invoke = async command => { assert.equal(command, 'restart_application'); restarted++; };
  const install = app.installUpdate(); await turn(); app.useConfirmStore.getState().settle(true); await install;
  assert.equal(installed, 1); assert.equal(restarted, 1); assert.equal(app.useUpdateStore.getState().phase, 'installed');
  delete globalThis.__testUpdate;
});

test('update dialog renders indeterminate progress without an invented percentage and preserves deferred state', () => {
  let renderer;
  app.useUpdateStore.setState({ visible: true, phase: 'downloading', downloaded: 512000, total: null });
  act(() => { renderer = create(React.createElement(app.UpdateDialog)); });
  try {
    assert.equal(renderer.root.findByType('progress').props.value, undefined);
    act(() => app.useUpdateStore.setState({ total: 1024000 }));
    assert.equal(renderer.root.findByType('progress').props.value, 50);
    act(() => renderer.root.findAllByType('button').find(button => button.children.includes('稍后处理')).props.onClick());
    assert.equal(renderer.toJSON(), null); assert.equal(app.useUpdateStore.getState().phase, 'downloading');
  } finally { act(() => renderer.unmount()); delete globalThis.window; }
});

test('revoking repository access closes all aliases together and keeps other repositories open', async () => {
  const before = app.useRepoStore.getState(), calls = [], primary = { path: 'E:/repos/one', name: 'one' }, alias = { path: 'E:/links/one', name: 'alias' }, other = { path: 'E:/repos/two', name: 'two' };
  let renderer;
  globalThis.window = { __TAURI_INTERNALS__: { invoke: async (command, args) => {
    calls.push({ command, args });
    if (command === 'list_repository_permissions') return [primary.path, other.path];
    if (command === 'revoke_repository_permission') return [primary.path, alias.path];
    throw new Error('Unexpected native command');
  } } };
  app.useRepoStore.setState({ currentRepo: alias, openTabs: [primary, alias, other], refreshAll: async () => {} });
  try {
    await act(async () => { renderer = create(React.createElement(app.RepositoryPermissions)); await turn(); });
    const button = renderer.root.findAllByType('button').find(item => item.props['aria-label']?.endsWith(primary.path));
    assert.ok(button);
    await act(async () => { button.props.onClick(); await turn(); });
    assert.deepEqual(app.useRepoStore.getState().openTabs.map(repo => repo.path), [other.path]);
    assert.equal(app.useRepoStore.getState().currentRepo.path, other.path);
    assert.deepEqual(JSON.parse(saved.get('auu_git_open_tabs')).map(repo => repo.path), [other.path]);
    assert.deepEqual(calls.find(call => call.command === 'revoke_repository_permission').args, { path: primary.path, openPaths: [primary.path, alias.path, other.path] });
    assert.equal(renderer.root.findAllByType('button').length, 1);
  } finally {
    if (renderer) act(() => renderer.unmount());
    app.useRepoStore.setState(before, true); delete globalThis.window;
  }
});
