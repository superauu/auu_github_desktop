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
const values = new Map();
globalThis.localStorage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: (key) => values.delete(key) };
let tmp, app, server, base;
let repoIndex = 0;
const headers = { 'Content-Type': 'application/json', 'X-AuuGit-Request': '1' };
const git = (repo, ...args) => {
  const result = spawnSync('git', ['-c', 'core.quotepath=false', ...args], { cwd: repo, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || result.error?.message);
  return result.stdout;
};
const file = (repo, name) => path.join(repo, name);
async function repository() {
  const repo = path.join(tmp, `repo-${++repoIndex}`); await fs.mkdir(repo);
  git(repo, 'init', '-b', 'main'); git(repo, 'config', 'user.name', 'Regression'); git(repo, 'config', 'user.email', 'review@example.invalid'); git(repo, 'config', 'core.autocrlf', 'false');
  return repo;
}
async function commit(repo, name = 'initial') { git(repo, 'add', '-A'); git(repo, 'commit', '-m', name); }
const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };
const info = (repo) => ({ id: repo, name: repo, path: repo, currentBranch: 'main', lastOpenedAt: 0 });
const clean = { currentBranch: 'main', ahead: 0, behind: 0, isClean: true, staged: [], unstaged: [], untracked: [] };
async function eventually(predicate) { for (let i = 0; i < 100; i++) { if (predicate()) return; await new Promise((r) => setTimeout(r, 20)); } assert.fail('Timed out waiting for state'); }
function stub(target, replacements) { const originals = Object.fromEntries(Object.keys(replacements).map((key) => [key, target[key]])); Object.assign(target, replacements); return () => Object.assign(target, originals); }

before(async () => {
  tmp = await fs.mkdtemp(path.join(root, '.test-tmp-'));
  const bundle = path.join(tmp, 'app.cjs');
  await build({ stdin: { contents: `export * from './src/services/git/PorcelainParser'; export * from './src/services/git/GitQueue'; export * from './src/stores/workspaceSessionStore'; export * from './src/utils/cursorThemes'; export {gitService} from './src/services/git/GitService'; export {useRepoStore} from './src/stores/repoStore'; export {useGitHubStore} from './src/stores/githubStore'; export {githubService, GitHubApiError} from './src/services/github/GitHubService'; export {aiCommitService} from './src/services/ai/AiCommitService'; export {getCommitScope} from './src/services/git/commitScope'; export {fitWorkspacePanels} from './src/utils/workspaceSizing'; export {useSettingsStore} from './src/stores/settingsStore'; export {useToastStore} from './src/stores/toastStore';`, resolveDir: root }, bundle: true, platform: 'node', format: 'cjs', outfile: bundle, alias: { '@': path.join(root, 'src') }, logLevel: 'silent' });
  app = createRequire(import.meta.url)(bundle);
  server = await createServer({ configFile: path.join(root, 'vite.config.ts'), server: { host: '127.0.0.1', port: 0, strictPort: false, watch: null } });
  await server.listen(); base = `http://127.0.0.1:${server.httpServer.address().port}`;
  globalThis.fetch = (url, init) => nativeFetch(typeof url === 'string' && url.startsWith('/api/') ? base + url : url, init);
});
after(async () => {
  app?.useGitHubStore.getState().clearRepo(); globalThis.fetch = nativeFetch;
  await server?.close();
  if (tmp && path.dirname(tmp) === root && path.basename(tmp).startsWith('.test-tmp-')) await fs.rm(tmp, { recursive: true, force: true });
});

test('porcelain preserves renamed paths containing spaces and NUL-delimited special characters', async () => {
  const repo = await repository(); await fs.writeFile(file(repo, 'old name.txt'), 'hello\n'); await commit(repo);
  git(repo, 'mv', 'old name.txt', 'new name.txt');
  const status = await app.gitService.getStatus(repo);
  assert.equal(status.staged[0].path, 'new name.txt'); assert.equal(status.staged[0].oldPath, 'old name.txt');
  const raw = `2 RM N... 100644 100644 100644 a b R100 tab\tname.txt\0old name.txt\0? trailing \0`;
  const parsed = app.parsePorcelainV2(raw);
  assert.equal(parsed.staged[0].path, 'tab\tname.txt'); assert.equal(parsed.unstaged[0].status, 'modified'); assert.equal(parsed.untracked[0].path, 'trailing ');
});

test('hunk staging supports tracked empty files, deletions, header-like lines and missing final newline', async () => {
  const repo = await repository(); await fs.writeFile(file(repo, 'empty.txt'), ''); await fs.writeFile(file(repo, 'text.txt'), '-- old\n'); await commit(repo);
  await fs.writeFile(file(repo, 'empty.txt'), 'added\n');
  let hunks = app.groupDiffIntoHunks(await app.gitService.getFileDiff(repo, 'empty.txt'));
  await app.gitService.stageHunk(repo, 'empty.txt', hunks[0]); assert.equal(git(repo, 'show', ':empty.txt'), 'added\n');
  await app.gitService.unstageHunk(repo, 'empty.txt', app.groupDiffIntoHunks(await app.gitService.getFileDiff(repo, 'empty.txt', true))[0]); assert.equal(git(repo, 'show', ':empty.txt'), '');
  await fs.writeFile(file(repo, 'text.txt'), '++ new');
  hunks = app.groupDiffIntoHunks(await app.gitService.getFileDiff(repo, 'text.txt'));
  await app.gitService.stageHunk(repo, 'text.txt', hunks[0]); assert.equal(git(repo, 'show', ':text.txt'), '++ new');
  await commit(repo, 'modified'); await fs.unlink(file(repo, 'text.txt'));
  await app.gitService.stageHunk(repo, 'text.txt', app.groupDiffIntoHunks(await app.gitService.getFileDiff(repo, 'text.txt'))[0]);
  assert.match(git(repo, 'diff', '--cached', '--name-status'), /D\s+text.txt/);
});

