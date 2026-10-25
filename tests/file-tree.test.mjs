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
let tmp, app, server, base, index = 0;
const git = (cwd, ...args) => {
  const result = spawnSync('git', ['-c', 'core.quotepath=false', ...args], { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || result.error?.message);
  return result.stdout;
};
async function fixture() {
  const repo = path.join(tmp, `repo-${++index}`);
  await fs.mkdir(repo);
  git(repo, 'init', '-b', 'main'); git(repo, 'config', 'user.name', 'Test'); git(repo, 'config', 'user.email', 'test@example.invalid'); git(repo, 'config', 'core.autocrlf', 'false');
  await fs.mkdir(path.join(repo, 'src', 'deep', 'nested'), { recursive: true });
  await fs.mkdir(path.join(repo, '空间 目录'));
  await fs.writeFile(path.join(repo, 'README.md'), '# title\n');
  await fs.writeFile(path.join(repo, 'src', 'index.ts'), 'export {};\n');
  await fs.writeFile(path.join(repo, 'src', 'deep', 'nested', 'module.ts'), 'export const value = 1;\n');
  await fs.writeFile(path.join(repo, '空间 目录', '文件 甲.txt'), '中文内容\n');
  await fs.writeFile(path.join(repo, '中文 文件.txt'), '中文 根文件\n');
  git(repo, 'add', '-A'); git(repo, 'commit', '-m', 'initial');
  return repo;
}
before(async () => {
  tmp = await fs.mkdtemp(path.join(root, '.test-tree-'));
  const outfile = path.join(tmp, 'tree.cjs');
  await build({ stdin: { contents: `export * from './src/services/git/TreeService';`, resolveDir: root }, bundle: true, platform: 'node', format: 'cjs', outfile, alias: { '@': path.join(root, 'src') }, logLevel: 'silent' });
  app = createRequire(import.meta.url)(outfile);
  server = await createServer({ configFile: path.join(root, 'vite.config.ts'), server: { host: '127.0.0.1', port: 0, strictPort: false, watch: null } });
  await server.listen(); base = `http://127.0.0.1:${server.httpServer.address().port}`;
  globalThis.fetch = (url, init) => nativeFetch(typeof url === 'string' && url.startsWith('/api/') ? base + url : url, init);
});
after(async () => {
  globalThis.fetch = nativeFetch; await server?.close();
  if (tmp && path.dirname(tmp) === root && path.basename(tmp).startsWith('.test-tree-')) await fs.rm(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 150 });
});

test('-z ls-tree records parse with padded sizes, dashes, submodule entries and odd paths', () => {
  const hash = '0123456789abcdef0123456789abcdef01234567';
  const raw = [
    `100644 blob ${hash}      123\tplain.txt`,
    `100644 blob ${hash}        0\tempty.txt`,
    `100755 blob ${hash}   456789\t空间 目录/文件 甲.txt`,
    `160000 commit ${hash} -\tvendor/lib`,
    `100644 blob ${hash}      12\twe\nird.txt`,
    'garbage line',
    '',
  ].join('\0') + '\0';
  const entries = app.parseLsTreeZ(raw);
  assert.deepEqual(entries.map(entry => entry.path), ['plain.txt', 'empty.txt', '空间 目录/文件 甲.txt', 'vendor/lib', 'we\nird.txt']);
  assert.equal(entries[0].sizeBytes, 123);
  assert.equal(entries[1].sizeBytes, 0);
  assert.equal(entries[2].sizeBytes, 456789);
  assert.equal(entries[3].type, 'commit');
  assert.equal(entries[3].sizeBytes, null);
  assert.deepEqual(app.parseLsTreeZ(''), []);
});

test('nested trees are built in one pass with directories first and stable names', () => {
  const hash = '0123456789abcdef0123456789abcdef01234567';
  const nodes = app.buildSnapshotTree([
    { mode: '100644', type: 'blob', objectHash: hash, sizeBytes: 3, path: 'src/index.ts' },
    { mode: '100644', type: 'blob', objectHash: hash, sizeBytes: 9, path: 'README.md' },
    { mode: '100644', type: 'blob', objectHash: hash, sizeBytes: 1, path: 'src/deep/nested/module.ts' },
    { mode: '100644', type: 'blob', objectHash: hash, sizeBytes: 4, path: 'src/deep/a.txt' },
  ]);
  assert.deepEqual(nodes.map(node => [node.kind, node.name]), [['dir', 'src'], ['file', 'README.md']]);
  const src = nodes[0];
  assert.deepEqual(src.children.map(node => node.name), ['deep', 'index.ts']);
  const deep = src.children[0];
  assert.equal(deep.path, 'src/deep');
  assert.deepEqual(deep.children.map(node => node.name), ['nested', 'a.txt']);
  const file = src.children[1];
  assert.equal(file.path, 'src/index.ts');
  assert.equal(file.objectHash, hash);
  assert.equal(file.children, null);
});

