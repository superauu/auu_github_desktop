/**
 * ImageDiffService：isImagePath 判定 + web 分支 /api/git-image 真实读取
 * （vite dev server + 真实临时 git 仓库），风格同 tests/history-search.test.mjs。
 */
import { before, after, test } from 'node:test';
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
// 1x1 PNG（标准最小图）
const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
let tmp, app, server, index = 0;
const git = (cwd, ...args) => {
  const result = spawnSync('git', ['-c', 'core.quotepath=false', ...args], { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || result.error?.message);
  return result.stdout;
};

before(async () => {
  tmp = await fs.mkdtemp(path.join(root, '.test-imgdiff-'));
  const outfile = path.join(tmp, 'app.cjs');
  await build({ stdin: { contents: `export { readGitImage, isImagePath } from './src/services/git/ImageDiffService';`, resolveDir: root }, bundle: true, platform: 'node', format: 'cjs', outfile, alias: { '@': path.join(root, 'src') }, logLevel: 'silent' });
  app = createRequire(import.meta.url)(outfile);
  server = await createServer({ configFile: path.join(root, 'vite.config.ts'), server: { host: '127.0.0.1', port: 0, strictPort: false, watch: null } });
  await server.listen();
  const base = `http://127.0.0.1:${server.httpServer.address().port}`;
  globalThis.fetch = (url, init) => routedFetch(typeof url === 'string' && url.startsWith('/api/') ? base + url : url, init);
});
after(async () => {
  globalThis.fetch = nativeFetch; await server?.close();
  if (tmp && path.dirname(tmp) === root && path.basename(tmp).startsWith('.test-imgdiff-')) await fs.rm(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 150 });
});

async function fixture({ commitImage = true, worktreeExtra = false } = {}) {
  const repo = path.join(tmp, `repo-${++index}`);
  await fs.mkdir(repo);
  git(repo, 'init', '-b', 'main');
  git(repo, 'config', 'user.name', 'Test'); git(repo, 'config', 'user.email', 'test@example.invalid'); git(repo, 'config', 'core.autocrlf', 'false');
  if (commitImage) {
    await fs.writeFile(path.join(repo, 'logo.png'), Buffer.from(PNG_BASE64, 'base64'));
    git(repo, 'add', '-A'); git(repo, 'commit', '-m', 'add logo');
  }
  if (worktreeExtra) await fs.writeFile(path.join(repo, 'draft.png'), Buffer.from(PNG_BASE64, 'base64'));
  return repo;
}

test('isImagePath 只认内置光栅格式且大小写不敏感', () => {
  for (const hit of ['a.png', 'b.JPG', 'c.jpeg', 'd.jpg', 'e.gif', 'f.webp', 'g.bmp', 'dir/h.png']) assert.equal(app.isImagePath(hit), true, hit);
  for (const miss of ['a.txt', 'a.tiff', 'a.svg', 'a.psd', 'png', 'a.pngx']) assert.equal(app.isImagePath(miss), false, miss);
});

test('已提交图片按 revision 读取为 PNG data URL', async () => {
  const repo = await fixture();
  const head = git(repo, 'rev-parse', 'HEAD').trim();
  const dataUrl = await app.readGitImage(repo, 'logo.png', head);
  assert.match(dataUrl, /^data:image\/png;base64,/);
  const bytes = Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');
  assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], '解码后应保留 PNG 魔数');
});

test('WORKTREE revision 读取未提交的工作区图片', async () => {
  const repo = await fixture({ worktreeExtra: true });
  const dataUrl = await app.readGitImage(repo, 'draft.png', 'WORKTREE');
  assert.match(dataUrl, /^data:image\/png;base64,/);
});

test('版本里不存在的图片返回 null 而不是抛错', async () => {
  const repo = await fixture();
  const head = git(repo, 'rev-parse', 'HEAD').trim();
  assert.equal(await app.readGitImage(repo, 'missing.png', head), null);
});

test('非法 revision 直接抛出服务端错误消息', async () => {
  const repo = await fixture();
  await assert.rejects(() => app.readGitImage(repo, 'logo.png', 'main'), /Invalid image revision|revision/i);
});
