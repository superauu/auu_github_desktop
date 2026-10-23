import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { createServer } from 'vite';
import React from 'react';
import { create, act } from 'react-test-renderer';

const root = process.cwd(), nativeFetch = globalThis.fetch;
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
let tmp, app, server, base, index = 0;
const git = (cwd, ...args) => { const result = spawnSync('git', ['-c', 'core.quotepath=false', ...args], { cwd, encoding: 'utf8' }); if (result.status !== 0) throw Error(result.stderr || result.error?.message); return result.stdout; };
const write = (repo, file, content) => fs.writeFile(path.join(repo, file), content);
async function fixture(initial = true) {
  const repo = path.join(tmp, `repo-${++index}`); await fs.mkdir(repo);
  git(repo, 'init', '-b', 'main'); git(repo, 'config', 'user.name', 'Batch Test'); git(repo, 'config', 'user.email', 'batch@example.invalid'); git(repo, 'config', 'core.autocrlf', 'false');
  if (initial) { await write(repo, 'a.txt', 'base\n'); await write(repo, 'README.md', 'base docs\n'); git(repo, 'add', '-A'); git(repo, 'commit', '-m', 'initial'); }
  return repo;
}
const group = (title, files, body = 'Explain the change') => ({ title, body, reason: 'Related purpose', files });
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
before(async () => {
  tmp = await fs.mkdtemp(path.join(root, '.test-tmp-commit-batch-'));
  const outfile = path.join(tmp, 'app.cjs');
  await build({ stdin: { contents: `export * from './src/services/git/CommitBatchService'; export { getGitWriteActivity } from './src/services/git/GitQueue'; export * from './src/services/ai/AiCommitBatchService'; export { AiCommitBatchDialog } from './src/features/git/AiCommitBatchDialog'; export { CommitPlanningProgress } from './src/features/git/CommitPlanningProgress'; export { gitService } from './src/services/git/GitService'; export { useRepoStore } from './src/stores/repoStore'; export { useSettingsStore } from './src/stores/settingsStore'; export { useWorkspaceSessionStore, draftKey } from './src/stores/workspaceSessionStore'; export { useRemoteDialogStore } from './src/stores/remoteDialogStore';`, resolveDir: root }, bundle: true, platform: 'node', format: 'cjs', outfile, external: ['react', 'react-dom'], alias: { '@': path.join(root, 'src') }, logLevel: 'silent', plugins: [{ name: 'batch-ui', setup(build) {
    build.onLoad({ filter: /ModalSurface\.tsx$/ }, () => ({ contents: 'export function ModalSurface({ children }) { return children; }', loader: 'jsx' }));
    build.onLoad({ filter: /AiClient\.ts$/ }, () => ({ contents: 'export const requestAiText = (...args) => globalThis.__batchAiRequest(...args);' }));
  } }] });
  app = createRequire(import.meta.url)(outfile);
  server = await createServer({ configFile: path.join(root, 'vite.config.ts'), server: { host: '127.0.0.1', port: 0, strictPort: false, watch: null } });
  await server.listen(); base = `http://127.0.0.1:${server.httpServer.address().port}`;
  globalThis.fetch = (url, init) => nativeFetch(typeof url === 'string' && url.startsWith('/api/') ? base + url : url, init);
});
after(async () => {
  globalThis.fetch = nativeFetch; delete globalThis.__batchAiRequest; app?.useRemoteDialogStore.getState().settle(null); await server?.close();
  if (tmp && path.dirname(tmp) === root && path.basename(tmp).startsWith('.test-tmp-commit-batch-')) await fs.rm(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 150 });
});

