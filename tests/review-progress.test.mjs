/**
 * 审查进度持久化 store 测试:版本/目标隔离、分支清空、范围裁剪与
 * migrate 的防御性归一(丢非法条目、过滤非法字段)。localStorage 以内存替身提供。
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { build } from 'esbuild';

const root = process.cwd();
let app, tmp;

before(async () => {
  globalThis.localStorage = {
    store: {},
    getItem(key) { return this.store[key] ?? null; },
    setItem(key, value) { this.store[key] = String(value); },
    removeItem(key) { delete this.store[key]; },
  };
  tmp = await fs.mkdtemp(path.join(root, '.test-tmp-review-progress-'));
  const bundle = path.join(tmp, 'review-progress.cjs');
  await build({
    stdin: {
      contents: `export { useReviewProgressStore, progressKey, getRangeProgress } from './src/stores/reviewProgressStore';`,
      resolveDir: root,
    },
    bundle: true, platform: 'node', format: 'cjs', outfile: bundle,
    logLevel: 'silent',
  });
  app = createRequire(import.meta.url)(bundle);
});

after(async () => {
  delete globalThis.localStorage;
  if (tmp && path.dirname(tmp) === root && path.basename(tmp).startsWith('.test-tmp-review-progress-')) await fs.rm(tmp, { recursive: true, force: true, maxRetries: 5 });
});

const A = { approval: { approvedFiles: ['a.ts'], approvedHunks: { 'a.ts': [1, 5] } }, comments: [{ id: 'a.ts:1:5', path: 'a.ts', startLine: 1, endLine: 5, text: '意见' }] };

test('progress is keyed by repo+branch, defaults to empty and clears', () => {
  const store = app.useReviewProgressStore;
  const key = (repo, branch) => app.progressKey(repo, branch);
  assert.deepEqual(key('C:/r', 'main'), JSON.stringify(['C:/r', 'main']));

  store.getState().setProgress('C:/r', 'main', A);
  assert.deepEqual(store.getState().getProgress('C:/r', 'main'), A);
  assert.deepEqual(store.getState().getProgress('C:/r', 'dev'), { approval: { approvedFiles: [], approvedHunks: {} }, comments: [] }, 'missing keys default to empty');

  store.getState().clearProgress('C:/r', 'main');
  assert.deepEqual(store.getState().getProgress('C:/r', 'main').comments, []);
});

test('persist round-trips entries through localStorage', () => {
  const store = app.useReviewProgressStore;
  store.getState().setProgress('C:/r2', 'dev', A);
  const raw = JSON.parse(globalThis.localStorage.getItem('auu-git-review-progress'));
  assert.ok(raw.state.entries[app.progressKey('C:/r2', 'dev')], 'entries are persisted');
  assert.equal(raw.version, 1);
});

test('migrate drops invalid entries and normalizes fields', async () => {
  const persisted = {
    version: 1,
    state: {
      entries: {
        [app.progressKey('ok', 'main')]: A,
        [app.progressKey('bad-shape', 'main')]: { approval: null, comments: [] },
        [app.progressKey('bad-comments', 'main')]: { approval: { approvedFiles: 'x', approvedHunks: {} }, comments: 'nope' },
        [app.progressKey('partial', 'main')]: { approval: { approvedFiles: ['a', 3, 'b'], approvedHunks: { 'a.ts': [1, 'x', 2] } }, comments: [{ id: 'i', path: 'p', startLine: 1, endLine: 2, text: 't' }, null] },
      },
    },
  };
  const store = app.useReviewProgressStore;
  const migrated = await store.persist.getOptions().migrate(persisted.state, 0);
  assert.deepEqual(migrated.entries[app.progressKey('ok', 'main')], A);
  assert.equal(migrated.entries[app.progressKey('bad-shape', 'main')], undefined);
  assert.equal(migrated.entries[app.progressKey('bad-comments', 'main')], undefined);
  assert.deepEqual(migrated.entries[app.progressKey('partial', 'main')].approval, {
    approvedFiles: ['a', 'b'], approvedHunks: { 'a.ts': [1, 2] },
  });
  assert.equal(migrated.entries[app.progressKey('partial', 'main')].comments.length, 1);
});

test('legacy progress is never used for a scoped diff and branch clearing removes all scopes only in that branch', () => {
  const store = app.useReviewProgressStore;
  store.setState({ entries: {} });
  const scope = { baseHash: 'base', headHash: 'head', target: 'net' };
  store.getState().setProgress('r', 'main', A);
  assert.deepEqual(store.getState().getProgress('r', 'main', scope).approval.approvedFiles, []);
  store.getState().setProgress('r', 'main', A, scope);
  store.getState().setProgress('r', 'main', A, { ...scope, target: 'commit' });
  store.getState().setProgress('r', 'dev', A, scope);
  store.getState().setProgress('r2', 'main', A, scope);
  assert.equal(app.getRangeProgress(store.getState().entries, 'r', 'main', 'base', 'head').length, 2);
  store.getState().clearProgress('r', 'main');
  assert.deepEqual(store.getState().snapshotProgress('r', 'main'), {});
  assert.deepEqual(store.getState().getProgress('r', 'dev', scope), A);
  assert.deepEqual(store.getState().getProgress('r2', 'main', scope), A);
});

test('range pruning keeps all targets of an active range together and refreshes recently edited ranges', () => {
  const store = app.useReviewProgressStore;
  store.setState({ entries: {} });
  const scope = { baseHash: 'base', headHash: 'head', target: 'net' };
  for (let i = 0; i < 60; i++) store.getState().setProgress('active', 'main', A, { ...scope, target: `commit-${i}` });
  assert.equal(app.getRangeProgress(store.getState().entries, 'active', 'main', 'base', 'head').length, 60);
  for (let i = 0; i < 49; i++) store.getState().setProgress('other', 'main', A, { ...scope, headHash: `head-${i}` });
  store.getState().setProgress('active', 'main', A, scope);
  store.getState().setProgress('newest', 'main', A, scope);
  assert.equal(app.getRangeProgress(store.getState().entries, 'active', 'main', 'base', 'head').length, 61);
  assert.equal(app.getRangeProgress(store.getState().entries, 'other', 'main', 'base', 'head-0').length, 0);
});
