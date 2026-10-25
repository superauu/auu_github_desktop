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
    // 跳检走私：log 的 -m 是开关不取值，后面的 blocked 选项必须仍然被检查；
    // 取值 flag 的值本身（commit -m / merge -m）也必须过全部选项检查。
    ['log', '-m', '--format=x', '-m', '--output=' + path.join(outside, 'evil'), '-1'],
    ['log', '-m', '--output=' + path.join(outside, 'evil')],
    ['commit', '-m', '--exec=evil'], ['merge', '-m', '--strategy=evil'], ['tag', '-m', '--output=evil'],
    ['clone', '-qb', '-c-branch', '--', 'url', 'target'],
    // 任意文件读写载体：hash-object -w、commit/tag 的 -F/--file、blame --contents、pathspec-from-file。
    ['hash-object', '-w', 'file'], ['hash-object', '-wfile'],
    ['commit', '-F', 'file'], ['commit', '--file=x'], ['commit', '-t', 'file'], ['commit', '-C', 'HEAD'],
    ['tag', '-F', 'file'], ['merge', '-F', 'file'], ['blame', '--contents', 'file'],
    ['commit', '--pathspec-from-file=outside'], ['add', '--pathspec-from-file=outside'],
    // 未来多键值 config 写入与越界目标。
    ['config', '--local', 'user.name', 'a', 'user.email', 'b'],
    ['config', '--local', '--replace-all', '--', 'auugit.x', 'v', 'core.hooksPath', 'evil'],
    ['config', '--list', 'a', 'b', 'c'],
    ['clone', '--', 'file://outside/repo', 'target'],
    ['init', path.join(outside, 'evil')], ['init', '..'], ['init', '--', path.join(outside, 'evil')],
    ['worktree', 'move', 'wt', path.join(outside, 'evil')], ['worktree', 'move', 'wt', '../evil'],
    ['diff', '--no-index', 'a', 'b'], ['diff', '--no-index', '--', 'a'],
    ['diff', '--no-index', '--', path.join(outside, 'secret'), 'b'],
    ['diff', '--no-index', '--', 'a', '../secret'],
    // bisect 的执行/重放/图形子命令、未列出的子命令、裸调用与选项走私一律拒绝。
    ['bisect'], ['bisect', 'help'], ['bisect', 'run', 'make'], ['bisect', 'run'],
    ['bisect', 'replay', 'log.txt'], ['bisect', 'visualize'], ['bisect', 'visualize', '--', 'HEAD'],
    ['bisect', 'view', 'HEAD'], ['bisect', 'start', '--term-new=broken', 'HEAD'],
    ['bisect', 'bad', '--term-good=x'], ['bisect', 'log', '--output=evil'],
  ];
  for (const args of rejected) assert.throws(() => app.validateGitArguments(args), undefined, JSON.stringify(args));
  for (const args of [['clone', '-qbbranch-with-c', '--', 'url', 'target'], ['clone', '--', '-c-url', 'target'], ['clone', '--', 'https://example.invalid/repo.git', 'target'], ['cherry-pick', '-s', 'HEAD'], ['merge', '--signoff', '--end-of-options', 'main'], ['init', '-b', 'main'], ['init', '.'], ['worktree', 'add', '-b', 'review', '--', 'dest', 'main']]) assert.doesNotThrow(() => app.validateGitArguments(args));
  for (const args of [
    ['-c', 'core.quotepath=false', 'status', '-z'],
    ['commit', '-m', 'hello world'], ['commit', '-m', '-- high priority'],
    ['tag', '-a', 'v1', '-m', 'release'],
    ['stash', 'push', '-u', '-m', 'wip'],
    ['update-ref', '-m', 'AuuGit Redo', 'refs/heads/x', 'a'.repeat(40), 'b'.repeat(40)],
    ['log', '-n', '5', '--format=%h'], ['reflog', 'show', '--all', '-n', '150', '--format=%H'],
    ['checkout', '-b', 'feature'], ['switch', '--track', '-c', 'x', 'refs/remotes/origin/x'],
    ['hash-object', '--no-filters', '--', 'file'], ['blame', '--line-porcelain', '--', 'file'],
    ['add', '--pathspec-from-file=-', '--pathspec-file-nul'],
    ['commit', '--only', '-m', 'message', '--pathspec-from-file=-', '--pathspec-file-nul'],
    ['config', '--local', 'branch.main.pushRemote', 'origin'], ['config', '--get', 'core.ignorecase'],
    ['config', '--get', 'core.ignorecase', 'pat'], ['config', '--local', '-z', '--get-regexp', '^auugit\\.'],
    ['-c', `sequence.editor=printf '%s\\n' 'pick ${'a'.repeat(40)}' 'fixup ${'b'.repeat(40)}' > "$1"; :`, 'rebase', '--interactive', 'HEAD'],
    // bisect 向导的真实形态：位置 rev、-- 后的路径限定与无参数子命令放行。
    ['bisect', 'start', 'a'.repeat(40), 'HEAD~9'],
    ['bisect', 'start', 'HEAD', 'HEAD~3', '--', 'src/'],
    ['bisect', 'bad'], ['bisect', 'good', 'a'.repeat(40)], ['bisect', 'new', 'HEAD'],
    ['bisect', 'old', 'a'.repeat(40)], ['bisect', 'skip', 'a'.repeat(40)], ['bisect', 'skip', '--', 'a'.repeat(40)],
    ['bisect', 'reset'], ['bisect', 'log'], ['bisect', 'terms'],
  ]) assert.doesNotThrow(() => app.validateGitArguments(args));
});

