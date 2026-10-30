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
  await build({ stdin: { contents: `export {useWorkingReview} from './src/features/review/useWorkingReview'; export {WorkingReviewPanel,WorkingReviewHunkActions} from './src/features/review/WorkingReviewPanel'; export {sameDiffLines} from './src/utils/diffRows'; export * from './src/features/review/useWorkingReviewFileList'; export * from './src/stores/workingReviewStore'; export * from './src/features/review/WorkingReviewFileStatus'; export {useToastStore} from './src/stores/toastStore';`, resolveDir: root }, bundle: true, platform: 'node', format: 'cjs', outfile, external: ['react', 'react-dom'], alias: { '@': path.join(root, 'src') }, logLevel: 'silent', plugins: [{ name: 'review-list-service', setup(b) {
    b.onResolve({ filter: /^@\/services\/git\/WorkingReviewService$/ }, () => ({ path: 'capture', namespace: 'fixture' }));
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export const captureWorkingReview=(...args)=>globalThis.__captureWorkingList(...args);' }));
  } }] });
  app = createRequire(import.meta.url)(outfile);
});
beforeEach(() => {
  calls = []; app.useWorkingReviewStore.setState({ records: {} });
  app.useWorkingReviewDraftStore.setState({ drafts: {} });
  app.useWorkingReviewStorageStatus.setState({ unavailable: false });
  app.useToastStore.setState({ toasts: [], history: [] });
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

test('unrelated rerenders retain the review query function without repeating captures', async () => {
  let renderer;
  const files = [file(), file('b.ts')], state = status();
  approve();
  const props = { status: state, files };
  try {
    await act(async () => { renderer = create(React.createElement(Probe, props)); });
    const stateFor = latest.stateFor, reads = calls.length;
    await act(async () => renderer.update(React.createElement(Probe, { ...props, unrelated: 'appearance changed' })));
    assert.equal(latest.stateFor, stateFor);
    assert.equal(calls.length, reads);
    await act(async () => app.useWorkingReviewStore.getState().approveFile(key(), snapshot(), false));
    assert.notEqual(latest.stateFor, stateFor);
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

test('review evidence rejects byte and location changes hidden by identical display text', async () => {
  const lines = [{ type: 'add', content: '+same', oldNo: null, newNo: 1 }];
  let renderer, review;
  for (const change of [{ patchContent: '+same\r' }, { newNo: 2 }, { type: 'context' }]) {
    globalThis.__captureWorkingList = async () => ({ ...snapshot(), lines: [{ ...lines[0], ...change }] });
    try {
      // Use stable status identity to avoid restarting capture on the probe render.
      const state = status();
      function StableProbe() { review = app.useWorkingReview(REPO, state, file(), lines, false, false, null); return null; }
      await act(async () => { renderer = create(React.createElement(StableProbe)); });
      assert.equal(review.ready, false); assert.equal(review.failed, true);
    } finally { await act(async () => renderer?.unmount()); }
  }
});

test('next review navigation wraps, skips approved/conflicted rows and separates staged versions', () => {
  const first = file('a.ts', true), second = file('a.ts'), conflict = { ...file('b.ts'), status: 'conflicted' }, last = file('c.ts');
  const files = [first, second, conflict, last];
  const stateFor = item => ({ kind: item === last ? 'approved' : 'pending' });
  assert.equal(app.nextWorkingReviewFile(files, first, stateFor), second);
  assert.equal(app.nextWorkingReviewFile(files, second, stateFor), first);
  assert.equal(app.nextWorkingReviewFile([second, conflict, last], second, stateFor), undefined);
  assert.equal(app.nextWorkingReviewFile([], undefined, stateFor), undefined);
});

test('switching staged versions closes the old hunk editor instead of reusing its target', async () => {
  let renderer, review; const state = status(), lines = [];
  function ReviewProbe({ staged }) { review = app.useWorkingReview(REPO, state, file('a.ts', staged), lines, false, false, null); return null; }
  try {
    await act(async () => { renderer = create(React.createElement(ReviewProbe, { staged: true })); });
    await act(async () => review.setNoteTarget('first')); assert.equal(review.noteTarget, 'first');
    await act(async () => renderer.update(React.createElement(ReviewProbe, { staged: false })));
    assert.equal(review.noteTarget, undefined);
  } finally { await act(async () => renderer?.unmount()); }
});

test('session note drafts survive closing and remounting, remain scoped to file/version/target and save via shortcut', async () => {
  let renderer, review; const state = status(), lines = [];
  function PanelProbe({ item = file() }) {
    review = app.useWorkingReview(REPO, state, item, lines, false, false, null);
    return React.createElement(app.WorkingReviewPanel, { review, filtered: false });
  }
  const mount = async item => act(async () => { renderer = create(React.createElement(PanelProbe, { item })); });
  const draft = () => renderer.root.findByType('textarea');
  try {
    await mount(); await act(async () => review.setNoteTarget(null));
    await act(async () => draft().props.onChange({ target: { value: 'Keep this file draft' } }));
    await act(async () => review.setNoteTarget('first')); assert.equal(draft().props.value, '');
    await act(async () => draft().props.onChange({ target: { value: 'Keep this hunk draft' } }));
    await act(async () => review.setNoteTarget(undefined));
    await act(async () => renderer.unmount()); await mount(file('b.ts'));
    await act(async () => review.setNoteTarget(null)); assert.equal(draft().props.value, '');
    await act(async () => renderer.unmount()); await mount();
    await act(async () => review.setNoteTarget(null)); assert.equal(draft().props.value, 'Keep this file draft');
    globalThis.__captureWorkingList = async () => snapshot('new');
    await act(async () => review.retry()); assert.equal(draft().props.value, '');
    globalThis.__captureWorkingList = async () => snapshot();
    await act(async () => review.retry()); assert.equal(draft().props.value, 'Keep this file draft');
    await act(async () => review.setNoteTarget('first')); assert.equal(draft().props.value, 'Keep this hunk draft');
    const event = { key: 'Enter', ctrlKey: true, nativeEvent: { isComposing: true }, preventDefault() {} };
    await act(async () => draft().props.onKeyDown(event)); assert.equal(review.record, undefined, 'IME composition must not submit');
    await act(async () => draft().props.onKeyDown({ ...event, nativeEvent: { isComposing: false } }));
    assert.equal(draft().props.value, ''); assert.equal(review.record.issues[0].text, 'Keep this hunk draft');
    await act(async () => review.setNoteTarget(null)); assert.equal(draft().props.value, 'Keep this file draft', 'saving a hunk does not erase the file draft');
  } finally { await act(async () => renderer?.unmount()); }
});

test('deleting a note offers undo scoped to the original file and preserves newer notes', async () => {
  const state = status(), lines = []; let renderer, review;
  function PanelProbe() { review = app.useWorkingReview(REPO, state, file(), lines, false, false, null); return React.createElement(app.WorkingReviewPanel, { review, filtered: false }); }
  try {
    await act(async () => { renderer = create(React.createElement(PanelProbe)); });
    await act(async () => { review.setNoteTarget(null); app.useWorkingReviewStore.getState().addIssue(key(), snapshot(), 'Original issue'); });
    const original = review.record.issues[0];
    await act(async () => renderer.root.findByProps({ 'aria-label': '删除此意见' }).props.onClick());
    assert.equal(review.record.issues.length, 0);
    const undo = app.useToastStore.getState().toasts.at(-1).action;
    await act(async () => app.useWorkingReviewStore.getState().addIssue(key(), snapshot(), 'A later issue'));
    await act(async () => undo.onClick()); await act(async () => undo.onClick());
    assert.deepEqual(review.record.issues.map(issue => issue.text), ['Original issue', 'A later issue']);
    assert.deepEqual(review.record.issues[0], original); assert.equal(review.unresolved, 2);
  } finally { await act(async () => renderer?.unmount()); }
});

test('failed storage writes keep review actions usable and retry saves all accumulated changes', async () => {
  const setItem = localStorage.setItem;
  try {
    localStorage.setItem = () => { throw Error('Quota exceeded'); };
    assert.doesNotThrow(() => approve());
    assert.equal(app.useWorkingReviewStorageStatus.getState().unavailable, true);
    assert.equal(app.workingReviewStatus(app.useWorkingReviewStore.getState().records[key()], snapshot()).approved, true);
    app.useWorkingReviewStore.getState().addIssue(key('b.ts'), snapshot(), 'Must not lose this note');
    assert.equal(app.useWorkingReviewStore.getState().retrySave(), false);
    localStorage.setItem = setItem;
    assert.equal(app.useWorkingReviewStore.getState().retrySave(), true);
    const records = JSON.parse(saved.get('auugit-working-review')).state.records;
    assert.equal(records[key('b.ts')].issues[0].text, 'Must not lose this note');
    assert.equal(app.workingReviewStatus(records[key()], snapshot()).approved, true);
  } finally { localStorage.setItem = setItem; }
});

test('compact status markers keep accessible details while leaving room for filenames', async () => {
  let renderer;
  try {
    await act(async () => { renderer = create(React.createElement(app.WorkingReviewFileStatus, { state: { kind: 'partial', approvedHunks: 1, totalHunks: 3, unresolved: 0 }, compact: true })); });
    const marker = renderer.root.findByProps({ 'data-working-review-state': 'partial' });
    assert.equal(marker.props.title, '已审核 1/3 个代码块'); assert.equal(marker.props['aria-label'], marker.props.title);
    assert.equal(marker.findAllByType('span').length, 1, 'compact markers render no visible text');
  } finally { await act(async () => renderer?.unmount()); }
});

test('malformed persisted records cannot approve files or crash review status', async () => {
  const store = app.useWorkingReviewStore;
  saved.set('auugit-working-review', JSON.stringify({ state: { records: {
    [key()]: { approvedFiles: 'old', approvedHunks: 'first', issues: [null, { id: 'bad', snapshot: 123, text: 'invalid' }] },
    [key('b.ts')]: null,
  } }, version: 0 }));
  await store.persist.rehydrate();
  const record = store.getState().records[key()];
  assert.doesNotThrow(() => app.workingReviewStatus(record, snapshot()));
  assert.equal(app.workingReviewStatus(record, snapshot()).approved, false);
  assert.deepEqual(record.issues, []);
});

test('notes and hunk revocations invalidate overlapping approvals while retaining unrelated text and binary versions', async () => {
  const store = app.useWorkingReviewStore, first = snapshot('first-version', ['shared', 'first-only']), second = snapshot('second-version', ['shared', 'second-only']);
  const unrelated = snapshot('unrelated', ['different']), binary = snapshot('binary', []);
  for (const snap of [first, second, unrelated, binary]) store.getState().approveFile(key(), snap, true);
  await store.persist.rehydrate();
  store.getState().addIssue(key(), first, 'Fix the shared hunk', 'shared');
  const state = snap => app.workingReviewStatus(store.getState().records[key()], snap);
  assert.equal(state(first).approved, false); assert.equal(state(second).approved, false);
  assert.equal(state(unrelated).approved, true); assert.equal(state(binary).approved, true);
  const issue = store.getState().records[key()].issues[0]; store.getState().updateIssue(key(), issue.id, true);
  assert.equal(state(first).approved, false, 'resolving a note requires explicit reapproval');
  store.getState().approveHunk(key(), 'shared', true);
  assert.equal(state(first).approved, true); assert.equal(state(second).approved, true);
  assert.equal(state(binary).approved, true, 'adding a hunk approval does not erase a binary review');
  store.getState().approveFile(key(), first, true); store.getState().approveFile(key(), second, true);
  store.getState().approveHunk(key(), 'shared', false);
  assert.equal(state(first).approved, false); assert.equal(state(second).approved, false);
  assert.equal(state(unrelated).approved, true); assert.equal(state(binary).approved, true);
});

test('reopening a file removes full approvals that overlap revoked hunks without affecting disjoint versions', () => {
  const store = app.useWorkingReviewStore, first = snapshot('first-version', ['shared']), second = snapshot('second-version', ['shared', 'other']);
  const binary = snapshot('binary', []);
  for (const snap of [first, second, binary]) store.getState().approveFile(key(), snap, true);
  store.getState().approveFile(key(), first, false);
  const record = store.getState().records[key()];
  assert.equal(app.workingReviewStatus(record, first).approved, false);
  assert.equal(app.workingReviewStatus(record, second).approved, false);
  assert.equal(app.workingReviewStatus(record, binary).approved, true);
});

test('legacy approvals load normally and revoke conservatively when their unknown hunks are changed', async () => {
  const store = app.useWorkingReviewStore;
  saved.set('auugit-working-review', JSON.stringify({ state: { records: { [key()]: { approvedFile: 'old', approvedHunks: [], issues: [] } } }, version: 0 }));
  await store.persist.rehydrate(); assert.equal(app.workingReviewStatus(store.getState().records[key()], snapshot()).approved, true);
  store.getState().approveHunk(key(), 'first', false);
  assert.equal(app.workingReviewStatus(store.getState().records[key()], snapshot()).approved, false);
});

test('partially damaged storage preserves readable notes and valid neighboring records without restoring unsafe approvals', async () => {
  const store = app.useWorkingReviewStore;
  const valid = { approvedFiles: ['old'], approvedHunks: ['first', 'second'], issues: [] };
  saved.set('auugit-working-review', JSON.stringify({ state: { records: {
    [key()]: { ...valid, issues: [null, { id: 'recoverable', text: 'Keep this issue', snapshot: 'old', resolved: false,
      origin: { context: '+original code', source: 42, headHash: { invalid: true } } }] },
    [key('b.ts')]: valid,
  } }, version: 0 }));
  await store.persist.rehydrate(); const records = store.getState().records, issue = records[key()].issues[0];
  assert.equal(issue.text, 'Keep this issue'); assert.equal(issue.origin.context, '+original code');
  assert.equal(issue.origin.source, 'unknown'); assert.equal(issue.origin.headHash, undefined);
  assert.deepEqual(records[key()].approvedFiles, []); assert.deepEqual(records[key()].approvedHunks, []);
  assert.equal(app.workingReviewStatus(records[key('b.ts')], snapshot()).approved, true);
});

test('invalid JSON and inaccessible storage preserve live progress and retry writes a recoverable snapshot', async () => {
  const store = app.useWorkingReviewStore, getItem = localStorage.getItem;
  approve(); const records = store.getState().records;
  saved.set('auugit-working-review', '{broken json');
  await store.persist.rehydrate(); assert.equal(store.getState().records, records);
  assert.equal(app.useWorkingReviewStorageStatus.getState().unavailable, true);
  assert.equal(store.getState().retrySave(), true);
  try {
    localStorage.getItem = () => { throw Error('Read denied'); };
    await store.persist.rehydrate(); assert.equal(store.getState().records, records);
    assert.equal(app.useWorkingReviewStorageStatus.getState().unavailable, true);
  } finally { localStorage.getItem = getItem; }
  assert.equal(store.getState().retrySave(), true);
  assert.equal(app.workingReviewStatus(JSON.parse(saved.get('auugit-working-review')).state.records[key()], snapshot()).approved, true);
});