test('snapshot lists the exact tree of an old commit and resolves short hashes', async () => {
  const repo = await fixture();
  const firstHash = git(repo, 'rev-parse', 'HEAD').trim();
  await fs.writeFile(path.join(repo, 'src', 'index.ts'), 'export const changed = true;\n');
  git(repo, 'add', '-A'); git(repo, 'commit', '-m', 'second');
  const [oldFull, oldShort, head] = await Promise.all([
    app.treeService.listSnapshot(repo, firstHash),
    app.treeService.listSnapshot(repo, firstHash.slice(0, 8)),
    app.treeService.listSnapshot(repo, 'HEAD'),
  ]);
  assert.equal(oldFull.commit, firstHash);
  assert.equal(oldShort.commit, firstHash);
  assert.notEqual(head.commit, firstHash);
  assert.equal(oldFull.entries.find(entry => entry.path === 'src/index.ts').sizeBytes, Buffer.byteLength('export {};\n'));
  assert.equal(head.entries.find(entry => entry.path === 'src/index.ts').sizeBytes, Buffer.byteLength('export const changed = true;\n'));
  const paths = oldFull.entries.map(entry => entry.path);
  assert.ok(paths.includes('src/deep/nested/module.ts'));
  assert.ok(paths.includes('空间 目录/文件 甲.txt'));
  assert.ok(paths.includes('中文 文件.txt'));
  assert.ok(!paths.includes('nonexistent.txt'));
  assert.equal(await app.treeService.resolveCommitHash(repo, firstHash.slice(0, 10)), firstHash);
  await assert.rejects(app.treeService.resolveCommitHash(repo, '--abort'));
});

test('readBlob returns text with Chinese and CRLF intact, and flags binary and oversized blobs', async () => {
  const repo = await fixture();
  await fs.writeFile(path.join(repo, 'pixel.bin'), Buffer.from([0, 1, 2, 0, 65, 66]));
  await fs.writeFile(path.join(repo, 'big.bin'), Buffer.alloc(2 * 1024 * 1024 + 1024, 65));
  await fs.writeFile(path.join(repo, 'crlf.txt'), 'first\r\nsecond\r\n');
  git(repo, 'add', '-A'); git(repo, 'commit', '-m', 'binary');
  const head = await app.treeService.listSnapshot(repo, 'HEAD');
  const read = name => app.treeService.readBlob(repo, head.entries.find(entry => entry.path === name).objectHash);
  const readme = await read('README.md');
  assert.equal(readme.kind, 'text'); assert.equal(readme.content, '# title\n'); assert.equal(readme.sizeBytes, 8);
  const chinese = await read('中文 文件.txt');
  assert.equal(chinese.kind, 'text'); assert.equal(chinese.content, '中文 根文件\n');
  const crlf = await read('crlf.txt');
  assert.equal(crlf.content, 'first\r\nsecond\r\n');
  const binary = await read('pixel.bin');
  assert.equal(binary.kind, 'binary'); assert.equal(binary.sizeBytes, 6);
  const big = await read('big.bin');
  assert.equal(big.kind, 'too-large'); assert.equal(big.sizeBytes, 2 * 1024 * 1024 + 1024);
  const emptyHash = git(repo, 'hash-object', '-w', '--stdin').replace('\n', '');
  const empty = await app.treeService.readBlob(repo, emptyHash);
  assert.equal(empty.kind, 'text'); assert.equal(empty.content, ''); assert.equal(empty.sizeBytes, 0);
});

test('object hashes are validated before reaching git and injection attempts are rejected', async () => {
  const repo = await fixture();
  const valid = 'a'.repeat(40);
  for (const bad of ['', 'short', 'g'.repeat(40), 'A'.repeat(40), `${valid.slice(0, 39)}`, `${valid} --upload-pack=evil`, `${valid}..HEAD`, `${valid}X`]) {
    await assert.rejects(app.treeService.readBlob(repo, bad), /Invalid object hash/);
  }
  const valid64 = 'b'.repeat(64);
  await assert.rejects(app.treeService.readBlob(repo, valid64), error => !/Invalid object hash/.test(error.message));
  assert.deepEqual(app.parseLsTreeZ(`100644 blob NOTAHASH 5\tx.txt\0`), []);
  assert.equal(app.formatBytes(512), '512 B');
  assert.equal(app.formatBytes(2048), '2 KB');
  assert.equal(app.formatBytes(2 * 1024 * 1024), '2 MB');
});

test('huge snapshots build in linear time and visible rows honor collapsed directories', () => {
  const entries = [];
  for (let i = 0; i < 24000; i++) {
    entries.push({ mode: '100644', type: 'blob', objectHash: 'a'.repeat(40), sizeBytes: i, path: `dir${Math.floor(i / 100)}/sub${Math.floor(i / 10)}/file${i}.txt` });
  }
  const started = performance.now();
  const nodes = app.buildSnapshotTree(entries);
  const allRows = app.collectVisibleRows(nodes, new Set());
  assert.equal(allRows.length, 24000 + 2400 + 240);
  const collapsed = new Set(Array.from({ length: 240 }, (_, d) => `dir${d}`));
  // 折叠全部顶层目录后只剩 240 个目录行，其子树（子目录与文件）全部隐藏。
  const collapsedRows = app.collectVisibleRows(nodes, collapsed);
  assert.equal(collapsedRows.length, 240);
  const filtered = entries.filter(entry => entry.sizeBytes % 5 === 0);
  const filteredNodes = app.buildSnapshotTree(filtered);
  assert.equal(filteredNodes.length, 240);
  assert.equal(app.collectVisibleRows(filteredNodes, new Set()).length, 4800 + 2400 + 240);
  assert.ok(performance.now() - started < 2000, `tree build took too long: ${performance.now() - started}ms`);
});

test('empty repositories fail snapshot listing with a clear error', async () => {
  const repo = path.join(tmp, `empty-${++index}`);
  await fs.mkdir(repo);
  git(repo, 'init', '-b', 'main'); git(repo, 'config', 'user.name', 'Test'); git(repo, 'config', 'user.email', 'test@example.invalid');
  await assert.rejects(app.treeService.listSnapshot(repo, 'HEAD'));
  await assert.rejects(app.treeService.listSnapshot(repo, ''));
});
