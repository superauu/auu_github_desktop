// 仓库统计面板数据测试：shortlog 贡献榜与 count-objects 对象统计（真仓库）。
// 策略面见 repo-tools-policy.test.mjs（shortlog/count-objects 门）。
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
  temporary = await fs.mkdtemp(path.join(root, '.test-tmp-repo-stats-'));
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
  if (temporary && path.dirname(temporary) === root && path.basename(temporary).startsWith('.test-tmp-repo-stats-')) await fs.rm(temporary, { recursive: true, force: true });
});

test('getShortlog ranks authors by commits excluding merges and getRepoStats parses -vH keys', async () => {
  const repository = path.join(temporary, 'stats');
  await fs.mkdir(repository, { recursive: true });
  const git = (args, env) => execFileSync('git', args, { cwd: repository, windowsHide: true, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...env } });
  git(['init', '-b', 'main']);
  git(['config', 'user.name', 'Alpha']);
  git(['config', 'user.email', 'alpha@example.invalid']);
  const commit = async (name, email, message) => {
    await fs.writeFile(path.join(repository, `f-${message.replace(/\s+/g, '-')}.txt`), `${message}\n`);
    git(['add', '--', '.']);
    git(['commit', '-m', message], { GIT_AUTHOR_NAME: name, GIT_AUTHOR_EMAIL: email, GIT_COMMITTER_NAME: name, GIT_COMMITTER_EMAIL: email });
  };
  await commit('Alpha', 'alpha@example.invalid', 'work one');
  await commit('Beta', 'beta@example.invalid', 'work two');
  await commit('Alpha', 'alpha@example.invalid', 'work three');
  // 分支上的合并提交不应计入 --no-merges 统计。
  git(['checkout', '-b', 'side']);
  await commit('Gamma', 'gamma@example.invalid', 'side work');
  git(['checkout', 'main']);
  git(['merge', '--no-ff', '--no-edit', 'side']);
  const service = app.gitService;

  const contributors = await service.getShortlog(repository);
  // --no-merges 只排除合并提交本身；被合并分支的提交从 HEAD 可达，照常计入（产品语义：
  // 贡献榜 = 当前分支全部历史）。
  assert.deepEqual(contributors.map(entry => entry.name), ['Alpha', 'Beta', 'Gamma']);
  assert.equal(contributors[0].commits, 2);
  assert.equal(contributors[1].commits, 1);

  // 限制条数。
  const limited = await service.getShortlog(repository, 1);
  assert.equal(limited.length, 1);
  assert.equal(limited[0].name, 'Alpha');

  const stats = await service.getRepoStats(repository);
  assert.ok(stats, 'count-objects -vH should return key/values');
  assert.ok(stats['count'], 'loose object count present');
  assert.ok(stats['in-pack'], 'packed object count present');
  assert.match(stats['size-pack'] ?? stats['size'] ?? '', /\S/);
});
