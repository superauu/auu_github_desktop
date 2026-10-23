import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { createServer } from 'vite';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const headers = { 'Content-Type': 'application/json', 'X-AuuGit-Request': '1' };
let temporary, outside, server, base, app;
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
before(async () => {
  temporary = await fs.mkdtemp(path.join(root, '.test-tmp-security-'));
  outside = await fs.mkdtemp(path.join(os.tmpdir(), 'auugit-outside-'));
  const bundle = path.join(temporary, 'helpers.cjs');
  await build({ stdin: { contents: `export * from './src/services/fs/RepositoryAccess'; export * from './src/services/fs/DirectoryService'; export * from './scripts/dev-file-io'; export * from './scripts/git-policy'; export * from './src/utils/externalUrl'; export { gitService } from './src/services/git/GitService'; export { useSettingsStore } from './src/stores/settingsStore'; export { gitHubOAuthService } from './src/services/github/GitHubOAuthService';`, resolveDir: root }, bundle: true, platform: 'node', format: 'cjs', outfile: bundle, alias: { '@': path.join(root, 'src') }, logLevel: 'silent' });
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
    ['clone', '-c', 'core.sshCommand=bad', '--', 'url', 'target'],
    ['clone', '-ccore.sshCommand=bad', '--', 'url', 'target'],
    ['clone', '-qnc', 'core.sshCommand=bad', '--', 'url', 'target'],
    ['init', '-c', 'core.sshCommand=bad'],
    ['merge', '-s', 'custom', 'HEAD'], ['merge', '-nscustom', 'HEAD'],
    ['merge', '--strategy=custom', 'HEAD'], ['rebase', '--str=custom', 'HEAD'],
  ];
  for (const args of rejected) assert.throws(() => app.validateGitArguments(args), undefined, JSON.stringify(args));
  for (const args of [['clone', '-qb', '-c-branch', '--', 'url', 'target'], ['clone', '-qbbranch-with-c', '--', 'url', 'target'], ['clone', '--', '-c-url', 'target'], ['cherry-pick', '-s', 'HEAD'], ['merge', '--signoff', '--end-of-options', 'main']]) assert.doesNotThrow(() => app.validateGitArguments(args));
  for (const args of [['-c', 'core.quotepath=false', 'status', '-z'], ['commit', '-m', '--exec=literal text'], ['config', '--local', 'branch.main.pushRemote', 'origin'], ['config', '--get', 'core.ignorecase'], ['-c', `sequence.editor=printf '%s\\n' 'pick ${'a'.repeat(40)}' 'fixup ${'b'.repeat(40)}' > "$1"; :`, 'rebase', '--interactive', 'HEAD']]) assert.doesNotThrow(() => app.validateGitArguments(args));
});

test('native approval deduplicates concurrent requests and retries after cancellation', async () => {
  const calls = [], repository = path.join(temporary, 'approval'), binary = path.join(temporary, 'custom-git', 'git.exe');
  let denied = true;
  globalThis.window = { __TAURI_INTERNALS__: { invoke: async (command, args) => {
    calls.push({ command, args });
    if (command === 'authorize_git_binary' && denied) throw 'Approval cancelled';
  } } };
  try {
    await Promise.all([app.authorizeRepository(repository), app.authorizeRepository(repository)]);
    assert.equal(calls.filter(call => call.command === 'authorize_repository').length, 1);
    const outcomes = await Promise.allSettled([app.authorizeGitBinary(binary), app.authorizeGitBinary(binary)]);
    assert.ok(outcomes.every(value => value.status === 'rejected' && value.reason instanceof Error));
    assert.equal(calls.filter(call => call.command === 'authorize_git_binary').length, 1);
    denied = false; await app.authorizeGitBinary(binary); await app.authorizeGitBinary(binary); await app.authorizeGitBinary('git');
    assert.equal(calls.filter(call => call.command === 'authorize_git_binary').length, 2);
  } finally { delete globalThis.window; }
});

test('repository consent and folder picking use the current app language, with retry after denial', async () => {
  const calls = [], previousLanguage = app.useSettingsStore.getState().language;
  let denied = true;
  globalThis.window = { __TAURI_INTERNALS__: { invoke: async (command, args) => {
    calls.push({ command, args });
    if (command === 'pick_repository_folder') return null;
    if (denied) throw 'AUUGIT_REPOSITORY_ACCESS_CANCELLED';
  } } };
  try {
    app.useSettingsStore.setState({ language: 'zh' });
    const rejected = await Promise.allSettled([app.authorizeRepository(temporary), app.authorizeRepository(temporary)]);
    assert.equal(calls.length, 1);
    assert.ok(rejected.every(result => result.status === 'rejected' && app.isRepositoryAccessCancelled(result.reason)));
    assert.equal(rejected[0].reason.message, '已取消仓库访问授权');
    assert.equal(calls[0].args.language, 'zh');
    await app.pickFolderNative(); assert.equal(calls.at(-1).args.language, 'zh');
    app.useSettingsStore.setState({ language: 'en' });
    await assert.rejects(app.authorizeRepository(temporary), error => error.message === 'Repository access was cancelled');
    assert.equal(calls.at(-1).args.language, 'en');
    denied = false;
    await app.authorizeRepository(temporary);
    await app.pickFolderNative(); assert.equal(calls.at(-1).args.language, 'en');
    assert.equal(app.isRepositoryAccessCancelled('disk failure'), false);
    assert.equal(app.isRepositoryAccessCancelled('Repository access was cancelled'), true);
  } finally { app.useSettingsStore.setState({ language: previousLanguage }); delete globalThis.window; }
});

