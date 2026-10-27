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
let app, tmp;
const REPO = 'C:/report-repo', HEAD = 'c'.repeat(40);
const snapshot = () => ({ fingerprint: 'a'.repeat(64), metadata: [], hunks: [{ id: 'first', header: '@@ -1,1 +1,1 @@' }, { id: 'second', header: '@@ -20,1 +20,1 @@' }], lines: [
  { type: 'header', oldNo: null, newNo: null, content: '@@ -1,1 +1,1 @@' },
  { type: 'delete', oldNo: 1, newNo: null, content: '-old first' }, { type: 'add', oldNo: null, newNo: 1, content: '+new first' },
  { type: 'header', oldNo: null, newNo: null, content: '@@ -20,1 +20,1 @@' },
  { type: 'delete', oldNo: 20, newNo: null, content: '-old second' }, { type: 'add', oldNo: null, newNo: 20, content: '+new second' },
] });
const key = (file = 'a.ts', repo = REPO, branch = 'main') => app.workingReviewKey(repo, branch, file);
const add = (text, file = 'a.ts', hunk = 'first', source = 'unstaged', repo = REPO, branch = 'main') => {
  const diff = snapshot(); app.useWorkingReviewStore.getState().addIssue(key(file, repo, branch), diff, text, hunk, app.captureWorkingIssueOrigin(diff, hunk, source, HEAD));
};
const report = (includeResolved = false, repoPath = REPO, branch = 'main') => app.buildWorkingReviewReport({ records: app.useWorkingReviewStore.getState().records, repoPath, branch, includeResolved, t: app.tNow });
const byId = (renderer, id) => renderer.root.findByProps({ 'data-testid': id });
const text = node => typeof node === 'string' ? node : node.children.map(text).join('');

before(async () => {
  tmp = await fs.mkdtemp(path.join(root, '.test-tmp-working-report-')); const outfile = path.join(tmp, 'report.cjs');
  await build({ stdin: { contents: `export * from './src/features/review/workingReviewReportLogic'; export * from './src/stores/workingReviewStore'; export {WorkingReviewReport} from './src/features/review/WorkingReviewReport'; export {tNow} from './src/i18n'; export {useToastStore} from './src/stores/toastStore';`, resolveDir: root }, bundle: true, platform: 'node', format: 'cjs', outfile, external: ['react', 'react-dom'], alias: { '@': path.join(root, 'src') }, logLevel: 'silent', plugins: [{ name: 'headless-report', setup(b) { b.onLoad({ filter: /ModalSurface\.tsx$/ }, () => ({ contents: 'export function ModalSurface({children}) {return children;}', loader: 'jsx' })); } }] });
  app = createRequire(import.meta.url)(outfile);
});
beforeEach(() => { app.useWorkingReviewStore.setState({ records: {} }); app.useToastStore.setState({ toasts: [] }); });
after(async () => { if (tmp && path.dirname(tmp) === root && path.basename(tmp).startsWith('.test-tmp-working-report-')) await fs.rm(tmp, { recursive: true, force: true, maxRetries: 5 }); });