test('hunk staging works in a linked Git worktree and for untracked files', async () => {
  const repo = await repository(); await fs.writeFile(file(repo, 'a.txt'), 'before\n'); await commit(repo);
  const worktree = path.join(tmp, 'linked'); git(repo, 'worktree', 'add', '-b', 'linked', worktree);
  await fs.writeFile(file(worktree, 'a.txt'), 'after\n');
  await app.gitService.stageHunk(worktree, 'a.txt', app.groupDiffIntoHunks(await app.gitService.getFileDiff(worktree, 'a.txt'))[0]);
  assert.equal(git(worktree, 'show', ':a.txt'), 'after\n');
  await fs.writeFile(file(worktree, 'new name.txt'), 'new\n');
  globalThis.navigator = { userAgent: process.platform === 'win32' ? 'Windows' : 'Linux' };
  await app.gitService.stageHunk(worktree, 'new name.txt', app.groupDiffIntoHunks(await app.gitService.getFileDiff(worktree, 'new name.txt', false, true))[0], true);
  assert.equal(git(worktree, 'show', ':new name.txt'), 'new\n');
});

test('Redo preserves staged and unstaged edits made after Undo and rejects an unrelated HEAD', async () => {
  const repo = await repository(); await fs.writeFile(file(repo, 'a.txt'), 'one\n'); await commit(repo);
  await fs.writeFile(file(repo, 'a.txt'), 'two\n'); await commit(repo, 'second'); const redo = git(repo, 'rev-parse', 'HEAD').trim();
  await app.gitService.undoLastCommit(repo); await fs.writeFile(file(repo, 'a.txt'), 'staged edit\n'); git(repo, 'add', 'a.txt'); await fs.writeFile(file(repo, 'a.txt'), 'later edit\n');
  await app.gitService.redoCommit(repo, redo);
  assert.equal(git(repo, 'show', ':a.txt'), 'staged edit\n'); assert.equal(await fs.readFile(file(repo, 'a.txt'), 'utf8'), 'later edit\n');
  await commit(repo, 'third'); await assert.rejects(app.gitService.redoCommit(repo, redo), /HEAD changed/);
});

test('root and merge commits expose their files against the first parent', async () => {
  const repo = await repository(); await fs.writeFile(file(repo, 'root.txt'), 'root\n'); await commit(repo);
  assert.equal((await app.gitService.getCommitFiles(repo, 'HEAD'))[0].path, 'root.txt');
  git(repo, 'checkout', '-b', 'topic'); await fs.writeFile(file(repo, 'topic.txt'), 'topic\n'); await commit(repo, 'topic'); git(repo, 'checkout', 'main');
  await fs.writeFile(file(repo, 'main.txt'), 'main\n'); await commit(repo, 'main'); git(repo, 'merge', '--no-edit', 'topic');
  assert.deepEqual((await app.gitService.getCommitFiles(repo, 'HEAD')).map((f) => f.path), ['topic.txt']);
});

test('remote feature/topic checkout creates a local tracking branch', async () => {
  const repo = await repository(); await fs.writeFile(file(repo, 'a'), 'a'); await commit(repo);
  git(repo, 'remote', 'add', 'origin', repo); git(repo, 'update-ref', 'refs/remotes/origin/feature/topic', 'HEAD');
  await app.gitService.checkoutBranch(repo, 'origin/feature/topic');
  assert.equal(git(repo, 'branch', '--show-current').trim(), 'feature/topic'); assert.equal(git(repo, 'rev-parse', '--abbrev-ref', '@{u}').trim(), 'origin/feature/topic');
});

test('cherry-pick becomes continuable after resolving and staging all conflicts', async () => {
  const repo = await repository(); await fs.writeFile(file(repo, 'conflict name.txt'), 'base\n'); await commit(repo);
  git(repo, 'checkout', '-b', 'topic'); await fs.writeFile(file(repo, 'conflict name.txt'), 'incoming\n'); await commit(repo, 'topic'); const incoming = git(repo, 'rev-parse', 'HEAD').trim();
  git(repo, 'checkout', 'main'); await fs.writeFile(file(repo, 'conflict name.txt'), 'ours\n'); await commit(repo, 'ours');
  spawnSync('git', ['cherry-pick', incoming], { cwd: repo, encoding: 'utf8' });
  const conflict = await app.gitService.getRepoOperationState(repo); assert.equal(conflict.type, 'cherry-pick'); assert.deepEqual(conflict.conflictedFiles, ['conflict name.txt']);
  await fs.writeFile(file(repo, 'conflict name.txt'), 'resolved\n'); git(repo, 'add', '-A');
  assert.equal((await app.gitService.getRepoOperationState(repo)).isAllResolved, true);
});

