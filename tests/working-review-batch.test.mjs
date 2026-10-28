import { before, after, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { build } from 'esbuild';

const root = process.cwd(), repo = '/batch-review', saved = new Map();
globalThis.localStorage = { getItem: key => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value), removeItem: key => saved.delete(key) };
const file = (path, staged = false, status = 'modified') => ({ path, staged, status });
const snapshot = file => ({ fingerprint: `${file.path}:${file.staged}`, hunks: [{ id: `${file.path}:${file.staged}:hunk`, header: '@@ -1 +1 @@' }], lines: [], metadata: [] });
const scope = () => ({ currentBranch: 'main', headOid: 'a'.repeat(40), staged: [file('a.ts', true)], unstaged: [file('a.ts'), file('b.ts')], untracked: [] });
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
let app, tmp, status;
const key = file => app.workingReviewKey(repo, 'main', file.path);

before(async () => {
  tmp = await fs.mkdtemp(path.join(root, '.test-tmp-review-batch-'));
  const outfile = path.join(tmp, 'batch.cjs');
  const stubs = {
    '@/services/git/WorkingReviewService': 'export const captureWorkingReviews=(...args)=>globalThis.batchCapture(...args);',
    '@/services/git/GitService': 'export const gitService={getStatus:(...args)=>globalThis.batchStatus(...args)};',
    '@/stores/repoStore': "import {create} from 'zustand'; export const useRepoStore=create(()=>({currentRepo:null,status:null}));",
  };
  await build({ stdin: { contents: `export * from './src/features/review/approveAllWorkingReviews'; export * from './src/stores/workingReviewStore'; export {useRepoStore} from '@/stores/repoStore';`, resolveDir: root }, bundle: true, platform: 'node', format: 'cjs', outfile, alias: { '@': path.join(root, 'src') }, logLevel: 'silent', plugins: [{ name: 'batch-review', setup(b) {
    b.onResolve({ filter: /^@\// }, args => stubs[args.path] ? { path: args.path, namespace: 'fixture' } : undefined);
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: stubs[args.path], resolveDir: root }));
  } }] });
  app = createRequire(import.meta.url)(outfile);
});
beforeEach(() => {
  status = scope(); app.useRepoStore.setState({ currentRepo: { path: repo }, status });
  app.useWorkingReviewStore.setState({ records: {} });
  globalThis.batchCapture = async (_repo, files) => files.map(file => ({ file, snapshot: snapshot(file) }));
  globalThis.batchStatus = async () => structuredClone(status);
});
after(async () => {
  delete globalThis.batchCapture; delete globalThis.batchStatus;
  if (tmp && path.dirname(tmp) === root && path.basename(tmp).startsWith('.test-tmp-review-batch-')) await fs.rm(tmp, { recursive: true, force: true, maxRetries: 5 });
});

test('approve all updates subscribers once and preserves separate staged and unstaged approvals after reload', async () => {
  let changes = 0; const store = app.useWorkingReviewStore, stop = store.subscribe(() => { changes++; });
  try {
    const result = await app.approveAllWorkingReviews(repo, status);
    assert.equal(result.approved, 3); assert.equal(result.cancelled, false); assert.equal(changes, 1);
    for (const item of [...status.staged, ...status.unstaged]) assert.equal(app.workingReviewStatus(store.getState().records[key(item)], snapshot(item)).approved, true);
  } finally { stop(); }
  await app.useWorkingReviewStore.persist.rehydrate();
  assert.equal(app.useWorkingReviewStore.getState().records[key(file('a.ts'))].approvedFiles.length, 2);
  const again = await app.approveAllWorkingReviews(repo, status);
  assert.equal(again.approved, 0); assert.equal(again.alreadyApproved, 3);
});

test('unresolved notes, conflict files and failed reads stay pending while eligible versions pass', async () => {
  status.unstaged.push(file('conflict.ts', false, 'conflicted'), file('unreadable.ts'));
  app.useWorkingReviewStore.getState().addIssue(key(file('b.ts')), snapshot(file('b.ts')), 'Fix this first');
  globalThis.batchCapture = async (_repo, files) => {
    assert.ok(files.every(file => file.status !== 'conflicted'));
    return files.map(file => ({ file, snapshot: file.path === 'unreadable.ts' ? null : snapshot(file) }));
  };
  const result = await app.approveAllWorkingReviews(repo, status);
  assert.equal(result.approved, 2); assert.equal(result.unresolved, 1); assert.equal(result.conflicts, 1); assert.equal(result.failed, 1);
  assert.equal(app.useWorkingReviewStore.getState().records[key(file('b.ts'))].issues[0].resolved, false);
  assert.equal(app.useWorkingReviewStore.getState().records[key(file('conflict.ts'))], undefined);
  assert.equal(app.useWorkingReviewStore.getState().records[key(file('unreadable.ts'))], undefined);
});