test('batch planning is read-only and creates reviewed commits in order with bodies and whole worktree versions', async () => {
  const repo = await fixture();
  await write(repo, 'a.txt', 'staged\n'); git(repo, 'add', '--', 'a.txt'); await write(repo, 'a.txt', 'full worktree\n');
  await write(repo, 'new.txt', 'new file\n'); await write(repo, 'README.md', 'new docs\n');
  const before = git(repo, 'rev-parse', 'HEAD').trim(), indexBefore = git(repo, 'ls-files', '--stage');
  const plan = await app.commitBatchService.capture(repo);
  assert.equal(plan.files.length, 3); assert.match(plan.context, /full worktree/); assert.equal(git(repo, 'ls-files', '--stage'), indexBefore); assert.equal(git(repo, 'rev-parse', 'HEAD').trim(), before);
  const progress = [];
  const result = await app.commitBatchService.execute(plan, [group('feat: implementation', ['a.txt', 'new.txt'], 'Why this feature exists'), group('docs: usage', ['README.md'], 'Explain usage')], { onProgress: list => progress.push(list.length) });
  assert.deepEqual(progress, [1, 2]); assert.equal(result.completed.length, 2);
  assert.equal(git(repo, 'show', 'HEAD~1:a.txt'), 'full worktree\n');
  assert.equal(git(repo, 'show', 'HEAD~1:README.md'), 'base docs\n');
  assert.match(git(repo, 'log', '-2', '--format=%B'), /Why this feature exists/);
  assert.equal(git(repo, 'status', '--porcelain'), ''); assert.equal(git(repo, 'rev-parse', result.recoveryRef).trim(), before);
});

test('capture batches literal file fingerprints and reports real preparation progress', async () => {
  const repo = await fixture();
  const names = ['a.txt', 'README.md', '--literal.txt', 'bracket [name].txt', '中文 space.txt'];
  if (process.platform !== 'win32') names.push('line\nbreak.txt');
  for (const name of names) await write(repo, name, `changed ${name}\n`);
  const previous = globalThis.fetch, requests = [], progress = [];
  globalThis.fetch = (url, init) => { if (url === '/api/git') requests.push(JSON.parse(init.body).args); return previous(url, init); };
  let plan;
  try { plan = await app.commitBatchService.capture(repo, undefined, value => progress.push(value)); }
  finally { globalThis.fetch = previous; }
  const hashes = requests.filter(args => args.includes('hash-object'));
  assert.equal(hashes.length, 2);
  for (const name of names) assert.equal(plan.fingerprints[name], git(repo, 'hash-object', '--no-filters', '--', name).trim());
  assert.equal(progress[0].stage, 'waiting');
  assert.ok(progress.some(value => value.stage === 'reading' && value.completed === names.length && value.total === names.length));
  assert.equal(progress.at(-1).stage, 'checking'); assert.equal(progress.at(-1).completed, names.length);
  assert.equal(git(repo, 'show', ':a.txt'), 'base\n');
});

test('capture still rejects same-length edits during parallel preparation and cancels before AI', async () => {
  const repo = await fixture(); await write(repo, 'a.txt', 'one\n');
  const previous = globalThis.fetch; let hashes = 0;
  globalThis.fetch = async (url, init) => {
    if (url === '/api/git' && JSON.parse(init.body).args.includes('hash-object') && ++hashes === 2) await write(repo, 'a.txt', 'two\n');
    return previous(url, init);
  };
  try { await assert.rejects(app.commitBatchService.capture(repo), /变化|changed/); }
  finally { globalThis.fetch = previous; }
  const controller = new AbortController();
  await assert.rejects(app.commitBatchService.capture(repo, controller.signal, progress => {
    if (progress.stage === 'reading' && progress.total > 0) controller.abort();
  }), { name: 'AbortError' });
  assert.equal(git(repo, 'show', ':a.txt'), 'base\n');
  assert.equal(await fs.readFile(path.join(repo, 'a.txt'), 'utf8'), 'two\n');
});

