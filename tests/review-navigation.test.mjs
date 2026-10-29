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
const BASE = 'a'.repeat(40), HEAD = 'b'.repeat(40), REPO = '/navigation-fixture';
let app, tmp;
const text = node => typeof node === 'string' ? node : node.children.map(text).join('');
before(async () => {
  tmp = await fs.mkdtemp(path.join(root, '.test-tmp-review-navigation-'));
  const outfile = path.join(tmp, 'navigation.cjs');
  await build({ stdin: { contents: `export {historyRefTarget} from './src/features/git/HistoryRefOverflow'; export {LeftSidebar} from './src/components/layout/LeftSidebar'; export {CommitHistoryView} from './src/features/git/CommitHistoryView'; export {CenterStage} from './src/components/layout/CenterStage'; export {useRepoStore} from './src/stores/repoStore'; export {useReviewStore} from './src/stores/reviewStore'; export {useReviewProgressStore,progressKey} from './src/stores/reviewProgressStore'; export {useWorkspaceSessionStore} from './src/stores/workspaceSessionStore'; export {gitService} from './src/services/git/GitService';`, resolveDir: root }, bundle: true, platform: 'node', format: 'cjs', outfile, external: ['react', 'react-dom'], alias: { '@': path.join(root, 'src') }, logLevel: 'silent', plugins: [{ name: 'headless-navigation', setup(b) {
    b.onLoad({ filter: /ModalSurface\.tsx$/ }, () => ({ contents: 'export function ModalSurface({children}) {return children;}', loader: 'jsx' }));
    b.onLoad({ filter: /scroll-area\.tsx$/ }, () => ({ contents: 'import React from "react"; export function ScrollArea({children}) {return <div>{children}</div>;}', loader: 'jsx' }));
    b.onLoad({ filter: /EmbeddedTerminalPanel\.tsx$/ }, () => ({ contents: 'export function EmbeddedTerminalPanel(){return null;}', loader: 'jsx' }));
  } }] });
  app = createRequire(import.meta.url)(outfile);
  globalThis.window = { innerWidth: 1412, addEventListener() {}, removeEventListener() {} };
  globalThis.document = { getElementById() { return null; }, addEventListener() {}, removeEventListener() {} };
});
beforeEach(() => {
  app.useWorkspaceSessionStore.setState({ historyViews: {} });
  app.useRepoStore.setState({ currentRepo: { path: REPO, currentBranch: 'main' }, status: { currentBranch: 'main', headOid: HEAD, staged: [], unstaged: [], untracked: [] }, activeTab: 'history', commits: [], branches: [], tags: [], stashes: [], selectedCommit: null, selectedFile: null, selectedBranch: null, scrollToCommitHash: null, isLeftSidebarCollapsed: false });
  app.useReviewStore.setState({ status: 'ready', repoPath: REPO, branch: 'main', headHash: HEAD, checkpoint: { hash: BASE, ref: 'refs/auugit/review/main' }, commits: [], rangeFiles: [], targetFiles: [], selectedFile: null, diffLines: [], badgeCount: 3 });
});

test('filtered history remains keyboard reachable without changing the selected details while typing', async () => {
  const commit = (hash, subject) => ({ hash, shortHash: hash.slice(0, 7), subject, author: { name: 'Test', email: 'test@example.invalid', date: '2026-10-29T00:00:00Z', relativeDate: 'now' }, parents: [] });
  const selected = commit(HEAD, 'Release');
  const matches = [commit('c'.repeat(40), 'Fix first'), commit('d'.repeat(40), 'Fix second')];
  const original = app.gitService.findCommits;
  app.gitService.findCommits = async () => matches;
  app.useRepoStore.setState({ commits: [selected, ...matches], selectedCommit: selected });
  let renderer;
  const rows = () => renderer.root.findAll(node => node.type === 'div' && !!node.props['data-commit-row']);
  try {
    await act(async () => { renderer = create(React.createElement(app.CommitHistoryView)); });
    await act(async () => renderer.root.findByType('input').props.onChange({ target: { value: 'Fix' } }));
    assert.equal(app.useRepoStore.getState().selectedCommit.hash, HEAD, 'typing must preserve the previous details');
    assert.deepEqual(rows().map(row => row.props.tabIndex), [0, -1]);
    assert.equal(rows().some(row => row.props['aria-current'] === 'true'), false, 'the keyboard entry is not a selected row yet');

    const focusTarget = {};
    await act(async () => rows()[0].props.onFocus({ target: focusTarget, currentTarget: focusTarget }));
    assert.equal(app.useRepoStore.getState().selectedCommit.hash, matches[0].hash);
    let prevented = false;
    const target = { hasAttribute: name => name === 'data-commit-row', dataset: { commitRow: matches[0].hash } };
    const list = renderer.root.find(node => node.type === 'div' && node.props.role === 'list' && !!node.props.onKeyDown);
    await act(async () => list.props.onKeyDown({ target, key: 'ArrowDown', preventDefault() { prevented = true; } }));
    assert.equal(prevented, true);
    assert.equal(app.useRepoStore.getState().selectedCommit.hash, matches[1].hash);
    assert.deepEqual(rows().map(row => row.props.tabIndex), [-1, 0]);

    await act(async () => renderer.root.findByType('input').props.onChange({ target: { value: 'No matching subject' } }));
    assert.equal(rows().length, 0);
    assert.equal(app.useRepoStore.getState().selectedCommit.hash, matches[1].hash, 'empty results must preserve details');
    await act(async () => renderer.root.findByType('input').props.onChange({ target: { value: '' } }));
    assert.equal(rows().filter(row => row.props.tabIndex === 0).length, 1);
    assert.equal(rows().find(row => row.props.tabIndex === 0).props['data-commit-row'], matches[1].hash);
  } finally {
    await act(async () => renderer?.unmount());
    app.gitService.findCommits = original;
  }
});