test('declining consent prevents open, clone, init and worktree Git commands', async () => {
  const calls = [];
  globalThis.window = { __TAURI_INTERNALS__: { invoke: async (command, args) => {
    calls.push({ command, args });
    if (command === 'authorize_repository') throw 'AUUGIT_REPOSITORY_ACCESS_CANCELLED';
    throw Error('Unexpected native command');
  } } };
  try {
    for (const operation of [
      () => app.gitService.openRepository(temporary),
      () => app.gitService.initRepository(temporary),
      () => app.gitService.cloneRepository('https://example.invalid/repo.git', temporary),
      () => app.gitService.createWorktree(temporary, path.join(temporary, 'new-tree'), 'main'),
    ]) await assert.rejects(operation(), app.isRepositoryAccessCancelled);
    assert.ok(calls.every(call => call.command === 'authorize_repository'));
    assert.equal(calls.length, 4, 'a cancelled request must never be cached as authorized');
  } finally { delete globalThis.window; }
});

test('native directory denials never fall back to HTTP and operation probes accept only a repository', async () => {
  const originalFetch = globalThis.fetch, calls = [];
  globalThis.fetch = async () => { throw new Error('Unexpected HTTP fallback'); };
  globalThis.window = { __TAURI_INTERNALS__: { invoke: async (command, args) => {
    calls.push({ command, args });
    if (command === 'paths_exist') return [false, false, false, true];
    if (command === 'list_repository_permissions') return [temporary];
    throw new Error('Directory access denied');
  } } };
  try {
    assert.equal((await app.validateDirectoryPath(outside)).requiresAuthorization, true);
    await assert.rejects(app.validateDirectoryPath(outside, true), /Directory access denied/);
    await assert.rejects(app.listDirectories(), /Directory access denied/);
    const state = await app.gitService.getRepoOperationState(temporary, { unstaged: [] });
    assert.equal(state.type, 'merge');
    const probe = calls.find(call => call.command === 'paths_exist');
    assert.deepEqual(probe.args, { repoPath: temporary, gitBinary: 'git' });
  } finally { globalThis.fetch = originalFetch; delete globalThis.window; }
});

test('clone configuration bypasses are rejected before a custom SSH command can run', async () => {
  const marker = path.join(temporary, 'clone-ssh-marker'), helper = path.join(temporary, 'clone-ssh-probe.sh');
  await fs.writeFile(helper, `#!/bin/sh\nprintf 'executed\\n' > '${marker.replaceAll('\\', '/')}'\nexit 1\n`);
  const override = `core.sshCommand=sh '${helper.replaceAll('\\', '/')}'`;
  for (const flags of [['-c', override], ['-c' + override], ['-qnc', override]]) {
    const response = await post('git', { args: ['clone', ...flags, '--', 'ssh://review.invalid/unused.git', path.join(temporary, 'blocked-clone')], cwd: temporary });
    assert.equal(response.status, 400); assert.match((await response.json()).error, /Unsupported Git option/);
    assert.equal(await fs.stat(marker).then(() => true, () => false), false);
  }
});

test('browser requests cannot select an arbitrary executable named Git on any Git endpoint', async () => {
  const executable = path.join(temporary, process.platform === 'win32' ? 'git.exe' : 'git');
  await fs.writeFile(executable, 'not a trusted executable');
  for (const [endpoint, data] of [
    ['git', { args: ['--version'], cwd: temporary }],
    ['git-image', { repoPath: temporary, filePath: 'image.png', revision: 'INDEX' }],
    ['fs/ignore-file', { repoPath: temporary, scope: 'local' }],
  ]) {
    const response = await post(endpoint, { ...data, gitBinary: executable });
    assert.equal(response.status, 400); assert.match((await response.json()).error, /approve|approved/);
  }
});

test('the hardened policy still permits local clone, init and linked worktree creation', async () => {
  const source = path.join(temporary, 'source'); await fs.mkdir(source);
  const git = (...args) => execFileSync('git', args, { cwd: source, windowsHide: true, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  git('init', '-b', 'main'); git('config', 'user.name', 'Policy Test'); git('config', 'user.email', 'policy@example.invalid');
  await fs.writeFile(path.join(source, 'file.txt'), 'base\n'); git('add', '--', 'file.txt'); git('commit', '-m', 'base');
  const initialized = path.join(temporary, 'initialized'); await fs.mkdir(initialized);
  for (const data of [
    { args: ['clone', '--', source, path.join(temporary, 'cloned')], cwd: temporary },
    { args: ['init', '-b', 'main'], cwd: initialized },
    { args: ['worktree', 'add', '-b', 'review', '--', path.join(temporary, 'worktree'), 'main'], cwd: source },
  ]) {
    const response = await post('git', data);
    assert.equal(response.status, 200); const result = await response.json(); assert.equal(result.exitCode, 0, result.stderr);
  }
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
