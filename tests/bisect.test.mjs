// 可视化 Bisect 向导测试：
// 1. 策略镜像：run/replay/visualize 等子命令与选项走私被 validateGitArguments 拒绝；
// 2. 端点级：dev server /api/git 同样拒绝（与 src-tauri 共用同一镜像）；
// 3. 真实仓库全流程：10 个提交、已知坏点，向导语义的 mark 循环命中预期 first bad，
//    reset 后 BISECT_LOG 消失、bisect log 失效；
// 4. 未授权路径（授权根之外）的 bisect 命令拒绝。
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { createServer } from 'vite';
import { retryDevFetch } from './dev-fetch-retry.mjs';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const headers = { 'Content-Type': 'application/json', 'X-AuuGit-Request': '1' };
let temporary, outside, server, base, app, originalFetch;
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
before(async () => {
  temporary = await fs.mkdtemp(path.join(root, '.test-tmp-bisect-'));
  outside = await fs.mkdtemp(path.join(os.tmpdir(), 'auugit-outside-'));
  const bundle = path.join(temporary, 'helpers.cjs');
  await build({ stdin: { contents: `export * from './scripts/git-policy'; export { bisectService } from './src/services/git/BisectService'; export { gitService } from './src/services/git/GitService';`, resolveDir: root }, bundle: true, platform: 'node', format: 'cjs', outfile: bundle, alias: { '@': path.join(root, 'src') }, logLevel: 'silent' });
  app = createRequire(import.meta.url)(bundle);
  server = await createServer({ configFile: path.join(root, 'vite.config.ts'), server: { host: '127.0.0.1', port: 0, strictPort: false, watch: null } });
  await server.listen();
  base = `http://127.0.0.1:${server.httpServer.address().port}`;
  // 服务层走浏览器语义的相对路径 fetch('/api/git')；Node 里没有文档 base URL，这里补一层。
  originalFetch = globalThis.fetch;
  const retriedFetch = retryDevFetch(originalFetch);
  globalThis.fetch = (input, init) => {
    const url = typeof input === 'string' && input.startsWith('/') ? base + input : input;
    return retriedFetch(url, init);
  };
});
after(async () => {
  if (originalFetch) globalThis.fetch = originalFetch;
  await server?.close();
  if (temporary && path.dirname(temporary) === root && path.basename(temporary).startsWith('.test-tmp-bisect-')) await fs.rm(temporary, { recursive: true, force: true });
  if (outside && path.dirname(outside) === os.tmpdir() && path.basename(outside).startsWith('auugit-outside-')) await fs.rm(outside, { recursive: true, force: true });
});
const post = (endpoint, data) => fetch(base + '/api/' + endpoint, { method: 'POST', headers, body: JSON.stringify(data) });

test('bisect policy gate rejects run/replay/visualize and option smuggling, allows the wizard subcommands', () => {
  const rejected = [
    ['bisect'], ['bisect', 'help'],
    // run 会执行任意命令、replay 会读取外部文件、visualize/view 会拉起图形或 pager。
    ['bisect', 'run', 'make'], ['bisect', 'run'],
    ['bisect', 'replay', 'log.txt'], ['bisect', 'visualize'], ['bisect', 'visualize', '--', 'HEAD'],
    ['bisect', 'view', 'HEAD'],
    // 未列出的子命令 fail closed；--term-* 等选项与 blocked 选项走私一律拒绝。
    ['bisect', 'start', '--term-new=broken', 'HEAD'],
    ['bisect', 'start', '--term-old=works', 'HEAD', 'HEAD~5'],
    ['bisect', 'bad', '--term-good=x'], ['bisect', 'good', '-P', 'rev'],
    ['bisect', 'log', '--output=evil'], ['bisect', 'reset', '-q', '--foo'],
  ];
  for (const args of rejected) assert.throws(() => app.validateGitArguments(args), undefined, JSON.stringify(args));
  const hash = 'a'.repeat(40);
  for (const args of [
    ['bisect', 'start', hash, 'HEAD~9'],
    ['bisect', 'start', 'HEAD', 'HEAD~3', '--', 'src/'],
    ['bisect', 'bad'], ['bisect', 'good', hash], ['bisect', 'new', 'HEAD'], ['bisect', 'old', hash],
    ['bisect', 'skip', hash], ['bisect', 'skip', '--', hash],
    ['bisect', 'reset'], ['bisect', 'log'], ['bisect', 'terms'],
  ]) assert.doesNotThrow(() => app.validateGitArguments(args), JSON.stringify(args));
});

test('development git endpoint rejects bisect execution vectors and unauthorized roots', async () => {
  const repository = path.join(temporary, 'policy-repo');
  await fs.mkdir(repository, { recursive: true });
  for (const args of [
    ['bisect', 'run', 'make'],
    ['bisect', 'replay', 'log.txt'],
    ['bisect', 'start', '--term-new=broken', 'HEAD'],
  ]) {
    const response = await post('git', { args, cwd: repository });
    assert.equal(response.status, 400, JSON.stringify(args));
    assert.match((await response.json()).error, /Unsupported|Missing/);
  }
  // 授权根之外的仓库：bisect 命令在端点层拒绝（与其它 git 命令同一边界）。
  const response = await post('git', { args: ['bisect', 'start', 'HEAD', 'HEAD~2'], cwd: outside });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /outside|authorized/i);
});

