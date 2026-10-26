// LFS 面板测试：
// 1. 纯函数：parseLfsTracks / parseLfsFiles 的输出解析与垃圾行容忍；
// 2. 端点级：dev server /api/git 拒绝 lfs push/migrate/install 裸调用（策略层收窄），
//    放行 track/version；
// 3. 真实仓库全流程（git-lfs 可用环境）：install --local 只写仓库内配置 → track 写
//    .gitattributes → untrack 移除 → uninstall --local 清理；全程校验配置与文件内容；
// 4. 环境自适应：git-lfs 缺失环境（CI ubuntu）detect 返回 null，需要 lfs 的操作抛
//    可读错误而不是崩溃——真实流程测试自动跳过。
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
  temporary = await fs.mkdtemp(path.join(root, '.test-tmp-lfs-'));
  const bundle = path.join(temporary, 'helpers.cjs');
  await build({ stdin: { contents: `export { lfsService, parseLfsTracks, parseLfsFiles } from './src/services/git/LfsService';`, resolveDir: root }, bundle: true, platform: 'node', format: 'cjs', outfile: bundle, alias: { '@': path.join(root, 'src') }, logLevel: 'silent' });
  app = createRequire(import.meta.url)(bundle);
  server = await createServer({ configFile: path.join(root, 'vite.config.ts'), server: { host: '127.0.0.1', port: 0, strictPort: false, watch: null } });
  await server.listen();
  base = `http://127.0.0.1:${server.httpServer.address().port}`;
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
  if (temporary && path.dirname(temporary) === root && path.basename(temporary).startsWith('.test-tmp-lfs-')) {
    await fs.rm(temporary, { recursive: true, force: true });
  }
});
const post = (endpoint, data) => fetch(base + '/api/' + endpoint, { method: 'POST', headers, body: JSON.stringify(data) });

test('parseLfsTracks and parseLfsFiles tolerate headers and junk lines', () => {
  const tracks = app.parseLfsTracks([
    'Listing tracked patterns',
    '    *.psd (.gitattributes)',
    '    docs/**/*.bin (.gitattributes)\r',
    '',
  ].join('\n'));
  assert.deepEqual(tracks, [
    { pattern: '*.psd', source: '.gitattributes' },
    { pattern: 'docs/**/*.bin', source: '.gitattributes' },
  ]);
  assert.deepEqual(app.parseLfsTracks(''), []);

  const files = app.parseLfsFiles([
    'a1b2c3d4 * assets/logo.png',
    'deadbeef - assets/video.mp4\r',
    'garbage line',
  ].join('\n'));
  assert.equal(files.length, 2);
  assert.deepEqual(files[0], { oid: 'a1b2c3d4', downloaded: true, path: 'assets/logo.png' });
  assert.equal(files[1].downloaded, false);
});

test('development git endpoint gates lfs execution vectors', async () => {
  const repository = path.join(temporary, 'policy-repo');
  await fs.mkdir(repository, { recursive: true });
  execFileSync('git', ['-C', repository, 'init', '-q', '-b', 'main']);
  for (const args of [
    ['lfs', 'push', 'origin', 'main'],
    ['lfs', 'migrate', 'import', '--everything'],
    ['lfs', 'install'],
    ['lfs', 'install', '--local', '--force'],
    ['lfs', 'track', '--filename', 'x'],
  ]) {
    const response = await post('git', { args, cwd: repository });
    assert.equal(response.status, 400, JSON.stringify(args));
  }
  // track 的白名单形态在端点层放行（git-lfs 未安装时 git 报错属于执行错误而非策略拒绝）。
  const track = await post('git', { args: ['lfs', 'track', '--', '*.psd'], cwd: repository });
  assert.equal(track.status, 200);
});

test('lfs service degrades to not-installed without git-lfs and round-trips when available', async () => {
  const repository = path.join(temporary, 'lfs-repo');
  await fs.mkdir(repository, { recursive: true });
  execFileSync('git', ['-c', 'user.name=AuuGit Test', '-c', 'user.email=test@example.invalid', '-C', repository, 'init', '-q', '-b', 'main']);
  await fs.writeFile(path.join(repository, 'readme.md'), '# lfs\n');
  execFileSync('git', ['-c', 'user.name=AuuGit Test', '-c', 'user.email=test@example.invalid', '-C', repository, 'add', '.']);
  execFileSync('git', ['-c', 'user.name=AuuGit Test', '-c', 'user.email=test@example.invalid', '-C', repository, 'commit', '-q', '-m', 'init']);

  const version = await app.lfsService.detect(repository);
  if (version === null) {
    // CI（无 git-lfs）：detect 降级为 null；需要 lfs 的操作给可读错误。
    assert.equal(await app.lfsService.detect(repository), null);
    await assert.rejects(() => app.lfsService.tracks(repository), /git-lfs|安装/i);
    return;
  }

  // 本机（有 git-lfs）：完整闭环。
  assert.match(version, /^git-lfs\//);
  assert.equal(await app.lfsService.repoFilterEnabled(repository), false);
  await app.lfsService.enableRepoFilters(repository);
  assert.equal(await app.lfsService.repoFilterEnabled(repository), true);
  // install --local 只写仓库内配置：全局 ~/.gitconfig 不新增 auugit 测试痕迹
  //（间接断言——filter.lfs.clean 落在 --local 而进程内可见）。
  await app.lfsService.addTrack(repository, '*.bin');
  const gitattributes = await fs.readFile(path.join(repository, '.gitattributes'), 'utf8');
  assert.match(gitattributes, /\*\.bin filter=lfs/);
  const tracks = await app.lfsService.tracks(repository);
  assert.ok(tracks.some((track) => track.pattern === '*.bin'));
  await app.lfsService.removeTrack(repository, '*.bin');
  const after = await app.lfsService.tracks(repository);
  assert.ok(!after.some((track) => track.pattern === '*.bin'));
  await app.lfsService.disableRepoFilters(repository);
  assert.equal(await app.lfsService.repoFilterEnabled(repository), false);
  // 空模式/选项形态输入在触 git 前被拒。
  await assert.rejects(() => app.lfsService.addTrack(repository, '  '));
  await assert.rejects(() => app.lfsService.addTrack(repository, '--upload-pack=evil'));
});