test('four groups run repository hooks once per commit and expose the actual in-flight commit phase', async () => {
  const repo = await fixture();
  for (const name of ['a.txt', 'README.md', 'c.txt', 'd.txt']) await write(repo, name, 'changed\n');
  const hooks = path.join(repo, '.git', 'hooks'), marker = path.join(hooks, 'batch-waiting'), release = path.join(hooks, 'batch-release');
  await fs.writeFile(path.join(hooks, 'pre-commit'), '#!/bin/sh\nhooks=$(git rev-parse --git-path hooks)\nprintf "called\\n" >> "$hooks/batch-calls"\ntouch "$hooks/batch-waiting"\ni=0\nwhile [ ! -f "$hooks/batch-release" ]; do\n i=$((i+1)); [ "$i" -lt 150 ] || exit 1\n sleep 0.1\ndone\n', { mode: 0o755 });
  const plan = await app.commitBatchService.capture(repo), progress = [];
  const outcome = app.commitBatchService.execute(plan, ['a.txt', 'README.md', 'c.txt', 'd.txt'].map((name, i) => group(`chore: group ${i + 1}`, [name])), { onProgress: list => progress.push(list.length) }).then(value => ({ value }), error => ({ error }));
  try {
    const deadline = Date.now() + 15000;
    while (!await fs.stat(marker).catch(() => null) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 50));
    assert.ok(await fs.stat(marker));
    assert.equal(app.getGitWriteActivity(repo).command, 'commit');
    assert.ok(app.getGitWriteActivity(repo).phaseStartedAt);
  } finally { await fs.writeFile(release, 'continue'); }
  const result = await outcome;
  if (result.error) throw result.error;
  assert.equal(result.value.completed.length, 4); assert.deepEqual(progress, [1, 2, 3, 4]);
  assert.equal((await fs.readFile(path.join(hooks, 'batch-calls'), 'utf8')).trim().split(/\r?\n/).length, 4);
  assert.equal(git(repo, 'status', '--porcelain'), ''); assert.equal(app.getGitWriteActivity(repo), null);
});

test('batch refuses same-path content changes, staging changes and additional files after analysis', async () => {
  const repo = await fixture(); await write(repo, 'a.txt', 'one\n');
  let plan = await app.commitBatchService.capture(repo); const before = git(repo, 'rev-parse', 'HEAD');
  await write(repo, 'a.txt', 'two\n');
  await assert.rejects(app.commitBatchService.execute(plan, [group('fix: content', ['a.txt'])]), /变化|changed/);
  plan = await app.commitBatchService.capture(repo); git(repo, 'add', '--', 'a.txt');
  await assert.rejects(app.commitBatchService.execute(plan, [group('fix: content', ['a.txt'])]), /变化|changed/);
  plan = await app.commitBatchService.capture(repo); await write(repo, 'extra.txt', 'extra');
  await assert.rejects(app.commitBatchService.execute(plan, [group('fix: content', ['a.txt'])]), /变化|changed/);
  assert.equal(git(repo, 'rev-parse', 'HEAD'), before); assert.equal(git(repo, 'show', ':a.txt'), 'two\n');
});

test('failed commit hooks preserve original partial staging and completed commits are reported exactly once', async () => {
  const repo = await fixture(); await write(repo, 'a.txt', 'code\n');
  await write(repo, 'README.md', 'staged docs\n'); git(repo, 'add', '--', 'README.md'); await write(repo, 'README.md', 'working docs\n');
  const plan = await app.commitBatchService.capture(repo);
  await fs.writeFile(path.join(repo, '.git', 'hooks', 'pre-commit'), '#!/bin/sh\nif git diff --cached --name-only | grep -q "^README.md$"; then echo rejected >&2; exit 1; fi\n', { mode: 0o755 });
  let error;
  try { await app.commitBatchService.execute(plan, [group('feat: code', ['a.txt']), group('docs: guide', ['README.md'])]); } catch (caught) { error = caught; }
  assert.ok(error instanceof app.CommitBatchError); assert.equal(error.completed.length, 1); assert.equal(error.indexError, undefined);
  assert.equal(git(repo, 'log', '-1', '--format=%s').trim(), 'feat: code');
  assert.equal(git(repo, 'show', ':README.md'), 'staged docs\n'); assert.equal(await fs.readFile(path.join(repo, 'README.md'), 'utf8'), 'working docs\n');
  assert.equal(git(repo, 'show', ':a.txt'), 'code\n');
  await assert.rejects(app.commitBatchService.execute(plan, [group('feat: code', ['a.txt']), group('docs: guide', ['README.md'])]), /变化|changed/);
  assert.equal(git(repo, 'rev-list', '--count', 'HEAD').trim(), '2');
});