test('git policy helpers classify devices, operand shapes and local clone sources', () => {
  assert.equal(app.isNullDevice('nul'), true);
  assert.equal(app.isNullDevice('NUL'), true);
  assert.equal(app.isNullDevice('/dev/null'), true);
  assert.equal(app.isNullDevice('nul:'), false);
  assert.equal(app.isNullDevice('C:/x'), false);
  assert.deepEqual(app.noIndexPaths(['diff', '--no-index', '--no-color', '--', 'nul', 'a/b'], 0), ['nul', 'a/b']);
  assert.deepEqual(app.noIndexPaths(['diff', '--no-index', '--', '/dev/null', 'file'], 0), ['/dev/null', 'file']);
  assert.deepEqual(app.noIndexPaths(['check-ignore', '--no-index', '-z'], 0), []);
  assert.equal(app.initTarget(['init', '-b', 'main'], 0), null);
  assert.equal(app.initTarget(['init', '-b', 'main', 'sub'], 0), 'sub');
  assert.equal(app.initTarget(['init', '--', 'sub'], 0), 'sub');
  assert.deepEqual(app.worktreeMoveTargets(['worktree', 'move', 'wt', 'dest'], 0), ['wt', 'dest']);
  assert.deepEqual(app.worktreeMoveTargets(['worktree', 'add', '--', 'dest'], 0), []);
  assert.equal(app.isLocalCloneSource('/repos/x'), true);
  assert.equal(app.isLocalCloneSource('./x'), true);
  assert.equal(app.isLocalCloneSource('plain-dir'), true);
  assert.equal(app.isLocalCloneSource('https://example.invalid/r.git'), false);
  assert.equal(app.isLocalCloneSource('ssh://example.invalid/r.git'), false);
  assert.equal(app.isLocalCloneSource('git@example.invalid:r.git'), false);
  assert.equal(app.isLocalCloneSource('file://outside/repo'), true);
  // 传输目标按本地 file 传输处理时的路径形态（与 Rust local_transport_path 一致）。
  assert.equal(app.localTransportPath('plain'), 'plain');
  assert.equal(app.localTransportPath('./x'), './x');
  assert.equal(app.localTransportPath('/repos/x'), '/repos/x');
  assert.equal(app.localTransportPath('https://example.invalid/r.git'), null);
  assert.equal(app.localTransportPath('ssh://example.invalid/r.git'), null);
  assert.equal(app.localTransportPath('git@example.invalid:r.git'), null);
  assert.equal(app.localTransportPath('host:r.git'), null);
  assert.equal(app.localTransportPath('file:E:/x'), null);
  assert.equal(app.localTransportPath('file://example.invalid/x'), null);
  assert.equal(app.localTransportPath('file://'), null);
  assert.equal(app.localTransportPath('FILE://localhost/repos/x'), '/repos/x');
  assert.equal(app.localTransportPath('file:///repos/a%20b'), '/repos/a b');
  assert.equal(app.localTransportPath('file:///repos/%2E%2E'), '/repos/..');
  assert.equal(app.localTransportPath('file:///a%zz'), '/a%zz');
  if (process.platform === 'win32') {
    assert.equal(app.localTransportPath('C:/repos/x'), 'C:/repos/x');
    assert.equal(app.localTransportPath('file://E:/repos/x'), 'E:/repos/x');
    assert.equal(app.localTransportPath('file:///E:/repos/x'), 'E:/repos/x');
    assert.equal(app.localTransportPath('file://E:\\repos\\x'), 'E:\\repos\\x');
  } else {
    assert.equal(app.localTransportPath('C:/repos/x'), null);
    assert.equal(app.localTransportPath('file:///E:/repos/x'), '/E:/repos/x');
  }
  // push/fetch/pull 的传输目标候选（与 Rust transport_candidates 一致）：取值选项的值、
  // refspec 与未知选项都不会被误读成 <repository>。
  assert.deepEqual(app.transportCandidates(['--all']), 'all');
  assert.deepEqual(app.transportCandidates(['origin']), { explicit: ['origin'] });
  assert.deepEqual(app.transportCandidates(['--prune', 'origin', 'refs/heads/main']), { explicit: ['origin'] });
  assert.deepEqual(app.transportCandidates(['+main:main']), { explicit: ['+main:main'] });
  assert.deepEqual(app.transportCandidates(['--multiple', 'a', 'b']), { explicit: ['a', 'b'] });
  assert.equal(app.transportCandidates([]), 'upstream');
  assert.equal(app.transportCandidates(['--rebase']), 'upstream');
  assert.deepEqual(app.transportCandidates(['--', 'origin', 'main']), { explicit: ['origin'] });
  assert.deepEqual(app.transportCandidates(['--depth', '1', 'origin']), { explicit: ['origin'] });
  assert.deepEqual(app.transportCandidates(['--shallow-exclude', './inside', 'origin']), { explicit: ['origin'] });
  assert.deepEqual(app.transportCandidates(['--force-with-lease=refs/heads/x:o', 'origin']), { explicit: ['origin'] });
  assert.deepEqual(app.transportCandidates(['-qf', 'origin']), { explicit: ['origin'] });
  assert.deepEqual(app.transportCandidates(['-o', 'x', 'origin']), { explicit: ['origin'] });
  assert.deepEqual(app.transportCandidates(['-qovalue', 'origin']), { explicit: ['origin'] });
  assert.equal(app.transportCandidates(['--unknown', 'origin']), null);
  assert.equal(app.transportCandidates(['-s', 'ort', 'origin']), null);
  assert.equal(app.transportCandidates(['--']), 'upstream');
  if (process.platform === 'win32') {
    assert.equal(app.isLocalCloneSource('C:/repos/x'), true);
    assert.equal(app.isLocalCloneSource('C:x'), true);
    assert.equal(app.isLocalCloneSource('host:r.git'), false);
  }
});

