import { before, after, beforeEach, test } from 'node:test';
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
const REPO = '/review-list', file = (path = 'a.ts', staged = false) => ({ path, staged, status: 'modified' });
const snapshot = (fingerprint = 'old', ids = ['first', 'second']) => ({ fingerprint, hunks: ids.map(id => ({ id, header: `@@ ${id} @@` })), lines: [], metadata: [] });
const status = () => ({ currentBranch: 'main', headOid: 'a'.repeat(40), staged: [], unstaged: [], untracked: [] });
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
let tmp, app, latest, calls;
const key = (path = 'a.ts', repo = REPO, branch = 'main') => app.workingReviewKey(repo, branch, path);
const approve = (path = 'a.ts', snap = snapshot(), repo = REPO, branch = 'main') => app.useWorkingReviewStore.getState().approveFile(key(path, repo, branch), snap, true);
function Probe(props) {
  latest = app.useWorkingReviewFileList(props.repo ?? REPO, props.status, props.files, props.revision ?? 0, props.selected);
  return React.createElement('div', null, props.files.map(item => React.createElement(app.WorkingReviewFileStatus, { key: app.workingFileVersionKey(item), state: latest.stateFor(item) })));
}
before(async () => {
  tmp = await fs.mkdtemp(path.join(root, '.test-tmp-review-list-')); const outfile = path.join(tmp, 'list.cjs');
  await build({ stdin: { contents: `export {useWorkingReview} from './src/features/review/useWorkingReview'; export {WorkingReviewPanel,WorkingReviewHunkActions} from './src/features/review/WorkingReviewPanel'; export {sameDiffLines} from './src/utils/diffRows'; export * from './src/features/review/useWorkingReviewFileList'; export * from './src/stores/workingReviewStore'; export * from './src/features/review/WorkingReviewFileStatus';`, resolveDir: root }, bundle: true, platform: 'node', format: 'cjs', outfile, external: ['react', 'react-dom'], alias: { '@': path.join(root, 'src') }, logLevel: 'silent', plugins: [{ name: 'review-list-service', setup(b) {
    b.onResolve({ filter: /^@\/services\/git\/WorkingReviewService$/ }, () => ({ path: 'capture', namespace: 'fixture' }));
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export const captureWorkingReview=(...args)=>globalThis.__captureWorkingList(...args);' }));
  } }] });
  app = createRequire(import.meta.url)(outfile);
});
beforeEach(() => {
  calls = []; app.useWorkingReviewStore.setState({ records: {} });
  globalThis.__captureWorkingList = async (repo, item) => { calls.push([repo, item.path, item.staged]); return snapshot(); };
});
after(async () => { delete globalThis.__captureWorkingList; if (tmp && path.dirname(tmp) === root && path.basename(tmp).startsWith('.test-tmp-review-list-')) await fs.rm(tmp, { recursive: true, force: true, maxRetries: 5 }); });

test('never-reviewed files are immediately pending without loading every diff', async () => {
  let renderer; const files = [file(), file('b.ts')];
  try {
    await act(async () => { renderer = create(React.createElement(Probe, { status: status(), files })); });
    assert.equal(latest.pending, 2); assert.equal(latest.approved, 0); assert.equal(latest.checking, 0); assert.deepEqual(calls, []);
    assert.equal(latest.stateFor(files[0]).kind, 'pending');
  } finally { await act(async () => renderer?.unmount()); }
});

test('approving or reopening the selected file updates its list status immediately', async () => {
  let renderer; const item = file(), snap = snapshot(), props = { status: status(), files: [item], selected: { file: item, snapshot: snap } };
  try {
    await act(async () => { renderer = create(React.createElement(Probe, props)); });
    await act(async () => approve()); assert.equal(latest.stateFor(item).kind, 'approved'); assert.equal(latest.approved, 1); assert.deepEqual(calls, []);
    assert.ok(renderer.root.findAllByProps({ 'aria-label': '已审核' }).length);
    await act(async () => app.useWorkingReviewStore.getState().approveFile(key(), snap, false));
    assert.equal(latest.stateFor(item).kind, 'pending'); assert.equal(latest.pending, 1);
  } finally { await act(async () => renderer?.unmount()); }
});

test('saved reviews appear for unselected files and staged and unstaged rows are verified independently', async () => {
  approve(); const staged = file('a.ts', true), unstaged = file(), untouched = file('new.ts'); let renderer;
  globalThis.__captureWorkingList = async (repo, item) => { calls.push(item.staged); return item.staged ? snapshot() : snapshot('new', ['changed']); };
  try {
    await act(async () => { renderer = create(React.createElement(Probe, { status: status(), files: [staged, unstaged, untouched] })); });
    assert.equal(latest.stateFor(staged).kind, 'approved'); assert.equal(latest.stateFor(unstaged).kind, 'pending');
    assert.equal(latest.approved, 1); assert.equal(latest.pending, 2); assert.deepEqual(calls.sort(), [false, true]);
  } finally { await act(async () => renderer?.unmount()); }
});