test('search shortcuts enter results, clear filters and leave IME composition alone', async () => {
  const selected = { hash: HEAD, shortHash: HEAD.slice(0, 7), subject: 'Release', author: { name: 'Test', email: 't@example.invalid', date: '2026-10-29', relativeDate: 'now' }, parents: [] };
  const result = { ...selected, hash: BASE, shortHash: BASE.slice(0, 7), subject: 'Fix layout' };
  app.useRepoStore.setState({ commits: [selected, result], selectedCommit: selected });
  let renderer, focused = 0;
  const original = document.getElementById;
  document.getElementById = id => id === `commit-row-${BASE}` ? { focus() { focused++; } } : null;
  const event = (key, extra = {}) => ({ key, nativeEvent: {}, preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; }, ...extra });
  try {
    await act(async () => { renderer = create(React.createElement(app.CommitHistoryView)); });
    await act(async () => renderer.root.findByType('input').props.onChange({ target: { value: 'Fix' } }));
    const composing = event('ArrowDown', { nativeEvent: { isComposing: true } });
    await act(async () => renderer.root.findByType('input').props.onKeyDown(composing));
    assert.equal(composing.prevented, undefined);
    assert.equal(app.useRepoStore.getState().selectedCommit.hash, HEAD);
    const down = event('ArrowDown');
    await act(async () => renderer.root.findByType('input').props.onKeyDown(down));
    assert.equal(down.prevented, true); assert.equal(down.stopped, true);
    assert.equal(app.useRepoStore.getState().selectedCommit.hash, BASE); assert.ok(focused > 0);
    const escape = event('Escape');
    await act(async () => renderer.root.findByType('input').props.onKeyDown(escape));
    assert.equal(escape.prevented, true);
    assert.equal(renderer.root.findByType('input').props.value, '');
    await act(async () => renderer.root.findByType('input').props.onChange({ target: { value: 'Missing' } }));
    const empty = event('ArrowDown');
    await act(async () => renderer.root.findByType('input').props.onKeyDown(empty));
    assert.equal(empty.prevented, undefined);
    await act(async () => renderer.root.findByType('select').props.onChange({ target: { value: 'contents' } }));
    const inputs = renderer.root.findAllByType('input');
    await act(async () => inputs[1].props.onChange({ target: { value: 'src/long/path.ts' } }));
    await act(async () => renderer.root.findAllByType('input')[1].props.onKeyDown(event('Escape')));
    assert.deepEqual(renderer.root.findAllByType('input').map(input => input.props.value), ['', '']);
  } finally { await act(async () => renderer?.unmount()); document.getElementById = original; }
});

test('ref targets preserve full branch names and explicitly address tags', () => {
  for (const [ref, target] of [
    ['HEAD -> feature/long-name', 'feature/long-name'],
    ['tag: release/v1.2.3', 'refs/tags/release/v1.2.3'],
    ['remotes/upstream/feature/ui', 'upstream/feature/ui'],
    ['origin/main', 'origin/main'], ['feature/ui', 'feature/ui'], ['HEAD', 'HEAD'],
  ]) assert.equal(app.historyRefTarget(ref), target);
});