test('failed reads throw, traversal is refused and optimistic writes preserve external edits', async () => {
  const repo = await repository(); await fs.writeFile(file(repo, 'a.txt'), 'original');
  await assert.rejects(app.gitService.readWorkingFile(repo, 'missing.txt'));
  await assert.rejects(app.gitService.writeWorkingFile(repo, '../escape.txt', 'bad'), /Invalid/);
  await fs.writeFile(file(repo, 'binary'), Buffer.from([0xff, 0xfe])); await assert.rejects(app.gitService.readWorkingFile(repo, 'binary'));
  await assert.rejects(app.gitService.writeWorkingFile(repo, 'a.txt', 'overwrite', 'stale'));
  assert.equal(await fs.readFile(file(repo, 'a.txt'), 'utf8'), 'original');
  await app.gitService.writeWorkingFile(repo, 'a.txt', 'saved', 'original'); assert.equal(await fs.readFile(file(repo, 'a.txt'), 'utf8'), 'saved');
});

test('local API blocks foreign/simple requests, survives a failed spawn and supports other repositories', async () => {
  const repo = await repository();
  let res = await nativeFetch(base + '/api/git', { method: 'POST', headers: { ...headers, Origin: 'https://foreign.example.invalid' }, body: JSON.stringify({ args: ['--version'], cwd: repo }) }); assert.equal(res.status, 403);
  res = await nativeFetch(base + '/api/git', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ args: ['--version'] }) }); assert.equal(res.status, 403);
  res = await nativeFetch(base + '/api/git', { method: 'POST', headers, body: JSON.stringify({ args: ['--version'], gitBinary: path.join(tmp, 'missing', 'git.exe') }) }); assert.equal(res.status, 500);
  res = await nativeFetch(base + '/api/git', { method: 'POST', headers, body: JSON.stringify({ args: ['--version'], cwd: repo }) }); assert.equal(res.status, 200); assert.equal((await res.json()).exitCode, 0);
  res = await nativeFetch(base + '/api/fs/write-file', { method: 'POST', headers, body: JSON.stringify({ repoPath: repo, filePath: '../escape', content: 'no' }) }); assert.equal(res.status, 400);
});

test('late repository responses cannot replace a newer repository and local repos clear GitHub binding', async () => {
  const wait = deferred();
  const restore = stub(app.gitService, { getStatus: async (repo) => { if (repo === 'A') await wait.promise; return clean; }, getCommits: async () => [], getBranches: async () => [], getTags: async () => [], getStashes: async () => [], getRepoOperationState: async () => ({ type: 'none', conflictedFiles: [], inConflict: false, isAllResolved: false }), openRepository: async (repo) => info(repo) });
  try {
    app.useRepoStore.getState().setCurrentRepo(info('A')); const pending = app.useRepoStore.getState().refreshAll();
    app.useRepoStore.getState().setCurrentRepo(info('B')); await app.useRepoStore.getState().refreshAll();
    wait.resolve(); await pending; assert.equal(app.useRepoStore.getState().currentRepo.path, 'B');
    app.useGitHubStore.setState({ currentOwner: 'old', currentRepoName: 'old' }); app.useRepoStore.getState().setCurrentRepo(info('local')); await app.useRepoStore.getState().refreshAll();
    assert.equal(app.useGitHubStore.getState().currentOwner, null);
  } finally { restore(); app.useRepoStore.getState().setCurrentRepo(null); }
});

test('file selection ignores stale diffs and repeated edits refresh even with unchanged status codes', async () => {
  const repo = await repository(); await fs.writeFile(file(repo, 'a.txt'), 'base\n'); await commit(repo); await fs.writeFile(file(repo, 'a.txt'), 'first\n');
  app.useRepoStore.getState().setCurrentRepo(info(repo)); await app.useRepoStore.getState().refreshAll();
  await eventually(() => app.useRepoStore.getState().fileDiffLines.some((l) => l.content === '+first'));
  await fs.writeFile(file(repo, 'a.txt'), 'second\n'); await app.useRepoStore.getState().checkExternalChanges();
  await eventually(() => app.useRepoStore.getState().fileDiffLines.some((l) => l.content === '+second'));
  const a = deferred(), b = deferred(); const restore = stub(app.gitService, { getFileDiff: (repo, name) => name === 'A' ? a.promise : b.promise });
  try {
    app.useRepoStore.getState().setSelectedFile({ path: 'A', staged: false, status: 'modified' }); app.useRepoStore.getState().setSelectedFile({ path: 'B', staged: false, status: 'modified' });
    b.resolve([{ content: '+B' }]); await new Promise(setImmediate); a.resolve([{ content: '+A' }]); await new Promise(setImmediate);
    assert.equal(app.useRepoStore.getState().fileDiffLines[0].content, '+B');
  } finally { restore(); app.useRepoStore.getState().setCurrentRepo(null); }
});

