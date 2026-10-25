/**
 * F3 冲突三方对照（基线/我方/对方）：
 * - ConflictBaseService.fetchStages 经真实 git 仓库的合并冲突读取 :1:/:2:/:3: 三个阶段；
 * - add/add 缺基线、路径校验、超大文件护栏；
 * - 定位启发式（locateBlockSpans）把冲突块对到基线正确区域；
 * - ConflictParser 既有行为不回归；
 * - conflictBase 词典 zh/en 键集合与占位符一致。
 * 风格与 tests/branch-safety.test.mjs 一致：esbuild 打包 + node:test + vite dev server 提供 /api/git。
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
let tmp, app, server, base, index = 0;
const git = (cwd, ...args) => {
  const result = spawnSync('git', ['-c', 'core.quotepath=false', ...args], { cwd, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || result.error?.message);
  return result.stdout;
};
const mergeAllowFail = (cwd, ...args) => spawnSync('git', ['-c', 'core.quotepath=false', ...args], { cwd, encoding: 'utf8' });

async function fixture() {
  const repo = path.join(tmp, `repo-${++index}`);
  await fs.mkdir(repo);
  git(repo, 'init', '-b', 'main');
  git(repo, 'config', 'user.name', 'Test');
  git(repo, 'config', 'user.email', 'test@example.invalid');
  git(repo, 'config', 'core.autocrlf', 'false');
  return repo;
}

// 典型冲突：双方都改同一行（端口），我方/对方各插入一行中文配置；对方还改了另一处（自动合并）。
const baseFile = [
  '# 项目配置',
  '',
  'name = demo',
  'version = 1.0.0',
  '',
  '[server]',
  'host = localhost',
  'port = 8080',
  '',
  '[features]',
  'alpha = false',
  'beta = false',
  '',
  '# 结束',
  'tail-1',
  'tail-2',
  'tail-3',
  'tail-4',
  '',
].join('\n');
const oursFile = baseFile.replace('port = 8080', 'port = 7070\n超时 = 30');
const theirsFile = baseFile.replace('port = 8080', 'port = 9090\nTLS 已启用').replace('beta = false', 'beta = true');

async function conflictedRepo() {
  const repo = await fixture();
  await fs.writeFile(path.join(repo, 'app.ini'), baseFile);
  git(repo, 'add', '-A');
  git(repo, 'commit', '-m', 'base');
  git(repo, 'switch', '-c', 'topic');
  await fs.writeFile(path.join(repo, 'app.ini'), theirsFile);
  git(repo, 'add', '-A');
  git(repo, 'commit', '-m', 'topic');
  git(repo, 'switch', 'main');
  await fs.writeFile(path.join(repo, 'app.ini'), oursFile);
  git(repo, 'add', '-A');
  git(repo, 'commit', '-m', 'main change');
  const merged = mergeAllowFail(repo, 'merge', 'topic');
  assert.notEqual(merged.status, 0, 'expected a merge conflict');
  assert.match(git(repo, 'status', '--porcelain'), /^UU app\.ini/m);
  return repo;
}

before(async () => {
  tmp = await fs.mkdtemp(path.join(root, '.test-conflict-base-'));
  const outfile = path.join(tmp, 'app.cjs');
  await build({
    stdin: {
      contents: `export * from './src/services/git/ConflictBaseService'; export * from './src/services/git/ConflictParser'; export { conflictBaseZh, conflictBaseEn } from './src/i18n/conflictBase';`,
      resolveDir: root,
    },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outfile,
    alias: { '@': path.join(root, 'src') },
    logLevel: 'silent',
  });
  app = createRequire(import.meta.url)(outfile);
  server = await createServer({ configFile: path.join(root, 'vite.config.ts'), server: { host: '127.0.0.1', port: 0, strictPort: false, watch: null } });
  await server.listen();
  base = `http://127.0.0.1:${server.httpServer.address().port}`;
  globalThis.fetch = (url, init) => nativeFetch(typeof url === 'string' && url.startsWith('/api/') ? base + url : url, init);
});

after(async () => {
  globalThis.fetch = nativeFetch;
  await server?.close();
  if (tmp && path.dirname(tmp) === root && path.basename(tmp).startsWith('.test-conflict-base-')) {
    await fs.rm(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 150 });
  }
});

test('fetchStages returns the base, ours and theirs stages of a real merge conflict', async () => {
  const repo = await conflictedRepo();
  const stages = await app.fetchStages(repo, 'app.ini');
  assert.equal(stages.base, baseFile);
  assert.equal(stages.ours, oursFile);
  assert.equal(stages.theirs, theirsFile);
  // 与 git 直读一致（含中文内容与子目录无关的根路径）。
  assert.equal(stages.base, git(repo, 'show', ':1:app.ini'));
  assert.equal(stages.ours, git(repo, 'show', ':2:app.ini'));
  assert.equal(stages.theirs, git(repo, 'show', ':3:app.ini'));
});

test('stages are read through subdirectory paths and glob-like filenames stay literal', async () => {
  const repo = await fixture();
  await fs.writeFile(path.join(repo, 'keep.txt'), 'r\n');
  await fs.mkdir(path.join(repo, 'docs'));
  await fs.writeFile(path.join(repo, 'docs', 'note[1].txt'), 'anchor base\nshared tail\n');
  git(repo, 'add', '-A');
  git(repo, 'commit', '-m', 'root');
  git(repo, 'switch', '-c', 'topic');
  await fs.writeFile(path.join(repo, 'docs', 'note[1].txt'), 'anchor theirs\nshared tail\n');
  git(repo, 'add', '-A');
  git(repo, 'commit', '-m', 'topic');
  git(repo, 'switch', 'main');
  await fs.writeFile(path.join(repo, 'docs', 'note[1].txt'), 'anchor ours\nshared tail\n');
  git(repo, 'add', '-A');
  git(repo, 'commit', '-m', 'main');
  mergeAllowFail(repo, 'merge', 'topic');
  assert.match(git(repo, 'status', '--porcelain'), /^UU docs\/note\[1\]\.txt/m);
  const stages = await app.fetchStages(repo, 'docs/note[1].txt');
  assert.equal(stages.base, 'anchor base\nshared tail\n');
  assert.equal(stages.ours, 'anchor ours\nshared tail\n');
  assert.equal(stages.theirs, 'anchor theirs\nshared tail\n');
});

test('add/add conflicts report a missing base instead of failing', async () => {
  const repo = await fixture();
  await fs.writeFile(path.join(repo, 'root.txt'), 'r\n');
  git(repo, 'add', '-A');
  git(repo, 'commit', '-m', 'root');
  git(repo, 'switch', '-c', 'side');
  await fs.mkdir(path.join(repo, 'docs'));
  await fs.writeFile(path.join(repo, 'docs', '新建配置.json'), '{\n  "来源": "side"\n}\n');
  git(repo, 'add', '-A');
  git(repo, 'commit', '-m', 'side add');
  git(repo, 'switch', 'main');
  await fs.mkdir(path.join(repo, 'docs'));
  await fs.writeFile(path.join(repo, 'docs', '新建配置.json'), '{\n  "来源": "main"\n}\n');
  git(repo, 'add', '-A');
  git(repo, 'commit', '-m', 'main add');
  mergeAllowFail(repo, 'merge', 'side');
  // add/add 冲突的状态码是 AA（双方各自新增），不是 UU。
  assert.match(git(repo, 'status', '--porcelain'), /^AA docs\//m);
  const stages = await app.fetchStages(repo, 'docs/新建配置.json');
  assert.equal(stages.base, null);
  assert.match(stages.ours, /"来源": "main"/);
  assert.match(stages.theirs, /"来源": "side"/);
});

test('a file without conflict stages reports every version as missing', async () => {
  const repo = await fixture();
  await fs.writeFile(path.join(repo, 'plain.txt'), 'plain\n');
  git(repo, 'add', '-A');
  git(repo, 'commit', '-m', 'plain');
  const stages = await app.fetchStages(repo, 'plain.txt');
  assert.deepEqual(stages, { base: null, ours: null, theirs: null });
});

test('invalid conflict paths are rejected before any git call', async () => {
  const repo = await fixture();
  await fs.writeFile(path.join(repo, 'a.txt'), 'a\n');
  git(repo, 'add', '-A');
  git(repo, 'commit', '-m', 'a');
  for (const bad of ['', '   ', '../sibling.txt', 'a/../../b.txt', 'sub/..\\..\\escape.txt', '/etc/passwd', '\\windows\\system32', 'C:/Windows/system32', 'D:escape', '-flag.txt']) {
    await assert.rejects(app.fetchStages(repo, bad), (error) => {
      assert.match(error.message, /empty|"\.\."|relative|-/);
      return true;
    }, bad);
  }
  assert.throws(() => app.validateConflictFilePath('../x'), /"\.\."/);
  assert.throws(() => app.validateConflictFilePath('a/../..'), /"\.\."/);
  assert.throws(() => app.validateConflictFilePath('-x'), /-/);
  assert.throws(() => app.validateConflictFilePath('C:/x'), /relative/);
  assert.throws(() => app.validateConflictFilePath('  '), /empty/);
  assert.equal(app.validateConflictFilePath('  docs/a[1].txt  '), 'docs/a[1].txt');
});

test('stages above the 2 MB guard are rejected with a readable error', async () => {
  const repo = await fixture();
  // 30000 行 × ~76 字节 ≈ 2.2 MB：阶段是完整 blob，无论冲突块多小都会超限。
  const big = Array.from({ length: 30000 }, (_, i) => `line-${i} ${'x'.repeat(64)}`).join('\n') + '\n';
  assert.ok(Buffer.byteLength(big) > 2 * 1024 * 1024);
  await fs.writeFile(path.join(repo, 'big.txt'), big);
  git(repo, 'add', '-A');
  git(repo, 'commit', '-m', 'root');
  git(repo, 'switch', '-c', 'topic');
  await fs.writeFile(path.join(repo, 'big.txt'), big.replace('line-5 ', 'line-5 theirs '));
  git(repo, 'add', '-A');
  git(repo, 'commit', '-m', 'topic');
  git(repo, 'switch', 'main');
  await fs.writeFile(path.join(repo, 'big.txt'), big.replace('line-5 ', 'line-5 ours '));
  git(repo, 'add', '-A');
  git(repo, 'commit', '-m', 'main');
  mergeAllowFail(repo, 'merge', 'topic');
  assert.match(git(repo, 'status', '--porcelain'), /^UU big\.txt/m);
  await assert.rejects(app.fetchStages(repo, 'big.txt'), /exceeds the 2 MB/);
});

test('the localization heuristic maps blocks onto the correct base region (±5 lines)', async () => {
  const repo = await conflictedRepo();
  const working = await fs.readFile(path.join(repo, 'app.ini'), 'utf8');
  const parsed = app.parseConflictBlocks(working);
  assert.equal(parsed.totalConflicts, 1);
  assert.equal(parsed.blocks[0].currentContent, 'port = 7070\n超时 = 30');
  assert.equal(parsed.blocks[0].incomingContent, 'port = 9090\nTLS 已启用');

  const workingLines = working.split('\n');
  const baseLines = baseFile.split('\n');
  const baseSpans = app.locateBlockSpans(baseLines, parsed.blocks, workingLines, 'base');
  const expectedBaseStart = baseLines.indexOf('port = 8080');
  assert.equal(baseSpans[0].matched, true);
  assert.ok(Math.abs(baseSpans[0].start - expectedBaseStart) <= 5, `base span ${baseSpans[0].start} vs ${expectedBaseStart}`);

  const oursLines = oursFile.split('\n');
  const oursSpans = app.locateBlockSpans(oursLines, parsed.blocks, workingLines, 'ours');
  assert.equal(oursSpans[0].matched, true);
  assert.equal(oursSpans[0].start, oursLines.indexOf('port = 7070'));
  assert.ok(oursSpans[0].end > oursSpans[0].start);

  const theirsLines = theirsFile.split('\n');
  const theirsSpans = app.locateBlockSpans(theirsLines, parsed.blocks, workingLines, 'theirs');
  assert.equal(theirsSpans[0].matched, true);
  assert.equal(theirsSpans[0].start, theirsLines.indexOf('port = 9090'));

  // 兜底：基线与上下文毫无关联时按比例位置推算（matched=false，且落在文件范围内）。
  const unrelated = Array.from({ length: 60 }, (_, i) => `unrelated-${i}`);
  const fallback = app.locateBlockSpans(unrelated, parsed.blocks, workingLines, 'base');
  assert.equal(fallback[0].matched, false);
  assert.ok(fallback[0].start >= 0 && fallback[0].start < unrelated.length);
  assert.ok(fallback[0].end <= unrelated.length);
});

test('sequential search keeps multiple blocks monotonic on both sides', () => {
  const working = [
    'header',
    'ctx-a',
    '<<<<<<< HEAD',
    'ours-1',
    '=======',
    'theirs-1',
    '>>>>>>> t',
    'middle shared',
    'ctx-a',
    '<<<<<<< HEAD',
    'ours-2',
    '=======',
    'theirs-2',
    '>>>>>>> t',
    'end',
  ].join('\n');
  const ours = ['header', 'ctx-a', 'ours-1', 'middle shared', 'ctx-a', 'ours-2', 'end'].join('\n');
  const base = ['header', 'ctx-a', 'base-1', 'middle shared', 'ctx-a', 'base-2', 'end'].join('\n');
  const parsed = app.parseConflictBlocks(working);
  assert.equal(parsed.totalConflicts, 2);
  const workingLines = working.split('\n');
  const baseSpans = app.locateBlockSpans(base.split('\n'), parsed.blocks, workingLines, 'base');
  assert.equal(baseSpans[0].start, 2);
  assert.equal(baseSpans[0].matched, true);
  assert.equal(baseSpans[1].start, 5);
  assert.equal(baseSpans[1].matched, true);
  const oursSpans = app.locateBlockSpans(ours.split('\n'), parsed.blocks, workingLines, 'ours');
  assert.equal(oursSpans[0].start, 2);
  assert.equal(oursSpans[1].start, 5);
});

test('ConflictParser behavior stays intact (blocks, diff3 base, span-only resolution)', () => {
  const text = 'before\n<<<<<<< HEAD\nours\n=======\ntheirs\n>>>>>>> topic\nafter\n';
  const parsed = app.parseConflictBlocks(text);
  assert.equal(parsed.totalConflicts, 1);
  assert.equal(parsed.blocks[0].startLine, 2);
  assert.equal(parsed.blocks[0].endLine, 6);
  assert.equal(parsed.blocks[0].currentContent, 'ours');
  assert.equal(parsed.blocks[0].incomingContent, 'theirs');
  assert.equal(parsed.blocks[0].baseContent, undefined);
  assert.equal(app.resolveSingleBlock(text, 0, 'both'), 'before\nours\ntheirs\nafter\n');
  assert.equal(app.resolveSingleBlock(text, 0, 'incoming'), 'before\ntheirs\nafter\n');
  assert.equal(app.resolveAllBlocks(text.replace('>>>>>>> topic', '>>>>>>> topic\n<<<<<<< HEAD\no2\n=======\nt2\n>>>>>>> u'), 'current'), 'before\nours\no2\nafter\n');
  const diff3 = 'a\n<<<<<<< HEAD\no\n||||||| base marker\nb\n=======\nt\n>>>>>>> x\nz\n';
  const parsed3 = app.parseConflictBlocks(diff3);
  assert.equal(parsed3.blocks[0].baseContent, 'b');
  assert.equal(app.hasConflictMarkers(text), true);
  // CRLF 文件中只重写块区间、块外字节保持原样。
  const mixed = 'before\r\n<<<<<<< HEAD\nours\n=======\ntheirs\n>>>>>>> topic\r\nafter\r\n';
  assert.equal(app.resolveSingleBlock(mixed, 0, 'current'), 'before\r\nours\r\nafter\r\n');
});

test('conflictBase dictionaries keep zh/en key sets and placeholders aligned', () => {
  const zhKeys = Object.keys(app.conflictBaseZh).sort();
  const enKeys = Object.keys(app.conflictBaseEn).sort();
  assert.deepEqual(enKeys, zhKeys);
  assert.ok(zhKeys.length >= 15, `unexpectedly few conflictBase keys: ${zhKeys.length}`);
  const placeholders = (value) => [...String(value).matchAll(/\{([A-Za-z0-9_]+)\}/g)].map((match) => match[1]).sort().join(',');
  for (const key of zhKeys) {
    assert.equal(placeholders(app.conflictBaseEn[key]), placeholders(app.conflictBaseZh[key]), key);
  }
});
