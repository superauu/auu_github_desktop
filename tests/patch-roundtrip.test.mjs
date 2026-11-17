// 补丁导出/导入往返测试：
// 1. parseNumstat 纯函数：文本行统计、二进制 '-' 行、重命名路径原样保留；
// 2. 策略面：format-patch 缺 --stdout 在 dev 端点被拒（会落盘的形态绝不放行）；
// 3. 真实仓库往返：format-patch --stdout 导出单提交 → apply --numstat 预览 →
//    apply 应用到干净工作区，内容逐字节一致。
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
  temporary = await fs.mkdtemp(path.join(root, '.test-tmp-patch-'));
  const bundle = path.join(temporary, 'helpers.cjs');
  await build({ stdin: { contents: `export { patchService, parseNumstat } from './src/services/git/PatchService';`, resolveDir: root }, bundle: true, platform: 'node', format: 'cjs', outfile: bundle, alias: { '@': path.join(root, 'src') }, logLevel: 'silent' });
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
  if (temporary && path.dirname(temporary) === root && path.basename(temporary).startsWith('.test-tmp-patch-')) await fs.rm(temporary, { recursive: true, force: true });
});
const post = (endpoint, data) => fetch(base + '/api/' + endpoint, { method: 'POST', headers, body: JSON.stringify(data) });

const makeRepo = async (name) => {
  const repository = path.join(temporary, name);
  await fs.mkdir(repository, { recursive: true });
  const git = (...args) => execFileSync('git', args, { cwd: repository, windowsHide: true, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  git('init', '-b', 'main');
  git('config', 'user.name', 'Patch Roundtrip');
  git('config', 'user.email', 'patch@example.invalid');
  git('config', 'core.autocrlf', 'false');
  return { repository, git };
};

test('parseNumstat reads text and binary lines', () => {
  const preview = app.parseNumstat('3\t1\tsrc/app.ts\n-\t-\tlogo.png\n0\t2\treadme.md\n');
  assert.equal(preview.files.length, 3);
  assert.equal(preview.totalAdditions, 3);
  assert.equal(preview.totalDeletions, 3);
  assert.equal(preview.binaryCount, 1);
  assert.deepEqual(preview.files[1], { file: 'logo.png', additions: null, deletions: null });
  assert.deepEqual(preview.files[2], { file: 'readme.md', additions: 0, deletions: 2 });
});

test('dev endpoint rejects format-patch without --stdout', async () => {
  const repository = path.join(temporary, 'policy');
  await fs.mkdir(repository, { recursive: true });
  const response = await post('git', { args: ['format-patch', '-1', 'HEAD'], cwd: repository });
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /stdout/i);
});

test('export → preview → apply roundtrip reproduces the commit content', async () => {
  const { repository, git } = await makeRepo('roundtrip');
  await fs.writeFile(path.join(repository, 'base.txt'), 'base\n');
  git('add', '--', 'base.txt');
  git('commit', '-m', 'base');
  const patchContent = 'patched line\nsecond line\n';
  await fs.writeFile(path.join(repository, 'base.txt'), `${patchContent}base\n`);
  await fs.writeFile(path.join(repository, 'new.txt'), 'brand new file\n');
  git('add', '--', '.');
  git('commit', '-m', 'patched commit');
  const head = git('rev-parse', 'HEAD').trim();
  const service = app.patchService;

  // 导出（--stdout，不落盘）。
  const patch = await service.exportCommitPatch(repository, head, 1);
  assert.match(patch, /From [0-9a-f]{40}/);
  assert.match(patch, /patched commit/);

  // 预览：2 个文件，base.txt 行首插入两行（+2/-0）、new.txt 新增（+1），共 +3/-0。
  const preview = await service.previewPatch(repository, patch);
  assert.equal(preview.files.length, 2);
  assert.equal(preview.totalAdditions, 3);
  assert.equal(preview.totalDeletions, 0);
  assert.equal(preview.binaryCount, 0);

  // 应用到干净工作区并校验内容。
  const target = path.join(temporary, 'apply-target');
  await fs.mkdir(target, { recursive: true });
  const tgit = (...args) => execFileSync('git', args, { cwd: target, windowsHide: true, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  tgit('init', '-b', 'main');
  tgit('config', 'user.name', 'Patch Target');
  tgit('config', 'user.email', 'patch@example.invalid');
  tgit('config', 'core.autocrlf', 'false');
  await fs.writeFile(path.join(target, 'base.txt'), 'base\n');
  tgit('add', '--', 'base.txt');
  tgit('commit', '-m', 'base');
  await service.applyPatch(target, patch);
  assert.equal(await fs.readFile(path.join(target, 'base.txt'), 'utf8'), `${patchContent}base\n`);
  assert.equal(await fs.readFile(path.join(target, 'new.txt'), 'utf8'), 'brand new file\n');
});