test('initial repositories support multiple commits and untracked files with literal special paths', async () => {
  const repo = await fixture(false); await write(repo, '[a].txt', 'brackets\n'); await write(repo, 'a.txt', 'ordinary\n'); await write(repo, '--new.txt', 'dash\n');
  const plan = await app.commitBatchService.capture(repo); assert.equal(plan.head, '');
  const result = await app.commitBatchService.execute(plan, [group('feat: literal paths', ['[a].txt', '--new.txt']), group('feat: ordinary', ['a.txt'])]);
  assert.equal(result.completed.length, 2); assert.equal(result.recoveryRef, undefined);
  assert.deepEqual(git(repo, 'ls-tree', '--name-only', 'HEAD~1').trim().split(/\r?\n/).sort(), ['--new.txt', '[a].txt']);
  assert.equal(git(repo, 'status', '--porcelain'), '');
});

test('renamed and deleted files stay in their chosen commit without retaining old paths', async () => {
  const repo = await fixture(); git(repo, 'mv', 'a.txt', 'renamed.txt'); await fs.unlink(path.join(repo, 'README.md'));
  const plan = await app.commitBatchService.capture(repo);
  await app.commitBatchService.execute(plan, [group('refactor: rename', ['renamed.txt']), group('docs: remove obsolete guide', ['README.md'])]);
  assert.equal(git(repo, 'status', '--porcelain'), ''); assert.deepEqual(git(repo, 'ls-tree', '--name-only', 'HEAD').trim().split(/\r?\n/), ['renamed.txt']);
  assert.match(git(repo, 'show', '--format=', '--name-status', 'HEAD~1'), /a.txt.*renamed.txt/s);
});

test('cancelled-out staged edits are excluded from the plan and their staging remains intact', async () => {
  const repo = await fixture(); await write(repo, 'a.txt', 'staged\n'); git(repo, 'add', '--', 'a.txt'); await write(repo, 'a.txt', 'base\n'); await write(repo, 'README.md', 'docs\n');
  const plan = await app.commitBatchService.capture(repo); assert.deepEqual(plan.files.map(file => file.path), ['README.md']); assert.deepEqual(plan.skipped, ['a.txt']);
  await app.commitBatchService.execute(plan, [group('docs: update', ['README.md'])]);
  assert.equal(git(repo, 'show', ':a.txt'), 'staged\n'); assert.equal(await fs.readFile(path.join(repo, 'a.txt'), 'utf8'), 'base\n');
});

test('already staged deletions commit successfully without trying to add a missing path', async () => {
  const repo = await fixture(); git(repo, 'rm', '--', 'README.md');
  const plan = await app.commitBatchService.capture(repo);
  await app.commitBatchService.execute(plan, [group('docs: remove old guide', ['README.md'])]);
  assert.equal(git(repo, 'status', '--porcelain'), ''); assert.equal(git(repo, 'ls-tree', '--name-only', 'HEAD').trim(), 'a.txt');
});

test('failed renamed-file commits restore the staged version even when the old path is already absent from the index', async () => {
  const repo = await fixture(); git(repo, 'mv', 'a.txt', 'renamed.txt'); await write(repo, 'renamed.txt', 'working rename\n');
  const before = git(repo, 'ls-files', '--stage');
  const plan = await app.commitBatchService.capture(repo);
  await fs.writeFile(path.join(repo, '.git', 'hooks', 'pre-commit'), '#!/bin/sh\nexit 1\n', { mode: 0o755 });
  let failure;
  try { await app.commitBatchService.execute(plan, [group('refactor: rename', ['renamed.txt'])]); } catch (error) { failure = error; }
  assert.ok(failure instanceof app.CommitBatchError); assert.equal(failure.indexError, undefined);
  assert.equal(git(repo, 'ls-files', '--stage'), before); assert.equal(await fs.readFile(path.join(repo, 'renamed.txt'), 'utf8'), 'working rename\n');
});

