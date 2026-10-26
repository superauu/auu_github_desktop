import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { createServer } from 'vite';
import { retryDevFetch } from './dev-fetch-retry.mjs';

const root = process.cwd();
const nativeFetch = globalThis.fetch;
const routedFetch = retryDevFetch(nativeFetch);
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
let tmp, app, server, base, index = 0;
const git = (cwd, ...args) => {
  const result = spawnSync('git', ['-c', 'core.quotepath=false', ...args], { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || result.error?.message);
  return result.stdout;
};
const branch = (name, isRemote = false) => ({ name, isRemote, isCurrent: false });
async function fixture() {
  const repo = path.join(tmp, `repo-${++index}`); await fs.mkdir(repo);
  git(repo, 'init', '-b', 'main'); git(repo, 'config', 'user.name', 'Test'); git(repo, 'config', 'user.email', 'test@example.invalid'); git(repo, 'config', 'core.autocrlf', 'false');
  await fs.writeFile(path.join(repo, 'a.txt'), 'base\n'); git(repo, 'add', '-A'); git(repo, 'commit', '-m', 'initial');
  return repo;
}
async function change(repo, name, text, message = 'change') { await fs.writeFile(path.join(repo, name), text); git(repo, 'add', '-A'); git(repo, 'commit', '-m', message); }
before(async () => {
  tmp = await fs.mkdtemp(path.join(root, '.test-safety-'));
  const outfile = path.join(tmp, 'app.cjs');
  await build({ stdin: { contents: `export * from './src/services/git/BranchSafetyService'; export * from './src/services/ai/AiExplanationService'; export * from './src/services/git/HistoryWorkflowService'; export * from './src/services/git/CommitSplitService'; export * from './src/services/git/LineStagingService'; export * from './src/services/ai/GitAssistantValidation'; export * from './src/services/ai/AiTransport'; export * from './src/services/git/ConflictParser'; export {gitService} from './src/services/git/GitService';`, resolveDir: root }, bundle: true, platform: 'node', format: 'cjs', outfile, alias: { '@': path.join(root, 'src') }, logLevel: 'silent' });
  app = createRequire(import.meta.url)(outfile);
  server = await createServer({ configFile: path.join(root, 'vite.config.ts'), server: { host: '127.0.0.1', port: 0, strictPort: false, watch: null } });
  await server.listen(); base = `http://127.0.0.1:${server.httpServer.address().port}`;
  globalThis.fetch = (url, init) => routedFetch(typeof url === 'string' && url.startsWith('/api/') ? base + url : url, init);
});
after(async () => {
  globalThis.fetch = nativeFetch; await server?.close();
  if (tmp && path.dirname(tmp) === root && path.basename(tmp).startsWith('.test-safety-')) await fs.rm(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 150 });
});

test('fast-forward preview leaves HEAD, index and working tree unchanged; merge saves a persistent recovery ref', async () => {
  const repo = await fixture(); const initial = git(repo, 'rev-parse', 'HEAD').trim();
  git(repo, 'config', 'merge.ff', 'false');
  git(repo, 'switch', '-c', 'feature/login'); await change(repo, 'login.txt', 'login\n'); git(repo, 'switch', 'main');
  const preview = await app.branchSafetyService.preview(repo, branch('feature/login'), branch('main'));
  assert.equal(preview.sourceOnly, 1); assert.equal(preview.targetOnly, 0); assert.equal(preview.conflictCheck, 'clean'); assert.deepEqual(preview.files, ['login.txt']);
  assert.equal(git(repo, 'rev-parse', 'HEAD').trim(), initial); assert.equal(git(repo, 'status', '--porcelain'), '');
  await app.branchSafetyService.execute(preview, 'merge');
  assert.equal(git(repo, 'rev-parse', 'HEAD').trim(), preview.sourceHash);
  const [point] = await app.branchSafetyService.list(repo);
  assert.equal(point.hash, initial); assert.equal(point.branch, 'main'); assert.equal(point.operation, 'merge');
  assert.equal(git(repo, 'show', point.ref + ':a.txt'), 'base\n');
});

test('merge conflict preview reports exact paths and failed merge retains the recovery point', async () => {
  const repo = await fixture(); const name = 'space 名称.txt'; await change(repo, name, 'base\n');
  git(repo, 'switch', '-c', 'topic'); await change(repo, name, 'topic\n');
  git(repo, 'switch', 'main'); await change(repo, name, 'main\n');
  const before = git(repo, 'rev-parse', 'HEAD').trim();
  const preview = await app.branchSafetyService.preview(repo, branch('topic'), branch('main'));
  assert.equal(preview.conflictCheck, 'conflicts'); assert.deepEqual(preview.conflicts, [name]);
  assert.equal(git(repo, 'status', '--porcelain'), '');
  await assert.rejects(app.branchSafetyService.execute(preview, 'merge'));
  assert.equal((await app.branchSafetyService.list(repo))[0].hash, before);
  await assert.rejects(app.branchSafetyService.create(repo));
  git(repo, 'merge', '--abort');
});

