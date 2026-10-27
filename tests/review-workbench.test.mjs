import { before, after, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import React from 'react';
import './react19-test-env.mjs';
import { create, act } from 'react-test-renderer';

const root = process.cwd();
const BASE = 'a'.repeat(40), HEAD = 'b'.repeat(40), NEXT = 'c'.repeat(40), FIRST = 'd'.repeat(40);
const REPO = 'C:/review-fixture';
const file = { path: 'a.ts', status: 'modified', insertions: 2, deletions: 2 };
const lines = [
  { type: 'header', content: '@@ -1,1 +1,1 @@' },
  { type: 'delete', content: '-old', oldNo: 1 },
  { type: 'add', content: '+new', newNo: 1 },
  { type: 'header', content: '@@ -20,1 +20,1 @@' },
  { type: 'delete', content: '-old second', oldNo: 20 },
  { type: 'add', content: '+new second', newNo: 20 },
];
let app, tmp;
const scope = (target = 'net', headHash = HEAD, baseHash = BASE) => ({ baseHash, headHash, target });
const empty = () => ({ approval: { approvedFiles: [], approvedHunks: {} }, comments: [] });
const progress = (text = 'Please adjust') => ({
  approval: { approvedFiles: ['a.ts'], approvedHunks: { 'a.ts': [1, 20] } },
  comments: [{ id: 'a.ts:20:20', path: 'a.ts', startLine: 20, endLine: 20, text }],
});
const saved = new Map();

before(async () => {
  globalThis.localStorage = { getItem: k => saved.get(k) ?? null, setItem: (k, v) => saved.set(k, v), removeItem: k => saved.delete(k) };
  tmp = await fs.mkdtemp(path.join(root, '.test-tmp-review-workbench-'));
  const stubs = {
    '@/stores/repoStore': `import { create } from 'zustand'; export const useRepoStore = create(() => ({ currentRepo: null, status: null }));`,
    '@/stores/layoutStore': `const state = {reviewFilesWidth:240,changesFileListWidth:220,setChangesFileListWidth(){},setReviewFilesWidth(){}}; export const useLayoutStore = Object.assign(fn=>fn(state),{getState:()=>state});`,
    '@/stores/settingsStore': `export const useSettingsStore = Object.assign(fn=>fn({diffFontSize:13}),{getState:()=>({aiConfig:{},language:'zh'})});`,
    '@/hooks/useWorkspaceLayout': `export const useWorkspaceLayout = () => ({panels:{files:220}});`,
    '@/stores/confirmStore': `export const confirmAction = async () => true;`,
    '@/i18n': `import {reviewZh} from '@/i18n/review'; export const tNow = k => reviewZh[k] ?? k; export const useI18n = () => ({t:tNow});`,
    '@/stores/toastStore': `const state={toasts:[],addToast(t){state.toasts.push(t)}}; export const useToastStore={getState:()=>state}; export const toast={error(...args){state.toasts.push({type:'error',args})},info(){},success(){},warning(){}};`,
    '@/services/ai/AiReviewSummaryService': `export const summarizeReviewRange = async () => ({overview:'',commits:[]});`,
    '@/services/git/GitService': `export const fixture={files:[],lines:[],commits:[],versions:{},versionsByHead:{},nonAncestors:[]}; export const gitService={isAncestor:async(r,b)=>!fixture.nonAncestors.includes(b),getCommitsInRange:async()=>({commits:fixture.commits,linear:true,truncated:false}),getRangePatch:async()=>'',getRangeDiffSummary:async()=>({files:fixture.files,insertions:2,deletions:2}),getReviewFileVersions:async(r,b,h)=>fixture.versionsByHead[h]??fixture.versions,getCommits:async()=>fixture.commits,getCommitFiles:async()=>fixture.files,getRangeFileDiff:async()=>fixture.lines,getCommitFileDiff:async()=>fixture.lines};`,
    '@/services/git/ReviewCheckpointService': `export const points=new Map(); export const pointKey=(r,b)=>JSON.stringify([r,b]); export const reviewCheckpointService={get:async(r,b)=>{const hash=points.get(pointKey(r,b));return hash?{ref:'refs/auugit/review/'+b,hash}:null},set:async(r,b,hash,expected)=>{if((points.get(pointKey(r,b))??null)!==expected)throw new Error('Checkpoint changed');points.set(pointKey(r,b),hash)}};`,
    '@/services/git/ImageDiffService': `export const isImagePath = () => false;`,
    '@/features/git/ImageDiffView': `export const ImageDiffView = () => null;`,
    '@/features/git/HistoryEditorDialog': `export const HistoryEditorDialog = () => null;`,
    '@/components/ui/button': `import React from 'react'; export const Button = ({children,...props}) => <button {...props}>{children}</button>;`,
    '@/components/ui/badge': `import React from 'react'; export const Badge = ({children}) => <span>{children}</span>;`,
    '@/components/ui/EmptyState': `import React from 'react'; export const EmptyState = ({title}) => <div>{title}</div>;`,
    '@/components/ui/ErrorNotice': `import React from 'react'; export const ErrorNotice = ({error}) => <div>{error}</div>;`,
    '@/components/ui/ModalSurface': `export const ModalSurface = ({children}) => children;`,
    '@/components/ui/scroll-area': `import React from 'react'; export const ScrollArea = ({children}) => <div>{children}</div>;`,
    '@/components/ui/VirtualRows': `import React from 'react'; export const VirtualRows = ({items,renderRow}) => <div>{items.map((item,index)=><React.Fragment key={index}>{renderRow(item,index)}</React.Fragment>)}</div>;`,
    '@/components/ui/ResizeHandle': `export const ResizeHandle = () => null;`,
    '@/components/ui/DiffTools': `export const DiffTools = () => null; export const highlightDiff = content => content;`,
    '@/components/ui/DiffFontControl': `export const DiffFontControl = () => null;`,
  };
  const bundle = path.join(tmp, 'workbench.cjs');
  await build({
    stdin: { contents: `export {ReviewView} from './src/features/review/ReviewView'; export {useReviewStore} from './src/stores/reviewStore'; export * from './src/stores/reviewProgressStore'; export {useRepoStore} from '@/stores/repoStore'; export {useToastStore} from '@/stores/toastStore'; export {fixture,gitService} from '@/services/git/GitService'; export {points,pointKey,reviewCheckpointService} from '@/services/git/ReviewCheckpointService';`, resolveDir: root },
    bundle: true, platform: 'node', format: 'cjs', outfile: bundle, external: ['react', 'react-dom', 'react/jsx-runtime'],
    alias: { '@': path.join(root, 'src') }, logLevel: 'silent',
    plugins: [{ name: 'headless-review-workbench', setup(b) {
      b.onResolve({ filter: /^@\// }, a => stubs[a.path] ? { path: a.path, namespace: 'fixture' } : undefined);
      b.onLoad({ filter: /.*/, namespace: 'fixture' }, a => ({ contents: stubs[a.path], loader: 'jsx', resolveDir: root }));
    } }],
  });
  app = createRequire(import.meta.url)(bundle);
});

after(async () => {
  delete globalThis.localStorage;
  if (tmp && path.dirname(tmp) === root && path.basename(tmp).startsWith('.test-tmp-review-workbench-')) await fs.rm(tmp, { recursive: true, force: true, maxRetries: 5 });
});

beforeEach(async () => {
  app.useReviewStore.getState().reset();
  app.useReviewProgressStore.setState({ entries: {} });
  app.useToastStore.getState().toasts.length = 0;
  app.points.clear();
  app.points.set(app.pointKey(REPO, 'main'), BASE);
  app.fixture.files = [file]; app.fixture.lines = lines;
  app.fixture.versions = { 'a.ts': 'v1' }; app.fixture.versionsByHead = {}; app.fixture.nonAncestors = [];
  app.fixture.commits = [FIRST, HEAD].map((hash, i) => ({ hash, shortHash: hash.slice(0, 7), subject: `Change ${i}`, author: { name: 'User', email: 'u@x', relativeDate: 'now' }, parents: [BASE] }));
  app.useRepoStore.setState({ currentRepo: { path: REPO }, status: { currentBranch: 'main', headOid: HEAD } });
  await app.useReviewStore.getState().load(REPO, 'main', HEAD);
  await app.useReviewStore.getState().selectFile(REPO, 'a.ts');
});

const byId = (renderer, id) => renderer.root.findAllByType('button').find(node => node.props['data-testid'] === id);
const click = button => button.props.onClick({ stopPropagation() {} });
const textContent = node => typeof node === 'string' ? node : node.children.map(textContent).join('');
async function addComment(renderer, line, text) {
  await act(async () => click(byId(renderer, `review-hunk-comment-a.ts-${line}`)));
  await act(async () => renderer.root.findByType('textarea').props.onChange({ target: { value: text } }));
  await act(async () => click(byId(renderer, 'review-comment-save')));
}

test('new HEAD cannot inherit legacy approvals without evidence; original comments survive as outdated', async () => {
  const p = app.useReviewProgressStore;
  p.getState().setProgress(REPO, 'main', progress(), scope());
  let renderer;
  try {
    await act(async () => { renderer = create(React.createElement(app.ReviewView)); });
    assert.equal(byId(renderer, 'review-file-approve-current').props['aria-pressed'], true);
    await act(async () => {
      app.useRepoStore.setState({ status: { currentBranch: 'main', headOid: NEXT } });
      await app.useReviewStore.getState().load(REPO, 'main', NEXT);
      await app.useReviewStore.getState().selectFile(REPO, 'a.ts');
    });
    assert.equal(byId(renderer, 'review-file-approve-current').props['aria-pressed'], false);
    assert.match(JSON.stringify(renderer.toJSON()), /Please adjust/);
    assert.deepEqual(p.getState().getProgress(REPO, 'main', scope('net', NEXT)).approval.approvedFiles, []);
    assert.equal(p.getState().getProgress(REPO, 'main', scope('net', NEXT)).comments[0].status, 'outdated');
    assert.deepEqual(p.getState().getProgress(REPO, 'main', scope('net', HEAD, FIRST)), empty());
    assert.deepEqual(p.getState().getProgress(REPO, 'main', scope()), progress());
    // Clear memory, then hydrate the serialization written by the real store.
    const stored = saved.get('auu-git-review-progress');
    await act(async () => {
      p.setState({ entries: {} });
      saved.set('auu-git-review-progress', stored);
      await p.persist.rehydrate();
    });
    assert.deepEqual(p.getState().getProgress(REPO, 'main', scope()), progress());
  } finally { await act(async () => renderer?.unmount()); }
});

test('approving one commit never approves another commit or the net diff', async () => {
  app.fixture.lines = lines.slice(0, 3);
  await app.useReviewStore.getState().setTarget(REPO, { kind: 'commit', hash: FIRST });
  await app.useReviewStore.getState().selectFile(REPO, 'a.ts');
  let renderer;
  try {
    await act(async () => { renderer = create(React.createElement(app.ReviewView)); });
    await act(async () => click(byId(renderer, 'review-hunk-approve-a.ts-1')));
    assert.deepEqual(app.useReviewProgressStore.getState().getProgress(REPO, 'main', scope(FIRST)).approval.approvedFiles, ['a.ts']);
    await act(async () => {
      await app.useReviewStore.getState().setTarget(REPO, { kind: 'commit', hash: HEAD });
      await app.useReviewStore.getState().selectFile(REPO, 'a.ts');
    });
    assert.equal(byId(renderer, 'review-hunk-approve-a.ts-1').props['aria-pressed'], false);
    await act(async () => {
      app.fixture.lines = lines;
      await app.useReviewStore.getState().setTarget(REPO, { kind: 'net' });
      await app.useReviewStore.getState().selectFile(REPO, 'a.ts');
    });
    assert.equal(byId(renderer, 'review-hunk-approve-a.ts-20').props['aria-pressed'], false);
    await act(async () => click(byId(renderer, 'review-file-approve-current')));
    assert.deepEqual(app.useReviewProgressStore.getState().getProgress(REPO, 'main', scope()).approval.approvedFiles, ['a.ts']);
    assert.deepEqual(app.useReviewProgressStore.getState().getProgress(REPO, 'main', scope(HEAD)).approval.approvedFiles, []);
  } finally { await act(async () => renderer?.unmount()); }
});

test('split diff keeps second hunk approval and comment actions anchored to the right lines', async () => {
  app.useReviewStore.getState().setDiffMode('split');
  let renderer;
  try {
    await act(async () => { renderer = create(React.createElement(app.ReviewView)); });
    assert.ok(byId(renderer, 'review-hunk-approve-a.ts-20'));
    await act(async () => click(byId(renderer, 'review-hunk-approve-a.ts-20')));
    assert.equal(byId(renderer, 'review-hunk-approve-a.ts-1').props['aria-pressed'], false);
    assert.equal(byId(renderer, 'review-hunk-approve-a.ts-20').props['aria-pressed'], true);
    await addComment(renderer, 20, 'Second block only');
    const comment = app.useReviewProgressStore.getState().getProgress(REPO, 'main', scope()).comments[0];
    assert.equal(comment.startLine, 20); assert.equal(comment.endLine, 20);
    assert.equal(comment.text, 'Second block only');
    assert.match(comment.origin.context, /second/);
  } finally { await act(async () => renderer?.unmount()); }
});

test('comments stay separate across targets and reports include every current source and cancelled file', async () => {
  let renderer;
  try {
    await act(async () => { renderer = create(React.createElement(app.ReviewView)); });
    await addComment(renderer, 1, 'Net opinion');
    await act(async () => {
      await app.useReviewStore.getState().setTarget(REPO, { kind: 'commit', hash: FIRST });
      await app.useReviewStore.getState().selectFile(REPO, 'a.ts');
    });
    await addComment(renderer, 1, 'Commit opinion');
    const cancelled = { ...empty(), comments: [{ id: 'gone', path: 'gone.ts', startLine: null, endLine: null, text: 'Removed later' }] };
    await act(async () => app.useReviewProgressStore.getState().setProgress(REPO, 'main', cancelled, scope(HEAD)));
    assert.equal(app.useReviewProgressStore.getState().getProgress(REPO, 'main', scope()).comments[0].text, 'Net opinion');
    const report = renderer.root.findAllByType('button').find(node => node.props.title === '审查报告');
    await act(async () => click(report));
    const text = textContent(renderer.root.findByProps({ 'data-testid': 'review-report-text' }));
    assert.match(text, /净变更 · 行 1-1 · 待处理:Net opinion/);
    assert.ok(text.includes(`提交 ${FIRST} · 行 1-1 · 待处理:Commit opinion`));
    assert.match(text, /## gone.ts/);
    assert.match(text, /Removed later/);
  } finally { await act(async () => renderer?.unmount()); }
});

test('mark and undo restore all target approvals and comments without touching other branches', async () => {
  const p = app.useReviewProgressStore, s = app.useReviewStore;
  p.getState().setProgress(REPO, 'main', progress(), scope());
  p.getState().setProgress(REPO, 'main', progress('Commit note'), scope(FIRST));
  p.getState().setProgress(REPO, 'dev', progress('Other branch'), scope());
  const snapshot = p.getState().snapshotProgress(REPO, 'main');
  await s.getState().markReviewed(REPO, 'main');
  assert.deepEqual(p.getState().snapshotProgress(REPO, 'main'), {});
  assert.equal(app.points.get(app.pointKey(REPO, 'main')), HEAD);
  p.getState().setProgress(REPO, 'main', progress('Later work'), scope('net', NEXT, HEAD));
  await s.getState().undoMarkReviewed(REPO, 'main');
  assert.equal(app.points.get(app.pointKey(REPO, 'main')), BASE);
  for (const [key, entry] of Object.entries(snapshot)) assert.deepEqual(p.getState().entries[key], entry);
  assert.equal(p.getState().getProgress(REPO, 'main', scope('net', NEXT, HEAD)).comments[0].text, 'Later work');
  assert.equal(p.getState().getProgress(REPO, 'dev', scope()).comments[0].text, 'Other branch');
});

test('undo uses the marked HEAD after switching repositories and rejects checkpoint conflicts', async () => {
  const p = app.useReviewProgressStore, s = app.useReviewStore;
  p.getState().setProgress(REPO, 'main', progress(), scope());
  await s.getState().markReviewed(REPO, 'main');
  app.points.set(app.pointKey('C:/other', 'dev'), FIRST);
  await s.getState().load('C:/other', 'dev', NEXT);
  await s.getState().undoMarkReviewed(REPO, 'main');
  assert.equal(app.points.get(app.pointKey(REPO, 'main')), BASE);
  assert.equal(s.getState().repoPath, 'C:/other');
  assert.equal(s.getState().headHash, NEXT);
  assert.deepEqual(p.getState().getProgress(REPO, 'main', scope()), progress());
  await s.getState().load(REPO, 'main', HEAD);
  await s.getState().markReviewed(REPO, 'main');
  app.points.set(app.pointKey(REPO, 'main'), NEXT);
  await s.getState().undoMarkReviewed(REPO, 'main');
  assert.equal(app.points.get(app.pointKey(REPO, 'main')), NEXT);
  assert.deepEqual(p.getState().snapshotProgress(REPO, 'main'), {});
});

test('loading another version invalidates a pending old diff', async () => {
  const s = app.useReviewStore, original = app.gitService.getRangeFileDiff;
  let release;
  app.gitService.getRangeFileDiff = () => new Promise(resolve => { release = resolve; });
  try {
    await s.getState().setTarget(REPO, { kind: 'net' });
    const pending = s.getState().selectFile(REPO, 'a.ts');
    await s.getState().load(REPO, 'main', NEXT);
    release(lines); await pending;
    assert.equal(s.getState().headHash, NEXT);
    assert.deepEqual(s.getState().diffLines, []);
    assert.equal(s.getState().selectedFile, null);
  } finally { app.gitService.getRangeFileDiff = original; }
});

test('a failed mark preserves progress and an obsolete undo action cannot undo a newer mark', async () => {
  const p = app.useReviewProgressStore, s = app.useReviewStore;
  p.getState().setProgress(REPO, 'main', progress(), scope());
  app.points.set(app.pointKey(REPO, 'main'), NEXT);
  await s.getState().markReviewed(REPO, 'main');
  assert.deepEqual(p.getState().getProgress(REPO, 'main', scope()), progress());
  assert.equal(s.getState().markBusy, false);
  app.points.set(app.pointKey(REPO, 'main'), BASE);
  await s.getState().markReviewed(REPO, 'main');
  const oldUndo = app.useToastStore.getState().toasts.find(t => t.action).action;
  await s.getState().load(REPO, 'main', NEXT);
  p.getState().setProgress(REPO, 'main', progress('New version'), scope('net', NEXT, HEAD));
  await s.getState().markReviewed(REPO, 'main');
  oldUndo.onClick();
  assert.equal(app.points.get(app.pointKey(REPO, 'main')), NEXT);
  await s.getState().undoMarkReviewed(REPO, 'main');
  assert.equal(app.points.get(app.pointKey(REPO, 'main')), HEAD);
  assert.equal(p.getState().getProgress(REPO, 'main', scope('net', NEXT, HEAD)).comments[0].text, 'New version');
});

test('incremental review preserves unchanged files and immutable commit scopes, reopening only changed net hunks', async () => {
  const p = app.useReviewProgressStore, s = app.useReviewStore;
  let renderer;
  try {
    await act(async () => { renderer = create(React.createElement(app.ReviewView)); });
    await act(async () => click(byId(renderer, 'review-file-approve-current')));
    await addComment(renderer, 20, 'Verify second block');
    const original = p.getState().getProgress(REPO, 'main', scope()).comments[0].origin;
    await act(async () => {
      await s.getState().setTarget(REPO, { kind: 'commit', hash: FIRST });
      await s.getState().selectFile(REPO, 'a.ts');
    });
    await act(async () => click(byId(renderer, 'review-file-approve-current')));
    await act(async () => {
      app.useRepoStore.setState({ status: { currentBranch: 'main', headOid: NEXT } });
      await s.getState().load(REPO, 'main', NEXT);
      await s.getState().selectFile(REPO, 'a.ts');
    });
    assert.equal(byId(renderer, 'review-file-approve-current').props['aria-pressed'], true);
    assert.equal(s.getState().retainedFiles, 1);
    assert.deepEqual(p.getState().getProgress(REPO, 'main', scope(FIRST, NEXT)).approval.approvedFiles, ['a.ts']);
    const later = 'e'.repeat(40);
    app.fixture.versions = { 'a.ts': 'v2' };
    app.fixture.lines = lines.map((line, i) => i === 2 ? { ...line, content: '+fixed' } : line);
    await act(async () => {
      app.useRepoStore.setState({ status: { currentBranch: 'main', headOid: later } });
      await s.getState().load(REPO, 'main', later);
      await s.getState().selectFile(REPO, 'a.ts');
    });
    assert.equal(byId(renderer, 'review-file-approve-current').props['aria-pressed'], false);
    assert.equal(byId(renderer, 'review-hunk-approve-a.ts-1').props['aria-pressed'], false);
    assert.equal(byId(renderer, 'review-hunk-approve-a.ts-20').props['aria-pressed'], true);
    const carried = p.getState().getProgress(REPO, 'main', scope('net', later)).comments[0];
    assert.equal(carried.status, 'needsReview');
    assert.equal(carried.anchorStale, false);
    assert.deepEqual(carried.origin, original);
  } finally { await act(async () => renderer?.unmount()); }
});

test('findings can be resolved, included in reports, reopened and edited without losing original code', async () => {
  const p = app.useReviewProgressStore;
  let renderer;
  try {
    await act(async () => { renderer = create(React.createElement(app.ReviewView)); });
    await addComment(renderer, 1, 'Please fix');
    const comment = p.getState().getProgress(REPO, 'main', scope()).comments[0];
    await act(async () => click(byId(renderer, 'review-issues-open')));
    let status = renderer.root.findByProps({ 'data-testid': `review-issue-status-${comment.id}` });
    await act(async () => status.props.onChange({ target: { value: 'resolved' } }));
    assert.equal(p.getState().getProgress(REPO, 'main', scope()).comments[0].status, 'resolved');
    assert.match(JSON.stringify(renderer.toJSON()), /没有符合条件的意见/);
    const filters = renderer.root.findAllByType('select').find(node => node.props['aria-label'] === '筛选意见');
    await act(async () => filters.props.onChange({ target: { value: 'all' } }));
    const update = renderer.root.findAllByType('button').find(node => node.children.includes('更新注释'));
    await act(async () => click(update));
    await act(async () => renderer.root.findByType('textarea').props.onChange({ target: { value: 'Revised finding' } }));
    await act(async () => click(renderer.root.findAllByType('button').find(node => node.children.includes('更新注释'))));
    assert.equal(p.getState().getProgress(REPO, 'main', scope()).comments[0].text, 'Revised finding');
    assert.equal(p.getState().getProgress(REPO, 'main', scope()).comments[0].status, 'open');
    assert.deepEqual(p.getState().getProgress(REPO, 'main', scope()).comments[0].origin, comment.origin);
    status = renderer.root.findByProps({ 'data-testid': `review-issue-status-${comment.id}` });
    await act(async () => status.props.onChange({ target: { value: 'resolved' } }));
    await act(async () => click(renderer.root.findAllByType('button').filter(node => node.props['aria-label'] === 'common.close').at(-1)));
    const report = renderer.root.findAllByType('button').find(node => node.props.title === '审查报告');
    await act(async () => click(report));
    assert.equal(renderer.root.findAllByProps({ 'data-testid': 'review-report-text' }).length, 0);
    await act(async () => renderer.root.findAllByType('input').find(node => node.props.type === 'checkbox').props.onChange({ target: { checked: true } }));
    const text = textContent(renderer.root.findByProps({ 'data-testid': 'review-report-text' }));
    assert.match(text, /已解决:Revised finding/);
    assert.match(text, /\+new/);
  } finally { await act(async () => renderer?.unmount()); }
});

test('non-ancestor history never inherits review progress and removed files keep findings accessible', async () => {
  const p = app.useReviewProgressStore, s = app.useReviewStore;
  let renderer;
  try {
    await act(async () => { renderer = create(React.createElement(app.ReviewView)); });
    await addComment(renderer, 1, 'Keep original evidence');
    await act(async () => click(byId(renderer, 'review-file-approve-current')));
    const original = p.getState().getProgress(REPO, 'main', scope()).comments[0];
    app.fixture.nonAncestors = [HEAD];
    await act(async () => {
      app.useRepoStore.setState({ status: { currentBranch: 'main', headOid: NEXT } });
      await s.getState().load(REPO, 'main', NEXT);
    });
    assert.deepEqual(p.getState().getProgress(REPO, 'main', scope('net', NEXT)), empty());
    app.fixture.nonAncestors = [];
    app.fixture.versions = {};
    app.fixture.files = [];
    await act(async () => s.getState().load(REPO, 'main', NEXT));
    const carried = p.getState().getProgress(REPO, 'main', scope('net', NEXT)).comments[0];
    assert.equal(carried.status, 'outdated');
    assert.deepEqual(carried.origin, original.origin);
    await act(async () => click(byId(renderer, 'review-issues-open')));
    assert.match(JSON.stringify(renderer.toJSON()), /Keep original evidence/);
    assert.match(JSON.stringify(renderer.toJSON()), /无法可靠定位/);
  } finally { await act(async () => renderer?.unmount()); }
});

test('fingerprints, original context and finding status survive persistence before incremental review', async () => {
  const p = app.useReviewProgressStore, s = app.useReviewStore;
  let renderer;
  try {
    await act(async () => { renderer = create(React.createElement(app.ReviewView)); });
    await act(async () => click(byId(renderer, 'review-file-approve-current')));
    await addComment(renderer, 1, 'Persistent finding');
    const before = structuredClone(p.getState().getProgress(REPO, 'main', scope()));
    assert.match(before.evidence['a.ts'].hunks[0].fingerprint, /^[a-f0-9]{64}$/);
    const serialized = saved.get('auu-git-review-progress');
    await act(async () => {
      p.setState({ entries: {} });
      saved.set('auu-git-review-progress', serialized);
      await p.persist.rehydrate();
    });
    assert.deepEqual(p.getState().getProgress(REPO, 'main', scope()), before);
    await act(async () => {
      app.useRepoStore.setState({ status: { currentBranch: 'main', headOid: NEXT } });
      await s.getState().load(REPO, 'main', NEXT);
    });
    const carried = p.getState().getProgress(REPO, 'main', scope('net', NEXT));
    assert.deepEqual(carried.approval.approvedFiles, ['a.ts']);
    assert.equal(carried.comments[0].status, 'open');
    assert.deepEqual(carried.comments[0].origin, before.comments[0].origin);
  } finally { await act(async () => renderer?.unmount()); }
});

test('explicit unapproval before opening a changed file cancels pending inherited hunk approvals', async () => {
  const s = app.useReviewStore;
  let renderer;
  try {
    await act(async () => { renderer = create(React.createElement(app.ReviewView)); });
    await act(async () => click(byId(renderer, 'review-file-approve-current')));
    app.fixture.versions = { 'a.ts': 'v2' };
    app.fixture.lines = lines.map((line, i) => i === 2 ? { ...line, content: '+changed' } : line);
    await act(async () => {
      app.useRepoStore.setState({ status: { currentBranch: 'main', headOid: NEXT } });
      await s.getState().load(REPO, 'main', NEXT);
    });
    await act(async () => click(byId(renderer, 'review-file-approve-a.ts')));
    await act(async () => click(renderer.root.findAllByType('button').find(node => node.props['aria-expanded'] === false)));
    await act(async () => click(byId(renderer, 'review-file-approve-a.ts')));
    await act(async () => s.getState().selectFile(REPO, 'a.ts'));
    assert.equal(byId(renderer, 'review-file-approve-current').props['aria-pressed'], false);
    assert.equal(byId(renderer, 'review-hunk-approve-a.ts-20').props['aria-pressed'], false);
  } finally { await act(async () => renderer?.unmount()); }
});