test('a failed commit also preserves intent-to-add entries instead of turning them into ordinary untracked files', async () => {
  const repo = await fixture(); await write(repo, 'new.txt', 'intent\n'); git(repo, 'add', '-N', '--', 'new.txt');
  const before = git(repo, 'status', '--porcelain=v2');
  const plan = await app.commitBatchService.capture(repo);
  await fs.writeFile(path.join(repo, '.git', 'hooks', 'pre-commit'), '#!/bin/sh\nexit 1\n', { mode: 0o755 });
  await assert.rejects(app.commitBatchService.execute(plan, [group('feat: new file', ['new.txt'])]));
  assert.equal(git(repo, 'status', '--porcelain=v2'), before);
});

test('invalid AI plans cannot omit, duplicate or invent paths and commit messages cannot inject extra options', () => {
  const valid = { summary: 'Two related concerns', groups: [group('feat: one', ['a']), group('docs: two', ['b'])] };
  assert.equal(app.parseCommitBatchResult(JSON.stringify(valid), ['a', 'b']).groups.length, 2);
  for (const groups of [[group('x', ['a'])], [group('x', ['a', 'a', 'b'])], [group('x', ['a', 'unknown'])], [group('bad\nsubject', ['a', 'b'])], [{ ...group('x', ['a', 'b']), body: 'bad\0message' }]]) assert.throws(() => app.parseCommitBatchResult(JSON.stringify({ ...valid, groups }), ['a', 'b']));
});

test('AI planning uses the configured adapter, full manifest and bounded excerpts without executing Git', async () => {
  let sent;
  globalThis.__batchAiRequest = async (_config, messages, options) => { sent = { messages, options }; return JSON.stringify({ summary: 'One cohesive feature', groups: [group('feat: coherent', ['a'])] }); };
  const result = await app.analyzeCommitBatch({ files: [{ path: 'a' }], context: 'ALL FILES: ["a"]\nDIFF +change', truncated: true }, { provider: 'openai-compatible', apiKey: 'test', model: 'test' }, 'zh', new AbortController().signal);
  assert.equal(result.groups.length, 1); assert.match(sent.messages[0].content, /keep implementation|keep implementation/i); assert.match(sent.messages[0].content, /truncated=true/); assert.match(sent.messages[1].content, /ALL FILES/);
  const controller = new AbortController(); controller.abort(); await assert.rejects(app.analyzeCommitBatch({}, { provider: 'openai-compatible', apiKey: 'test' }, 'zh', controller.signal), { name: 'AbortError' });
});

test('AI cancellation returns promptly even when the provider ignores its signal', async () => {
  globalThis.__batchAiRequest = () => new Promise(() => {});
  const controller = new AbortController();
  const result = app.analyzeCommitBatch({ files: [{ path: 'a' }], context: 'changes', truncated: false }, { provider: 'openai-compatible', apiKey: 'test' }, 'zh', controller.signal);
  controller.abort();
  await assert.rejects(result, { name: 'AbortError' });
});

test('AI planning times out at the relay deadline with a timeout message instead of user cancellation', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  globalThis.__batchAiRequest = () => new Promise(() => {});
  const result = app.analyzeCommitBatch({ files: [{ path: 'a' }], context: 'changes', truncated: false }, { provider: 'openai-compatible', apiKey: 'test' }, 'zh', new AbortController().signal);
  const rejected = assert.rejects(result, /60 秒|60 seconds/);
  context.mock.timers.tick(60000);
  await rejected;
  context.mock.timers.reset();
});

const text = node => typeof node === 'string' ? node : Array.isArray(node) ? node.map(text).join('') : node?.props ? text(node.props.children) : '';
const button = (renderer, label) => renderer.root.findAllByType('button').find(value => text(value) === label);

