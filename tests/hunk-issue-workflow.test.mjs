import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import React from 'react';
import './react19-test-env.mjs';
import { create, act } from 'react-test-renderer';

const root = process.cwd();
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
let app, tmp;
const reference = { owner: 'upstream', repo: 'project', number: 12 };
const groups = () => [{ id: 'g1', title: 'feat: first', body: 'Keep my explanation.', units: ['h0:0'], reason: 'One concern' }, { id: 'g2', title: 'feat: second', body: '', units: ['h0:1'] }];
const plan = { repoPath: '/repo', branch: 'main', units: [] };
const text = value => typeof value === 'string' ? value : Array.isArray(value) ? value.map(text).join('') : value?.props ? text(value.props.children) : '';
const button = (renderer, label) => renderer.root.findAllByType('button').find(value => text(value) === label);
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
before(async () => {
  tmp = await fs.mkdtemp(path.join(root, '.test-tmp-hunk-issue-')); const outfile = path.join(tmp, 'app.cjs');
  await build({ stdin: { contents: `export * from './src/features/git/hunkIssueReferencePlan'; export { HunkIssueReferences } from './src/features/git/HunkIssueReferences'; export { hunkCommitService } from './src/services/git/HunkCommitService'; export { useRepoStore } from './src/stores/repoStore'; export { useIssueWorkflowStore } from './src/stores/issueWorkflowStore';`, resolveDir: root }, outfile, bundle: true, platform: 'node', format: 'cjs', external: ['react', 'react-dom'], alias: { '@': path.join(root, 'src') }, logLevel: 'silent' });
  app = createRequire(import.meta.url)(outfile);
  app.useIssueWorkflowStore.persist.setOptions({ storage: { getItem: () => null, setItem() {}, removeItem() {} } });
});
after(async () => { if (tmp && path.dirname(tmp) === root && path.basename(tmp).startsWith('.test-tmp-hunk-issue-')) await fs.rm(tmp, { recursive: true, force: true, maxRetries: 5 }); });

test('references modify only selected message bodies, preserving order, titles, reasons, assignments and source objects', () => {
  const original = groups(), before = JSON.stringify(original), result = app.proposeHunkIssueReferences(original, ['g1'], reference);
  assert.deepEqual(result.changed, ['g1']); assert.equal(result.groups[0].body, 'Keep my explanation.\n\nRefs upstream/project#12');
  assert.deepEqual(result.groups[1], original[1]); assert.equal(JSON.stringify(original), before);
  assert.equal(result.groups[0].reason, original[0].reason); assert.deepEqual(result.groups[0].units, original[0].units);
  result.groups[0].units.push('new'); assert.deepEqual(original[0].units, ['h0:0']);
});

test('empty descriptions and CRLF messages receive a fully qualified non-closing reference', () => {
  const input = groups(); input[0].body = 'Keep\r\nmy prose'; const result = app.proposeHunkIssueReferences(input, ['g1', 'g2'], reference);
  assert.equal(result.groups[0].body, 'Keep\r\nmy prose\r\n\r\nRefs upstream/project#12'); assert.equal(result.groups[1].body, 'Refs upstream/project#12');
  assert.doesNotMatch(JSON.stringify(result), /Closes|Fixes|Resolves/);
});

test('actual references deduplicate case-insensitively, while fenced examples and comments do not suppress a real reference', () => {
  for (const body of ['refs UPSTREAM/PROJECT#12', 'text\n  Refs upstream/project#12\n']) {
    const input = groups(); input[0].body = body; assert.deepEqual(app.proposeHunkIssueReferences(input, ['g1'], reference).changed, []);
  }
  for (const body of ['```text\nRefs upstream/project#12\n```', '~~~~\nRefs upstream/project#12\n~~~~', '<!-- Refs upstream/project#12 -->', '`Refs upstream/project#12`', '    Refs upstream/project#12', '`code\nRefs upstream/project#12\ncode`']) {
    const input = groups(); input[0].body = body; const result = app.proposeHunkIssueReferences(input, ['g1'], reference);
    assert.equal(result.groups[0].body, body + '\n\nRefs upstream/project#12');
  }
});

test('invalid references or selections and oversized descriptions fail before any group is modified', () => {
  for (const ref of [{ ...reference, owner: '' }, { ...reference, repo: 'bad\nCloses #1' }, { ...reference, number: 0 }, { ...reference, number: 1.5 }]) assert.throws(() => app.proposeHunkIssueReferences(groups(), ['g1'], ref), /无效|Invalid/);
  for (const selected of [[], ['missing'], ['g1', 'g1']]) assert.throws(() => app.proposeHunkIssueReferences(groups(), selected, reference), /无效|Invalid/);
  const input = groups(); input[1].body = 'x'.repeat(6000); const before = JSON.stringify(input);
  assert.throws(() => app.proposeHunkIssueReferences(input, ['g1', 'g2'], reference), /6000|6,000/); assert.equal(JSON.stringify(input), before);
});

test('unfinished code fences or comments cannot hide a newly appended reference', () => {
  for (const body of ['```\nRefs upstream/project#12', '<!-- unfinished\nRefs upstream/project#12', '~~~~\nexample']) {
    const input = groups(); input[0].body = body; assert.throws(() => app.proposeHunkIssueReferences(input, ['g1'], reference), /闭合|Close/);
  }
});