test('a note added while reading is checked before the batch is applied', async () => {
  const gate = deferred(); globalThis.batchCapture = () => gate.promise;
  const operation = app.approveAllWorkingReviews(repo, status);
  app.useWorkingReviewStore.getState().addIssue(key(file('b.ts')), snapshot(file('b.ts')), 'Newly found issue');
  gate.resolve([...status.staged, ...status.unstaged].map(file => ({ file, snapshot: snapshot(file) })));
  const result = await operation; assert.equal(result.approved, 2); assert.equal(result.unresolved, 1);
});

test('repository, branch, HEAD and file-scope changes during capture cancel all approvals', async () => {
  for (const change of [
    () => app.useRepoStore.setState({ currentRepo: { path: '/other' } }),
    () => app.useRepoStore.setState({ status: { ...status, currentBranch: 'other' } }),
    () => app.useRepoStore.setState({ status: { ...status, headOid: 'b'.repeat(40) } }),
    () => app.useRepoStore.setState({ status: { ...status, untracked: [file('new.ts', false, 'untracked')] } }),
  ]) {
    app.useRepoStore.setState({ currentRepo: { path: repo }, status });
    const gate = deferred(); globalThis.batchCapture = () => gate.promise;
    const operation = app.approveAllWorkingReviews(repo, status); change(); gate.resolve([]);
    assert.equal((await operation).cancelled, true); assert.deepEqual(app.useWorkingReviewStore.getState().records, {});
  }
});

test('external Git changes and failed scope reads never apply partial approvals', async () => {
  globalThis.batchStatus = async () => ({ ...status, untracked: [file('external.ts', false, 'untracked')] });
  assert.equal((await app.approveAllWorkingReviews(repo, status)).cancelled, true);
  assert.deepEqual(app.useWorkingReviewStore.getState().records, {});
  globalThis.batchStatus = async () => { throw Error('Cannot read repository'); };
  await assert.rejects(app.approveAllWorkingReviews(repo, status), /Cannot read repository/);
  assert.deepEqual(app.useWorkingReviewStore.getState().records, {});
});

test('filtered review captures only requested current versions and returns a precise retry scope', async () => {
  const targets = [status.unstaged[0], status.unstaged[1], file('outside.ts')];
  globalThis.batchCapture = async (_repo, files) => {
    assert.deepEqual(files, targets.slice(0, 2));
    return files.map(item => ({ file: item, snapshot: item.path === 'b.ts' ? null : snapshot(item) }));
  };
  const result = await app.approveAllWorkingReviews(repo, status, { files: targets });
  assert.equal(result.approved, 1); assert.deepEqual(result.failedFiles, [status.unstaged[1]]);
  assert.equal(app.workingReviewStatus(app.useWorkingReviewStore.getState().records[key(file('a.ts'))], snapshot(file('a.ts', true))).approved, false);
  globalThis.batchCapture = async (_repo, files) => files.map(item => ({ file: item, snapshot: snapshot(item) }));
  assert.equal((await app.approveAllWorkingReviews(repo, status, { files: result.failedFiles })).approved, 1);
  assert.equal(app.workingReviewStatus(app.useWorkingReviewStore.getState().records[key(file('a.ts'))], snapshot(file('a.ts', true))).approved, false);
});

test('cancellation before capture, during capture and during final verification never saves partial approvals', async () => {
  for (const phase of ['before', 'capture', 'verify']) {
    const controller = new AbortController(); let captures = 0;
    if (phase === 'before') controller.abort();
    globalThis.batchCapture = async (_repo, files, _whole, _head, options) => {
      captures++; assert.equal(options.signal, controller.signal);
      options.onProgress?.({ completed: 1, total: files.length });
      if (phase === 'capture') controller.abort();
      return files.map(item => ({ file: item, snapshot: snapshot(item) }));
    };
    globalThis.batchStatus = async () => { if (phase === 'verify') controller.abort(); return structuredClone(status); };
    const progress = [];
    const result = await app.approveAllWorkingReviews(repo, status, { signal: controller.signal, onProgress: value => progress.push(value) });
    assert.equal(result.cancelled, true); assert.deepEqual(app.useWorkingReviewStore.getState().records, {});
    assert.equal(captures, phase === 'before' ? 0 : 1); assert.equal(progress.length, captures);
  }
});
