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
let tmp, app;
const file = (path = 'src/a.ts', staged = false) => ({ path, staged, status: 'modified' });
const snapshot = (fingerprint = 'original', ids = ['one']) => ({ fingerprint, hunks: ids.map(id => ({ id, header: `@@ ${id} @@` })), lines: [], metadata: [] });
const key = (path = 'src/a.ts', repo = 'E:/repo', branch = 'main') => app.workingReviewKey(repo, branch, path);
const add = (path = 'src/a.ts') => { app.useWorkingReviewStore.getState().addIssue(key(path), snapshot(), 'Original note', 'one'); return app.useWorkingReviewStore.getState().records[key(path)].issues[0]; };
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const until = async condition => { for (let i = 0; i < 1000; i++) { if (condition()) return; await new Promise(done => setTimeout(done, 2)); } assert.fail('Timed out waiting for capture'); };

before(async () => {
  tmp = await fs.mkdtemp(path.join(root, '.test-tmp-review-workflow-')); const outfile = path.join(tmp, 'workflow.cjs');
  await build({ stdin: { contents: `export * from './src/features/review/workingReviewFilters'; export * from './src/features/review/workingReviewLocation'; export * from './src/features/review/WorkingReviewIssueCard'; export * from './src/services/git/WorkingReviewService'; export * from './src/stores/workingReviewStore';`, resolveDir: root }, bundle: true, platform: 'node', format: 'cjs', outfile, external: ['react', 'react-dom'], alias: { '@': path.join(root, 'src') }, logLevel: 'silent', plugins: [{ name: 'capture-executor', setup(b) {
    b.onLoad({ filter: /GitExecutor\.ts$/ }, () => ({ contents: 'export const executeGit=(...args)=>globalThis.workflowRead(...args);' }));
  } }] });
  app = createRequire(import.meta.url)(outfile);
});
beforeEach(() => { app.useWorkingReviewStore.setState({ records: {} }); app.useWorkingReviewDraftStore.setState({ drafts: {} }); });
after(async () => { delete globalThis.workflowRead; if (tmp && path.dirname(tmp) === root && path.basename(tmp).startsWith('.test-tmp-review-workflow-')) await fs.rm(tmp, { recursive: true, force: true, maxRetries: 5 }); });

test('file search combines normalized current and original paths with review state and preserves versions', () => {
  const files = [file('src/Alpha.ts', true), file('src/Alpha.ts'), { ...file('docs/new.md'), oldPath: 'old/Guide.md' }, file('pending.ts'), file('checking.ts')];
  const states = ['approved', 'issues', 'partial', 'pending', 'checking'];
  const stateFor = item => ({ kind: states[files.indexOf(item)], unresolved: item === files[1] ? 1 : 0 });
  assert.deepEqual(app.filterWorkingReviewFiles(files, ' SRC\\ALPHA ', 'all', stateFor), files.slice(0, 2));
  assert.deepEqual(app.filterWorkingReviewFiles(files, 'alpha', 'approved', stateFor), [files[0]]);
  assert.deepEqual(app.filterWorkingReviewFiles(files, '', 'issues', stateFor), [files[1]]);
  assert.deepEqual(app.filterWorkingReviewFiles(files, 'old/guide', 'pending', stateFor), [files[2]]);
  assert.deepEqual(app.filterWorkingReviewFiles(files, '', 'pending', stateFor), files.slice(1));
  assert.deepEqual(app.filterWorkingReviewFiles(files, 'missing', 'all', stateFor), []);
});

test('editing preserves original context, identity and resolution and rejects conflicting or deleted notes', async () => {
  const issue = add(), store = app.useWorkingReviewStore;
  store.getState().updateIssue(key(), issue.id, true);
  assert.equal(store.getState().editIssue(key(), issue.id, '  Better description  ', issue.text), true);
  const changed = store.getState().records[key()].issues[0];
  assert.deepEqual(changed, { ...issue, text: 'Better description', resolved: true });
  assert.equal(store.getState().editIssue(key(), issue.id, 'Overwrite', issue.text), false);
  assert.equal(store.getState().editIssue(key(), issue.id, '   ', changed.text), false);
  await store.persist.rehydrate(); assert.deepEqual(store.getState().records[key()].issues[0], JSON.parse(JSON.stringify(changed)));
  store.getState().deleteIssue(key(), issue.id);
  assert.equal(store.getState().editIssue(key(), issue.id, 'Recreate', changed.text), false);
  assert.deepEqual(store.getState().records[key()].issues, []);
});

test('completed cleanup is scoped, durable and keeps ongoing files and unresolved historical findings', async () => {
  const store = app.useWorkingReviewStore;
  const resolved = add('done.ts'); store.getState().updateIssue(key('done.ts'), resolved.id, true);
  add('open.ts'); add('active.ts');
  store.getState().approveFile(key('approval.ts'), snapshot(), true);
  store.getState().approveFile(key('other.ts', 'E:/repo', 'feature'), snapshot(), true);
  store.getState().approveFile(key('elsewhere.ts', 'E:/other'), snapshot(), true);
  store.getState().clearCompleted('E:\\repo\\', 'main', ['active.ts']);
  const records = store.getState().records;
  assert.equal(records[key('done.ts')], undefined); assert.equal(records[key('approval.ts')], undefined);
  assert.equal(records[key('open.ts')].issues.length, 1); assert.equal(records[key('active.ts')].issues.length, 1);
  assert.ok(records[key('other.ts', 'E:/repo', 'feature')]); assert.ok(records[key('elsewhere.ts', 'E:/other')]);
  store.getState().clearCompleted('E:/repo', 'main', ['active.ts']); assert.equal(store.getState().records, records, 'unchanged refresh keeps references stable');
  await store.persist.rehydrate(); assert.deepEqual(JSON.parse(JSON.stringify(store.getState().records)), JSON.parse(JSON.stringify(records)));
});

