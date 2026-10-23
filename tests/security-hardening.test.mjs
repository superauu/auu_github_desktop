import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { createServer } from 'vite';

const root = process.cwd();
const headers = { 'Content-Type': 'application/json', 'X-AuuGit-Request': '1' };
let temporary, outside, server, base, app;
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
before(async () => {
  temporary = await fs.mkdtemp(path.join(root, '.test-tmp-security-'));
  outside = await fs.mkdtemp(path.join(os.tmpdir(), 'auugit-outside-'));
  const bundle = path.join(temporary, 'helpers.cjs');
  await build({ stdin: { contents: `export * from './scripts/dev-file-io'; export * from './scripts/git-policy'; export * from './src/utils/externalUrl'; export { gitService } from './src/services/git/GitService'; export { gitHubOAuthService } from './src/services/github/GitHubOAuthService';`, resolveDir: root }, bundle: true, platform: 'node', format: 'cjs', outfile: bundle, alias: { '@': path.join(root, 'src') }, logLevel: 'silent' });
  app = createRequire(import.meta.url)(bundle);
  server = await createServer({ configFile: path.join(root, 'vite.config.ts'), server: { host: '127.0.0.1', port: 0, strictPort: false, watch: null } });
  await server.listen();
  base = `http://127.0.0.1:${server.httpServer.address().port}`;
});
after(async () => {
  delete globalThis.window;
  await server?.close();
  if (temporary && path.dirname(temporary) === root && path.basename(temporary).startsWith('.test-tmp-security-')) await fs.rm(temporary, { recursive: true, force: true });
  if (outside && path.dirname(outside) === os.tmpdir() && path.basename(outside).startsWith('auugit-outside-')) await fs.rm(outside, { recursive: true, force: true });
});
const post = (endpoint, data) => fetch(base + '/api/' + endpoint, { method: 'POST', headers, body: JSON.stringify(data) });

test('native terminal passes paths as data and reports spawn failures without silently copying', async () => {
  const calls = [];
  const repoPath = "E:/repos/中文 '[brackets] & $name";
  globalThis.window = { __TAURI_INTERNALS__: { invoke: async (command, args) => { calls.push({ command, args }); } } };
  try {
    await app.gitService.openTerminal(repoPath);
    assert.deepEqual(calls, [{ command: 'open_terminal', args: { repoPath } }]);
    window.__TAURI_INTERNALS__.invoke = async () => { throw 'Unable to start terminal'; };
    await assert.rejects(app.gitService.openTerminal(repoPath), /Unable to start terminal/);
  } finally { delete globalThis.window; }
  await assert.rejects(app.gitService.openTerminal(repoPath), /桌面|desktop/);
});

test('Git arguments reject execution overrides, abbreviations and configuration write bypasses', () => {
  const rejected = [
    ['-c', 'core.sshCommand=bad', 'fetch'], ['-c', 'core.pager=bad', 'log'],
    ['-C', outside, 'status'], ['--git-dir=' + outside, 'status'],
    ['fetch', '--upload-pa=bad'], ['push', '--receive-pack=bad'], ['rebase', '-xbad', 'HEAD'],
    ['config', '--local', 'core.hooksPath', outside], ['config', '--global', 'user.name', 'bad'],
    ['config', '--local', '--replace-all', '--', 'core.sshCommand', 'bad', '--get'],
    ['-c', 'sequence.editor=bad', 'rebase', '--interactive', 'HEAD'], ['daemon'],
  ];
  for (const args of rejected) assert.throws(() => app.validateGitArguments(args), undefined, JSON.stringify(args));
  for (const args of [['-c', 'core.quotepath=false', 'status', '-z'], ['commit', '-m', '--exec=literal text'], ['config', '--local', 'branch.main.pushRemote', 'origin'], ['config', '--get', 'core.ignorecase'], ['-c', `sequence.editor=printf '%s\\n' 'pick ${'a'.repeat(40)}' 'fixup ${'b'.repeat(40)}' > "$1"; :`, 'rebase', '--interactive', 'HEAD']]) assert.doesNotThrow(() => app.validateGitArguments(args));
});