async function fixture(options = {}) {
  const events = { applied: [], blocked: [], verifies: 0 };
  app.useRepoStore.setState({ currentRepo: { path: '/repo', currentBranch: 'main' }, status: { currentBranch: 'main' } });
  app.useIssueWorkflowStore.setState({ branchIssues: {} }); app.useIssueWorkflowStore.getState().linkBranch('/repo', 'main', reference);
  app.hunkCommitService.verify = async () => { events.verifies++; return options.verify?.(); };
  const scope = { owner: 'fork', repo: 'project', key: 'account-one', isAuthenticated: true, isCurrent: () => true };
  const task = { path: '/repo', branch: 'main', reference, scope, issue: { title: 'Current task', state: 'open', body: 'Issue background' }, loading: false };
  const props = { plan, groups: groups(), task, blocked: false, onApply: value => events.applied.push(value), onBlockedChange: value => events.blocked.push(value), onNavigate() {} };
  let renderer; await act(async () => { renderer = create(React.createElement(app.HunkIssueReferences, props)); });
  const preview = async () => { if (!renderer.root.findAllByType('input')[0].props.checked) await act(async () => renderer.root.findAllByType('input')[0].props.onChange({ target: { checked: true } })); await act(async () => button(renderer, '预览 Issue 引用').props.onClick()); };
  return { renderer, props, events, preview, cleanup: () => act(async () => renderer.unmount()) };
}

test('UI previews full messages and applies only after explicit action and live verification', async () => {
  const f = await fixture();
  try {
    await f.preview(); assert.match(JSON.stringify(f.renderer.toJSON()), /Keep my explanation/); assert.equal(f.events.applied.length, 0); assert.equal(f.events.verifies, 0); assert.equal(f.events.blocked.at(-1), true);
    await act(async () => button(f.renderer, '应用 Issue 引用').props.onClick());
    assert.equal(f.events.verifies, 1); assert.equal(f.events.applied.length, 1); assert.equal(f.events.applied[0][0].body, 'Keep my explanation.\n\nRefs upstream/project#12'); assert.equal(f.events.applied[0][1].body, ''); assert.equal(f.events.blocked.at(-1), false);
  } finally { await f.cleanup(); }
});

test('cancel and snapshot failure preserve original descriptions and release blocked controls', async () => {
  const f = await fixture({ verify: () => { throw Error('Snapshot changed'); } });
  try {
    await f.preview(); await act(async () => button(f.renderer, '保留原说明').props.onClick()); assert.equal(f.events.verifies, 0); assert.equal(f.events.applied.length, 0); assert.equal(f.events.blocked.at(-1), false);
    await f.preview(); await act(async () => button(f.renderer, '应用 Issue 引用').props.onClick());
    assert.equal(f.events.applied.length, 0); assert.equal(f.events.verifies, 1); assert.match(JSON.stringify(f.renderer.toJSON()), /Snapshot changed/); assert.equal(f.events.blocked.at(-1), false);
  } finally { await f.cleanup(); }
});

test('issue detail failure leaves the local reference usable without inventing background', async () => {
  const f = await fixture();
  try {
    const task = { ...f.props.task, issue: undefined, error: 'Issue detail unavailable' };
    await act(async () => f.renderer.update(React.createElement(app.HunkIssueReferences, { ...f.props, task })));
    assert.match(JSON.stringify(f.renderer.toJSON()), /Issue detail unavailable/);
    await f.preview(); await act(async () => button(f.renderer, '应用 Issue 引用').props.onClick());
    assert.equal(f.events.applied.length, 1); assert.equal(f.events.applied[0][0].body, 'Keep my explanation.\n\nRefs upstream/project#12');
  } finally { await f.cleanup(); }
});

for (const scenario of ['account', 'association', 'branch']) test(`a live ${scenario} change prevents pending references from applying`, async () => {
  const f = await fixture();
  try {
    await f.preview();
    if (scenario === 'account') f.props.task.scope.isCurrent = () => false;
    if (scenario === 'association') app.useIssueWorkflowStore.getState().unlinkBranch('/repo', 'main');
    if (scenario === 'branch') app.useRepoStore.setState({ currentRepo: { path: '/repo', currentBranch: 'other' } });
    await act(async () => button(f.renderer, '应用 Issue 引用').props.onClick()); assert.equal(f.events.applied.length, 0); assert.equal(f.events.blocked.at(-1), false);
  } finally { await f.cleanup(); }
});

test('group edits invalidate an outstanding preview instead of replacing newer messages', async () => {
  const f = await fixture();
  try {
    await f.preview(); await act(async () => f.renderer.update(React.createElement(app.HunkIssueReferences, { ...f.props, groups: groups().map(group => ({ ...group, body: 'New manual text' })) })));
    assert.equal(button(f.renderer, '应用 Issue 引用'), undefined); assert.equal(f.events.applied.length, 0); assert.equal(f.events.blocked.at(-1), false);
  } finally { await f.cleanup(); }
});

test('unmounting during verification ignores a late response and creates no replacement', async () => {
  const pending = deferred(), f = await fixture({ verify: () => pending.promise });
  await f.preview(); let applying; await act(async () => { applying = button(f.renderer, '应用 Issue 引用').props.onClick(); });
  await f.cleanup(); await act(async () => { pending.resolve(); await applying; }); assert.equal(f.events.applied.length, 0); assert.equal(f.events.blocked.at(-1), false);
});