test('partially reviewed hunks and unresolved notes have distinct visible list states', async () => {
  app.useWorkingReviewStore.getState().approveHunk(key(), 'first', true); let renderer; const item = file();
  try {
    await act(async () => { renderer = create(React.createElement(Probe, { status: status(), files: [item] })); });
    assert.equal(latest.stateFor(item).kind, 'partial'); assert.equal(latest.stateFor(item).approvedHunks, 1);
    assert.ok(renderer.root.findAllByProps({ 'aria-label': '已审核 1/2 个代码块' }).length);
    await act(async () => app.useWorkingReviewStore.getState().addIssue(key(), snapshot(), 'Fix this hunk', 'second'));
    assert.equal(latest.stateFor(item).kind, 'issues'); assert.equal(latest.stateFor(item).unresolved, 1);
    const issue = app.useWorkingReviewStore.getState().records[key()].issues[0];
    await act(async () => app.useWorkingReviewStore.getState().updateIssue(key(), issue.id, true)); assert.equal(latest.stateFor(item).kind, 'partial');
    await act(async () => app.useWorkingReviewStore.getState().approveHunk(key(), 'second', true)); assert.equal(latest.stateFor(item).kind, 'approved');
  } finally { await act(async () => renderer?.unmount()); }
});

test('a successful filesystem refresh rechecks green rows even if status codes and file lists are unchanged', async () => {
  approve(); let renderer; const item = file(), props = { status: status(), files: [item], revision: 0 }, gate = deferred();
  try {
    await act(async () => { renderer = create(React.createElement(Probe, props)); }); assert.equal(latest.stateFor(item).kind, 'approved');
    globalThis.__captureWorkingList = () => gate.promise;
    await act(async () => renderer.update(React.createElement(Probe, { ...props, revision: 1 })));
    assert.equal(latest.stateFor(item).kind, 'approved'); assert.equal(latest.approved, 1, 'background verification keeps the last confirmed display');
    await act(async () => gate.resolve(snapshot('changed', ['new content']))); assert.equal(latest.stateFor(item).kind, 'pending');
  } finally { await act(async () => renderer?.unmount()); }
});

test('unchanged periodic reads keep the badge, icon and progress counts stable throughout verification', async () => {
  approve(); let renderer; const item = file(), props = { status: status(), files: [item], revision: 0 };
  try {
    await act(async () => { renderer = create(React.createElement(Probe, props)); });
    const before = JSON.stringify(renderer.toJSON());
    for (let revision = 1; revision <= 3; revision++) {
      const gate = deferred(); globalThis.__captureWorkingList = () => gate.promise;
      await act(async () => renderer.update(React.createElement(Probe, { ...props, status: { ...props.status }, revision })));
      assert.equal(JSON.stringify(renderer.toJSON()), before); assert.equal(latest.approved, 1); assert.equal(latest.checking, 0);
      await act(async () => gate.resolve(snapshot())); assert.equal(JSON.stringify(renderer.toJSON()), before);
    }
  } finally { await act(async () => renderer?.unmount()); }
});

test('failed periodic verification replaces the retained approval with the failure state', async () => {
  approve(); let renderer; const item = file(), props = { status: status(), files: [item], revision: 0 }, gate = deferred();
  try {
    await act(async () => { renderer = create(React.createElement(Probe, props)); });
    globalThis.__captureWorkingList = () => gate.promise;
    await act(async () => renderer.update(React.createElement(Probe, { ...props, revision: 1 }))); assert.equal(latest.stateFor(item).kind, 'approved');
    await act(async () => gate.reject(Error('cannot verify'))); assert.equal(latest.stateFor(item).kind, 'pending'); assert.equal(latest.stateFor(item).failed, true);
  } finally { await act(async () => renderer?.unmount()); }
});

test('late reads from a previous repository cannot approve the current repository', async () => {
  approve(); approve('a.ts', snapshot('repo-b', ['other']), '/other'); const first = deferred(), second = deferred(); let renderer; const item = file(), state = status();
  globalThis.__captureWorkingList = repo => repo === REPO ? first.promise : second.promise;
  try {
    await act(async () => { renderer = create(React.createElement(Probe, { status: state, files: [item] })); });
    await act(async () => renderer.update(React.createElement(Probe, { repo: '/other', status: state, files: [item] })));
    await act(async () => first.resolve(snapshot())); assert.equal(latest.stateFor(item).kind, 'checking');
    await act(async () => second.resolve(snapshot('repo-b', ['other']))); assert.equal(latest.stateFor(item).kind, 'approved');
    await act(async () => renderer.update(React.createElement(Probe, { repo: '/other', status: { ...state, currentBranch: 'different' }, files: [item] })));
    assert.equal(latest.stateFor(item).kind, 'pending', 'another branch cannot inherit saved approvals');
  } finally { await act(async () => renderer?.unmount()); }
});