test('stale previews and untracked work are rejected before switching branch or saving a point', async () => {
  const repo = await fixture(); git(repo, 'branch', 'topic');
  const preview = await app.branchSafetyService.preview(repo, branch('topic'), branch('main'));
  await change(repo, 'a.txt', 'new\n');
  await assert.rejects(app.branchSafetyService.execute(preview, 'merge'), /刷新|Refresh/);
  const fresh = await app.branchSafetyService.preview(repo, branch('main'), branch('topic'));
  await fs.writeFile(path.join(repo, 'untracked.txt'), 'precious\n');
  await assert.rejects(app.branchSafetyService.execute(fresh, 'merge'), /Stash|stash/);
  assert.equal(git(repo, 'branch', '--show-current').trim(), 'main'); assert.equal((await app.branchSafetyService.list(repo)).length, 0);
});

test('restore saves the current commit and rejects dirty work, wrong branch and a changed HEAD', async () => {
  const repo = await fixture(); await app.branchSafetyService.create(repo); const [point] = await app.branchSafetyService.list(repo);
  await change(repo, 'a.txt', 'second\n'); const current = git(repo, 'rev-parse', 'HEAD').trim();
  await fs.writeFile(path.join(repo, 'a.txt'), 'unsaved\n');
  await assert.rejects(app.branchSafetyService.restore(repo, point, current)); assert.equal(await fs.readFile(path.join(repo, 'a.txt'), 'utf8'), 'unsaved\n');
  git(repo, 'restore', 'a.txt');
  await assert.rejects(app.branchSafetyService.restore(repo, point, point.hash));
  git(repo, 'switch', '-c', 'other'); await assert.rejects(app.branchSafetyService.restore(repo, point, current)); git(repo, 'switch', 'main');
  await app.branchSafetyService.restore(repo, point, current);
  assert.equal(git(repo, 'rev-parse', 'HEAD').trim(), point.hash); assert.equal(await fs.readFile(path.join(repo, 'a.txt'), 'utf8'), 'base\n');
  const backup = (await app.branchSafetyService.list(repo)).find(value => value.operation === 'restore');
  assert.equal(backup.hash, current);
  await app.branchSafetyService.restore(repo, backup, point.hash); assert.equal(git(repo, 'rev-parse', 'HEAD').trim(), current);
});

