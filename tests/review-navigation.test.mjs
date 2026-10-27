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
  await build({ stdin: { contents: `export {LeftSidebar} from './src/components/layout/LeftSidebar'; export {CommitHistoryView} from './src/features/git/CommitHistoryView'; export {ReviewView} from './src/features/review/ReviewView'; export {useRepoStore} from './src/stores/repoStore'; export {useReviewStore} from './src/stores/reviewStore'; export {useReviewProgressStore,progressKey} from './src/stores/reviewProgressStore'; export {useWorkspaceSessionStore} from './src/stores/workspaceSessionStore'; export {gitService} from './src/services/git/GitService';`, resolveDir: root }, bundle: true, platform: 'node', format: 'cjs', outfile, external: ['react', 'react-dom'], alias: { '@': path.join(root, 'src') }, logLevel: 'silent', plugins: [{ name: 'headless-navigation', setup(b) {
    b.onLoad({ filter: /ModalSurface\.tsx$/ }, () => ({ contents: 'export function ModalSurface({children}) {return children;}', loader: 'jsx' }));
    b.onLoad({ filter: /scroll-area\.tsx$/ }, () => ({ contents: 'import React from "react"; export function ScrollArea({children}) {return <div>{children}</div>;}', loader: 'jsx' }));
  } }] });
  app = createRequire(import.meta.url)(outfile);
  globalThis.window = { innerWidth: 1412, addEventListener() {}, removeEventListener() {} };
  globalThis.document = { getElementById() { return null; }, addEventListener() {}, removeEventListener() {} };
});
beforeEach(() => {
  app.useRepoStore.setState({ currentRepo: { path: REPO, currentBranch: 'main' }, status: { currentBranch: 'main', headOid: HEAD, staged: [], unstaged: [], untracked: [] }, activeTab: 'history', commits: [], branches: [], tags: [], stashes: [], selectedCommit: null, selectedFile: null, selectedBranch: null, scrollToCommitHash: null, isLeftSidebarCollapsed: false });
  app.useReviewStore.setState({ status: 'ready', repoPath: REPO, branch: 'main', headHash: HEAD, checkpoint: { hash: BASE, ref: 'refs/auugit/review/main' }, commits: [], rangeFiles: [], targetFiles: [], selectedFile: null, diffLines: [], badgeCount: 3 });
});
after(async () => {
  delete globalThis.window; delete globalThis.document;
  if (tmp && path.dirname(tmp) === root && path.basename(tmp).startsWith('.test-tmp-review-navigation-')) await fs.rm(tmp, { recursive: true, force: true, maxRetries: 5 });
});

test('stage review belongs to history navigation and has no standalone sidebar item', async () => {
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

test('history opens stage review with its live pending count without clearing checkpoint or findings', async () => {
  const scope = { baseHash: BASE, headHash: HEAD, target: 'net' };
  const progress = { approval: { approvedFiles: ['a.ts'], approvedHunks: {} }, comments: [{ id: 'note', path: 'a.ts', startLine: 1, endLine: 1, text: 'Keep this finding' }] };
  app.useReviewProgressStore.getState().setProgress(REPO, 'main', progress, scope);
  const key = app.progressKey(REPO, 'main', scope);
  let renderer;
  try {
    await act(async () => { renderer = create(React.createElement(app.CommitHistoryView)); });
    const entry = () => renderer.root.findByProps({ 'data-testid': 'history-stage-review' });
    assert.match(text(entry()), /阶段复核3/);
    await act(async () => app.useReviewStore.setState({ badgeCount: 5 }));
    assert.match(text(entry()), /阶段复核5/);
    await act(async () => entry().props.onClick());
    assert.equal(app.useRepoStore.getState().activeTab, 'review');
    assert.equal(app.useReviewStore.getState().checkpoint.hash, BASE);
    assert.deepEqual(app.useReviewProgressStore.getState().entries[key], progress);
  } finally { await act(async () => renderer?.unmount()); }
});

test('stage review can return to history with and without a checkpoint, keeping saved history filters', async () => {
  const original = app.gitService.getCommits;
  app.gitService.getCommits = async () => [];
  app.useWorkspaceSessionStore.getState().updateHistoryView(REPO, { query: 'saved filter', scrollTop: 420 });
  try {
    for (const checkpoint of [{ hash: BASE, ref: 'refs/auugit/review/main' }, null]) {
      app.useReviewStore.setState({ checkpoint }); app.useRepoStore.setState({ activeTab: 'review' });
      let renderer;
      try {
        await act(async () => { renderer = create(React.createElement(app.ReviewView)); });
        const back = renderer.root.findByProps({ 'data-testid': 'review-back-history' });
        assert.equal(back.props['aria-label'], '返回提交历史');
        await act(async () => back.props.onClick());
        assert.equal(app.useRepoStore.getState().activeTab, 'history');
        assert.equal(app.useWorkspaceSessionStore.getState().historyViews[REPO].query, 'saved filter');
        assert.equal(app.useWorkspaceSessionStore.getState().historyViews[REPO].scrollTop, 420);
      } finally { await act(async () => renderer?.unmount()); }
    }
  } finally { app.gitService.getCommits = original; }
});
