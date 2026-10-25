// 提交签名面板测试：
// 1. 服务配置流（dev server 真实 git）：status 初始为空 → enable 写 gpg.format=ssh +
//    user.signingkey + commit.gpgsign=true（git config 逐一断言）→ 无密钥时 enable 拒绝 →
//    disable 置 false 且保留密钥配置；
// 2. 端点级：gpg.program / gpg.ssh.program 写入被策略拒绝（任意可执行文件执行面），
//    gpg.format=x509 拒绝、=ssh 放行；
// 3. 桌面专属命令守卫：非 Tauri 环境下 listPublicKeys/generateKey/detectKeygen 抛错
//    （面板降级为手动输入而不是崩溃）。
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { createServer } from 'vite';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const headers = { 'Content-Type': 'application/json', 'X-AuuGit-Request': '1' };
let temporary, server, base, app, originalFetch;
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
before(async () => {
  temporary = await fs.mkdtemp(path.join(root, '.test-tmp-signing-'));
  const bundle = path.join(temporary, 'helpers.cjs');
  await build({ stdin: { contents: `export { signingService } from './src/services/git/SigningService';`, resolveDir: root }, bundle: true, platform: 'node', format: 'cjs', outfile: bundle, alias: { '@': path.join(root, 'src') }, logLevel: 'silent' });
  app = createRequire(import.meta.url)(bundle);
  server = await createServer({ configFile: path.join(root, 'vite.config.ts'), server: { host: '127.0.0.1', port: 0, strictPort: false, watch: null } });
  await server.listen();
  base = `http://127.0.0.1:${server.httpServer.address().port}`;
  originalFetch = globalThis.fetch;
  globalThis.fetch = (input, init) => {
    const url = typeof input === 'string' && input.startsWith('/') ? base + input : input;
    return originalFetch(url, init);
  };
});
after(async () => {
  if (originalFetch) globalThis.fetch = originalFetch;
  await server?.close();
  if (temporary && path.dirname(temporary) === root && path.basename(temporary).startsWith('.test-tmp-signing-')) {
    await fs.rm(temporary, { recursive: true, force: true });
  }
});
const post = (endpoint, data) => fetch(base + '/api/' + endpoint, { method: 'POST', headers, body: JSON.stringify(data) });

test('signing service round-trips repo configuration through real git', async () => {
  const repository = path.join(temporary, 'signing-repo');
  await fs.mkdir(repository, { recursive: true });
  const git = (...args) => execFileSync('git', ['-c', 'user.name=AuuGit Test', '-c', 'user.email=test@example.invalid', '-C', repository, ...args]);
  git('init', '-q', '-b', 'main');
  await fs.writeFile(path.join(repository, 'readme.md'), '# signing\n');
  git('add', '.');
  git('commit', '-q', '-m', 'init');

  // 初始：全部未配置。
  const initial = await app.signingService.status(repository);
  assert.equal(initial.signingKey, '');
  assert.equal(initial.commitSign, false);
  assert.equal(initial.format, '');

  // 无密钥时启用被拒（避免 git 回落到 gpg 程序的非 SSH 语义）。
  await assert.rejects(() => app.signingService.enable(repository, '  '), /密钥|key/i);

  // 启用：三件套落盘并可用 git config 读回。
  await app.signingService.enable(repository, 'C:/keys/auugit.pub');
  assert.equal(git('config', '--local', '--get', 'gpg.format').toString().trim(), 'ssh');
  assert.equal(git('config', '--local', '--get', 'user.signingkey').toString().trim(), 'C:/keys/auugit.pub');
  assert.equal(git('config', '--local', '--get', 'commit.gpgsign').toString().trim(), 'true');
  const enabled = await app.signingService.status(repository);
  assert.equal(enabled.commitSign, true);
  assert.equal(enabled.format, 'ssh');

  // 停用：仅 commit.gpgsign=false，密钥配置保留。
  await app.signingService.disable(repository);
  const disabled = await app.signingService.status(repository);
  assert.equal(disabled.commitSign, false);
  assert.equal(disabled.signingKey, 'C:/keys/auugit.pub');
});

test('development git endpoint never allows gpg executable configuration', async () => {
  const repository = path.join(temporary, 'policy-repo');
  await fs.mkdir(repository, { recursive: true });
  execFileSync('git', ['-C', repository, 'init', '-q', '-b', 'main']);
  for (const args of [
    ['config', '--local', 'gpg.program', 'C:/evil/signer.exe'],
    ['config', '--local', 'gpg.ssh.program', 'C:/evil/ssh.exe'],
    ['config', '--local', 'gpg.format', 'x509'],
    ['config', '--local', 'commit.gpgsign', 'yes'],
  ]) {
    const response = await post('git', { args, cwd: repository });
    assert.equal(response.status, 400, JSON.stringify(args));
  }
  for (const args of [
    ['config', '--local', 'gpg.format', 'ssh'],
    ['config', '--local', 'commit.gpgsign', 'false'],
    ['config', '--local', 'user.signingkey', '~/.ssh/id_ed25519.pub'],
  ]) {
    const response = await post('git', { args, cwd: repository });
    assert.equal(response.status, 200, JSON.stringify(args));
  }
});

test('desktop-only ssh key commands reject outside the desktop runtime', async () => {
  // Node 测试环境没有 __TAURI_INTERNALS__：桌面专属命令必须显式抛错（面板据此降级），
  // 而不是静默成功或不可读崩溃。
  await assert.rejects(() => app.signingService.detectKeygen(), /desktop/i);
  await assert.rejects(() => app.signingService.listPublicKeys(), /desktop/i);
  await assert.rejects(() => app.signingService.generateKey('k', 'c'), /desktop/i);
});