test('GitHub results are scoped to the current binding and pagination loads older open PRs', async () => {
  const wait = deferred(); const restore = stub(app.githubService, { getRepository: async (owner) => { if (owner === 'A') await wait.promise; return { name: owner }; }, getWorkflows: async () => [], getWorkflowRuns: async () => [], getPullRequests: async () => [] });
  try {
    const pending = app.useGitHubStore.getState().syncRepo('A', 'repo'); await app.useGitHubStore.getState().syncRepo('B', 'repo'); wait.resolve(); await pending;
    assert.equal(app.useGitHubStore.getState().repoDetails.name, 'B');
  } finally { restore(); app.useGitHubStore.getState().clearRepo(); }
  const savedFetch = globalThis.fetch; let requests = 0;
  globalThis.fetch = async (url) => { requests++; assert.match(url, /state=open/); return new Response(JSON.stringify([{ number: requests }]), { headers: requests === 1 ? { Link: '<https://api.github.com/repos/o/r/pulls?state=open&page=2>; rel="next"' } : {} }); };
  try { assert.deepEqual((await app.githubService.getPullRequests('o', 'r', 'open')).map((pr) => pr.number), [1, 2]); } finally { globalThis.fetch = savedFetch; }
});

test('temporary authentication failures retain vault credentials; only 401 clears them', async () => {
  const calls = []; globalThis.window = { __TAURI_INTERNALS__: { invoke: async (command) => { calls.push(command); return command === 'get_github_token' ? 'vault-token' : null; } } };
  let restore = stub(app.githubService, { verifyToken: async () => { throw new TypeError('offline'); } });
  try { await app.useGitHubStore.getState().initAuth(); assert(!calls.includes('delete_github_token')); }
  finally { restore(); }
  restore = stub(app.githubService, { verifyToken: async () => { throw new app.GitHubApiError(401, 'invalid'); } });
  try { await app.useGitHubStore.getState().initAuth(); assert(calls.includes('delete_github_token')); }
  finally { restore(); delete globalThis.window; }
});

test('builtin AI never sends source to an external endpoint, and settings never persist an API key', async () => {
  const restore = stub(app.gitService, { getFileDiff: async () => [{ type: 'add', content: '+const privateSource = 1' }] });
  const savedFetch = globalThis.fetch; let requests = 0; globalThis.fetch = async () => { requests++; throw new Error('Unexpected network request'); };
  try {
    await app.aiCommitService.generateCommitMessage({ repoPath: 'unused', files: [{ path: 'private.ts', status: 'modified', staged: true }], aiConfig: { provider: 'builtin', apiKey: 'SECRET', endpoint: 'https://example.invalid/v1', model: 'model' } });
    assert.equal(requests, 0);
    app.useSettingsStore.getState().setAiConfig({ apiKey: 'SECRET', provider: 'builtin' }); assert(!values.get('auu_git_settings').includes('SECRET'));
    assert(!Object.hasOwn(JSON.parse(values.get('auu_git_settings')).aiConfig, 'apiKey'));
  } finally { restore(); globalThis.fetch = savedFetch; }
});

test('cancelled and timed-out CI checks are not announced as passing', async () => {
  app.useGitHubStore.setState({ currentOwner: 'owner', currentRepoName: 'repo' }); app.useToastStore.setState({ toasts: [] });
  const restore = stub(app.githubService, { getCommitChecks: async () => [{ name: 'test', status: 'completed', conclusion: 'timed_out' }] });
  const timer = globalThis.setTimeout; const scheduled = [];
  globalThis.setTimeout = (callback, delay) => { scheduled.push({ callback, delay }); return 12345; };
  try {
    app.useGitHubStore.getState().watchPushChecks('sha'); const poll = scheduled.find((item) => item.delay === 15000); await poll.callback();
    assert(!app.useToastStore.getState().toasts.some((toast) => toast.type === 'success')); assert(app.useToastStore.getState().toasts.some((toast) => toast.type === 'warning'));
  } finally { globalThis.setTimeout = timer; restore(); app.useGitHubStore.getState().clearRepo(); }
});


test('GitHub remote detection accepts dotted repository names and rejects lookalike hosts', async () => {
  const repo = await repository(); git(repo, 'remote', 'add', 'origin', 'https://github.com/owner/repo.name.git');
  let opened = await app.gitService.openRepository(repo); assert.equal(opened.gitHubRepo, 'repo.name');
  git(repo, 'remote', 'set-url', 'origin', 'https://evilgithub.com/owner/repo.git');
  opened = await app.gitService.openRepository(repo); assert.equal(opened.isGitHubRepo, false);
});

test('successful push clears loading state', async () => {
  const repo = await repository(); await fs.writeFile(file(repo, 'a.txt'), 'a'); await commit(repo);
  app.useRepoStore.getState().setCurrentRepo(info(repo)); await app.useRepoStore.getState().refreshAll();
  const restore = stub(app.gitService, { push: async () => {} });
  try { await app.useRepoStore.getState().push(); assert.equal(app.useRepoStore.getState().isLoading, false); }
  finally { restore(); app.useRepoStore.getState().setCurrentRepo(null); }
});

test('AI key vault initialization waits for an in-flight key save', async () => {
  let vault = null;
  globalThis.window = { __TAURI_INTERNALS__: { invoke: async (command, args) => {
    if (command === 'store_ai_key') { vault = args.key; return null; }
    if (command === 'get_ai_key') return vault;
    throw new Error('Unexpected native command');
  } } };
  try {
    app.useSettingsStore.getState().setAiConfig({ apiKey: 'VAULT_SECRET' }); await app.useSettingsStore.getState().initSecrets();
    assert.equal(vault, 'VAULT_SECRET'); assert.equal(app.useSettingsStore.getState().aiConfig.apiKey, 'VAULT_SECRET');
    assert(!values.get('auu_git_settings').includes('VAULT_SECRET'));
  } finally { delete globalThis.window; }
});

