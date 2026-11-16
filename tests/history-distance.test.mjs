// 提交详情「距 tag 距离」与文件历史分页测试：
// 1. getCommitDistance：有 tag 仓库解析出 <tag>-<N>-g<hash>，tag 提交本身距离 0；
//    无 tag 仓库（--always 纯 hash）返回 null；
// 2. getCommitsForFile：--skip 分页取窗、超出末页返回空、fromHash 把回看范围限定到
//    该提交可达的历史。
// 策略面见 repo-tools-policy.test.mjs（describe 门）。
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
let temporary, server, base, app, originalFetch;
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
before(async () => {
  temporary = await fs.mkdtemp(path.join(root, '.test-tmp-history-distance-'));
  const bundle = path.join(temporary, 'helpers.cjs');
  await build({ stdin: { contents: `export { gitService } from './src/services/git/GitService';`, resolveDir: root }, bundle: true, platform: 'node', format: 'cjs', outfile: bundle, alias: { '@': path.join(root, 'src') }, logLevel: 'silent' });
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
  if (temporary && path.dirname(temporary) === root && path.basename(temporary).startsWith('.test-tmp-history-distance-')) await fs.rm(temporary, { recursive: true, force: true });
});

const makeRepo = async (name) => {
  const repository = path.join(temporary, name);
  await fs.mkdir(repository, { recursive: true });
  const git = (...args) => execFileSync('git', args, { cwd: repository, windowsHide: true, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  git('init', '-b', 'main');
  git('config', 'user.name', 'Distance Test');
  git('config', 'user.email', 'distance@example.invalid');
  git('config', 'core.autocrlf', 'false');
  return { repository, git };
};

test('getCommitDistance resolves the tag and distance, and returns null without tags', async () => {
  const { repository, git } = await makeRepo('tagged');
  const hashes = [];
  for (let index = 1; index <= 3; index++) {
    await fs.writeFile(path.join(repository, 'file.txt'), `v${index}\n`);
    git('add', '--', 'file.txt');
    git('commit', '-m', `commit ${index}`);
    hashes.push(git('rev-parse', 'HEAD').trim());
  }
  git('tag', 'v1.0.0', hashes[1]);
  const service = app.gitService;
  // HEAD 在 tag 之后 1 个提交；tag 提交本身距离 0。
  assert.deepEqual(await service.getCommitDistance(repository, hashes[2]), { tag: 'v1.0.0', distance: 1 });
  assert.deepEqual(await service.getCommitDistance(repository, hashes[1]), { tag: 'v1.0.0', distance: 0 });
  // tag 之前的提交不在 tag「之后」，describe 解析不出 N-g 形态 → null。
  assert.equal(await service.getCommitDistance(repository, hashes[0]), null);
});

test('getCommitDistance returns null on repositories without any tag', async () => {
  const { repository, git } = await makeRepo('untagged');
  await fs.writeFile(path.join(repository, 'file.txt'), 'v1\n');
  git('add', '--', 'file.txt');
  git('commit', '-m', 'commit 1');
  const hash = git('rev-parse', 'HEAD').trim();
  assert.equal(await app.gitService.getCommitDistance(repository, hash), null);
});

test('getCommitsForFile pages with growing windows and limits traversal with fromHash', async () => {
  const { repository, git } = await makeRepo('file-history');
  const hashes = [];
  for (let index = 1; index <= 5; index++) {
    await fs.writeFile(path.join(repository, 'tracked.txt'), `v${index}\n`);
    git('add', '--', 'tracked.txt');
    git('commit', '-m', `touch tracked ${index}`);
    hashes.push(git('rev-parse', 'HEAD').trim());
  }
  // 混入无关提交：--follow 下 --skip 会在过滤前的流上计数错位，分页必须走窗口递增。
  await fs.writeFile(path.join(repository, 'other.txt'), 'x\n');
  git('add', '--', 'other.txt');
  git('commit', '-m', 'unrelated');
  const service = app.gitService;
  const page0 = await service.getCommitsForFile(repository, 'tracked.txt', 2, { page: 0 });
  assert.equal(page0.length, 2);
  assert.equal(page0[0].hash, hashes[4]);
  // 窗口递增：page 1 取前 4 条，调用方切尾段得 [2..4)。
  const page1 = await service.getCommitsForFile(repository, 'tracked.txt', 2, { page: 1 });
  assert.equal(page1.length, 4);
  assert.equal(page1[0].hash, hashes[4]);
  assert.equal(page1[2].hash, hashes[2]);
  // 越过末页：整窗等于仓库内该文件全部历史（5 条）。
  const pageBeyond = await service.getCommitsForFile(repository, 'tracked.txt', 2, { page: 5 });
  assert.equal(pageBeyond.length, 5);
  // fromHash：只回看该提交可达的历史（3 条，不含其后 2 次修改）。
  const limited = await service.getCommitsForFile(repository, 'tracked.txt', 100, { fromHash: hashes[2] });
  assert.equal(limited.length, 3);
  assert.equal(limited[0].hash, hashes[2]);
});