test('remote destinations are rejected and a remote source can merge into a local branch', async () => {
  const repo = await fixture(); git(repo, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
  const preview = await app.branchSafetyService.preview(repo, branch('main'), branch('origin/main', true));
  await assert.rejects(app.branchSafetyService.execute(preview, 'merge'), /本地|local/);
  const inverse = await app.branchSafetyService.preview(repo, branch('origin/main', true), branch('main'));
  await app.branchSafetyService.execute(inverse, 'merge'); assert.equal((await app.branchSafetyService.list(repo)).length, 1);
});

test('ordinary merge options retain the previewed no-fast-forward behavior and custom message', async () => {
  const repo = await fixture(); git(repo, 'switch', '-c', 'topic'); await change(repo, 'topic.txt', 'topic\n'); git(repo, 'switch', 'main');
  const preview = await app.branchSafetyService.preview(repo, branch('topic'), branch('main'));
  await app.branchSafetyService.execute(preview, 'merge', { noFf: true, message: 'reviewed merge message' });
  assert.equal(git(repo, 'log', '-1', '--format=%s').trim(), 'reviewed merge message');
  assert.equal(git(repo, 'log', '-1', '--format=%P').trim().split(' ').length, 2);
});

test('rebase-source moves the source and saves its original commit; occupied worktrees are protected', async () => {
  const repo = await fixture(); git(repo, 'switch', '-c', 'topic'); await change(repo, 'topic.txt', 'topic\n'); const original = git(repo, 'rev-parse', 'HEAD').trim();
  git(repo, 'switch', 'main'); await change(repo, 'main.txt', 'main\n');
  const preview = await app.branchSafetyService.preview(repo, branch('topic'), branch('main'));
  git(repo, 'branch', 'keep-original', original); git(repo, 'config', 'rebase.updateRefs', 'true');
  await app.branchSafetyService.execute(preview, 'rebase-source');
  assert.equal(git(repo, 'rev-parse', 'keep-original').trim(), original);
  assert.equal(git(repo, 'branch', '--show-current').trim(), 'topic'); assert.notEqual(git(repo, 'rev-parse', 'HEAD').trim(), original);
  assert.equal((await app.branchSafetyService.list(repo))[0].hash, original);
  const linked = path.join(tmp, 'linked'); git(repo, 'worktree', 'add', linked, 'main');
  const occupied = await app.branchSafetyService.preview(repo, branch('topic'), branch('main'));
  await assert.rejects(app.branchSafetyService.execute(occupied, 'merge'));
  assert.equal(git(repo, 'branch', '--show-current').trim(), 'topic'); git(repo, 'worktree', 'remove', linked);
});

test('explanation context uses immutable commits, caps content and does not call an AI provider', async () => {
  const repo = await fixture(); await change(repo, 'large.txt', 'evidence\n'.repeat(4000));
  const hash = git(repo, 'rev-parse', 'HEAD').trim();
  const context = await app.collectExplanation(repo, { kind: 'commit', hash });
  assert.equal(context.text.length, 16000); assert.equal(context.truncated, true); assert.match(context.text, /large.txt/); assert.match(context.text, /evidence/);
  const branchContext = await app.collectExplanation(repo, { kind: 'branch', base: 'HEAD~1', head: 'HEAD' }); assert.match(branchContext.text, new RegExp(hash));
  await assert.rejects(app.explainChanges(context, { provider: 'builtin', apiKey: '', endpoint: '', model: '' }, 'en', new AbortController().signal));
});

test('AI explanation sends only the inspected context, handles cancellation and rejects empty responses', async () => {
  const transport = globalThis.fetch; const config = { provider: 'openai-compatible', apiKey: 'test-only', endpoint: 'https://example.invalid/v1', model: 'test-model' };
  let sent;
  globalThis.fetch = async (url, init) => { sent = JSON.parse(init.body); return new Response(JSON.stringify({ choices: [{ message: { content: 'Observed changes' } }] })); };
  try {
    assert.equal(await app.explainChanges({ text: 'inspected diff', truncated: false }, config, 'en', new AbortController().signal), 'Observed changes');
    assert.match(sent.messages[1].content, /inspected diff/); assert.equal(sent.model, 'test-model');
    const abort = new AbortController(); abort.abort(); await assert.rejects(app.explainChanges({ text: '', truncated: false }, config, 'en', abort.signal), { name: 'AbortError' });
    globalThis.fetch = async () => new Response(JSON.stringify({ choices: [] }));
    await assert.rejects(app.explainChanges({ text: 'diff', truncated: false }, config, 'en', new AbortController().signal));
  } finally { globalThis.fetch = transport; }
});

test('visual history editor squashes commits with a recovery point and preserves files', async () => {
  const repo = await fixture(); await change(repo, 'one.txt', 'one\n', 'first feature'); await change(repo, 'two.txt', 'two\n', 'second feature');
  const before = git(repo, 'rev-parse', 'HEAD').trim(); const plan = await app.historyWorkflowService.plan(repo, 2);
  await app.historyWorkflowService.rewrite(repo, plan, plan.commits.map((commit, i) => ({ hash: commit.hash, action: i ? 'squash' : 'pick' })));
  assert.equal(git(repo, 'rev-list', '--count', 'HEAD').trim(), '2');
  assert.equal(git(repo, 'show', 'HEAD:one.txt'), 'one\n'); assert.equal(git(repo, 'show', 'HEAD:two.txt'), 'two\n');
  assert.match(git(repo, 'log', '-1', '--format=%B'), /first feature/); assert.match(git(repo, 'log', '-1', '--format=%B'), /second feature/);
  assert.equal((await app.branchSafetyService.list(repo))[0].hash, before);
});

test('history editor supports reorder and fixup, rejects published commits and malformed plans', async () => {
  const repo = await fixture(); await change(repo, 'one.txt', 'one\n', 'one'); await change(repo, 'two.txt', 'two\n', 'two'); await change(repo, 'three.txt', 'three\n', 'three');
  const plan = await app.historyWorkflowService.plan(repo, 3);
  await assert.rejects(app.historyWorkflowService.rewrite(repo, plan, [{ hash: plan.head, action: 'pick' }]));
  git(repo, 'update-ref', 'refs/remotes/origin/main', plan.head);
  await assert.rejects(app.historyWorkflowService.rewrite(repo, plan, plan.commits.map(commit => ({ hash: commit.hash, action: 'pick' }))), /远程|remote/);
  git(repo, 'update-ref', '-d', 'refs/remotes/origin/main');
  const reversed = [...plan.commits].reverse();
  await app.historyWorkflowService.rewrite(repo, plan, reversed.map((commit, index) => ({ hash: commit.hash, action: index === 1 ? 'fixup' : 'pick' })));
  assert.equal(git(repo, 'log', '-1', '--format=%s').trim(), 'one'); assert.equal(git(repo, 'rev-list', '--count', 'HEAD').trim(), '3');
});

test('reword rewrites one message and preserves the rest of the history', async () => {
  const repo = await fixture(); await change(repo, 'one.txt', 'one\n', 'one'); await change(repo, 'two.txt', 'two\n', 'two'); await change(repo, 'three.txt', 'three\n', 'three');
  const plan = await app.historyWorkflowService.plan(repo, 3);
  assert.equal(plan.published, false);
  await app.historyWorkflowService.rewrite(repo, plan, plan.commits.map(commit => commit.subject === 'two'
    ? { hash: commit.hash, action: 'reword', message: 'two (rewritten)\n\nnew body' }
    : { hash: commit.hash, action: 'pick' }));
  assert.deepEqual(git(repo, 'log', '--format=%s', '--reverse').trim().split(/\r?\n/), ['initial', 'one', 'two (rewritten)', 'three']);
  assert.match(git(repo, 'log', '--reverse', '--format=%B').trim(), /new body/);
  assert.equal(git(repo, 'rev-list', '--count', 'HEAD').trim(), '4');
  assert.equal(git(repo, 'show', 'HEAD:one.txt'), 'one\n'); assert.equal(git(repo, 'show', 'HEAD:three.txt'), 'three\n');
  assert.equal(git(repo, 'branch', '--show-current').trim(), 'main');
  assert.equal(git(repo, 'status', '--porcelain').trim(), '');
});

test('drop removes a commit with its changes; mixed loop keeps remaining content', async () => {
  const repo = await fixture(); await change(repo, 'one.txt', 'one\n', 'one'); await change(repo, 'two.txt', 'two\n', 'two'); await change(repo, 'three.txt', 'three\n', 'three');
  const plan = await app.historyWorkflowService.plan(repo, 3);
  const two = plan.commits.find(commit => commit.subject === 'two');
  await app.historyWorkflowService.rewrite(repo, plan, plan.commits.map(commit => commit.hash === two.hash ? { hash: commit.hash, action: 'drop' } : { hash: commit.hash, action: 'pick' }));
  assert.deepEqual(git(repo, 'log', '--format=%s', '--reverse').trim().split(/\r?\n/), ['initial', 'one', 'three']);
  assert.equal(git(repo, 'rev-list', '--count', 'HEAD').trim(), '3');
  assert.throws(() => git(repo, 'show', 'HEAD:two.txt'));
  assert.equal(git(repo, 'show', 'HEAD:three.txt'), 'three\n');
  assert.equal(git(repo, 'branch', '--show-current').trim(), 'main');
});

test('loop path rejects squash-first plans and reword without a usable message', async () => {
  const repo = await fixture(); await change(repo, 'one.txt', 'one\n', 'one'); await change(repo, 'two.txt', 'two\n', 'two');
  const plan = await app.historyWorkflowService.plan(repo, 2);
  const steps = plan.commits.map(commit => ({ hash: commit.hash, action: commit === plan.commits[0] ? 'reword' : 'pick' }));
  steps[0].message = '   ';
  await assert.rejects(app.historyWorkflowService.rewrite(repo, plan, steps));
  steps[0] = { hash: steps[0].hash, action: 'squash' };
  await assert.rejects(app.historyWorkflowService.rewrite(repo, plan, steps));
  steps[0] = { hash: steps[0].hash, action: 'reword', message: '-looks-like-an-option' };
  await assert.rejects(app.historyWorkflowService.rewrite(repo, plan, steps));
  // 失败重放不破坏现场：分支仍在原提交上、无 cherry-pick 残留
  assert.equal(git(repo, 'branch', '--show-current').trim(), 'main');
  assert.equal(git(repo, 'status', '--porcelain').trim(), '');
});

test('a conflicting replay is aborted and the branch is restored to its original head', async () => {
  const repo = await fixture();
  await change(repo, 'base.txt', 'base\n', 'base');
  await change(repo, 'one.txt', 'one\n', 'one');            // 创建 one.txt
  await change(repo, 'one.txt', 'one\ntwo\n', 'two');       // 基于其上的追加——丢弃创建提交后必然冲突
  const plan = await app.historyWorkflowService.plan(repo, 2);
  const original = git(repo, 'rev-parse', 'HEAD').trim();
  const steps = plan.commits.map(commit => commit.subject === 'one' ? { hash: commit.hash, action: 'drop' } : { hash: commit.hash, action: 'pick' });
  await assert.rejects(app.historyWorkflowService.rewrite(repo, plan, steps));
  assert.equal(git(repo, 'rev-parse', 'HEAD').trim(), original);
  assert.equal(git(repo, 'branch', '--show-current').trim(), 'main');
  assert.equal(git(repo, 'status', '--porcelain').trim(), '');
  let cherryPickHead = '';
  try { cherryPickHead = git(repo, 'rev-parse', '-q', '--verify', 'CHERRY_PICK_HEAD').trim(); } catch { /* 已随中止清理 */ }
  assert.equal(cherryPickHead, '');
});

test('reflog recovery finds deleted branch commits and never overwrites an existing branch', async () => {
  const repo = await fixture(); git(repo, 'switch', '-c', 'lost'); await change(repo, 'lost.txt', 'recover me\n'); const hash = git(repo, 'rev-parse', 'HEAD').trim();
  git(repo, 'switch', 'main'); git(repo, 'branch', '-D', 'lost');
  const entries = await app.historyWorkflowService.reflog(repo); assert.ok(entries.some(entry => entry.hash === hash));
  const diff = await app.historyWorkflowService.compare(repo, hash); assert.match(diff.text, /recover me/);
  await fs.writeFile(path.join(repo, 'a.txt'), 'unsaved\n');
  await app.historyWorkflowService.recoverBranch(repo, hash, 'recovered/lost');
  assert.equal(git(repo, 'rev-parse', 'recovered/lost').trim(), hash); assert.equal(git(repo, 'branch', '--show-current').trim(), 'main');
  await assert.rejects(app.historyWorkflowService.recoverBranch(repo, diff.head, 'recovered/lost'));
  assert.equal(await fs.readFile(path.join(repo, 'a.txt'), 'utf8'), 'unsaved\n');
});

test('content search finds code changes without matching commit metadata', async () => {
  const repo = await fixture(); await change(repo, 'code.txt', 'uniqueLoginToken\n', 'unrelated title');
  const matches = await app.historyWorkflowService.searchContents(repo, 'uniqueLoginToken'); assert.equal(matches.length, 1); assert.equal(matches[0].subject, 'unrelated title');
});

test('split planner stages only a chosen group and refuses stale file contents or existing staging', async () => {
  globalThis.navigator = { userAgent: 'Windows' };
  const repo = await fixture(); await fs.writeFile(path.join(repo, 'a.txt'), 'changed\n'); await fs.writeFile(path.join(repo, 'guide.md'), '# guide\n');
  let plan = await app.commitSplitService.plan(repo); assert.equal(plan.files.length, 2);
  await fs.writeFile(path.join(repo, 'guide.md'), '# changed after preview\n');
  await assert.rejects(app.commitSplitService.stageGroup(repo, plan, ['guide.md']), /刷新|Refresh/);
  plan = await app.commitSplitService.plan(repo); await app.commitSplitService.stageGroup(repo, plan, ['guide.md']);
  assert.equal(git(repo, 'diff', '--cached', '--name-only').trim(), 'guide.md'); assert.match(git(repo, 'diff'), /changed/);
  await assert.rejects(app.commitSplitService.plan(repo), /暂存|staged/);
});

test('line staging and unstaging preserve unselected changes across multiple hunks', async () => {
  const repo = await fixture(); await change(repo, 'a.txt', Array.from({ length: 30 }, (_, i) => `line ${i}`).join('\n') + '\n');
  const working = Array.from({ length: 30 }, (_, i) => i === 1 ? 'first edit  ' : i === 26 ? 'second edit' : `line ${i}`).join('\n') + '\n';
  await fs.writeFile(path.join(repo, 'a.txt'), working);
  let lines = await app.gitService.getFileDiff(repo, 'a.txt');
  const picked = new Set(lines.flatMap((line, index) => (line.content === '-line 1' || line.content === '+first edit  ') ? [index] : []));
  await app.stageSelectedLines(repo, 'a.txt', lines, picked);
  assert.match(git(repo, 'show', ':a.txt'), /first edit {2}/); assert.doesNotMatch(git(repo, 'show', ':a.txt'), /second edit/);
  assert.equal(await fs.readFile(path.join(repo, 'a.txt'), 'utf8'), working);
  lines = await app.gitService.getFileDiff(repo, 'a.txt', true);
  await app.stageSelectedLines(repo, 'a.txt', lines, new Set(lines.flatMap((line, i) => line.type === 'add' || line.type === 'delete' ? [i] : [])), true);
  assert.equal(git(repo, 'diff', '--cached'), ''); assert.equal(await fs.readFile(path.join(repo, 'a.txt'), 'utf8'), working);
});

test('selecting one added line and stale line selections are handled without staging other edits', async () => {
  const repo = await fixture(); await fs.writeFile(path.join(repo, 'a.txt'), 'base\nadd one\nadd two\n');
  const lines = await app.gitService.getFileDiff(repo, 'a.txt');
  await app.stageSelectedLines(repo, 'a.txt', lines, new Set([lines.findIndex(line => line.content === '+add two')]));
  assert.equal(git(repo, 'show', ':a.txt'), 'base\nadd two\n');
  await assert.rejects(app.stageSelectedLines(repo, 'a.txt', lines, new Set([1])), /刷新|Refresh/);
});

test('line staging applies multiple selected hunks together and preserves missing final newlines', async () => {
  const repo = await fixture(); const original = Array.from({ length: 30 }, (_, i) => `old ${i}`).join('\n') + '\n';
  await change(repo, 'a.txt', original);
  const updated = original.replace('old 1\n', 'new first\n').replace('old 26\n', 'new last\n'); await fs.writeFile(path.join(repo, 'a.txt'), updated);
  let lines = await app.gitService.getFileDiff(repo, 'a.txt');
  await app.stageSelectedLines(repo, 'a.txt', lines, new Set(lines.flatMap((line, i) => line.type === 'add' || line.type === 'delete' ? [i] : [])));
  assert.equal(git(repo, 'show', ':a.txt'), updated);
  git(repo, 'commit', '-m', 'both hunks');
  await fs.writeFile(path.join(repo, 'a.txt'), updated.trimEnd());
  lines = await app.gitService.getFileDiff(repo, 'a.txt');
  await app.stageSelectedLines(repo, 'a.txt', lines, new Set(lines.flatMap((line, i) => line.type === 'add' || line.type === 'delete' ? [i] : [])));
  assert.equal(git(repo, 'show', ':a.txt'), updated.trimEnd());
});

test('line and hunk staging preserve CRLF content when Git autocrlf is disabled', async () => {
  const repo = await fixture(); await change(repo, 'a.txt', 'first\r\nsecond\r\nthird\r\n');
  await fs.writeFile(path.join(repo, 'a.txt'), 'first\r\nsecond\r\ninserted\r\nthird\r\n');
  let lines = await app.gitService.getFileDiff(repo, 'a.txt');
  await app.stageSelectedLines(repo, 'a.txt', lines, new Set([lines.findIndex(line => line.content === '+inserted')]));
  assert.equal(git(repo, 'show', ':a.txt'), 'first\r\nsecond\r\ninserted\r\nthird\r\n');
  lines = await app.gitService.getFileDiff(repo, 'a.txt', true);
  await app.stageSelectedLines(repo, 'a.txt', lines, new Set([lines.findIndex(line => line.type === 'add')]), true);
  assert.equal(git(repo, 'diff', '--cached'), '');
  await app.gitService.stageHunk(repo, 'a.txt', lines);
  assert.equal(git(repo, 'show', ':a.txt'), 'first\r\nsecond\r\ninserted\r\nthird\r\n');
});

test('AI structured results reject unknown/duplicate paths and marker-filled conflict resolutions', () => {
  assert.deepEqual(app.parseCommitGroups('{"groups":[{"title":"fix: a","files":["a"]}]}', ['a']), [{ title: 'fix: a', files: ['a'] }]);
  assert.throws(() => app.parseCommitGroups('{"groups":[{"title":"a","files":["secret"]}]}', ['a']));
  assert.throws(() => app.parseCommitGroups('{"groups":[{"title":"a","files":["a","a"]}]}', ['a']));
  assert.throws(() => app.parseConflictSuggestion('{"explanation":"bad","resolution":"<<<<<<< HEAD"}'));
  const text = 'before\r\n<<<<<<< HEAD\r\na\r\n=======\r\nb\r\n>>>>>>> branch\r\nafter\r\n';
  assert.equal(app.resolveSingleBlock(text, 0, 'custom', 'resolved'), 'before\r\nresolved\r\nafter\r\n');
  assert.match(app.diagnoseGitError('non-fast-forward'), /远端|remote/);
});

test('conflict resolution rewrites only the block span and preserves mixed line endings', () => {
  // CRLF 文件中的冲突块由 git 以 LF 写入：块外字节必须逐字保留，替换行使用块自身的行尾。
  const mixed = 'before\r\n<<<<<<< HEAD\nours\n=======\ntheirs\n>>>>>>> topic\r\nafter\r\ntail\n';
  assert.equal(app.resolveSingleBlock(mixed, 0, 'current'), 'before\r\nours\r\nafter\r\ntail\n');
  // 多块文件：只重写目标块，其余块（含不同行尾）与未涉及行保持原样。
  const two = 'a\r\n<<<<<<< x\none\n=======\ntwo\n>>>>>>> y\r\nb\n<<<<<<< p\r\nthree\r\n=======\nfour\r\n>>>>>>> q\nz\n';
  assert.equal(
    app.resolveSingleBlock(two, 1, 'incoming'),
    'a\r\n<<<<<<< x\none\n=======\ntwo\n>>>>>>> y\r\nb\nfour\nz\n'
  );
  // 块内多行替换沿用块的行尾风格；both 合并的两半之间也一致。
  assert.equal(app.resolveSingleBlock(mixed, 0, 'both'), 'before\r\nours\ntheirs\r\nafter\r\ntail\n');
  // 块结尾没有换行（EOF）时不补换行；空解析移除整块且不留下空行。
  const eof = 'keep\r\n<<<<<<< a\nx\n=======\ny\n>>>>>>> b';
  assert.equal(app.resolveSingleBlock(eof, 0, 'incoming'), 'keep\r\ny');
  assert.equal(app.resolveSingleBlock(eof, 0, 'custom', ''), 'keep\r\n');
});

test('native-style AI waits cancel promptly without waiting for the provider', async () => {
  const abort = new AbortController(); let finish;
  const pending = new Promise(resolve => { finish = resolve; });
  const waiting = app.awaitAiResponse(pending, abort.signal); abort.abort();
  await assert.rejects(waiting, { name: 'AbortError' }); finish('late response');
});

test('image endpoint preserves exact binary data, reads index versions and rejects traversal and oversized images', async () => {
  const repo = await fixture();
  const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN6kAAAAASUVORK5CYII=', 'base64');
  await fs.writeFile(path.join(repo, 'pixel.png'), bytes); git(repo, 'add', '-A'); git(repo, 'commit', '-m', 'image');
  const read = (filePath, revision) => globalThis.fetch('/api/git-image', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-AuuGit-Request': '1' }, body: JSON.stringify({ repoPath: repo, filePath, revision, gitBinary: 'git' }) });
  const result = await read('pixel.png', 'INDEX'); assert.equal(result.status, 200); assert.equal((await result.json()).dataUrl, `data:image/png;base64,${bytes.toString('base64')}`);
  const missing = await read('absent.png', 'WORKTREE'); assert.equal((await missing.json()).dataUrl, null);
  assert.equal((await read('../outside.png', 'WORKTREE')).status, 400);
  await fs.writeFile(path.join(repo, 'large.png'), Buffer.alloc(8 * 1024 * 1024 + 1)); assert.equal((await read('large.png', 'WORKTREE')).status, 400);
});

test('named recovery points persist locally and renaming never changes the saved commit or dirty work', async () => {
  const repo = await fixture(); const head = git(repo, 'rev-parse', 'HEAD').trim();
  await app.branchSafetyService.create(repo, '登录模块重构前');
  let [point] = await app.branchSafetyService.list(repo);
  assert.equal(point.name, '登录模块重构前'); assert.equal(point.hash, head);
  const key = `auugit.recovery-${point.ref.split('/')[3]}.name`;
  assert.equal(git(repo, 'config', '--local', '--get', key).trim(), point.name);
  await fs.writeFile(path.join(repo, 'a.txt'), 'staged\n'); git(repo, 'add', 'a.txt');
  await fs.writeFile(path.join(repo, 'a.txt'), 'unsaved\n');
  const indexBefore = git(repo, 'ls-files', '--stage');
  const refsBefore = git(repo, 'show-ref');
  await app.branchSafetyService.rename(repo, point, '--global');
  [point] = await app.branchSafetyService.list(repo);
  assert.equal(point.name, '--global'); assert.equal(point.hash, head);
  assert.equal(git(repo, 'config', '--get', 'user.name').trim(), 'Test');
  assert.equal(git(repo, 'show-ref'), refsBefore); assert.equal(git(repo, 'ls-files', '--stage'), indexBefore);
  assert.equal(await fs.readFile(path.join(repo, 'a.txt'), 'utf8'), 'unsaved\n');
  await app.branchSafetyService.rename(repo, point, '  ');
  assert.equal((await app.branchSafetyService.list(repo))[0].name, undefined);
  assert.equal(git(repo, 'rev-parse', point.ref).trim(), head);
});

test('deleting one recovery point preserves other points, commits, branch, index, and uncommitted files', async () => {
  const repo = await fixture(); const head = git(repo, 'rev-parse', 'HEAD').trim();
  await app.branchSafetyService.create(repo, 'keep'); await app.branchSafetyService.create(repo, 'delete');
  const points = await app.branchSafetyService.list(repo), target = points.find(point => point.name === 'delete');
  await fs.writeFile(path.join(repo, 'a.txt'), 'staged\n'); git(repo, 'add', 'a.txt');
  await fs.writeFile(path.join(repo, 'a.txt'), 'working\n'); await fs.writeFile(path.join(repo, 'untracked.txt'), 'untracked\n');
  const status = git(repo, 'status', '--porcelain=v2', '-z'), indexBefore = git(repo, 'ls-files', '--stage');
  await app.branchSafetyService.remove(repo, target);
  const remaining = await app.branchSafetyService.list(repo);
  assert.equal(remaining.length, 1); assert.equal(remaining[0].name, 'keep');
  assert.equal(git(repo, 'rev-parse', 'HEAD').trim(), head); assert.equal(git(repo, 'branch', '--show-current').trim(), 'main');
  assert.equal(git(repo, 'status', '--porcelain=v2', '-z'), status); assert.equal(git(repo, 'ls-files', '--stage'), indexBefore);
  assert.equal(await fs.readFile(path.join(repo, 'a.txt'), 'utf8'), 'working\n');
  assert.equal(await fs.readFile(path.join(repo, 'untracked.txt'), 'utf8'), 'untracked\n');
  const result = spawnSync('git', ['config', '--local', '--get', `auugit.recovery-${target.ref.split('/')[3]}.name`], { cwd: repo, encoding: 'utf8' });
  assert.equal(result.status, 1);
});

test('recovery management rejects invalid names, foreign refs, and recovery points changed after listing', async () => {
  const repo = await fixture();
  for (const name of ['x'.repeat(81), 'line\nbreak', 'nul\0name']) await assert.rejects(app.branchSafetyService.create(repo, name));
  assert.equal((await app.branchSafetyService.list(repo)).length, 0);
  await app.branchSafetyService.create(repo);
  const [point] = await app.branchSafetyService.list(repo);
  await assert.rejects(app.branchSafetyService.remove(repo, { ...point, ref: 'refs/heads/main' }));
  await assert.rejects(app.branchSafetyService.rename(repo, { ...point, ref: 'refs/heads/main' }, 'wrong'));
  await change(repo, 'a.txt', 'later\n'); const later = git(repo, 'rev-parse', 'HEAD').trim();
  git(repo, 'update-ref', point.ref, later);
  await assert.rejects(app.branchSafetyService.remove(repo, point));
  await assert.rejects(app.branchSafetyService.rename(repo, point, 'stale'));
  assert.equal(git(repo, 'rev-parse', point.ref).trim(), later); assert.equal(git(repo, 'rev-parse', 'HEAD').trim(), later);
});

test('recovery names are shared across linked worktrees and remain compatible with restore', async () => {
  const repo = await fixture(); await app.branchSafetyService.create(repo, 'before changes');
  const [point] = await app.branchSafetyService.list(repo);
  const linked = path.join(tmp, `named-linked-${index}`); git(repo, 'worktree', 'add', '-b', 'linked', linked);
  assert.equal((await app.branchSafetyService.list(linked))[0].name, 'before changes');
  await app.branchSafetyService.rename(linked, point, '共享名称');
  assert.equal((await app.branchSafetyService.list(repo))[0].name, '共享名称');
  await change(repo, 'a.txt', 'later\n'); const later = git(repo, 'rev-parse', 'HEAD').trim();
  await app.branchSafetyService.restore(repo, point, later);
  assert.equal(git(repo, 'rev-parse', 'HEAD').trim(), point.hash);
  assert.ok((await app.branchSafetyService.list(repo)).some(saved => saved.operation === 'restore' && saved.hash === later));
});

test('recovery deletion refuses a ref changed between validation and compare-and-delete', async () => {
  const repo = await fixture(); await app.branchSafetyService.create(repo, 'race guard');
  const [point] = await app.branchSafetyService.list(repo);
  await change(repo, 'a.txt', 'newer\n'); const later = git(repo, 'rev-parse', 'HEAD').trim();
  const previousFetch = globalThis.fetch; let raced = false;
  globalThis.fetch = (url, init) => {
    const data = typeof url === 'string' && url === '/api/git' && init?.body ? JSON.parse(init.body) : null;
    if (data?.cwd === repo && data.args.includes('update-ref') && data.args.includes('-d')) {
      raced = true; git(repo, 'update-ref', point.ref, later);
    }
    return previousFetch(url, init);
  };
  try {
    await assert.rejects(app.branchSafetyService.remove(repo, point));
    assert.equal(raced, true); assert.equal(git(repo, 'rev-parse', point.ref).trim(), later);
    assert.equal((await app.branchSafetyService.list(repo))[0].name, 'race guard');
  } finally { globalThis.fetch = previousFetch; }
});

test('deleting a symbolic recovery ref never deletes its target branch', async () => {
  const repo = await fixture(); const head = git(repo, 'rev-parse', 'HEAD').trim();
  const ref = 'refs/auugit/recovery/123-abc/manual/main';
  git(repo, 'symbolic-ref', ref, 'refs/heads/main');
  const [point] = await app.branchSafetyService.list(repo);
  assert.equal(point.ref, ref); assert.equal(point.hash, head);
  await app.branchSafetyService.remove(repo, point);
  assert.equal(git(repo, 'rev-parse', 'refs/heads/main').trim(), head);
  assert.equal(git(repo, 'rev-parse', 'HEAD').trim(), head);
  assert.equal((await app.branchSafetyService.list(repo)).length, 0);
});