test('development filesystem and Git endpoints reject outside roots and linked directory escapes', async () => {
  await fs.writeFile(path.join(outside, 'secret.txt'), 'preserve');
  const link = path.join(temporary, 'outside-link');
  await fs.symlink(outside, link, process.platform === 'win32' ? 'junction' : 'dir');
  for (const repoPath of [outside, link]) {
    const response = await post('fs/write-file', { repoPath, filePath: 'secret.txt', content: 'bad' });
    assert.equal(response.status, 400); assert.match((await response.json()).error, /outside allowed/);
  }
  assert.equal((await post('fs/read-file', { repoPath: outside, filePath: 'secret.txt' })).status, 400);
  assert.equal((await post('fs/validate-path', { path: outside })).status, 400);
  assert.equal((await post('fs/exists', { path: path.join(outside, 'secret.txt') })).status, 400);
  assert.equal((await post('fs/exists', { paths: [path.join(temporary, 'safe'), path.join(outside, 'secret.txt')] })).status, 400);
  assert.equal((await post('fs/exists', { paths: Array(5).fill(path.join(temporary, 'safe')) })).status, 400);
  const bulk = await post('fs/exists', { paths: [temporary, path.join(temporary, 'missing')] });
  assert.equal(bulk.status, 200); assert.deepEqual((await bulk.json()).exists, [true, false]);
  assert.equal((await fetch(base + '/api/fs/list-dirs?path=' + encodeURIComponent(outside), { headers })).status, 400);
  assert.equal((await post('git', { args: ['-C', outside, 'status'], cwd: temporary })).status, 400);
  assert.equal((await post('git', { args: ['-c', 'core.quotepath=false', 'clone', '--', temporary, path.join(outside, 'clone')], cwd: temporary })).status, 400);
  assert.equal(await fs.readFile(path.join(outside, 'secret.txt'), 'utf8'), 'preserve');
  await fs.unlink(link);
});

test('text reads enforce the size limit and retain BOM, Unicode and CRLF for optimistic saves', async () => {
  const large = path.join(temporary, 'large.txt');
  const handle = await fs.open(large, 'w'); await handle.truncate(8 * 1024 * 1024 + 1); await handle.close();
  const response = await post('fs/read-file', { repoPath: temporary, filePath: 'large.txt' });
  assert.equal(response.status, 400); assert.match((await response.json()).error, /8 MiB/);
  const original = '\ufeff中文\r\nsecond\r\n';
  await fs.writeFile(path.join(temporary, 'text.txt'), original);
  const read = await post('fs/read-file', { repoPath: temporary, filePath: 'text.txt' });
  assert.equal((await read.json()).content, original);
  assert.equal((await post('fs/write-file', { repoPath: temporary, filePath: 'text.txt', content: original + 'saved', expectedContent: original })).status, 200);
  assert.equal(await fs.readFile(path.join(temporary, 'text.txt'), 'utf8'), original + 'saved');
});

test('serialized atomic saves preserve stale originals and leave no temporary files', async () => {
  const directory = path.join(temporary, 'saves'); await fs.mkdir(directory);
  const file = path.join(directory, 'file.txt'); await fs.writeFile(file, 'original');
  const results = await Promise.allSettled(['first', 'second'].map(content => app.withFileWrite(() => app.atomicWrite(file, content, 'original'))));
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(await fs.readFile(file, 'utf8'), 'first');
  assert.deepEqual(await fs.readdir(directory), ['file.txt']);
  await assert.rejects(app.withFileWrite(() => app.atomicWrite(file, 'bad', 'original')), /changed on disk/);
  await app.withFileWrite(() => app.atomicWrite(path.join(directory, 'new.txt'), 'new', ''));
  assert.equal(await fs.readFile(path.join(directory, 'new.txt'), 'utf8'), 'new');
});

test('OAuth rejects foreign schemes, hosts, credentials and ports before returning a device code', async () => {
  for (const url of ['http://github.com/login/device', 'https://github.com.evil.invalid/', 'https://github.com@evil.invalid/', 'https://user@github.com/', 'https://github.com:8443/', 'javascript:alert(1)']) assert.throws(() => app.validateGitHubUrl(url));
  assert.equal(app.validateGitHubUrl('https://github.com/login/device'), 'https://github.com/login/device');
  globalThis.window = { __TAURI_INTERNALS__: { invoke: async () => JSON.stringify({ device_code: 'device', user_code: 'code', verification_uri: 'https://evil.invalid/' }) } };
  try { await assert.rejects(app.gitHubOAuthService.requestDeviceCode(), /Invalid GitHub verification URL/); }
  finally { delete globalThis.window; }
});