test('a newer selected diff wins over an older background read and stays correct after navigating away', async () => {
  approve(); const gate = deferred(); let renderer; const item = file(), props = { status: status(), files: [item] };
  globalThis.__captureWorkingList = () => gate.promise;
  try {
    await act(async () => { renderer = create(React.createElement(Probe, props)); });
    await act(async () => renderer.update(React.createElement(Probe, { ...props, selected: { file: item, snapshot: snapshot('fresh', ['new content']) } })));
    assert.equal(latest.stateFor(item).kind, 'pending');
    await act(async () => gate.resolve(snapshot()));
    await act(async () => renderer.update(React.createElement(Probe, props)));
    assert.equal(latest.stateFor(item).kind, 'pending');
  } finally { await act(async () => renderer?.unmount()); }
});

test('background checks are limited to four at once and cancelled scopes launch no further reads', async () => {
  const files = Array.from({ length: 12 }, (_, i) => file(`${i}.ts`)), gates = []; let renderer;
  files.forEach(item => approve(item.path));
  globalThis.__captureWorkingList = () => { const gate = deferred(); gates.push(gate); return gate.promise; };
  try {
    await act(async () => { renderer = create(React.createElement(Probe, { status: status(), files })); }); assert.equal(gates.length, 4);
    await act(async () => renderer.update(React.createElement(Probe, { repo: '/other', status: status(), files: [] })));
    await act(async () => gates.forEach(gate => gate.resolve(snapshot())));
    assert.equal(gates.length, 4); assert.equal(latest.approved, 0); assert.equal(latest.pending, 0);
  } finally { await act(async () => renderer?.unmount()); }
});

test('failed verification removes green approval and exposes a retry hint rather than staying in checking', async () => {
  approve(); globalThis.__captureWorkingList = async () => { throw Error('read failed'); }; let renderer; const item = file();
  try {
    await act(async () => { renderer = create(React.createElement(Probe, { status: status(), files: [item] })); });
    assert.equal(latest.stateFor(item).kind, 'pending'); assert.equal(latest.stateFor(item).failed, true); assert.equal(latest.checking, 0);
  } finally { await act(async () => renderer?.unmount()); }
});

test('right-side file and hunk buttons stay enabled and unchanged during an unchanged background verification', async () => {
  let renderer, review; const item = file(), snap = snapshot(), props = { status: status(), lines: [], revision: 0 };
  globalThis.__captureWorkingList = async () => snap;
  function ReviewProbe(p) {
    review = app.useWorkingReview(REPO, p.status, item, p.lines, false, false, null, p.revision);
    return React.createElement(React.Fragment, null, React.createElement(app.WorkingReviewPanel, { review, filtered: false }), React.createElement(app.WorkingReviewHunkActions, { review, header: snap.hunks[0].header }));
  }
  try {
    await act(async () => { renderer = create(React.createElement(ReviewProbe, props)); });
    const before = JSON.stringify(renderer.toJSON()), firstSnapshot = review.snapshot;
    for (let revision = 1; revision <= 3; revision++) {
      const gate = deferred(); globalThis.__captureWorkingList = () => gate.promise;
      await act(async () => renderer.update(React.createElement(ReviewProbe, { ...props, status: { ...props.status }, revision })));
      assert.equal(review.ready, true); assert.equal(review.verifiedSnapshot, null); assert.equal(JSON.stringify(renderer.toJSON()), before);
      await act(async () => gate.resolve({ ...snapshot() }));
      assert.equal(review.snapshot, firstSnapshot, 'identical fingerprints preserve the displayed snapshot');
      assert.equal(JSON.stringify(renderer.toJSON()), before);
    }
  } finally { await act(async () => renderer?.unmount()); }
});

test('review actions during verification bind to displayed code and never approve a later changed snapshot', async () => {
  let renderer, review; const item = file(), props = { status: status(), lines: [], revision: 0 }, gate = deferred();
  function ReviewProbe(p) { review = app.useWorkingReview(REPO, p.status, item, p.lines, false, false, null, p.revision); return null; }
  try {
    await act(async () => { renderer = create(React.createElement(ReviewProbe, props)); });
    globalThis.__captureWorkingList = () => gate.promise;
    await act(async () => renderer.update(React.createElement(ReviewProbe, { ...props, revision: 1 })));
    await act(async () => review.approveFile());
    assert.ok(app.useWorkingReviewStore.getState().records[key()].approvedFiles.includes('old'));
    await act(async () => gate.resolve(snapshot('new', ['new hunk'])));
    assert.equal(review.approved, false); assert.ok(!app.useWorkingReviewStore.getState().records[key()].approvedFiles.includes('new'));
  } finally { await act(async () => renderer?.unmount()); }
});

test('equivalent re-parsed diffs retain content identity while real bytes, line numbers and patch headers count as changes', () => {
  const first = [{ type: 'header', content: '@@ -1 +1 @@', oldNo: null, newNo: null, patchHeader: ['index old..new'] }, { type: 'add', content: '+new', oldNo: null, newNo: 1, patchContent: '+new\r' }];
  const clone = () => structuredClone(first);
  assert.equal(app.sameDiffLines(first, clone()), true);
  for (const mutate of [next => { next[1].content = '+changed'; }, next => { next[1].newNo = 2; }, next => { next[1].patchContent = '+new'; }, next => { next[0].patchHeader[0] = 'index old..different'; }]) {
    const next = clone(); mutate(next); assert.equal(app.sameDiffLines(first, next), false);
  }
});