test('report collects all annotated files in the current repository and branch, including staged and untracked notes', () => {
  add('Fix staged code', 'a.ts', 'first', 'staged'); add('Fix new file', 'new.ts', undefined, 'untracked');
  add('Other branch secret', 'a.ts', 'first', 'unstaged', REPO, 'other'); add('Other repository secret', 'a.ts', 'first', 'unstaged', '/other');
  const result = report();
  assert.match(result, /## a\.ts/); assert.match(result, /## new\.ts/); assert.match(result, /记录时：暂存区/); assert.match(result, /记录时：未跟踪文件/);
  assert.match(result, /HEAD cccccccccc/); assert.match(result, /@@ -1,1 \+1,1 @@/); assert.match(result, /以下 2 条/);
  assert.doesNotMatch(result, /Other branch secret|Other repository secret/);
});

test('resolved notes are excluded by default and can be included as reference', () => {
  add('Open finding'); add('Resolved finding', 'b.ts');
  const issue = app.useWorkingReviewStore.getState().records[key('b.ts')].issues[0];
  app.useWorkingReviewStore.getState().updateIssue(key('b.ts'), issue.id, true);
  assert.match(report(), /Open finding/); assert.doesNotMatch(report(), /Resolved finding|## b\.ts/);
  assert.match(report(true), /Resolved finding/); assert.match(report(true), /已解决/); assert.match(report(true), /以下 2 条/);
});

test('original hunk context is bounded, immutable and survives persistence', async () => {
  const diff = snapshot(), origin = app.captureWorkingIssueOrigin(diff, 'second', 'unstaged', HEAD);
  app.useWorkingReviewStore.getState().addIssue(key(), diff, 'Fix this\nKeep the note verbatim', 'second', origin);
  diff.lines[5].content = '+later changed code';
  const result = report(); assert.match(result, /new second/); assert.doesNotMatch(result, /later changed code|old first/); assert.match(result, /Keep the note verbatim/);
  const raw = saved.get('auugit-working-review'); app.useWorkingReviewStore.setState({ records: {} }); saved.set('auugit-working-review', raw); await app.useWorkingReviewStore.persist.rehydrate();
  assert.equal(report(), result);
  const huge = snapshot(); huge.lines[2].content = '+' + 'x'.repeat(10000);
  const bounded = app.captureWorkingIssueOrigin(huge, 'first'); assert.equal(bounded.context.length, 8000); assert.equal(bounded.truncated, true);
  app.useWorkingReviewStore.getState().addIssue(key('huge.ts'), huge, 'Check truncation', 'first', bounded);
  assert.match(report(), /原始上下文已截断/);
});

test('file notes contain the complete bounded diff while an unknown hunk never receives unrelated code', () => {
  assert.match(app.captureWorkingIssueOrigin(snapshot()).context, /new first[\s\S]*new second/);
  assert.equal(app.captureWorkingIssueOrigin(snapshot(), 'missing').context, '');
});

test('older notes only recover original context when the exact snapshot and hunk are available', () => {
  const legacy = { id: 'legacy', text: 'Legacy note', snapshot: 'a'.repeat(64), hunk: 'first', resolved: false };
  app.useWorkingReviewStore.setState({ records: { [key()]: { approvedHunks: [], issues: [legacy] } } });
  assert.match(report(), /未保存原始代码上下文/); assert.match(report(), /代码块位置未保存/); assert.doesNotMatch(report(), /new first/);
  app.useWorkingReviewStore.getState().recoverIssueOrigins(key(), { ...snapshot(), fingerprint: 'b'.repeat(64) });
  assert.equal(app.useWorkingReviewStore.getState().records[key()].issues[0].origin, undefined);
  app.useWorkingReviewStore.getState().recoverIssueOrigins(key(), snapshot()); assert.match(report(), /new first/);
  assert.match(report(), /来源未记录/);
  app.useWorkingReviewStore.getState().recoverIssueOrigins(key(), { ...snapshot(), lines: [] }); assert.match(report(), /new first/);
});

test('scope matching normalizes Windows paths and ignores malformed or unrelated keys', () => {
  add('Windows path note');
  const records = { ...app.useWorkingReviewStore.getState().records, broken: { issues: [{ text: 'bad' }] }, '[1,2,3]': { issues: [{ text: 'wrong' }] } };
  const entries = app.workingReviewEntries(records, 'C:\\report-repo\\', 'main'); assert.equal(entries.length, 1); assert.equal(entries[0].path, 'a.ts');
  assert.equal(report(false, REPO, 'other'), '');
});

test('report preview copies exactly the displayed report and reacts to include-resolved', async () => {
  add('Actionable finding'); add('Already fixed', 'b.ts'); const resolved = app.useWorkingReviewStore.getState().records[key('b.ts')].issues[0];
  app.useWorkingReviewStore.getState().updateIssue(key('b.ts'), resolved.id, true);
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'navigator'); let copied, renderer;
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { clipboard: { writeText: async value => { copied = value; } } } });
  try {
    await act(async () => { renderer = create(React.createElement(app.WorkingReviewReport, { repoPath: REPO, branch: 'main' })); });
    await act(async () => byId(renderer, 'working-review-report-open').props.onClick());
    assert.doesNotMatch(text(byId(renderer, 'working-review-report-text')), /Already fixed/);
    await act(async () => byId(renderer, 'working-review-report-copy').props.onClick());
    assert.equal(copied, text(byId(renderer, 'working-review-report-text'))); assert.equal(copied, report());
    await act(async () => renderer.root.findByType('input').props.onChange({ target: { checked: true } }));
    assert.match(text(byId(renderer, 'working-review-report-text')), /Already fixed/);
    await act(async () => byId(renderer, 'working-review-report-copy').props.onClick()); assert.equal(copied, report(true));
  } finally { await act(async () => renderer?.unmount()); if (previous) Object.defineProperty(globalThis, 'navigator', previous); else delete globalThis.navigator; }
});

