// 子模块面板测试：
// 1. 纯函数：parseSubmoduleStatus 的各前缀/描述/CRLF/空输出/垃圾行行为；
// 2. 端点级：dev server /api/git 放行 status/add、拒绝 foreach/summary（任意 shell 执行
//    与摘要面在策略层永久封禁）；
// 3. 真实仓库全流程：child + main 两个仓库，add（本地路径源与 clone 同构授权）→
//    status 解析 → deinit → status 显示未初始化；
// 4. 行为锁定：update --init 对本地路径子模块被默认传输白名单拒绝（v1 fail-closed
//    决策——远程 https 子模块不受影响）。
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { createServer } from 'vite';
import { retryDevFetch } from './dev-fetch-retry.mjs';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const headers = { 'Content-Type': 'application/json', 'X-AuuGit-Request': '1' };
let temporary, server, base, app, originalFetch;
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
before(async () => {
  temporary = await fs.mkdtemp(path.join(root, '.test-tmp-submodules-'));
  const bundle = path.join(temporary, 'helpers.cjs');
  await build({ stdin: { contents: `export * from './scripts/git-policy'; export { submoduleService, parseSubmoduleStatus } from './src/services/git/SubmoduleService';`, resolveDir: root }, bundle: true, platform: 'node', format: 'cjs', outfile: bundle, alias: { '@': path.join(root, 'src') }, logLevel: 'silent' });
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
  if (temporary && path.dirname(temporary) === root && path.basename(temporary).startsWith('.test-tmp-submodules-')) {
    await fs.rm(temporary, { recursive: true, force: true });
  }
});
const post = (endpoint, data) => fetch(base + '/api/' + endpoint, { method: 'POST', headers, body: JSON.stringify(data) });

test('parseSubmoduleStatus handles prefixes, describe, CRLF and rejects garbage', () => {
  assert.deepEqual(app.parseSubmoduleStatus(''), []);
  const entries = app.parseSubmoduleStatus(
    [
      ' 0123456789abcdef0123456789abcdef01234567 dep-a (v1.2.3)',
      '-0123456789abcdef0123456789abcdef01234567 dep-b',
      '+fedcba9876543210fedcba9876543210fedcba98 dep-c (heads/main)',
      'Ufedcba9876543210fedcba9876543210fedcba98 dep-d',
    ].join('\r\n') + '\r\n',
  );
  assert.equal(entries.length, 4);
  assert.deepEqual(entries[0], { status: 'initialized', sha: '0123456789abcdef0123456789abcdef01234567', path: 'dep-a', describe: 'v1.2.3' });
  assert.equal(entries[1].status, 'uninitialized');
  assert.equal(entries[1].describe, '');
  assert.equal(entries[2].status, 'modified');
  assert.equal(entries[2].describe, 'heads/main');
  assert.equal(entries[3].status, 'conflict');
  // 短 sha（git status -- 8 位形态）同样接受；垃圾行 fail closed。
  assert.equal(app.parseSubmoduleStatus(' 01234567 short-dep')[0].sha, '01234567');
  assert.throws(() => app.parseSubmoduleStatus('not a submodule line'));
  assert.throws(() => app.parseSubmoduleStatus('Z0123456789abcdef0123456789abcdef01234567 dep'));
});

test('development git endpoint gates submodule execution vectors', async () => {
  const repository = path.join(temporary, 'policy-repo');
  await fs.mkdir(repository, { recursive: true });
  execFileSync('git', ['-C', repository, 'init', '-q', '-b', 'main']);
  for (const args of [
    ['submodule', 'foreach', 'pwd'],
    ['submodule', 'summary'],
    ['submodule', 'absorbgitdirs'],
    ['submodule', 'add', '--reference', 'C:/outside', 'url', 'dep'],
  ]) {
    const response = await post('git', { args, cwd: repository });
    assert.equal(response.status, 400, JSON.stringify(args));
  }
  const ok = await post('git', { args: ['submodule', 'status'], cwd: repository });
  assert.equal(ok.status, 200);
});

test('submodule service round-trips add, status, deinit on a real repository', async () => {
  const git = (cwd, ...args) => execFileSync('git', ['-c', 'user.name=AuuGit Test', '-c', 'user.email=test@example.invalid', '-C', cwd, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
  const child = path.join(temporary, 'child');
  const main = path.join(temporary, 'main');
  await fs.mkdir(child, { recursive: true });
  await fs.mkdir(main, { recursive: true });
  git(child, 'init', '-q', '-b', 'main');
  await fs.writeFile(path.join(child, 'lib.txt'), 'hello\n');
  git(child, 'add', '.');
  git(child, 'commit', '-q', '-m', 'child commit');
  const childSha = git(child, 'rev-parse', 'HEAD').toString().trim();
  git(main, 'init', '-q', '-b', 'main');
  await fs.writeFile(path.join(main, 'readme.md'), '# main\n');
  git(main, 'add', '.');
  git(main, 'commit', '-q', '-m', 'main commit');

  // 添加：本地路径源与 clone 源同构（授权范围内放行本地传输）。
  await app.submoduleService.add(main, { url: child, path: 'dep' });
  let entries = await app.submoduleService.list(main);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].path, 'dep');
  assert.equal(entries[0].sha, childSha);
  assert.equal(entries[0].status, 'initialized');

  // 取消初始化：工作区内容移除，登记保留（状态前缀 - ）。
  await app.submoduleService.deinit(main, 'dep');
  entries = await app.submoduleService.list(main);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].status, 'uninitialized');

  // deinit 保留 .git/modules 数据：update --init 从本地 module 数据恢复检出（无传输）。
  await app.submoduleService.updateInit(main);
  entries = await app.submoduleService.list(main);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].status, 'initialized');
  assert.equal(entries[0].sha, childSha);
});

test('submodule service validates add inputs before touching git', async () => {
  const main = path.join(temporary, 'main');
  await assert.rejects(() => app.submoduleService.add(main, { url: '  ', path: 'dep' }), /请填写|required/i);
  await assert.rejects(() => app.submoduleService.add(main, { url: 'https://example.invalid/x.git', path: '' }), /请填写|required/i);
  // 路径不允许选项形态、绝对路径与 .. 上溯（双保险：策略层同样拒绝）。
  await assert.rejects(() => app.submoduleService.add(main, { url: 'https://example.invalid/x.git', path: '--upload-pack=evil' }));
  await assert.rejects(() => app.submoduleService.add(main, { url: 'https://example.invalid/x.git', path: 'a/../..\\b' }));
});