test('logout cannot be undone by an in-flight credential write', async () => {
  const wait = deferred(); let vault = null, started = false, deleted = false;
  globalThis.window = { __TAURI_INTERNALS__: { invoke: async (command, args) => {
    if (command === 'store_github_token') { started = true; await wait.promise; vault = args.token; }
    if (command === 'delete_github_token') { vault = null; deleted = true; }
    return null;
  } } };
  const restore = stub(app.githubService, { verifyToken: async () => ({ login: 'test' }) });
  try {
    const pending = app.useGitHubStore.getState().login('TOKEN'); await eventually(() => started);
    app.useGitHubStore.getState().logout(); wait.resolve(); await pending; await eventually(() => deleted);
    assert.equal(vault, null); assert.equal(app.useGitHubStore.getState().isAuthenticated, false);
  } finally { restore(); delete globalThis.window; }
});

test('PR checkout refuses to overwrite divergent local commits', async () => {
  const remote = await repository(); await fs.writeFile(file(remote, 'a'), 'base'); await commit(remote);
  git(remote, 'update-ref', 'refs/pull/1/head', 'HEAD');
  const local = path.join(tmp, `repo-${++repoIndex}`); git(root, 'clone', remote, local);
  git(local, 'config', 'user.name', 'Regression'); git(local, 'config', 'user.email', 'review@example.invalid');
  await app.gitService.fetchAndCheckoutPR(local, 1); await fs.writeFile(file(local, 'local'), 'unpublished'); await commit(local, 'local');
  const localTip = git(local, 'rev-parse', 'HEAD').trim();
  await fs.writeFile(file(remote, 'remote'), 'remote'); await commit(remote, 'remote'); git(remote, 'update-ref', 'refs/pull/1/head', 'HEAD');
  await assert.rejects(app.gitService.fetchAndCheckoutPR(local, 1));
  assert.equal(git(local, 'rev-parse', 'refs/heads/pr-1').trim(), localTip);
});


test('Redo refuses an external checkout even when both branches point at the expected parent', async () => {
  const repo = await repository(); await fs.writeFile(file(repo, 'a'), 'one'); await commit(repo);
  await fs.writeFile(file(repo, 'a'), 'two'); await commit(repo, 'two'); const redo = git(repo, 'rev-parse', 'HEAD').trim();
  await app.gitService.undoLastCommit(repo); git(repo, 'switch', '-c', 'other');
  await assert.rejects(app.gitService.redoCommit(repo, redo, 'main'), /Branch changed/);
  assert.equal(git(repo, 'branch', '--show-current').trim(), 'other');
});


test('message generation uses only the index when a file has staged and unstaged edits', async () => {
  const repo = await repository(); await fs.writeFile(file(repo, 'a.ts'), 'export const initial = 1;\n'); await commit(repo);
  await fs.writeFile(file(repo, 'a.ts'), 'export const stagedOnly = 2;\n'); git(repo, 'add', 'a.ts');
  await fs.writeFile(file(repo, 'a.ts'), 'export const unstagedSecret = 3;\n');
  await fs.writeFile(file(repo, 'untracked.ts'), 'export const unrelated = true;\n');
  const scope = app.getCommitScope(await app.gitService.getStatus(repo));
  assert.deepEqual(scope.files.map(f => [f.path, f.staged]), [['a.ts', true]]);
  assert.equal(scope.stageAll, false); assert.equal(scope.excluded.length, 2);
  const original = app.gitService.getFileDiff; const seen = [];
  const restore = stub(app.gitService, { getFileDiff: async (...args) => { seen.push(args); return original.apply(app.gitService, args); } });
  try {
    const result = await app.aiCommitService.generateCommitMessageResult({ repoPath: repo, files: scope.files, aiConfig: { provider: 'builtin', apiKey: '', endpoint: '', model: '' } });
    assert.deepEqual(seen.map(args => [args[1], args[2]]), [['a.ts', true]]);
    assert.equal(result.source, 'builtin'); assert.equal(result.fallback, false);
    assert(!result.message.includes('unstagedSecret')); assert(!result.message.includes('unrelated'));
  } finally { restore(); }
});

test('commit scope includes all work only for explicit stage-all commits and never for amend', () => {
  const unstaged = [{ path: 'a', status: 'modified', staged: false }];
  const untracked = [{ path: 'new', status: 'untracked', staged: false }];
  const status = { ...clean, unstaged, untracked, isClean: false };
  const normal = app.getCommitScope(status); assert.equal(normal.stageAll, true); assert.equal(normal.files.length, 2); assert.equal(normal.excluded.length, 0);
  const amend = app.getCommitScope(status, true); assert.equal(amend.stageAll, false); assert.equal(amend.files.length, 0); assert.equal(amend.excluded.length, 2);
  assert.deepEqual(app.getCommitScope(null).files, []);
});

