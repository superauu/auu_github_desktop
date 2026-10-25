/**
 * F2 提交历史搜索增强：正则模式（-G）与路径过滤（pathspec）。
 * 真实临时 git 仓库 + esbuild 打包服务层，风格同 tests/branch-safety.test.mjs。
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { createServer } from 'vite';

const root = process.cwd();
const nativeFetch = globalThis.fetch;
globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
let tmp, app, server, index = 0;
const git = (cwd, ...args) => {
  const result = spawnSync('git', ['-c', 'core.quotepath=false', ...args], { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || result.error?.message);
  return result.stdout;
};
async function fixture() {
  const repo = path.join(tmp, `repo-${++index}`); await fs.mkdir(repo);
  git(repo, 'init', '-b', 'main'); git(repo, 'config', 'user.name', 'Test'); git(repo, 'config', 'user.email', 'test@example.invalid'); git(repo, 'config', 'core.autocrlf', 'false');
  await fs.writeFile(path.join(repo, 'a.txt'), 'base\n'); git(repo, 'add', '-A'); git(repo, 'commit', '-m', 'initial');
  return repo;
}
async function change(repo, name, text, message = 'change') {
  const file = path.join(repo, name);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, text); git(repo, 'add', '-A'); git(repo, 'commit', '-m', message);
}
const search = (repo, query, options) => app.historyWorkflowService.searchContents(repo, query, options);
const subjectsOf = (commits) => commits.map(commit => commit.subject).sort();

before(async () => {
  tmp = await fs.mkdtemp(path.join(root, '.test-histsearch-'));
  const outfile = path.join(tmp, 'app.cjs');
  await build({ stdin: { contents: `export { historyWorkflowService } from './src/services/git/HistoryWorkflowService';`, resolveDir: root }, bundle: true, platform: 'node', format: 'cjs', outfile, alias: { '@': path.join(root, 'src') }, logLevel: 'silent' });
  app = createRequire(import.meta.url)(outfile);
  server = await createServer({ configFile: path.join(root, 'vite.config.ts'), server: { host: '127.0.0.1', port: 0, strictPort: false, watch: null } });
  await server.listen();
  const base = `http://127.0.0.1:${server.httpServer.address().port}`;
  globalThis.fetch = (url, init) => nativeFetch(typeof url === 'string' && url.startsWith('/api/') ? base + url : url, init);
});
after(async () => {
  globalThis.fetch = nativeFetch; await server?.close();
  if (tmp && path.dirname(tmp) === root && path.basename(tmp).startsWith('.test-histsearch-')) await fs.rm(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 150 });
});

test('(a) literal search hits exactly the commits that touched the exact string', async () => {
  const repo = await fixture();
  await change(repo, 'src/auth.ts', 'const t = "secret-1";\n', 'auth module');
  await change(repo, 'docs/guide.md', 'documenting secret-1 for reviewers\n', 'docs update');
  await change(repo, 'src/other.ts', 'unrelated change\n', 'unrelated');
  // 两个提交都引入了字面量 "secret-1"（代码与文档），第三个提交没有
  assert.deepEqual(subjectsOf(await search(repo, 'secret-1')), ['auth module', 'docs update']);
  // fixed-strings 语义：字面模式下 `.` 不是通配符，"secret.1" 不存在 → 无结果而非报错
  assert.deepEqual(await search(repo, 'secret.1'), []);
});

test('(b) regex mode matches by pattern and converts illegal patterns into a readable error', async () => {
  const repo = await fixture();
  await change(repo, 'src/one.js', 'callHandler123();\n', 'handler one');
  await change(repo, 'src/two.js', 'callHandler456();\n', 'handler two');
  // 正则模式按模式匹配两处不同编号的调用
  assert.deepEqual(subjectsOf(await search(repo, 'Handler[0-9]+', { regex: true })), ['handler one', 'handler two']);
  // 同样的输入在字面模式下不是任何 diff 的一部分 → 无结果（证明两种模式确实走了不同的 pickaxe）
  assert.deepEqual(await search(repo, 'Handler[0-9]+'), []);
  // 非法正则：git 的 fatal 不再以原始报错透传，而是转成可读英文提示
  await assert.rejects(search(repo, 'Handler[', { regex: true }), /Invalid regular expression/);
  // 同样输入在字面模式下合法，只是无结果
  assert.deepEqual(await search(repo, 'Handler['), []);
});

test('(c) path filter restricts the search to commits touching the given path or directory', async () => {
  const repo = await fixture();
  await change(repo, 'logs/run.log', 'daemonRotate started\n', 'log rotate');
  await change(repo, 'src/daemon.ts', 'if (daemonRotate) reboot();\n', 'daemon fix');
  // 无过滤：两个提交都命中
  assert.deepEqual(subjectsOf(await search(repo, 'daemonRotate')), ['daemon fix', 'log rotate']);
  // 目录 pathspec
  assert.deepEqual(await search(repo, 'daemonRotate', { path: 'src' }).then(subjectsOf), ['daemon fix']);
  // 文件 pathspec
  assert.deepEqual(await search(repo, 'daemonRotate', { path: 'src/daemon.ts' }).then(subjectsOf), ['daemon fix']);
  // 首尾空白被 trim 后视为目录名
  assert.deepEqual(await search(repo, 'daemonRotate', { path: ' logs ' }).then(subjectsOf), ['log rotate']);
  // 正则模式同样支持路径过滤
  assert.deepEqual(await search(repo, 'daemon[A-Za-z]*', { regex: true, path: 'src' }).then(subjectsOf), ['daemon fix']);
  // 空白 pathspec 等价于不过滤
  assert.deepEqual(subjectsOf(await search(repo, 'daemonRotate', { path: '   ' })), ['daemon fix', 'log rotate']);
});

test('(d) pathspecs starting with "-" are rejected before reaching the command line', async () => {
  const repo = await fixture();
  await change(repo, 'src/auth.ts', 'token here\n', 'auth module');
  await assert.rejects(search(repo, 'token', { path: '-src' }), /must not start with/);
  await assert.rejects(search(repo, 'token', { path: '  --all  ' }), /must not start with/);
});

test('(e) legacy call signature (without options) keeps literal behavior', async () => {
  const repo = await fixture();
  await change(repo, 'src/auth.ts', 'const t = "secret-1";\n', 'auth module');
  const legacy = await app.historyWorkflowService.searchContents(repo, 'secret-1');
  assert.equal(legacy.length, 1); assert.equal(legacy[0].subject, 'auth module');
  // 显式空 options 与旧签名结果一致
  const modern = await app.historyWorkflowService.searchContents(repo, 'secret-1', {});
  assert.deepEqual(legacy.map(commit => commit.hash), modern.map(commit => commit.hash));
  // 纯空白查询短路返回空，不发起 git 调用
  assert.deepEqual(await app.historyWorkflowService.searchContents(repo, '   '), []);
});