test('empty and fully resolved reports disable copy while enabling the resolved filter restores it', async () => {
  let renderer;
  try {
    await act(async () => { renderer = create(React.createElement(app.WorkingReviewReport, { repoPath: REPO, branch: 'main' })); });
    await act(async () => byId(renderer, 'working-review-report-open').props.onClick()); assert.equal(byId(renderer, 'working-review-report-copy').props.disabled, true);
    await act(async () => { add('Fixed finding'); const issue = app.useWorkingReviewStore.getState().records[key()].issues[0]; app.useWorkingReviewStore.getState().updateIssue(key(), issue.id, true); });
    assert.equal(byId(renderer, 'working-review-report-copy').props.disabled, true);
    await act(async () => renderer.root.findByType('input').props.onChange({ target: { value: true, checked: true } })); assert.equal(byId(renderer, 'working-review-report-copy').props.disabled, false);
  } finally { await act(async () => renderer?.unmount()); }
});

test('changing repository or branch closes the report and cannot expose the previous scope', async () => {
  add('Original scope finding'); add('Other branch finding', 'b.ts', 'first', 'staged', REPO, 'other');
  let renderer;
  try {
    await act(async () => { renderer = create(React.createElement(app.WorkingReviewReport, { repoPath: REPO, branch: 'main' })); });
    await act(async () => byId(renderer, 'working-review-report-open').props.onClick());
    await act(async () => renderer.update(React.createElement(app.WorkingReviewReport, { repoPath: REPO, branch: 'other' })));
    assert.equal(renderer.root.findAllByProps({ 'data-testid': 'working-review-report-text' }).length, 0);
    await act(async () => byId(renderer, 'working-review-report-open').props.onClick());
    assert.match(text(byId(renderer, 'working-review-report-text')), /Other branch finding/); assert.doesNotMatch(text(byId(renderer, 'working-review-report-text')), /Original scope finding/);
    await act(async () => renderer.update(React.createElement(app.WorkingReviewReport, { repoPath: '/other', branch: 'other' })));
    assert.equal(renderer.root.findAllByProps({ 'data-testid': 'working-review-report-text' }).length, 0);
  } finally { await act(async () => renderer?.unmount()); }
});

test('clipboard failures are reported without closing or changing the preview', async () => {
  add('Keep preview on failure'); let renderer; const previous = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { clipboard: { writeText: async () => { throw Error('Clipboard denied'); } } } });
  try {
    await act(async () => { renderer = create(React.createElement(app.WorkingReviewReport, { repoPath: REPO, branch: 'main' })); });
    await act(async () => byId(renderer, 'working-review-report-open').props.onClick());
    await act(async () => byId(renderer, 'working-review-report-copy').props.onClick());
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.match(text(byId(renderer, 'working-review-report-text')), /Keep preview on failure/);
    assert.ok(app.useToastStore.getState().toasts.some(toast => toast.type === 'error' && toast.description === 'Clipboard denied'));
  } finally { await act(async () => renderer?.unmount()); if (previous) Object.defineProperty(globalThis, 'navigator', previous); else delete globalThis.navigator; }
});