test('generation reports actual model success and local fallback separately', async () => {
  const restore = stub(app.gitService, { getFileDiff: async () => [] });
  const saved = globalThis.fetch;
  const options = { repoPath: 'unused', files: [{ path: 'a.ts', status: 'modified', staged: true }], aiConfig: { provider: 'openai-compatible', endpoint: 'https://model.example.invalid/v1', apiKey: 'TEST', model: 'test-model' } };
  try {
    globalThis.fetch = async () => new Response(JSON.stringify({ choices: [{ message: { content: 'fix: real model result' } }] }), { headers: { 'Content-Type': 'application/json' } });
    const remote = await app.aiCommitService.generateCommitMessageResult(options);
    assert.equal(remote.source, 'llm'); assert.equal(remote.model, 'test-model'); assert.equal(remote.fallback, false); assert.equal(remote.message, 'fix: real model result');
    globalThis.fetch = async () => { throw new Error('Connection unavailable'); };
    const local = await app.aiCommitService.generateCommitMessageResult(options);
    assert.equal(local.source, 'builtin'); assert.equal(local.fallback, true); assert(!local.message.includes('real model result'));
    globalThis.fetch = async () => new Response(JSON.stringify({ choices: [{ message: { content: ' ' } }] }));
    const empty = await app.aiCommitService.generateCommitMessageResult(options);
    assert.equal(empty.source, 'builtin'); assert.equal(empty.fallback, true);
  } finally { globalThis.fetch = saved; restore(); }
});

test('PR description also reports local fallback after a configured model fails', async () => {
  const restore = stub(app.gitService, { getBranchDiff: async () => ({ files: [{ path: 'a', status: 'modified', staged: false }], patchText: '+ changed' }) });
  const saved = globalThis.fetch; globalThis.fetch = async () => { throw new Error('Connection unavailable'); };
  try {
    const result = await app.aiCommitService.generatePRDescriptionResult({ repoPath: 'unused', base: 'main', head: 'feature', aiConfig: { provider: 'openai-compatible', endpoint: 'https://model.example.invalid/v1', apiKey: 'TEST', model: 'model' } });
    assert.equal(result.source, 'builtin'); assert.equal(result.fallback, true); assert(result.message.includes('main...feature'));
  } finally { globalThis.fetch = saved; restore(); }
});


test('workspace sizing preserves a 640px main view across supported window sizes without mutating preferences', () => {
  for (const width of [900, 1240, 1280, 1480, 1600, 1920]) {
    for (const requested of [{ left: 200, right: 320, files: 260 }, { left: 500, right: 650, files: 500 }]) {
      const original = { ...requested };
      const visible = { left: width >= 1480, right: width >= 1240, files: true };
      const fitted = app.fitWorkspacePanels(width, requested, visible);
      const handles = Object.values(visible).filter(Boolean).length * 6;
      assert(width - fitted.left - fitted.right - fitted.files - handles >= 640);
      assert.deepEqual(requested, original);
      assert(fitted.files >= 160); assert.equal(Boolean(fitted.left), visible.left); assert.equal(Boolean(fitted.right), visible.right);
    }
  }
});

test('binary diffs remain visible and porcelain exposes the current HEAD', () => {
  assert.equal(app.parsePorcelainV2('# branch.oid abc123\0# branch.head main\0').headOid, 'abc123');
  const binary = app.parseDiffOutput('diff --git a/image.png b/image.png\nBinary files a/image.png and b/image.png differ\n');
  assert.equal(binary.length, 1); assert.match(binary[0].content, /Binary files/);
  assert.deepEqual(binary[0].patchHeader, []);
});

test('failed diff and history-file reads reject instead of pretending there are no changes', async () => {
  const missing = path.join(tmp, 'missing-repository');
  await assert.rejects(app.gitService.getFileDiff(missing, 'file.txt'));
  await assert.rejects(app.gitService.getCommitFiles(missing, 'HEAD'));
  await assert.rejects(app.gitService.getCommitFileDiff(missing, 'HEAD', 'file.txt'));
});

test('batch staging uses literal paths and initial commits can be unstaged without deleting files', async () => {
  const repo = await repository();
  await fs.writeFile(file(repo, 'a[1].txt'), 'literal'); await fs.writeFile(file(repo, 'a1.txt'), 'glob');
  await app.gitService.stageFiles(repo, ['a[1].txt']);
  assert.deepEqual((await app.gitService.getStatus(repo)).staged.map(f => f.path), ['a[1].txt']);
  await app.gitService.unstageFiles(repo, ['a[1].txt']);
  assert.equal((await app.gitService.getStatus(repo)).staged.length, 0);
  assert.equal(await fs.readFile(file(repo, 'a[1].txt'), 'utf8'), 'literal');
  await app.gitService.stageFile(repo, 'a[1].txt'); await app.gitService.unstageFile(repo, 'a[1].txt');
  assert.equal((await app.gitService.getStatus(repo)).staged.length, 0);
  await app.gitService.stageAll(repo); await app.gitService.unstageAll(repo);
  assert.equal((await app.gitService.getStatus(repo)).staged.length, 0);
  assert.equal(await fs.readFile(file(repo, 'a1.txt'), 'utf8'), 'glob');
  await commit(repo);
  await fs.writeFile(file(repo, 'a[1].txt'), 'changed');
  await app.gitService.stageFiles(repo, ['a[1].txt']); await app.gitService.unstageFiles(repo, ['a[1].txt']);
  assert.equal((await app.gitService.getStatus(repo)).unstaged[0].path, 'a[1].txt');
});