test('development git endpoint rejects smuggled values and off-repository file access', async () => {
  const repository = path.join(temporary, 'policy-repo');
  await fs.mkdir(repository, { recursive: true });
  await fs.writeFile(path.join(repository, 'untracked.txt'), 'new content\n');
  for (const args of [
    ['log', '-m', '--format=x', '-m', '--output=' + path.join(outside, 'evil'), '-1'],
    ['diff', '--no-index', 'a', 'b'],
    ['diff', '--no-index', '--', path.join(outside, 'secret.txt'), 'b'],
    ['hash-object', '-w', 'untracked.txt'],
    ['init', path.join(outside, 'evil')],
    ['worktree', 'move', 'wt', path.join(outside, 'evil')],
    // file:// 源可解析为本地路径时交给授权表：越界源在端点层拒绝（纯层只拒绝无法解析的形态）。
    ['clone', '--', 'file://' + path.join(outside, 'secret'), path.join(temporary, 'bad-clone')],
    // bisect run（任意命令执行）与 replay（外部文件重放）在端点层同样拒绝。
    ['bisect', 'run', 'make'],
    ['bisect', 'replay', 'log.txt'],
    ['bisect', 'start', '--term-new=broken', 'HEAD'],
  ]) {
    const response = await post('git', { args, cwd: repository });
    assert.equal(response.status, 400, JSON.stringify(args));
    assert.match((await response.json()).error, /Unsupported|requires|stay inside|outside/);
  }
  assert.equal(await fs.access(path.join(outside, 'evil')).then(() => true, () => false), false);
  // 合法的 untracked diff（空设备 + 仓库内相对路径）保持可用。
  // Git for Windows 直接支持 /dev/null；测试仓库嵌套在项目仓库内时 NUL 会被 git 的 prefix 破坏。
  const diff = await post('git', { args: ['diff', '--no-index', '--no-color', '--', '/dev/null', 'untracked.txt'], cwd: repository });
  assert.equal(diff.status, 200);
  const result = await diff.json();
  assert.equal(result.exitCode, 1);
  assert.match(result.stdout, /untracked\.txt/);
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

test('push and fetch grant the local transport only for authorized local remotes', async () => {
  const work = path.join(temporary, 'transport-repo'), mirror = path.join(temporary, 'mirror.git');
  const git = (...args) => execFileSync('git', args, { cwd: work, windowsHide: true, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  execFileSync('git', ['init', '-b', 'main', work], { windowsHide: true, stdio: 'ignore' });
  execFileSync('git', ['init', '--bare', mirror], { windowsHide: true, stdio: 'ignore' });
  git('config', 'user.name', 'Policy Test'); git('config', 'user.email', 'policy@example.invalid');
  await fs.writeFile(path.join(work, 'file.txt'), 'base\n'); git('add', '--', 'file.txt'); git('commit', '-m', 'base');
  git('remote', 'add', 'origin', mirror);
  git('remote', 'add', 'fileform', 'file:///' + mirror.replaceAll('\\', '/'));
  // 授权根内的本地 remote：remote 名、直接路径、file:// 形式都能推送。
  for (const [label, args] of [
    ['named remote', ['push', 'origin', 'refs/heads/main:refs/heads/main']],
    ['direct path', ['push', mirror, 'refs/heads/main:refs/heads/path-branch']],
    ['file:// form', ['push', 'fileform', 'refs/heads/main:refs/heads/file-branch']],
  ]) {
    const response = await post('git', { args, cwd: work });
    assert.equal(response.status, 200, label);
    const result = await response.json();
    assert.equal(result.exitCode, 0, `${label}: ${result.stderr}`);
  }
  // fetch --all、指定 remote、裸 pull（上游远程解析）同样获得放行。
  git('fetch', 'origin');
  git('branch', '--set-upstream-to=origin/main');
  for (const [label, args] of [
    ['fetch --all', ['fetch', '--all']],
    ['named fetch', ['fetch', 'origin', 'refs/heads/main']],
    ['bare pull', ['pull', '--rebase']],
  ]) {
    const response = await post('git', { args, cwd: work });
    assert.equal(response.status, 200, label);
    const result = await response.json();
    assert.equal(result.exitCode, 0, `${label}: ${result.stderr}`);
  }
  // 越界的本地 remote（remote 名或直接路径）回落默认白名单，由 git 报传输错误而非放行。
  const outsideMirror = path.join(outside, 'outside-mirror.git');
  execFileSync('git', ['init', '--bare', outsideMirror], { windowsHide: true, stdio: 'ignore' });
  git('remote', 'add', 'elsewhere', outsideMirror);
  await fs.writeFile(path.join(work, 'file.txt'), 'second\n'); git('add', '--', 'file.txt'); git('commit', '-m', 'second');
  for (const [label, args] of [
    ['outside named remote', ['push', 'elsewhere', 'refs/heads/main']],
    ['outside direct path', ['push', outsideMirror, 'refs/heads/main']],
    ['outside file:// form', ['push', 'file://' + outsideMirror.replaceAll('\\', '/'), 'refs/heads/main']],
  ]) {
    const response = await post('git', { args, cwd: work });
    assert.equal(response.status, 200, label);
    const result = await response.json();
    assert.notEqual(result.exitCode, 0, `${label}: must stay blocked`);
    assert.match(result.stderr, /not allowed|does not appear/, label);
  }
  assert.equal(await fs.access(path.join(outsideMirror, 'refs', 'heads', 'main')).then(() => true, () => false), false);
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