test('planning progress distinguishes file collection, model waiting and completed stage timings', async () => {
  const now = Date.now(); let renderer;
  try {
    await act(async () => { renderer = create(React.createElement(app.CommitPlanningProgress, { phase: 'collecting', progress: { stage: 'reading', completed: 2, total: 5 }, timing: { startedAt: now } })); });
    assert.equal(renderer.root.findByType('progress').props.value, 2);
    assert.equal(renderer.root.findByType('progress').props.max, 5);
    assert.match(JSON.stringify(renderer.toJSON()), /正在读取当前变更/);
    await act(async () => renderer.update(React.createElement(app.CommitPlanningProgress, { phase: 'analyzing', progress: { stage: 'checking', completed: 5, total: 5 }, timing: { startedAt: now - 13000, collectedAt: now - 12000 } })));
    assert.match(JSON.stringify(renderer.toJSON()), /等待模型返回完整方案/);
    assert.equal(renderer.root.findAllByType('progress').length, 0);
    await act(async () => renderer.update(React.createElement(app.CommitPlanningProgress, { phase: 'review', progress: { stage: 'checking', completed: 5, total: 5 }, timing: { startedAt: 1000, collectedAt: 2250, finishedAt: 5250 } })));
    const result = renderer.root.findAllByType('p').map(text).join(' ');
    assert.match(result, /读取变更 1.3s/); assert.match(result, /AI 分析 3.0s/);
  } finally { if (renderer) act(() => renderer.unmount()); }
});

async function uiFixture() {
  const originals = { capture: app.commitBatchService.capture, execute: app.commitBatchService.execute, status: app.gitService.getStatus, push: app.gitService.push, context: app.gitService.getPushContext, refresh: app.useRepoStore.getState().refreshAll, config: app.useSettingsStore.getState().aiConfig };
  const plan = { repoPath: '/batch-ui', branch: 'main', head: 'before', files: [{ path: 'a' }, { path: 'b' }], skipped: [], context: 'working changes', truncated: false };
  app.useRepoStore.setState({ currentRepo: { path: '/batch-ui', currentBranch: 'main' }, status: { currentBranch: 'main' }, refreshAll: async () => {} });
  app.useSettingsStore.setState({ aiConfig: { ...originals.config, provider: 'openai-compatible', apiKey: 'test', model: 'test' } });
  app.commitBatchService.capture = async () => plan;
  globalThis.__batchAiRequest = async () => JSON.stringify({ summary: 'Two independent changes', groups: [group('feat: a', ['a']), group('docs: b', ['b'])] });
  app.gitService.getStatus = async () => ({ currentBranch: 'main', headOid: 'after' });
  app.gitService.getPushContext = async () => ({ remotes: [] });
  let renderer; await act(async () => { renderer = create(React.createElement(app.AiCommitBatchDialog, { repoPath: '/batch-ui', branch: 'main', onClose() {}, onOpenAiSettings() {} })); });
  return { renderer, async cleanup() { await act(async () => { renderer.unmount(); app.useRemoteDialogStore.getState().settle(null); }); app.commitBatchService.capture = originals.capture; app.commitBatchService.execute = originals.execute; app.gitService.getStatus = originals.status; app.gitService.push = originals.push; app.gitService.getPushContext = originals.context; app.useRepoStore.setState({ currentRepo: null, refreshAll: originals.refresh }); app.useSettingsStore.setState({ aiConfig: originals.config }); } };
}