test('unchanged polling reads status once and does not reload history or branches', async () => {
  const repo = await repository(); await fs.writeFile(file(repo, 'a'), 'base'); await commit(repo);
  app.useRepoStore.getState().setCurrentRepo(info(repo)); await app.useRepoStore.getState().refreshAll();
  let logs = 0, branches = 0, statuses = 0;
  const originalStatus = app.gitService.getStatus.bind(app.gitService);
  const originalLog = app.gitService.getCommits.bind(app.gitService);
  const originalBranches = app.gitService.getBranches.bind(app.gitService);
  const restore = stub(app.gitService, {
    getStatus: (...args) => { statuses++; return originalStatus(...args); },
    getCommits: (...args) => { logs++; return originalLog(...args); },
    getBranches: (...args) => { branches++; return originalBranches(...args); },
  });
  try {
    const commits = app.useRepoStore.getState().commits;
    await app.useRepoStore.getState().checkExternalChanges();
    assert.equal(statuses, 1); assert.equal(logs, 0); assert.equal(branches, 0);
    assert.equal(app.useRepoStore.getState().commits, commits);
  } finally { restore(); app.useRepoStore.getState().setCurrentRepo(null); }
});

test('Git writes queue per repository, allow independent repositories and recover after rejection', async () => {
  const gate = deferred(), order = [];
  const first = app.serializeGitWrite('repo-A', async () => { order.push('first'); await gate.promise; throw new Error('expected'); });
  const rejected = assert.rejects(first, /expected/);
  const second = app.serializeGitWrite('repo-A', async () => { order.push('second'); });
  await app.serializeGitWrite('repo-B', async () => { order.push('independent'); });
  assert.deepEqual(order, ['first', 'independent']); assert.equal(app.getPendingGitWrites('repo-A'), 2);
  gate.resolve(); await rejected; await second; await new Promise(setImmediate);
  assert.deepEqual(order, ['first', 'independent', 'second']); assert.equal(app.getPendingGitWrites('repo-A'), 0);
});

test('drafts are isolated by repository and branch and survive storage rehydration', async () => {
  const store = app.useWorkspaceSessionStore; const previous = store.getState().drafts;
  const first = app.draftKey('repo-A', 'main'), second = app.draftKey('repo-A', 'feature'), third = app.draftKey('repo-B', 'main');
  try {
    store.getState().updateDraft(first, { title: 'Main draft' });
    store.getState().updateDraft(second, { title: 'Feature draft' });
    store.getState().updateDraft(third, { body: 'Other repository' });
    app.flushWorkspaceSession(); store.setState({ drafts: {} }); await store.persist.rehydrate();
    assert.equal(store.getState().drafts[first].title, 'Main draft');
    assert.equal(store.getState().drafts[second].title, 'Feature draft');
    assert.equal(store.getState().drafts[third].body, 'Other repository');
  } finally { store.setState({ drafts: previous }); app.flushWorkspaceSession(); }
});

test('history search finds commits outside the loaded page and resolves annotated tags', async () => {
  const repo = await repository(); await fs.writeFile(file(repo, 'a'), 'first'); await commit(repo, 'distant needle');
  const first = git(repo, 'rev-parse', 'HEAD').trim(); git(repo, 'tag', '-a', 'archive-release', '-m', 'annotated');
  await fs.writeFile(file(repo, 'a'), 'second'); await commit(repo, 'second');
  await fs.writeFile(file(repo, 'a'), 'third'); await commit(repo, 'third');
  assert(!(await app.gitService.getCommits(repo, 1)).some(commit => commit.hash === first));
  assert.equal((await app.gitService.findCommits(repo, 'distant needle'))[0].hash, first);
  assert.equal((await app.gitService.findCommits(repo, first.slice(0, 8)))[0].hash, first);
  assert.equal((await app.gitService.findCommits(repo, 'archive-release'))[0].hash, first);
  assert.equal(await app.gitService.getBranchCommitHash(repo, 'refs/tags/archive-release'), first);
  const page1 = await app.gitService.getCommits(repo, 2); const page2 = await app.gitService.getCommits(repo, 2, 2);
  assert.equal(new Set([...page1, ...page2].map(commit => commit.hash)).size, 3);
});

test('ignoring whitespace changes only the diff view, preserving complete file staging', async () => {
  const repo = await repository(); await fs.writeFile(file(repo, 'a.txt'), 'const value = 1;\n'); await commit(repo);
  await fs.writeFile(file(repo, 'a.txt'), 'const  value = 1;\n');
  assert((await app.gitService.getFileDiff(repo, 'a.txt')).some(line => line.type === 'add'));
  assert.equal((await app.gitService.getFileDiff(repo, 'a.txt', false, false, true)).length, 0);
  await app.gitService.stageFile(repo, 'a.txt');
  assert.equal(git(repo, 'show', ':a.txt'), 'const  value = 1;\n');
  assert.equal((await app.gitService.getFileDiff(repo, 'a.txt', true, false, true)).length, 0);
  git(repo, 'commit', '-m', 'spacing');
  assert((await app.gitService.getCommitFileDiff(repo, 'HEAD', 'a.txt')).some(line => line.type === 'add'));
  assert.equal((await app.gitService.getCommitFileDiff(repo, 'HEAD', 'a.txt', true)).length, 0);
});

