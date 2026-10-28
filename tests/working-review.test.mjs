import { before, after, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { createServer } from 'vite';
import { retryDevFetch } from './dev-fetch-retry.mjs';
import React from 'react';
import './react19-test-env.mjs';
import { create, act } from 'react-test-renderer';

const root = process.cwd(), nativeFetch = globalThis.fetch, saved = new Map();
const routedFetch = retryDevFetch(nativeFetch);
globalThis.localStorage = { getItem: key => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value), removeItem: key => saved.delete(key) };
let app, tmp, server, base, index = 0;
const git = (cwd, ...args) => {
  const result = spawnSync('git', ['-c', 'core.quotepath=false', ...args], { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr); return result.stdout;
};
const write = (repo, name, text) => fs.writeFile(path.join(repo, name), text);
async function fixture(initial = true) {
  const repo = path.join(tmp, `repo-${++index}`); await fs.mkdir(repo);
  git(repo, 'init', '-b', 'main'); git(repo, 'config', 'user.name', 'Review'); git(repo, 'config', 'user.email', 'review@example.invalid'); git(repo, 'config', 'core.autocrlf', 'false');
  if (initial) {
    await write(repo, 'a.txt', Array.from({ length: 30 }, (_, i) => `line ${i + 1}\n`).join(''));
    git(repo, 'add', '-A'); git(repo, 'commit', '-m', 'initial');
  }
  return repo;
}
const recordKey = (repo, file = 'a.txt', branch = 'main') => app.workingReviewKey(repo, branch, file);
const reviewStatus = (repo, snapshot, file = 'a.txt') => app.workingReviewStatus(app.useWorkingReviewStore.getState().records[recordKey(repo, file)], snapshot);
async function current(repo) {
  const status = await app.gitService.getStatus(repo);
  app.useRepoStore.setState({ currentRepo: { path: repo, currentBranch: status.currentBranch }, status });
  return status;
}
async function pending() {
  for (let i = 0; i < 100; i++) { if (app.useConfirmStore.getState().pending) return app.useConfirmStore.getState().pending; await new Promise(resolve => setTimeout(resolve, 20)); }
  assert.fail('Review reminder did not open');
}

before(async () => {
  tmp = await fs.mkdtemp(path.join(root, '.test-tmp-working-review-'));
  const outfile = path.join(tmp, 'app.cjs');
  await build({ stdin: { contents: `export * from './src/services/git/WorkingReviewService'; export * from './src/stores/workingReviewStore'; export * from './src/features/review/confirmWorkingReview'; export * from './src/features/review/approveAllWorkingReviews'; export { CommitComposer } from './src/components/layout/CommitComposer'; export { ConfirmDialog } from './src/components/ui/ConfirmDialog'; export { useSettingsStore } from './src/stores/settingsStore'; export { gitService } from './src/services/git/GitService'; export { useRepoStore } from './src/stores/repoStore'; export { useConfirmStore } from './src/stores/confirmStore'; export { useToastStore } from './src/stores/toastStore';`, resolveDir: root }, bundle: true, platform: 'node', format: 'cjs', outfile, external: ['react', 'react-dom'], alias: { '@': path.join(root, 'src') }, logLevel: 'silent', plugins: [{ name: 'headless-review', setup(b) { b.onLoad({ filter: /ModalSurface\.tsx$/ }, () => ({ contents: 'export function ModalSurface({children}) {return children;}', loader: 'jsx' })); } }] });
  app = createRequire(import.meta.url)(outfile);
  server = await createServer({ configFile: path.join(root, 'vite.config.ts'), server: { host: '127.0.0.1', port: 0, strictPort: false, watch: null } });
  await server.listen(); base = `http://127.0.0.1:${server.httpServer.address().port}`;
  globalThis.fetch = (url, init) => routedFetch(typeof url === 'string' && url.startsWith('/api/') ? base + url : url, init);
});
beforeEach(() => {
  app.useWorkingReviewStore.setState({ records: {} });
  app.useConfirmStore.getState().settle(false);
  app.useSettingsStore.getState().setReviewBeforeCommit(true);
});
after(async () => {
  app?.useConfirmStore.getState().settle(false); app?.useRepoStore.setState({ currentRepo: null });
  globalThis.fetch = nativeFetch; await server?.close();
  if (tmp && path.dirname(tmp) === root && path.basename(tmp).startsWith('.test-tmp-working-review-')) await fs.rm(tmp, { recursive: true, force: true, maxRetries: 5 });
});

test('review reminders default to enabled and the opt-out survives settings persistence', async () => {
  assert.equal(app.useSettingsStore.getState().reviewBeforeCommit, true);
  app.useSettingsStore.getState().setReviewBeforeCommit(false);
  assert.equal(JSON.parse(saved.get('auu_git_settings')).reviewBeforeCommit, false);
  const outfile = path.join(tmp, 'settings.cjs');
  await build({ stdin: { contents: `export {useSettingsStore} from './src/stores/settingsStore';`, resolveDir: root }, bundle: true, platform: 'node', format: 'cjs', outfile, alias: { '@': path.join(root, 'src') }, logLevel: 'silent' });
  assert.equal(createRequire(import.meta.url)(outfile).useSettingsStore.getState().reviewBeforeCommit, false);
});

test('successful status refresh clears completed committed records but keeps partial files and unresolved findings', async () => {
  const repo = await fixture();
  await write(repo, 'a.txt', 'staged part\n'); git(repo, 'add', '--', 'a.txt');
  await write(repo, 'a.txt', 'staged part\nremaining work\n');
  await write(repo, 'done.txt', 'finished\n'); await write(repo, 'open.txt', 'unresolved\n');
  git(repo, 'add', '--', 'done.txt', 'open.txt');
  const status = await current(repo), store = app.useWorkingReviewStore;
  for (const item of status.staged) {
    const snap = await app.captureWorkingReview(repo, item), key = recordKey(repo, item.path);
    store.getState().addIssue(key, snap, `Finding in ${item.path}`);
    if (item.path !== 'open.txt') store.getState().updateIssue(key, store.getState().records[key].issues[0].id, true);
  }
  git(repo, 'commit', '-m', 'partial and complete files');
  await app.useRepoStore.getState().refreshStatus();
  assert.ok(store.getState().records[recordKey(repo)], 'remaining work retains the file review');
  assert.equal(store.getState().records[recordKey(repo, 'done.txt')], undefined);
  assert.equal(store.getState().records[recordKey(repo, 'open.txt')].issues[0].resolved, false);
  git(repo, 'add', '--', 'a.txt'); git(repo, 'commit', '-m', 'finish partial file');
  await app.useRepoStore.getState().checkExternalChanges();
  assert.equal(store.getState().records[recordKey(repo)], undefined);
  await store.persist.rehydrate();
  assert.equal(store.getState().records[recordKey(repo, 'done.txt')], undefined);
  assert.equal(store.getState().records[recordKey(repo, 'open.txt')].issues[0].resolved, false);
});

test('a reviewed worktree file stays reviewed when staged, while later edits require review', async () => {
  const repo = await fixture(); await write(repo, 'a.txt', 'updated\n');
  const status = await current(repo), file = status.unstaged[0];
  const before = await app.captureWorkingReview(repo, file);
  app.useWorkingReviewStore.getState().approveFile(recordKey(repo), before, true);
  git(repo, 'add', '--', 'a.txt');
  const staged = await app.captureWorkingReview(repo, { ...file, staged: true });
  assert.equal(staged.fingerprint, before.fingerprint); assert.equal(reviewStatus(repo, staged).approved, true);
  await write(repo, 'a.txt', 'changed again\n');
  assert.equal(reviewStatus(repo, await app.captureWorkingReview(repo, file)).approved, false);
  assert.equal(reviewStatus(repo, staged).approved, true, 'unstaged edits must not invalidate the unchanged staged version');
  git(repo, 'add', '--', 'a.txt');
  assert.equal(reviewStatus(repo, await app.captureWorkingReview(repo, { ...file, staged: true })).approved, false);
});

test('approve all reviews actual staged, unstaged and empty new files without changing the index or resolving notes', async () => {
  const repo = await fixture(), original = await fs.readFile(path.join(repo, 'a.txt'), 'utf8');
  await write(repo, 'a.txt', original.replace('line 2\n', 'staged line\n')); git(repo, 'add', '-A');
  await write(repo, 'a.txt', original.replace('line 2\n', 'staged line\n').replace('line 25\n', 'unstaged line\n'));
  await write(repo, 'empty.txt', ''); await write(repo, 'blocked.txt', 'Needs a fix\n');
  const status = await current(repo), indexBefore = git(repo, 'diff', '--cached', '--raw');
  const blocked = status.untracked.find(file => file.path === 'blocked.txt');
  app.useWorkingReviewStore.getState().addIssue(recordKey(repo, blocked.path), await app.captureWorkingReview(repo, blocked), 'Resolve this first');
  const result = await app.approveAllWorkingReviews(repo, status);
  assert.equal(result.approved, 3); assert.equal(result.unresolved, 1); assert.equal(result.cancelled, false);
  for (const file of [...status.staged, ...status.unstaged, ...status.untracked].filter(file => file.path !== 'blocked.txt')) {
    assert.equal(reviewStatus(repo, await app.captureWorkingReview(repo, file), file.path).approved, true, `${file.path}/${file.staged}`);
  }
  assert.equal(git(repo, 'diff', '--cached', '--raw'), indexBefore);
  assert.equal(app.useWorkingReviewStore.getState().records[recordKey(repo, blocked.path)].issues[0].resolved, false);
  await write(repo, 'a.txt', original.replace('line 25\n', 'edited after batch review\n'));
  assert.equal(reviewStatus(repo, await app.captureWorkingReview(repo, status.unstaged[0])).approved, false);
  assert.equal(reviewStatus(repo, await app.captureWorkingReview(repo, status.staged[0])).approved, true);
});

test('renamed files display the same patch as review evidence, including pure renames and literal paths', async () => {
  for (const edit of [false, true]) {
    const repo = await fixture(), renamed = 'renamed [文件].txt';
    git(repo, 'mv', '--', 'a.txt', renamed);
    if (edit) {
      const original = await fs.readFile(path.join(repo, renamed), 'utf8');
      await write(repo, renamed, original.replace('line 2\n', 'new line 2\n')); git(repo, 'add', '--', renamed);
    }
    const status = await current(repo), file = status.staged.find(file => file.path === renamed);
    assert.equal(file.oldPath, 'a.txt');
    const snapshot = await app.captureWorkingReview(repo, file);
    await app.useRepoStore.getState().loadFileDiff(file);
    const semantic = lines => lines.map(({ type, oldNo, newNo, content, patchContent }) => ({ type, oldNo, newNo, content, patchContent }));
    assert.deepEqual(semantic(app.useRepoStore.getState().fileDiffLines), semantic(snapshot.lines));
    assert.ok(snapshot.metadata.some(line => line.startsWith('rename from ')));
  }
});

test('configured diff drivers and text conversion cannot hide source changes from review', async () => {
  const repo = await fixture();
  await write(repo, '.gitattributes', 'a.txt diff=review-fixture\n'); git(repo, 'add', '-A'); git(repo, 'commit', '-m', 'diff attributes');
  git(repo, 'config', 'diff.review-fixture.textconv', 'git --version');
  git(repo, 'config', 'diff.review-fixture.command', 'git --version');
  await write(repo, 'a.txt', 'updated source\n'); const status = await current(repo), file = status.unstaged[0];
  const snapshot = await app.captureWorkingReview(repo, file);
  await app.useRepoStore.getState().loadFileDiff(file);
  const lines = app.useRepoStore.getState().fileDiffLines;
  assert.ok(lines.some(line => line.content === '+updated source'));
  assert.deepEqual(lines.map(line => line.content), snapshot.lines.map(line => line.content));
});

test('a note on an unstaged binary version does not erase the reviewed staged version', async () => {
  const repo = await fixture(); await write(repo, 'image.bin', Buffer.from([0, 1, 2])); git(repo, 'add', '-A'); git(repo, 'commit', '-m', 'binary base');
  await write(repo, 'image.bin', Buffer.from([0, 3, 4])); git(repo, 'add', '-A');
  const status = await current(repo), staged = await app.captureWorkingReview(repo, status.staged[0]), key = recordKey(repo, 'image.bin');
  app.useWorkingReviewStore.getState().approveFile(key, staged, true);
  await app.useWorkingReviewStore.persist.rehydrate();
  await write(repo, 'image.bin', Buffer.from([0, 5, 6]));
  const latest = await current(repo), unstaged = await app.captureWorkingReview(repo, latest.unstaged[0]);
  app.useWorkingReviewStore.getState().addIssue(key, unstaged, 'Check these new bytes');
  assert.equal(reviewStatus(repo, staged, 'image.bin').approved, true);
  assert.equal(reviewStatus(repo, staged, 'image.bin').unresolved, 0);
  assert.equal(reviewStatus(repo, unstaged, 'image.bin').approved, false);
});

test('untracked, empty, deleted and binary files have exact review identities across staging', async () => {
  const repo = await fixture();
  await write(repo, 'new [文件].txt', 'new content\n'); await write(repo, 'empty.txt', '');
  await write(repo, 'binary.bin', Buffer.from([0, 1, 2, 3])); await fs.unlink(path.join(repo, 'a.txt'));
  const status = await current(repo);
  for (const file of [...status.unstaged, ...status.untracked]) {
    const snapshot = await app.captureWorkingReview(repo, file);
    app.useWorkingReviewStore.getState().approveFile(recordKey(repo, file.path), snapshot, true);
    git(repo, 'add', '--', file.path);
    const staged = await app.captureWorkingReview(repo, { ...file, status: file.status === 'untracked' ? 'added' : file.status, staged: true });
    assert.equal(reviewStatus(repo, staged, file.path).approved, true, file.path);
  }
  await write(repo, 'binary.bin', Buffer.from([0, 9, 8, 7])); git(repo, 'add', '--', 'binary.bin');
  assert.equal(reviewStatus(repo, await app.captureWorkingReview(repo, { path: 'binary.bin', status: 'added', staged: true }), 'binary.bin').approved, false);
});

test('approving a hunk carries to a partial commit and does not approve other hunks or metadata changes', async () => {
  const repo = await fixture();
  const original = await fs.readFile(path.join(repo, 'a.txt'), 'utf8');
  await write(repo, 'a.txt', original.replace('line 2\n', 'new line 2\n').replace('line 25\n', 'new line 25\n'));
  const status = await current(repo), file = status.unstaged[0], snapshot = await app.captureWorkingReview(repo, file);
  assert.equal(snapshot.hunks.length, 2);
  app.useWorkingReviewStore.getState().approveHunk(recordKey(repo), snapshot.hunks[0].id, true);
  assert.equal(reviewStatus(repo, snapshot).approved, false);
  await app.gitService.stageHunk(repo, 'a.txt', snapshot.lines.slice(0, snapshot.lines.findIndex((line, i) => i > 0 && line.type === 'header')));
  const staged = await app.captureWorkingReview(repo, { ...file, staged: true });
  assert.equal(reviewStatus(repo, staged).approved, true);
  assert.equal(reviewStatus(repo, await app.captureWorkingReview(repo, file)).approved, false);
  git(repo, 'update-index', '--chmod=+x', '--', 'a.txt');
  assert.equal(reviewStatus(repo, await app.captureWorkingReview(repo, { ...file, staged: true })).approved, false);
});

test('staged and unstaged reviews of one file remain separate and combine when both changes are staged', async () => {
  const repo = await fixture(), original = await fs.readFile(path.join(repo, 'a.txt'), 'utf8');
  const first = original.replace('line 2\n', 'reviewed line 2\n');
  await write(repo, 'a.txt', first); git(repo, 'add', '-A');
  const status = await current(repo), staged = await app.captureWorkingReview(repo, status.staged[0]), key = recordKey(repo);
  app.useWorkingReviewStore.getState().approveFile(key, staged, true);
  await write(repo, 'a.txt', first.replace('line 25\n', 'reviewed line 25\n'));
  const latest = await current(repo), unstaged = await app.captureWorkingReview(repo, latest.unstaged[0]);
  app.useWorkingReviewStore.getState().addIssue(key, unstaged, 'Check this later change');
  assert.equal(reviewStatus(repo, staged).approved, true, 'an unstaged note must not invalidate unrelated staged hunks');
  assert.equal(reviewStatus(repo, staged).unresolved, 0);
  assert.equal(reviewStatus(repo, unstaged).unresolved, 1);
  const issue = app.useWorkingReviewStore.getState().records[key].issues[0];
  app.useWorkingReviewStore.getState().updateIssue(key, issue.id, true);
  app.useWorkingReviewStore.getState().approveFile(key, unstaged, true);
  assert.equal(reviewStatus(repo, staged).approved, true, 'approving another version preserves earlier reviews');
  git(repo, 'add', '-A');
  assert.equal(reviewStatus(repo, await app.captureWorkingReview(repo, status.staged[0])).approved, true);
});

test('review notes invalidate approval, survive reload, and require explicit resolution and reapproval', async () => {
  const repo = await fixture(); await write(repo, 'a.txt', 'updated\n');
  const snapshot = await app.captureWorkingReview(repo, { path: 'a.txt', status: 'modified', staged: false }), key = recordKey(repo);
  const store = app.useWorkingReviewStore;
  store.getState().approveFile(key, snapshot, true); store.getState().addIssue(key, snapshot, 'Fix the edge case', snapshot.hunks[0].id);
  assert.equal(reviewStatus(repo, snapshot).approved, false); assert.equal(reviewStatus(repo, snapshot).unresolved, 1);
  const raw = saved.get('auugit-working-review'); assert.match(JSON.parse(raw).state.records[key].issues[0].origin.context, /updated/);
  store.setState({ records: {} }); saved.set('auugit-working-review', raw); await store.persist.rehydrate();
  const issue = store.getState().records[key].issues[0]; assert.equal(issue.text, 'Fix the edge case');
  store.getState().updateIssue(key, issue.id, true); assert.equal(reviewStatus(repo, snapshot).approved, false);
  store.getState().approveFile(key, snapshot, true); assert.equal(reviewStatus(repo, snapshot).approved, true);
  assert.equal(app.workingReviewStatus(store.getState().records[recordKey(repo, 'a.txt', 'other')], snapshot).approved, false);
});

test('reminder can return to review without staging, and continuing permits an unreviewed commit', async () => {
  const repo = await fixture(); await write(repo, 'a.txt', 'updated\n'); const status = await current(repo);
  const first = app.confirmWorkingReview(repo, 'main', status.unstaged, false, status.headOid);
  const prompt = await pending(); assert.equal(prompt.confirmLabel, '继续提交'); assert.equal(prompt.cancelLabel, '返回审核');
  app.useConfirmStore.getState().settle(false); assert.equal(await first, false);
  assert.equal(app.useRepoStore.getState().activeTab, 'changes'); assert.equal(git(repo, 'diff', '--cached'), '');
  const second = app.confirmWorkingReview(repo, 'main', status.unstaged, false, status.headOid);
  await pending(); app.useConfirmStore.getState().settle(true); assert.equal(await second, true);
  git(repo, 'add', '-A'); await app.gitService.commit(repo, 'commit unreviewed changes');
  assert.equal(git(repo, 'show', 'HEAD:a.txt'), 'updated\n');
});

test('dont-remind checkbox and settings toggle bypass reminders while manual review remains available', async () => {
  const repo = await fixture(); await write(repo, 'a.txt', 'updated\n'); const status = await current(repo);
  const decision = app.confirmWorkingReview(repo, 'main', status.unstaged, false, status.headOid);
  const prompt = await pending(); let renderer;
  try {
    await act(async () => { renderer = create(React.createElement(app.ConfirmDialog)); });
    await act(async () => renderer.root.findByType('input').props.onChange({ target: { checked: true } }));
    assert.equal(app.useSettingsStore.getState().reviewBeforeCommit, false);
    assert.equal(JSON.parse(saved.get('auu_git_settings')).reviewBeforeCommit, false);
    assert.ok(prompt.checkbox.label.includes('不再提醒'));
    await act(async () => app.useConfirmStore.getState().settle(true)); assert.equal(await decision, true);
    assert.equal(await app.confirmWorkingReview(repo, 'main', status.unstaged), true);
    assert.equal(app.useConfirmStore.getState().pending, null);
    const snapshot = await app.captureWorkingReview(repo, status.unstaged[0]); app.useWorkingReviewStore.getState().approveFile(recordKey(repo), snapshot, true);
    assert.equal(reviewStatus(repo, snapshot).approved, true);
  } finally { await act(async () => renderer?.unmount()); }
});

test('only the actual staged scope is checked and fully reviewed commits do not prompt', async () => {
  const repo = await fixture(); await write(repo, 'a.txt', 'updated\n'); git(repo, 'add', '-A'); await write(repo, 'excluded.txt', 'unreviewed\n');
  const status = await current(repo), snapshot = await app.captureWorkingReview(repo, status.staged[0]);
  app.useWorkingReviewStore.getState().approveFile(recordKey(repo), snapshot, true);
  assert.equal(await app.confirmWorkingReview(repo, 'main', status.staged, false, status.headOid), true);
  assert.equal(app.useConfirmStore.getState().pending, null);
});

test('editing the index or switching repositories during the reminder cancels the stale submission', async () => {
  const repo = await fixture(); await write(repo, 'a.txt', 'updated\n'); git(repo, 'add', '-A'); const status = await current(repo);
  const decision = app.confirmWorkingReview(repo, 'main', status.staged, false, status.headOid);
  await pending(); await write(repo, 'a.txt', 'new version\n'); git(repo, 'add', '-A');
  app.useConfirmStore.getState().settle(true); assert.equal(await decision, false);
  const next = app.confirmWorkingReview(repo, 'main', status.staged, false, status.headOid);
  await pending(); app.useRepoStore.setState({ currentRepo: { path: '/other' } });
  app.useConfirmStore.getState().settle(true); assert.equal(await next, false);
});

test('new repositories can review their first commit and batch review checks the whole worktree', async () => {
  const repo = await fixture(false); await write(repo, 'new.txt', 'new\n'); const status = await current(repo);
  const snapshot = await app.captureWorkingReview(repo, status.untracked[0], true, '');
  app.useWorkingReviewStore.getState().approveFile(recordKey(repo, 'new.txt'), snapshot, true);
  assert.equal(await app.confirmWorkingReview(repo, 'main', status.untracked, true, ''), true);
  git(repo, 'add', '-A'); await write(repo, 'new.txt', 'new\nadditional unstaged line\n');
  const unborn = await current(repo);
  const whole = await app.captureWorkingReview(repo, unborn.unstaged[0], true, '');
  const full = await app.captureWorkingReview(repo, { ...unborn.unstaged[0], status: 'untracked' });
  assert.equal(whole.fingerprint, full.fingerprint, 'an unborn batch must review the whole file, including already staged lines');
  git(repo, 'add', '-A'); git(repo, 'commit', '-m', 'initial');
  await write(repo, 'new.txt', 'staged\n'); git(repo, 'add', '-A'); await write(repo, 'new.txt', 'worktree\n');
  const latest = await current(repo); const staged = await app.captureWorkingReview(repo, latest.staged[0]);
  app.useWorkingReviewStore.getState().approveFile(recordKey(repo, 'new.txt'), staged, true);
  const decision = app.confirmWorkingReview(repo, 'main', latest.unstaged, true, latest.headOid);
  await pending(); app.useConfirmStore.getState().settle(false); assert.equal(await decision, false);
});

test('Windows line-ending normalization preserves approval when the reviewed content is staged', async () => {
  const repo = await fixture(); git(repo, 'config', 'core.autocrlf', 'true');
  await write(repo, 'a.txt', 'CRLF text\r\nsecond line\r\n');
  const status = await current(repo), snapshot = await app.captureWorkingReview(repo, status.unstaged[0]);
  app.useWorkingReviewStore.getState().approveFile(recordKey(repo), snapshot, true);
  git(repo, 'add', '-A'); const staged = await app.captureWorkingReview(repo, { ...status.unstaged[0], staged: true });
  assert.equal(reviewStatus(repo, staged).approved, true);
});

test('composer reminders preserve the draft on return and do not block continue-commit', async () => {
  const repo = await fixture(); await write(repo, 'a.txt', 'updated\n'); await current(repo);
  const refreshStatus = app.useRepoStore.getState().refreshStatus;
  app.useRepoStore.setState({ refreshStatus: async () => {} });
  let renderer, cleared = 0; const noop = () => {};
  const draftState = { title: 'review workflow', body: '', busy: false, setBusy: noop, operation: { current: false }, scopeSignature: { current: '' }, setTitle: () => { cleared++; }, setBody: noop, amend: false, setAmend: noop, amendCommit: null, setAmendCommit: noop, origin: null, setOrigin: noop };
  try {
    await act(async () => { renderer = create(React.createElement(app.CommitComposer, { draftState, onOpenAiSettings: noop })); });
    const submit = () => renderer.root.findAllByType('button').find(button => button.props.className?.includes('w-full h-10')).props.onClick();
    await act(async () => { submit(); await pending(); app.useConfirmStore.getState().settle(false); });
    for (let i = 0; i < 30 && draftState.operation.current; i++) await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(cleared, 0); assert.equal(git(repo, 'diff', '--cached'), '');
    await act(async () => { submit(); await pending(); app.useConfirmStore.getState().settle(true); });
    for (let i = 0; i < 100 && draftState.operation.current; i++) await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(git(repo, 'log', '-1', '--format=%s').trim(), 'review workflow'); assert.equal(cleared, 1);
  } finally { await act(async () => renderer?.unmount()); app.useRepoStore.setState({ refreshStatus }); }
});