test('preview supports editing messages, file reassignment and merging without committing before confirmation', async () => {
  const fixture = await uiFixture(), { renderer } = fixture; let executed;
  app.commitBatchService.execute = async (_plan, groups, options) => { executed = groups; const completed = [{ hash: 'after', title: groups[0].title, files: ['a', 'b'] }]; options.onProgress(completed); return { completed }; };
  try {
    assert.equal(executed, undefined);
    await act(async () => renderer.root.findAllByType('input')[0].props.onChange({ target: { value: 'feat: edited' } }));
    await act(async () => renderer.root.findAllByType('textarea')[0].props.onChange({ target: { value: 'Edited rationale' } }));
    await act(async () => renderer.root.findAllByType('select')[1].props.onChange({ target: { value: '0' } }));
    assert.equal(button(renderer, '确认创建 2 个提交').props.disabled, true);
    await act(async () => button(renderer, '移除空分组').props.onClick());
    await act(async () => button(renderer, '确认创建 1 个提交').props.onClick());
    assert.equal(executed[0].title, 'feat: edited'); assert.equal(executed[0].body, 'Edited rationale'); assert.deepEqual(executed[0].files, ['a', 'b']);
    assert.match(JSON.stringify(renderer.toJSON()), /已创建 1 个提交/);
  } finally { await fixture.cleanup(); }
});

test('cancelling destination creates no commits; failed push retries only push and never duplicates commits', async () => {
  const fixture = await uiFixture(), { renderer } = fixture; let executions = 0, pushes = 0;
  app.commitBatchService.execute = async (_plan, groups) => { executions++; return { completed: groups.map((value, i) => ({ hash: i ? 'after' : 'first', title: value.title, files: value.files })) }; };
  app.gitService.push = async () => { if (++pushes === 1) throw Error('network unavailable'); return {}; };
  try {
    let pending; await act(async () => { pending = button(renderer, '创建提交并推送…').props.onClick(); });
    await act(async () => app.useRemoteDialogStore.getState().settle(null)); await pending; assert.equal(executions, 0);
    await act(async () => { pending = button(renderer, '创建提交并推送…').props.onClick(); });
    await act(async () => app.useRemoteDialogStore.getState().settle({ remote: 'origin', branch: 'main', targetBranch: 'review/main' })); await pending;
    assert.equal(executions, 1); assert.equal(pushes, 1); assert.match(JSON.stringify(renderer.toJSON()), /提交已完成，但推送失败/);
    await act(async () => { button(renderer, '重试推送').props.onClick(); button(renderer, '重试推送').props.onClick(); });
    assert.equal(executions, 1); assert.equal(pushes, 2); assert.match(JSON.stringify(renderer.toJSON()), /全部提交已推送/);
  } finally { await fixture.cleanup(); }
});

test('batch execution displays completed commits and the current group while later checks are still running', async () => {
  const fixture = await uiFixture(), { renderer } = fixture, gate = deferred();
  const first = { hash: 'first', title: 'feat: a', files: ['a'] };
  app.commitBatchService.execute = async (_plan, _groups, options) => { options.onProgress([first]); return gate.promise; };
  try {
    await act(async () => button(renderer, '确认创建 2 个提交').props.onClick());
    const preview = JSON.stringify(renderer.toJSON());
    assert.match(preview, /正在执行提交 2 \/ 2/); assert.match(preview, /已创建 1 个提交/);
    assert.match(preview, /每个提交都会执行仓库配置的检查和签名/);
    assert.match(preview, /first/); assert.equal(button(renderer, '关闭').props.disabled, true);
    await act(async () => gate.resolve({ completed: [first, { hash: 'after', title: 'docs: b', files: ['b'] }] }));
    assert.match(JSON.stringify(renderer.toJSON()), /已创建 2 个提交/);
  } finally { gate.resolve({ completed: [first] }); await fixture.cleanup(); }
});

test('partial commit failures display completed results and cannot reexecute the stale plan', async () => {
  const fixture = await uiFixture(), { renderer } = fixture;
  app.commitBatchService.execute = async () => { throw new app.CommitBatchError('hook rejected', [{ hash: 'first', title: 'feat: a', files: ['a'] }], 'refs/recovery'); };
  try {
    await act(async () => button(renderer, '确认创建 2 个提交').props.onClick());
    assert.match(JSON.stringify(renderer.toJSON()), /执行已停止，已完成 1 个提交/);
    assert.equal(button(renderer, '确认创建 2 个提交'), undefined); assert.ok(button(renderer, '重新分析当前变更'));
  } finally { await fixture.cleanup(); }
});