test('code location chooses exact staged/unstaged versions, then matching hunks, then file-only fallback', () => {
  const issue = { ...add(), origin: { source: 'unstaged', context: '+original' } };
  const staged = { file: file('src/a.ts', true), snapshot: snapshot('staged', ['one']) };
  const unstaged = { file: file(), snapshot: snapshot('original', ['one']) };
  assert.equal(app.workingReviewLocation(issue, [staged, unstaged]).file.staged, false);
  assert.equal(app.workingReviewLocation({ ...issue, snapshot: 'staged' }, [staged, unstaged]).file.staged, true);
  const current = { ...unstaged, snapshot: snapshot('new-version', ['one', 'two']) };
  assert.equal(app.workingReviewLocation(issue, [staged, current]).file.staged, false);
  assert.equal(app.workingReviewLocation(issue, [staged, current]).header, '@@ one @@');
  const moved = { ...unstaged, snapshot: snapshot('changed', ['different']) };
  const fallback = app.workingReviewLocation(issue, [moved]);
  assert.equal(fallback.header, undefined); assert.equal(fallback.changed, true);
  assert.equal(app.workingReviewLocation(issue, []), null);
});

test('note editor retains cancelled drafts, ignores IME submission and reports concurrent edits', async () => {
  const issue = add(); let renderer;
  function Card() { const item = app.useWorkingReviewStore(state => state.records[key()]?.issues[0]); return item && React.createElement(app.WorkingReviewIssueCard, { recordKey: key(), issue: item, index: 0 }); }
  try {
    await act(async () => { renderer = create(React.createElement(Card)); });
    const edit = async () => act(async () => renderer.root.findAllByProps({ 'data-testid': `working-review-edit-${issue.id}` }).find(node => node.type === 'button').props.onClick());
    await edit();
    await act(async () => renderer.root.findByType('textarea').props.onChange({ target: { value: '' } }));
    assert.equal(renderer.root.findByType('textarea').props.value, '', 'clearing an edit must not refill the original note');
    assert.equal(renderer.root.findAllByType('button').find(node => node.children.includes('保存修改')).props.disabled, true);
    await act(async () => renderer.root.findByType('textarea').props.onChange({ target: { value: 'Draft correction' } }));
    await act(async () => renderer.root.findAllByType('button').find(node => node.children.includes('取消')).props.onClick());
    await edit(); assert.equal(renderer.root.findByType('textarea').props.value, 'Draft correction');
    await act(async () => renderer.root.findByType('textarea').props.onKeyDown({ key: 'Enter', ctrlKey: true, nativeEvent: { isComposing: true } }));
    assert.equal(app.useWorkingReviewStore.getState().records[key()].issues[0].text, issue.text);
    await act(async () => app.useWorkingReviewStore.getState().editIssue(key(), issue.id, 'Updated elsewhere', issue.text));
    await act(async () => renderer.root.findByType('form').props.onSubmit({ preventDefault() {} }));
    assert.ok(renderer.root.findByProps({ role: 'alert' })); assert.equal(renderer.root.findByType('textarea').props.value, 'Draft correction');
    assert.equal(app.useWorkingReviewStore.getState().records[key()].issues[0].text, 'Updated elsewhere');
  } finally { await act(async () => renderer?.unmount()); }
});

test('bulk capture limits concurrent reads, publishes bounded progress and stops scheduling after cancel', async () => {
  const controller = new AbortController(), gates = [], progress = [];
  globalThis.workflowRead = () => { const gate = deferred(); gates.push(gate); return gate.promise; };
  const operation = app.captureWorkingReviews('E:/repo', Array.from({ length: 12 }, (_, i) => file(`${i}.ts`)), false, '', { signal: controller.signal, onProgress: value => progress.push(value) });
  assert.equal(gates.length, 4);
  gates[0].resolve({ stdout: '' }); await until(() => gates.length === 5);
  controller.abort(); gates.slice(1).forEach(gate => gate.resolve({ stdout: '' }));
  const result = await operation;
  assert.equal(gates.length, 5); assert.equal(result.length, 5);
  assert.deepEqual(progress.map(item => item.completed), [0, 1]);
  assert.ok(progress.every(item => item.total === 12));
});

test('capture scope invalidation stops reads and completed batches report success and failure progress', async () => {
  let valid = true; const gates = [];
  globalThis.workflowRead = () => { const gate = deferred(); gates.push(gate); return gate.promise; };
  const cancelled = app.captureWorkingReviews('E:/repo', Array.from({ length: 8 }, (_, i) => file(`${i}.ts`)), false, '', { isCurrent: () => valid });
  valid = false; gates.forEach(gate => gate.resolve({ stdout: '' })); await cancelled; assert.equal(gates.length, 4);
  const progress = []; let calls = 0;
  globalThis.workflowRead = async () => { if (++calls === 2) throw Error('Unreadable'); return { stdout: '' }; };
  const result = await app.captureWorkingReviews('E:/repo', [file('1.ts'), file('2.ts'), file('3.ts')], false, '', { onProgress: value => progress.push(value) });
  assert.deepEqual(progress.map(item => item.completed), [0, 1, 2, 3]); assert.equal(result.filter(item => !item.snapshot).length, 1);
});