test('history keeps a visible keyboard entry when virtualization unmounts the selected commit', async () => {
  const commits = Array.from({ length: 100 }, (_, index) => ({ hash: index.toString(16).padStart(40, '0'), shortHash: index.toString(16).padStart(7, '0'), subject: `Commit ${index}`, author: { name: 'Test', email: 'test@example.invalid', date: '2026-10-29T00:00:00Z', relativeDate: 'now' }, parents: [] }));
  app.useRepoStore.setState({ commits, selectedCommit: commits[0] });
  let renderer;
  try {
    await act(async () => { renderer = create(React.createElement(app.CommitHistoryView)); });
    const list = renderer.root.find(node => node.type === 'div' && node.props.role === 'list' && !!node.props.onScroll);
    await act(async () => list.props.onScroll({ currentTarget: { scrollTop: 40 * 30, clientHeight: 300 } }));
    const rows = renderer.root.findAll(node => node.type === 'div' && !!node.props['data-commit-row']);
    assert.equal(rows.some(row => row.props['data-commit-row'] === commits[0].hash), false);
    assert.equal(rows.filter(row => row.props.tabIndex === 0).length, 1);
    assert.equal(rows.find(row => row.props.tabIndex === 0).props['data-commit-row'], commits[40].hash);
    assert.equal(app.useRepoStore.getState().selectedCommit.hash, commits[0].hash, 'scrolling alone must not select a different commit');
    // Headless refs are null, so let the debounced scroll write finish before unmounting.
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 180)); });
    assert.equal(app.useWorkspaceSessionStore.getState().historyViews[REPO].scrollTop, 1200);
  } finally { await act(async () => renderer?.unmount()); }
});
after(async () => {
  delete globalThis.window; delete globalThis.document;
  if (tmp && path.dirname(tmp) === root && path.basename(tmp).startsWith('.test-tmp-review-navigation-')) await fs.rm(tmp, { recursive: true, force: true, maxRetries: 5 });
});

test('legacy review navigation returns to history without a separate review sidebar item', async () => {
  let renderer, navigated = 0;
  app.useRepoStore.setState({ activeTab: 'review' });
  try {
    await act(async () => { renderer = create(React.createElement(app.LeftSidebar, { onNavigate: () => { navigated++; } })); });
    const buttons = renderer.root.findAllByType('button');
    assert.equal(buttons.some(button => text(button) === '审查' || text(button).includes('阶段复核')), false);
    const history = buttons.find(button => text(button) === '提交历史');
    assert.equal(history.props['aria-current'], 'page');
    await act(async () => history.props.onClick());
    assert.equal(app.useRepoStore.getState().activeTab, 'history'); assert.equal(navigated, 1);
  } finally { await act(async () => renderer?.unmount()); }
});

test('history has no stage-review entry or pending badge and old review navigation preserves saved data', async () => {
  const scope = { baseHash: BASE, headHash: HEAD, target: 'net' };
  const progress = { approval: { approvedFiles: ['a.ts'], approvedHunks: {} }, comments: [{ id: 'note', path: 'a.ts', startLine: 1, endLine: 1, text: 'Keep this finding' }] };
  app.useReviewProgressStore.getState().setProgress(REPO, 'main', progress, scope);
  const key = app.progressKey(REPO, 'main', scope);
  let renderer;
  try {
    await act(async () => { renderer = create(React.createElement(app.CommitHistoryView)); });
    assert.equal(renderer.root.findAllByProps({ 'data-testid': 'history-stage-review' }).length, 0);
    const before = JSON.stringify(renderer.toJSON());
    await act(async () => app.useReviewStore.setState({ badgeCount: 5 }));
    assert.equal(JSON.stringify(renderer.toJSON()), before);
    await act(async () => app.useRepoStore.getState().setActiveTab('review'));
    assert.equal(app.useRepoStore.getState().activeTab, 'history');
    assert.equal(app.useReviewStore.getState().checkpoint.hash, BASE);
    assert.deepEqual(app.useReviewProgressStore.getState().entries[key], progress);
  } finally { await act(async () => renderer?.unmount()); }
});

test('a legacy review route renders ordinary history and retains saved history filters', async () => {
  const original = app.gitService.getCommits;
  app.gitService.getCommits = async () => [];
  app.useWorkspaceSessionStore.getState().updateHistoryView(REPO, { query: 'saved filter', scrollTop: 420 });
  try {
    for (const checkpoint of [{ hash: BASE, ref: 'refs/auugit/review/main' }, null]) {
      app.useReviewStore.setState({ checkpoint }); app.useRepoStore.setState({ activeTab: 'review' });
      let renderer;
      try {
        await act(async () => { renderer = create(React.createElement(app.CenterStage, { onOpenRepoDialog() {}, onCloneRepoDialog() {}, onInitRepoDialog() {} })); });
        assert.equal(renderer.root.findAllByType(app.CommitHistoryView).length, 1);
        assert.equal(renderer.root.findAllByProps({ 'data-testid': 'history-stage-review' }).length, 0);
        await act(async () => app.useRepoStore.getState().setActiveTab('review'));
        assert.equal(app.useRepoStore.getState().activeTab, 'history');
        assert.equal(app.useWorkspaceSessionStore.getState().historyViews[REPO].query, 'saved filter');
        assert.equal(app.useWorkspaceSessionStore.getState().historyViews[REPO].scrollTop, 420);
      } finally { await act(async () => renderer?.unmount()); }
    }
  } finally { app.gitService.getCommits = original; }
});