test('history pagination keeps the page offset after locating a commit beyond the loaded page', async () => {
  const store = app.useRepoStore;
  const repo = 'pagination-repository'; let requestedSkip;
  const loaded = Array.from({ length: 100 }, (_, index) => ({ hash: `commit-${index}` }));
  const next = [{ hash: 'commit-100' }, { hash: 'located-commit' }];
  const restore = stub(app.gitService, { getCommits: async (_repo, _limit, skip) => { requestedSkip = skip; return next; } });
  try {
    store.getState().setCurrentRepo(info(repo));
    store.setState({ commits: [...loaded, { hash: 'located-commit' }], commitsLimit: 100, commitsLoadedAll: false });
    await store.getState().loadMoreCommits();
    assert.equal(requestedSkip, 100);
    assert.equal(store.getState().commits.length, 102);
    assert(store.getState().commits.some(commit => commit.hash === 'commit-100'));
  } finally { restore(); store.getState().setCurrentRepo(null); }
});

test('returning from history reloads the working diff without using the selected historical commit', async () => {
  const repo = await repository(); await fs.writeFile(file(repo, 'a.txt'), 'base\n'); await commit(repo);
  const store = app.useRepoStore;
  try {
    store.getState().setCurrentRepo(info(repo)); await store.getState().refreshAll();
    store.getState().setActiveTab('history');
    store.getState().setSelectedCommit(store.getState().commits[0]);
    await fs.writeFile(file(repo, 'a.txt'), 'working edit\n');
    await store.getState().checkExternalChanges();
    store.getState().setActiveTab('changes');
    await eventually(() => store.getState().fileDiffLines.some(line => line.content === '+working edit'));
    assert.equal(store.getState().fileDiffLoading, false);
  } finally { store.getState().setCurrentRepo(null); store.getState().setActiveTab('changes'); }
});

test('all curated cursors ship locally with valid hotspots and unknown preferences use the system cursor', async () => {
  assert.equal(app.CURSOR_STYLES.length, 14);
  assert.equal(new Set(app.CURSOR_STYLES.map(style => style.id)).size, 14);
  for (const invalid of [undefined, null, '', 'missing-theme', '__proto__', 'url(https://invalid.example)']) {
    assert.equal(app.normalizeCursorTheme(invalid), 'system');
  }
  for (const style of app.CURSOR_STYLES) {
    assert.equal(app.normalizeCursorTheme(style.id), style.id);
    for (const role of ['arrow', 'hand']) {
      const assetPath = style[role];
      assert(assetPath.startsWith('/cursors/'));
      const asset = await fs.readFile(path.join(root, 'public', assetPath));
      assert(asset.length > 0);
      const hotspot = role === 'arrow' ? style.hotspot : style.handHotspot;
      assert(hotspot.every(value => Number.isInteger(value) && value >= 0 && value < 32));
      if (assetPath.endsWith('.png')) { assert.equal(asset.readUInt32BE(16), 32); assert.equal(asset.readUInt32BE(20), 32); }
      else { assert.match(asset.toString('utf8'), /width="32"/); assert.match(asset.toString('utf8'), /height="32"/); }
    }
  }
});

test('cursor selection applies immediately, survives restart, resets to native and rejects stale saved themes', async () => {
  const settings = app.useSettingsStore;
  const previous = settings.getState(); const previousRaw = localStorage.getItem('auu_git_settings');
  const previousDocument = globalThis.document;
  const properties = new Map(); const dataset = {};
  globalThis.document = { documentElement: { style: { setProperty: (key, value) => properties.set(key, value), removeProperty: key => properties.delete(key) }, dataset, classList: { remove: () => {} } } };
  const require = createRequire(import.meta.url);
  const bundle = path.join(tmp, 'cursor-settings.cjs');
  try {
    settings.getState().setCursorTheme('nordzy-mocha-teal');
    assert.equal(dataset.cursorTheme, 'nordzy-mocha-teal');
    assert.match(properties.get('--app-cursor-default'), /arrow.png"\) 3 2, default$/);
    assert.match(properties.get('--app-cursor-pointer'), /hand.png"\) 9 3, pointer$/);
    assert.equal(JSON.parse(localStorage.getItem('auu_git_settings')).cursorTheme, 'nordzy-mocha-teal');
    await build({ stdin: { contents: `export {useSettingsStore} from './src/stores/settingsStore';`, resolveDir: root }, bundle: true, platform: 'node', format: 'cjs', outfile: bundle, alias: { '@': path.join(root, 'src') }, logLevel: 'silent' });
    const restart = () => { delete require.cache[bundle]; return require(bundle).useSettingsStore; };
    const restored = restart();
    assert.equal(restored.getState().cursorTheme, 'nordzy-mocha-teal');
    restored.getState().resetSettings();
    assert.equal(restored.getState().cursorTheme, 'system');
    assert.equal(properties.size, 0); assert.equal(dataset.cursorTheme, 'system');
    assert.equal(restart().getState().cursorTheme, 'system');
    localStorage.setItem('auu_git_settings', JSON.stringify({ cursorTheme: 'removed-theme' }));
    assert.equal(restart().getState().cursorTheme, 'system');
    assert.equal(properties.size, 0);
  } finally {
    settings.setState(previous);
    if (previousRaw === null) localStorage.removeItem('auu_git_settings'); else localStorage.setItem('auu_git_settings', previousRaw);
    if (previousDocument === undefined) delete globalThis.document; else globalThis.document = previousDocument;
  }
});
