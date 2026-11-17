// 全局代码搜索（git grep）测试：
// 1. 策略面在 repo-tools-policy.test.mjs（grep 门）；此处测 dev 端点同样拒绝走私形态；
// 2. 真实仓库：字面与 -i 检索、-- pathspec 过滤、正则、无命中退出码 1 归一为空结果；
// 3. parseGrepOutput 纯函数：file:line:col:text 解析、文件名含冒号、截断上限。
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
  temporary = await fs.mkdtemp(path.join(root, '.test-tmp-code-search-'));
  outside = await fs.mkdtemp(path.join(os.tmpdir(), 'auugit-outside-'));
  const bundle = path.join(temporary, 'helpers.cjs');
  await build({ stdin: { contents: `export { codeSearchService, parseGrepOutput, MAX_HITS } from './src/services/git/CodeSearchService';`, resolveDir: root }, bundle: true, platform: 'node', format: 'cjs', outfile: bundle, alias: { '@': path.join(root, 'src') }, logLevel: 'silent' });
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
  if (temporary && path.dirname(temporary) === root && path.basename(temporary).startsWith('.test-tmp-code-search-')) await fs.rm(temporary, { recursive: true, force: true });
  if (outside && path.dirname(outside) === os.tmpdir() && path.basename(outside).startsWith('auugit-outside-')) await fs.rm(outside, { recursive: true, force: true });
});
const post = (endpoint, data) => fetch(base + '/api/' + endpoint, { method: 'POST', headers, body: JSON.stringify(data) });

const makeRepo = async (name) => {
  const repository = path.join(temporary, name);
  await fs.mkdir(repository, { recursive: true });
  const git = (...args) => execFileSync('git', args, { cwd: repository, windowsHide: true, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  git('init', '-b', 'main');
  git('config', 'user.name', 'Code Search');
  git('config', 'user.email', 'grep@example.invalid');
  git('config', 'core.autocrlf', 'false');
  return { repository, git };
};

test('dev git endpoint rejects grep smuggling vectors', async () => {
  for (const args of [['grep', '-f', 'patterns.txt'], ['grep', '--open-files-in-pager', 'x'], ['grep'], ['grep', 'a', 'b']]) {
    const response = await post('git', { args, cwd: temporary });
    assert.equal(response.status, 400, JSON.stringify(args));
  }
  // 授权根之外的仓库在端点层拒绝。
  const response = await post('git', { args: ['grep', '-n', '--column', '-I', 'x'], cwd: outside });
  assert.equal(response.status, 400);
});

test('grepRepo finds literal and case-insensitive matches, honors pathspecs, and normalizes no-match', async () => {
  const { repository, git } = await makeRepo('repo');
  await fs.mkdir(path.join(repository, 'src'), { recursive: true });
  await fs.mkdir(path.join(repository, 'docs'), { recursive: true });
  await fs.writeFile(path.join(repository, 'src', 'app.ts'), 'const value = 1; // TODO fix\nexport const done = true;\n');
  await fs.writeFile(path.join(repository, 'docs', 'readme.md'), 'TODO write docs\n');
  git('add', '--', '.');
  git('commit', '-m', 'seed');
  const service = app.codeSearchService;

  const literal = await service.grepRepo(repository, 'TODO');
  assert.equal(literal.hits.length, 2);
  assert.equal(literal.truncated, false);
  assert.deepEqual(literal.hits.map(hit => hit.file).sort(), ['docs/readme.md', 'src/app.ts']);
  assert.equal(literal.hits.find(hit => hit.file === 'src/app.ts').line, 1);

  // 字面检索不做正则解释（点号按字面）。
  const dot = await service.grepRepo(repository, 'export const done = true;');
  assert.equal(dot.hits.length, 1);
  assert.equal(dot.hits[0].file, 'src/app.ts');

  // pathspec 过滤。
  const onlyDocs = await service.grepRepo(repository, 'TODO', { pathspecs: ['docs'] });
  assert.equal(onlyDocs.hits.length, 1);
  assert.equal(onlyDocs.hits[0].file, 'docs/readme.md');

  // 大小写不敏感。
  const lower = await service.grepRepo(repository, 'todo fix', { ignoreCase: true });
  assert.equal(lower.hits.length, 1);

  // 无命中：git 以退出码 1 结束，归一为空结果。
  const none = await service.grepRepo(repository, 'definitely-not-present-xyz');
  assert.deepEqual(none, { hits: [], truncated: false });

  // 正则模式。
  const ere = await service.grepRepo(repository, 'TODO (fix|write)', { regex: true });
  assert.equal(ere.hits.length, 2);
});

test('parseGrepOutput splits from the right and truncates at the limit', () => {
  const parsed = app.parseGrepOutput('src/a b.ts:12:7:const x = "a:b:c";\nbinary-file:3:1:zz\n');
  assert.deepEqual(parsed.hits, [{ file: 'src/a b.ts', line: 12, column: 7, text: 'const x = "a:b:c";' }, { file: 'binary-file', line: 3, column: 1, text: 'zz' }]);
  assert.equal(parsed.truncated, false);

  const many = Array.from({ length: 10 }, (unused, index) => `f${index}.ts:${index + 1}:1:text${index}`).join('\n');
  const limited = app.parseGrepOutput(many, 4);
  assert.equal(limited.hits.length, 4);
  assert.equal(limited.truncated, true);
  assert.ok(app.MAX_HITS > 0);
});