test('the wizard flow finds the known first bad commit and reset clears the bisect state', async () => {
  const repository = path.join(temporary, 'wizard-repo');
  const git = (...args) => execFileSync('git', args, { cwd: repository, windowsHide: true, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  await fs.mkdir(repository, { recursive: true });
  git('init', '-b', 'main');
  git('config', 'user.name', 'Bisect Test');
  git('config', 'user.email', 'bisect@example.invalid');
  // 10 个提交，第 7 个引入 bug（file.txt 含 "bug"），坏点确定且唯一。
  const BUG_INDEX = 7;
  const hashes = [];
  for (let index = 1; index <= 10; index++) {
    await fs.writeFile(path.join(repository, 'file.txt'), index >= BUG_INDEX ? `v${index} bug\n` : `v${index}\n`);
    git('add', '--', 'file.txt');
    git('commit', '-m', `commit ${index}`);
    hashes.push(git('rev-parse', 'HEAD').trim());
  }
  const service = app.bisectService;

  // 前置校验：好提交必须是坏提交祖先（方向反了拒绝，且不会留下 bisect 状态）；相同引用拒绝。
  await assert.rejects(service.start(repository, hashes[0], hashes[9]), /ancestor|祖先/);
  await assert.rejects(service.start(repository, hashes[0], hashes[0]), /differ|相同/);
  assert.equal(await service.isBisecting(repository), false);

  await service.start(repository, hashes[9], hashes[0]);
  assert.equal(await service.isBisecting(repository), true);
  // start 后已检出首个候选（不再是原分支 HEAD），范围估算为非负整数。
  const stepsAfterStart = await service.stepsRemaining(repository);
  assert.equal(typeof stepsAfterStart, 'number');
  assert.ok(stepsAfterStart >= 0);

  // 向导循环：按候选是否含 bug 决定 good/bad，直至收敛。
  let outcome = null, rounds = 0;
  while (rounds++ < 12) {
    const candidate = await service.currentCandidate(repository);
    const index = hashes.indexOf(candidate);
    assert.ok(index >= 0, `candidate ${candidate} must be one of the built commits`);
    const result = index + 1 >= BUG_INDEX ? await service.markBad(repository) : await service.markGood(repository);
    if (result.finished) { outcome = result; break; }
  }
  assert.ok(outcome?.finished, 'bisect must converge within the round budget');
  assert.equal(outcome.firstBad.hash, hashes[BUG_INDEX - 1]);
  assert.equal(outcome.firstBad.subject, `commit ${BUG_INDEX}`);
  assert.match(outcome.output, /file\.txt/);
  // 收敛但未 reset：git 语义上会话仍存活（BISECT_LOG 保留），日志含机器格式结论。
  assert.equal(await service.isBisecting(repository), true);
  const log = await service.log(repository);
  assert.match(log, new RegExp(`# first '?bad'? commit: \\[${outcome.firstBad.hash}\\]`));
  assert.equal(await service.resultHash(repository), outcome.firstBad.hash);
  // 剩余步数在收敛后为可解析的估算值。
  assert.equal(typeof await service.stepsRemaining(repository), 'number');
  // 结果步骤的变更概要：getCommitFiles 报告引入 bug 的文件。
  const files = await app.gitService.getCommitFiles(repository, outcome.firstBad.hash);
  assert.deepEqual(files.map((file) => file.path), ['file.txt']);

  // reset 后：会话探测失效、日志为空、BISECT_LOG 消失、HEAD 回到原分支。
  await service.reset(repository);
  assert.equal(await service.isBisecting(repository), false);
  assert.equal(await service.log(repository), '');
  assert.equal(await service.resultHash(repository), null);
  assert.equal(await fs.access(path.join(repository, '.git', 'BISECT_LOG')).then(() => true, () => false), false);
  assert.equal(git('rev-parse', '--abbrev-ref', 'HEAD').trim(), 'main');

  // reset 之后再次 mark 会被 git 拒绝（未在 bisect 中），报错经服务层透出。
  await assert.rejects(service.markBad(repository), /first bad commit|not bisecting|bisect/i);
});

test('dirty working tree checkout failure surfaces a readable error without corrupting state', async () => {
  const repository = path.join(temporary, 'dirty-repo');
  const git = (...args) => execFileSync('git', args, { cwd: repository, windowsHide: true, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  await fs.mkdir(repository, { recursive: true });
  git('init', '-b', 'main');
  git('config', 'user.name', 'Bisect Test');
  git('config', 'user.email', 'bisect@example.invalid');
  await fs.writeFile(path.join(repository, 'file.txt'), 'v1\n');
  git('add', '--', 'file.txt');
  git('commit', '-m', 'commit 1');
  await fs.writeFile(path.join(repository, 'file.txt'), 'v2\n');
  git('add', '--', 'file.txt');
  git('commit', '-m', 'commit 2');
  await fs.writeFile(path.join(repository, 'file.txt'), 'v3\n');
  git('add', '--', 'file.txt');
  git('commit', '-m', 'commit 3');
  await fs.writeFile(path.join(repository, 'file.txt'), 'dirty\n');
  // 脏工作区：start 需要真正检出候选（范围跨 2 个提交，候选不是当前 HEAD），
  // git 拒绝切换；服务层尽力清理并透出可读错误。
  await assert.rejects(app.bisectService.start(repository, 'HEAD', 'HEAD~2'), /local changes|会覆盖|需要先提交/i);
  assert.equal(await app.bisectService.isBisecting(repository), false);
  git('checkout', '--', 'file.txt');
});
