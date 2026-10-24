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
  await build({ stdin: { contents: `export * from './src/services/git/RepositorySession'; export * from './src/services/git/PorcelainParser'; export * from './src/services/git/GitQueue'; export * from './src/stores/workspaceSessionStore'; export * from './src/utils/cursorThemes'; export * from './src/services/git/IgnoreService'; export * from './src/services/git/worktrees'; export {gitService} from './src/services/git/GitService'; export {useRepoStore} from './src/stores/repoStore'; export {useGitHubStore} from './src/stores/githubStore'; export {githubService, GitHubApiError} from './src/services/github/GitHubService'; export {aiCommitService} from './src/services/ai/AiCommitService'; export {getCommitScope} from './src/services/git/commitScope'; export {fitWorkspacePanels} from './src/utils/workspaceSizing'; export {useSettingsStore} from './src/stores/settingsStore'; export {useToastStore} from './src/stores/toastStore';`, resolveDir: root }, bundle: true, platform: 'node', format: 'cjs', outfile: bundle, alias: { '@': path.join(root, 'src') }, logLevel: 'silent' });
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
  res = await nativeFetch(base + '/api/git', { method: 'POST', headers, body: JSON.stringify({ args: ['--version'], gitBinary: path.join(tmp, 'missing', 'git.exe') }) }); assert.equal(res.status, 400);
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

test('startup rejects a removed saved repository before scheduling Git reads and preserves unrelated tabs', async () => {
  const store = app.useRepoStore; store.getState().setCurrentRepo(null);
  const missing = info(path.join(tmp, 'removed-session-repository')), other = info('/unrelated-repository');
  store.setState({ openTabs: [missing, other] });
  localStorage.setItem('auu_git_last_active_repo', JSON.stringify(missing));
  let reads = 0; const restore = stub(app.gitService, { openRepository: async () => { reads++; throw Error('should not read'); } });
  try {
    await app.restoreSavedRepository();
    assert.equal(reads, 0); assert.equal(store.getState().currentRepo, null);
    assert.equal(localStorage.getItem('auu_git_last_active_repo'), null);
    assert.deepEqual(store.getState().openTabs.map(tab => tab.path), [other.path]);
  } finally { restore(); store.setState({ openTabs: [] }); }
});

test('startup keeps a saved repository when directory validation is temporarily unavailable', async () => {
  const store = app.useRepoStore; store.getState().setCurrentRepo(null);
  const saved = JSON.stringify(info('/temporarily-unavailable'));
  localStorage.setItem('auu_git_last_active_repo', saved);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw Error('backend offline'); };
  try {
    await app.restoreSavedRepository();
    assert.equal(localStorage.getItem('auu_git_last_active_repo'), saved);
    assert.equal(store.getState().currentRepo, null);
  } finally { globalThis.fetch = originalFetch; localStorage.removeItem('auu_git_last_active_repo'); }
});

test('denied repository activation preserves the current repository, session and draft without background reads', async () => {
  const store = app.useRepoStore, previous = store.getState();
  const current = info('/current-approved'), denied = info('/denied-repository');
  const oldSaved = values.get('auu_git_last_active_repo');
  const draftsBefore = app.useWorkspaceSessionStore.getState().drafts;
  store.setState({ currentRepo: current, openTabs: [current], openingRepoPath: null, status: clean, errorMessage: null });
  values.set('auu_git_last_active_repo', JSON.stringify(current));
  app.useWorkspaceSessionStore.getState().updateDraft(app.draftKey(current.path, current.currentBranch), { title: 'Keep my draft' });
  const draftBefore = JSON.stringify(app.useWorkspaceSessionStore.getState().drafts);
  const approvals = deferred(), calls = [];
  const toastCount = app.useToastStore.getState().history.length;
  globalThis.window = { __TAURI_INTERNALS__: { invoke: async (command, args) => {
    calls.push({ command, args });
    if (command === 'authorize_repository') { await approvals.promise; throw 'AUUGIT_REPOSITORY_ACCESS_CANCELLED'; }
    throw Error('Unexpected read before approval');
  } } };
  try {
    const pending = store.getState().setCurrentRepo(denied);
    assert.equal(store.getState().currentRepo.path, current.path);
    assert.equal(store.getState().openingRepoPath, denied.path);
    approvals.resolve(); assert.equal(await pending, false);
    assert.equal(store.getState().currentRepo.path, current.path);
    assert.equal(store.getState().status, clean);
    assert.equal(store.getState().openingRepoPath, null);
    assert.deepEqual(store.getState().openTabs, [current]);
    assert.equal(store.getState().errorMessage, null);
    assert.equal(values.get('auu_git_last_active_repo'), JSON.stringify(current));
    assert.equal(JSON.stringify(app.useWorkspaceSessionStore.getState().drafts), draftBefore);
    assert.equal(app.useToastStore.getState().history.length, toastCount);
    assert.ok(calls.every(call => call.command === 'authorize_repository'));
  } finally {
    delete globalThis.window; store.setState(previous, true);
    app.useWorkspaceSessionStore.setState({ drafts: draftsBefore });
    if (oldSaved === undefined) values.delete('auu_git_last_active_repo'); else values.set('auu_git_last_active_repo', oldSaved);
  }
});

test('declining startup restoration keeps the saved repository available for a deliberate retry', async () => {
  const store = app.useRepoStore, previous = store.getState(), oldSaved = values.get('auu_git_last_active_repo');
  const saved = JSON.stringify(info('/declined-startup')), calls = [];
  store.setState({ currentRepo: null, openingRepoPath: null, openTabs: [], errorMessage: null });
  values.set('auu_git_last_active_repo', saved);
  const toastCount = app.useToastStore.getState().history.length;
  globalThis.window = { __TAURI_INTERNALS__: { invoke: async command => { calls.push(command); throw 'AUUGIT_REPOSITORY_ACCESS_CANCELLED'; } } };
  try {
    await app.restoreSavedRepository();
    assert.deepEqual(calls, ['authorize_repository']);
    assert.equal(store.getState().currentRepo, null);
    assert.equal(store.getState().errorMessage, null);
    assert.equal(values.get('auu_git_last_active_repo'), saved);
    assert.equal(app.useToastStore.getState().history.length, toastCount);
  } finally {
    delete globalThis.window; store.setState(previous, true);
    if (oldSaved === undefined) values.delete('auu_git_last_active_repo'); else values.set('auu_git_last_active_repo', oldSaved);
  }
});

test('a denied repository can be approved on retry and only then starts refresh', async () => {
  const store = app.useRepoStore, previous = store.getState(), oldSaved = values.get('auu_git_last_active_repo');
  const selected = info('/permission-retry'); let deny = true, refreshes = 0;
  store.setState({ currentRepo: null, openingRepoPath: null, openTabs: [], refreshAll: async () => { refreshes++; } });
  globalThis.window = { __TAURI_INTERNALS__: { invoke: async command => {
    assert.equal(command, 'authorize_repository');
    if (deny) throw 'AUUGIT_REPOSITORY_ACCESS_CANCELLED';
  } } };
  try {
    assert.equal(await store.getState().setCurrentRepo(selected), false);
    assert.equal(refreshes, 0); assert.equal(store.getState().currentRepo, null);
    deny = false;
    assert.equal(await store.getState().setCurrentRepo(selected), true);
    assert.equal(refreshes, 1); assert.equal(store.getState().currentRepo.path, selected.path);
    assert.equal(store.getState().openingRepoPath, null);
    assert.equal(JSON.parse(values.get('auu_git_last_active_repo')).path, selected.path);
  } finally {
    delete globalThis.window; store.setState(previous, true);
    if (oldSaved === undefined) values.delete('auu_git_last_active_repo'); else values.set('auu_git_last_active_repo', oldSaved);
  }
});

test('a startup approval cannot reopen an older repository after the user cancels a newer selection', async () => {
  const store = app.useRepoStore, previous = store.getState(), oldSaved = values.get('auu_git_last_active_repo');
  const saved = info('/older-startup'), newer = info('/newer-selection'), waiting = deferred(), calls = [];
  store.setState({ currentRepo: null, openingRepoPath: null, openTabs: [] });
  values.set('auu_git_last_active_repo', JSON.stringify(saved));
  globalThis.window = { __TAURI_INTERNALS__: { invoke: async (command, args) => {
    calls.push({ command, args }); assert.equal(command, 'authorize_repository');
    if (args.path === saved.path) { await waiting.promise; return; }
    throw 'AUUGIT_REPOSITORY_ACCESS_CANCELLED';
  } } };
  try {
    const startup = app.restoreSavedRepository();
    await eventually(() => calls.length === 1);
    assert.equal(await store.getState().setCurrentRepo(newer), false);
    waiting.resolve(); await startup;
    assert.equal(calls.length, 2);
    assert.equal(store.getState().currentRepo, null);
    assert.equal(store.getState().openingRepoPath, null);
  } finally {
    waiting.resolve(); delete globalThis.window; store.setState(previous, true);
    if (oldSaved === undefined) values.delete('auu_git_last_active_repo'); else values.set('auu_git_last_active_repo', oldSaved);
  }
});

test('closing the active tab never leaves a closed repository active when the fallback authorization is denied', async () => {
  const store = app.useRepoStore, previous = store.getState(), oldSaved = values.get('auu_git_last_active_repo');
  const current = info('/closing-approved'), fallback = info('/denied-fallback'), waiting = deferred();
  store.setState({ currentRepo: current, openingRepoPath: null, openTabs: [current, fallback] });
  globalThis.window = { __TAURI_INTERNALS__: { invoke: async command => {
    assert.equal(command, 'authorize_repository'); await waiting.promise; throw 'AUUGIT_REPOSITORY_ACCESS_CANCELLED';
  } } };
  try {
    store.getState().closeTab(current.path);
    assert.equal(store.getState().currentRepo, null);
    assert.equal(store.getState().openingRepoPath, fallback.path);
    waiting.resolve();
    await eventually(() => store.getState().openingRepoPath === null);
    assert.equal(store.getState().currentRepo, null);
    assert.deepEqual(store.getState().openTabs, [fallback]);
  } finally {
    waiting.resolve(); delete globalThis.window; store.setState(previous, true);
    if (oldSaved === undefined) values.delete('auu_git_last_active_repo'); else values.set('auu_git_last_active_repo', oldSaved);
  }
});

test('a cancelled startup restore cannot replace a repository the user opens later', async () => {
  const repo = await repository(); await fs.writeFile(file(repo, 'a'), 'a'); await commit(repo);
  const store = app.useRepoStore; store.getState().setCurrentRepo(null);
  localStorage.setItem('auu_git_last_active_repo', JSON.stringify(info(repo)));
  const waiting = deferred(); let opened = false, cancelled = false;
  const restore = stub(app.gitService, { openRepository: async () => { opened = true; return waiting.promise; } });
  try {
    const pending = app.restoreSavedRepository(() => cancelled);
    await eventually(() => opened); cancelled = true;
    const chosen = info('/user-selected-repository'); store.setState({ currentRepo: chosen });
    waiting.resolve(info(repo)); await pending;
    assert.equal(store.getState().currentRepo.path, chosen.path);
  } finally { restore(); store.getState().setCurrentRepo(null); }
});

test('missing repository directories produce a specific error rather than a misleading missing Git executable error', async () => {
  const missing = path.join(tmp, 'removed-git-directory');
  const response = await globalThis.fetch('/api/git', { method: 'POST', headers, body: JSON.stringify({ args: ['status'], cwd: missing }) });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).errorCode, 'REPOSITORY_DIRECTORY_UNAVAILABLE');
  await assert.rejects(app.gitService.getStatus(missing), error => /目录|directory/i.test(error.message) && !/ENOENT|HTTP 500/.test(error.message));
});

async function remoteFixture() {
  const repo = await repository(); await fs.writeFile(file(repo, 'base.txt'), 'base'); await commit(repo);
  const origin = path.join(tmp, `origin ${repoIndex}.git`), upstream = path.join(tmp, `upstream ${repoIndex}.git`);
  git(root, 'init', '--bare', origin); git(root, 'init', '--bare', upstream);
  git(repo, 'remote', 'add', 'origin', origin); git(repo, 'remote', 'add', 'upstream', upstream);
  git(repo, 'push', '-u', 'upstream', 'main');
  return { repo, origin, upstream };
}

test('push honors branch pushRemote, repository pushDefault and tracking remote, including URLs with spaces', async () => {
  const { repo, origin, upstream } = await remoteFixture();
  let context = await app.gitService.getPushContext(repo);
  assert.equal(context.remote, 'upstream'); assert.equal(context.upstream, 'upstream/main');
  git(repo, 'config', 'remote.pushDefault', 'origin');
  assert.equal((await app.gitService.getPushContext(repo)).remote, 'origin');
  git(repo, 'config', 'branch.main.pushRemote', 'upstream');
  assert.equal((await app.gitService.getPushContext(repo)).remote, 'upstream');
  git(repo, 'config', '--unset', 'branch.main.pushRemote');
  await app.gitService.push(repo);
  assert.equal(git(origin, 'rev-parse', 'refs/heads/main'), git(repo, 'rev-parse', 'HEAD'));
  assert.equal(git(repo, 'rev-parse', '--abbrev-ref', '@{u}').trim(), 'upstream/main');
  assert.equal(git(upstream, 'rev-parse', 'main'), git(repo, 'rev-parse', 'HEAD'));
});

test('pushing an explicit source branch uses its own tracking and supports a renamed destination without changing pull source', async () => {
  const { repo, origin } = await remoteFixture();
  git(repo, 'branch', 'topic/path');
  git(repo, 'config', 'branch.topic/path.remote', 'upstream'); git(repo, 'config', 'branch.topic/path.merge', 'refs/heads/main');
  git(repo, 'switch', '-c', 'untracked-current');
  await app.gitService.push(repo, 'origin', 'topic/path', { targetBranch: 'published/topic', setUpstream: false, rememberRemote: true });
  assert.equal(git(origin, 'rev-parse', 'refs/heads/published/topic'), git(repo, 'rev-parse', 'refs/heads/topic/path'));
  assert.equal(git(repo, 'config', 'branch.topic/path.remote').trim(), 'upstream');
  assert.equal(git(repo, 'config', 'branch.topic/path.merge').trim(), 'refs/heads/main');
  assert.equal(git(repo, 'config', 'branch.topic/path.pushRemote').trim(), 'origin');
  assert.equal((await app.gitService.getPushContext(repo, 'topic/path')).pushRemote, 'origin');
  await app.gitService.push(repo, 'origin', 'topic/path', { setUpstream: false, rememberRemote: false });
  assert.equal((await app.gitService.getPushContext(repo, 'topic/path')).pushRemote, undefined);
  assert.equal(git(repo, 'config', 'branch.topic/path.remote').trim(), 'upstream');
  assert.equal(git(repo, 'branch', '--show-current').trim(), 'untracked-current');
});

test('a successful push stays successful when remembering its remote fails because configuration is locked', async () => {
  const { repo, origin } = await remoteFixture();
  git(repo, 'commit', '--allow-empty', '-m', 'Published despite preference lock');
  const store = app.useRepoStore;
  store.getState().setCurrentRepo(info(repo)); await store.getState().refreshAll();
  app.useToastStore.setState({ toasts: [] });
  const lock = path.join(repo, '.git', 'config.lock');
  await fs.writeFile(lock, 'test-owned configuration lock');
  try {
    await store.getState().push('origin', 'main', { setUpstream: false, rememberRemote: true });
    assert.equal(git(origin, 'rev-parse', 'refs/heads/main'), git(repo, 'rev-parse', 'HEAD'));
    assert.equal(store.getState().errorMessage, null);
    assert.equal(store.getState().isLoading, false);
    const warning = app.useToastStore.getState().toasts.find(toast => toast.type === 'warning' && /推送已成功|Push succeeded/.test(toast.title));
    assert.ok(warning); assert.match(warning.description, /lock config file|config.*lock/);
    assert.equal(spawnSync('git', ['config', '--get', 'branch.main.pushRemote'], { cwd: repo }).status, 1);
  } finally { await fs.unlink(lock); store.getState().setCurrentRepo(null); }
});

test('publishing a new branch can leave tracking unset or explicitly establish a different-named upstream', async () => {
  const { repo, origin } = await remoteFixture(); git(repo, 'switch', '-c', 'fresh');
  await app.gitService.push(repo, 'origin', 'fresh', { setUpstream: false });
  assert.equal(spawnSync('git', ['config', '--get', 'branch.fresh.remote'], { cwd: repo }).status, 1);
  await app.gitService.push(repo, 'origin', 'fresh', { setUpstream: true, targetBranch: 'review/fresh' });
  assert.equal(git(repo, 'rev-parse', '--abbrev-ref', '@{u}').trim(), 'origin/review/fresh');
  await app.gitService.push(repo, 'origin', 'fresh', { setUpstream: false, unsetUpstream: true, targetBranch: 'review/fresh' });
  assert.equal((await app.gitService.getPushContext(repo, 'fresh')).upstream, undefined);
  await app.gitService.push(repo, 'origin', 'fresh', { setUpstream: true, rememberRemote: true, targetBranch: 'review/fresh' });
  const remembered = await app.gitService.getPushContext(repo, 'fresh');
  assert.equal(remembered.upstream, 'origin/review/fresh'); assert.equal(remembered.pushRemote, 'origin');
  assert.equal(git(origin, 'rev-parse', 'refs/heads/review/fresh'), git(repo, 'rev-parse', 'HEAD'));
});

test('fetch all updates multiple remotes and prune removes stale tracking refs while retaining local branches', async () => {
  const { repo, origin, upstream } = await remoteFixture();
  git(repo, 'push', 'origin', 'main:refs/heads/origin-only'); git(repo, 'push', 'upstream', 'main:refs/heads/upstream-only');
  git(repo, 'update-ref', '-d', 'refs/remotes/origin/origin-only'); git(repo, 'update-ref', '-d', 'refs/remotes/upstream/upstream-only');
  await app.gitService.fetch(repo);
  assert.equal(git(repo, 'rev-parse', 'origin/origin-only'), git(repo, 'rev-parse', 'upstream/upstream-only'));
  git(repo, 'branch', 'keep-local', 'origin/origin-only'); git(origin, 'update-ref', '-d', 'refs/heads/origin-only');
  await app.gitService.fetch(repo, 'origin', true);
  assert.equal(spawnSync('git', ['show-ref', '--verify', '--quiet', 'refs/remotes/origin/origin-only'], { cwd: repo }).status, 1);
  assert.equal(git(repo, 'rev-parse', 'keep-local'), git(upstream, 'rev-parse', 'main'));
});

test('remote branch deletion targets only the selected server branch, preserving same-named tags, other remotes and local branches', async () => {
  const { repo, origin, upstream } = await remoteFixture();
  git(repo, 'branch', 'feature/topic'); git(repo, 'tag', 'feature/topic');
  for (const name of ['origin', 'upstream']) git(repo, 'push', name, 'refs/heads/feature/topic:refs/heads/feature/topic', 'refs/tags/feature/topic');
  await app.gitService.deleteRemoteBranch(repo, 'upstream', 'feature/topic');
  assert.equal(spawnSync('git', ['show-ref', '--verify', '--quiet', 'refs/heads/feature/topic'], { cwd: upstream }).status, 1);
  assert.equal(git(upstream, 'rev-parse', 'refs/tags/feature/topic'), git(origin, 'rev-parse', 'refs/heads/feature/topic'));
  assert.equal(git(repo, 'rev-parse', 'refs/heads/feature/topic'), git(repo, 'rev-parse', 'HEAD'));
  await assert.rejects(app.gitService.deleteRemoteBranch(repo, '--all', 'main'));
  await assert.rejects(app.gitService.deleteRemoteBranch(repo, 'origin', 'bad..branch'));
  await app.gitService.deleteRemoteTag(repo, 'feature/topic', 'origin');
  assert.equal(git(origin, 'rev-parse', 'refs/heads/feature/topic'), git(repo, 'rev-parse', 'HEAD'));
});

test('non-origin checkout uses the exact remote and refuses an existing local branch tracking another remote', async () => {
  const { repo } = await remoteFixture();
  git(repo, 'push', 'upstream', 'main:refs/heads/feature/nested');
  await app.gitService.checkoutBranch(repo, 'refs/remotes/upstream/feature/nested');
  assert.equal(git(repo, 'branch', '--show-current').trim(), 'feature/nested');
  assert.equal(git(repo, 'rev-parse', '--abbrev-ref', '@{u}').trim(), 'upstream/feature/nested');
  git(repo, 'switch', 'main'); git(repo, 'push', 'origin', 'main:refs/heads/feature/nested');
  await assert.rejects(app.gitService.checkoutBranch(repo, 'refs/remotes/origin/feature/nested'), /跟踪|track/);
  assert.equal(git(repo, 'branch', '--show-current').trim(), 'main');
  assert.equal(git(repo, 'for-each-ref', '--format=%(upstream)', 'refs/heads/feature/nested').trim(), 'refs/remotes/upstream/feature/nested');
  git(repo, 'branch', 'upstream/missing');
  await assert.rejects(app.gitService.checkoutBranch(repo, 'refs/remotes/upstream/missing'));
  assert.equal(git(repo, 'branch', '--show-current').trim(), 'main');
});

test('a sole non-origin remote can publish branches and tags, and ambiguous remotes require a selection', async () => {
  const { repo, upstream } = await remoteFixture();
  git(repo, 'remote', 'remove', 'origin'); git(repo, 'branch', '--unset-upstream', 'main');
  await app.gitService.push(repo); assert.equal(git(repo, 'rev-parse', '--abbrev-ref', '@{u}').trim(), 'upstream/main');
  git(repo, 'tag', 'release/test'); await app.gitService.pushTag(repo, 'release/test');
  assert.equal(git(upstream, 'rev-parse', 'refs/tags/release/test'), git(repo, 'rev-parse', 'HEAD'));
  git(repo, 'remote', 'add', 'other', upstream); git(repo, 'branch', '--unset-upstream', 'main');
  assert.equal((await app.gitService.getPushContext(repo)).remote, undefined);
  await assert.rejects(app.gitService.push(repo), /选择|Choose/);
});

test('GitHub collaboration binding can select upstream independently of push settings and clears a removed binding', async () => {
  const repo = await repository(); await fs.writeFile(file(repo, 'a'), 'a'); await commit(repo);
  git(repo, 'remote', 'add', 'origin', 'git@github.com:fork/project.git');
  git(repo, 'remote', 'add', 'upstream', 'https://github.com/team/project.git');
  git(repo, 'config', 'remote.pushDefault', 'origin');
  assert.equal(await app.gitService.getGitHubRemotePreference(repo), 'auto');
  await app.gitService.setGitHubRemote(repo, 'upstream');
  assert.equal(await app.gitService.getGitHubRemotePreference(repo), 'upstream');
  const opened = await app.gitService.openRepository(repo);
  assert.equal(opened.gitHubOwner, 'team'); assert.equal(opened.gitHubRemote, 'upstream');
  assert.equal((await app.gitService.getPushContext(repo)).remote, 'origin');
  git(repo, 'remote', 'remove', 'upstream');
  assert.equal((await app.gitService.openRepository(repo)).isGitHubRepo, false);
  await app.gitService.setGitHubRemote(repo, 'auto');
  assert.equal((await app.gitService.openRepository(repo)).gitHubOwner, 'fork');
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

test('porcelain v2 reports copied entries as renames and unquotes control escape paths', () => {
  // porcelain v2 的复制状态 `C` 曾经落到 default 分支变成 'conflicted'，UI 会误报冲突。
  const copied = app.parsePorcelainV2('1 C. N... 100644 100644 100644 hH hI copy name.txt');
  assert.equal(copied.staged[0].status, 'renamed'); assert.equal(copied.staged[0].path, 'copy name.txt');
  const copyRename = app.parsePorcelainV2('2 RC N... 100644 100644 100644 hH hI R100 renamed.txt\0old.txt\0');
  assert.equal(copyRename.staged[0].status, 'renamed');
  assert.equal(copyRename.unstaged[0].status, 'renamed');
  assert.equal(copyRename.unstaged[0].path, 'renamed.txt'); assert.equal(copyRename.unstaged[0].oldPath, 'old.txt');
  // \a \b \f \v 转义与既有 \n \t \r 补齐为同一映射。
  assert.equal(app.unquoteGitPath('"\\a\\b\\f\\v bell.txt"'), '\x07\x08\x0c\x0b bell.txt');
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

test('branch, tag and revision operands are validated before any write command runs', async () => {
  const repo = await repository(); await fs.writeFile(file(repo, 'a.txt'), 'base\n'); await commit(repo);
  const head = git(repo, 'rev-parse', 'HEAD').trim();
  // 分支名：空名与前导连字符在触达 git 前拒绝（未校验时 `-D main` + 起点 main 会删除 main）。
  await assert.rejects(app.gitService.createBranch(repo, '-D main'), /Invalid branch name/);
  await assert.rejects(app.gitService.createBranch(repo, '   '), /Invalid branch name/);
  // 起点：连字符形态在客户端拒绝；无法解析的修订由 rev-parse --verify --end-of-options 拒绝。
  await assert.rejects(app.gitService.createBranch(repo, 'feature', '--abort'), /Invalid branch start point/);
  await assert.rejects(app.gitService.createBranch(repo, 'feature', 'no-such-revision'));
  // 标签：check-ref-format 认可 refs/tags/--x 这类形态，前导连字符必须显式拒绝；删除同样如此。
  await assert.rejects(app.gitService.createTag(repo, '--delete=x'), /Invalid tag name/);
  await assert.rejects(app.gitService.createTag(repo, ''), /Invalid tag name/);
  await assert.rejects(app.gitService.deleteTag(repo, '-d v1'), /Invalid tag name/);
  // 修订：revert/cherry-pick/reset 的操作数先解析为提交（--abort 等选项形态、树对象均被拒绝）。
  await assert.rejects(app.gitService.revertCommit(repo, '--abort'));
  await assert.rejects(app.gitService.cherryPickCommit(repo, '-n'));
  await assert.rejects(app.gitService.hardResetCommit(repo, 'no-such-revision'));
  await assert.rejects(app.gitService.softResetCommit(repo, 'HEAD^{tree}'));
  // 全部拒绝之后引用与工作区必须原封不动。
  assert.equal(git(repo, 'rev-parse', 'HEAD').trim(), head);
  assert.equal(git(repo, 'status', '--porcelain'), '');
  // 合法输入保持可用：trim 后的分支/标签名、带起点建分支、附注标签、revert/reset/cherry-pick。
  await app.gitService.createBranch(repo, 'feature/from-head', 'HEAD');
  assert.equal(git(repo, 'rev-parse', 'feature/from-head').trim(), head);
  await app.gitService.createTag(repo, ' v1.0 ', head, 'annotated');
  // 附注标签的 rev-parse 指向 tag 对象，解引用到提交后再比较。
  assert.equal(git(repo, 'rev-parse', 'v1.0^{commit}').trim(), head);
  assert.match(git(repo, 'tag', '-l', '-n1', 'v1.0'), /annotated/);
  await app.gitService.hardResetCommit(repo, head);
  git(repo, 'switch', '-c', 'topic'); await fs.writeFile(file(repo, 'b.txt'), 'picked\n'); await commit(repo, 'pick me');
  const pick = git(repo, 'rev-parse', 'HEAD').trim();
  git(repo, 'switch', 'main');
  await app.gitService.cherryPickCommit(repo, pick);
  assert.equal(git(repo, 'show', 'HEAD:b.txt').trim(), 'picked');
  await app.gitService.revertCommit(repo, 'v1.0');
  assert.notEqual(git(repo, 'rev-parse', 'HEAD').trim(), head);
  assert.equal(git(repo, 'status', '--porcelain'), '');
  await app.gitService.deleteTag(repo, 'v1.0');
  assert.equal(git(repo, 'tag', '-l', 'v1.0').trim(), '');
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


test('ignore scopes escape exact paths, distinguish extension ranges and preserve existing CRLF rules', async () => {
  const repo = await repository();
  const names = ['reports/模板 [1].csv', 'reports/模板 1.csv', 'reports/nested/child.csv', 'other.csv', 'archive.tar.gz', '.env.local'];
  for (const name of names) { await fs.mkdir(path.dirname(file(repo, name)), { recursive: true }); await fs.writeFile(file(repo, name), 'data'); }
  assert.deepEqual(app.buildIgnoreRules(['reports/模板 [1].csv'], 'file'), ['/reports/模板\\ \\[1\\].csv']);
  assert.equal(app.fileExtension('archive.tar.gz'), '.tar.gz');
  assert.equal(app.fileExtension('report.2026.csv'), '.csv');
  assert.equal(app.fileExtension('.env.local'), '.local');
  assert.equal(app.fileExtension('.env'), '');
  const expected = { file: ['reports/模板 [1].csv'], typeHere: ['reports/模板 1.csv', 'reports/模板 [1].csv'], typeTree: ['reports/nested/child.csv', 'reports/模板 1.csv', 'reports/模板 [1].csv'], typeAll: ['other.csv', 'reports/nested/child.csv', 'reports/模板 1.csv', 'reports/模板 [1].csv'] };
  for (const [mode, paths] of Object.entries(expected)) {
    const rules = app.buildIgnoreRules(['reports/模板 [1].csv'], mode);
    const preview = await app.previewIgnore(repo, 'shared', rules.join('\n') + '\n');
    assert.deepEqual([...preview.untracked].sort(), [...paths].sort());
    const snapshot = await app.readIgnoreFile(repo, 'shared');
    const content = app.appendIgnoreRules(snapshot.content, rules);
    await app.saveIgnoreFile(repo, snapshot, content);
    const actual = (await app.gitService.getStatus(repo)).untracked.map(item => item.path);
    for (const name of names) assert.equal(actual.includes(name), !paths.includes(name));
    await app.undoIgnore(repo, snapshot, content);
    assert.equal(await fs.access(file(repo, '.gitignore')).then(() => true, () => false), false);
  }
  assert.equal(app.appendIgnoreRules('# existing\r\nfoo\r\n', ['foo', '/bar']), '# existing\r\nfoo\r\n/bar\r\n');
  assert.deepEqual(app.buildIgnoreRules(['a/x.csv', 'a/y.csv'], 'typeHere'), ['/a/*.csv']);
  assert.deepEqual(app.buildIgnoreRules(['root.csv'], 'directory'), []);
});

test('ignore preview respects nested negation, excluded directories and tracked files', async () => {
  const repo = await repository();
  await fs.mkdir(file(repo, 'data/nested'), { recursive: true });
  await fs.writeFile(file(repo, 'data/tracked.csv'), 'tracked'); await commit(repo);
  await fs.writeFile(file(repo, 'data/.gitignore'), '!keep.csv\n');
  await fs.writeFile(file(repo, 'data/keep.csv'), 'keep');
  await fs.writeFile(file(repo, 'data/drop.csv'), 'drop');
  await fs.writeFile(file(repo, 'data/nested/.gitignore'), '!keep.csv\n');
  await fs.writeFile(file(repo, 'data/nested/keep.csv'), 'keep');
  const preview = await app.previewIgnore(repo, 'shared', '*.csv\n', ['data/keep.csv']);
  assert.deepEqual(preview.untracked, ['data/drop.csv']);
  assert.deepEqual(preview.tracked, ['data/tracked.csv']);
  assert.deepEqual(preview.selectedNotIgnored, ['data/keep.csv']);
  const excluded = await app.previewIgnore(repo, 'shared', '/data/\n');
  assert(excluded.untracked.includes('data/nested/keep.csv'));
  const snapshot = await app.readIgnoreFile(repo, 'shared');
  await app.saveIgnoreFile(repo, snapshot, '*.csv\n');
  assert.equal(git(repo, 'ls-files', '--error-unmatch', 'data/tracked.csv').trim(), 'data/tracked.csv');
  assert.match(await app.checkIgnore(repo, ['data/drop.csv']), /\*\.csv/);
});

test('local ignore rules work in linked worktrees and reject stale saves and unsafe undo', async () => {
  const repo = await repository(); await fs.writeFile(file(repo, 'a.txt'), 'a'); await commit(repo);
  const linked = path.join(tmp, `ignore-linked-${repoIndex}`); git(repo, 'worktree', 'add', '-b', 'ignore-linked', linked);
  await fs.writeFile(file(linked, 'secret.txt'), 'secret');
  const snapshot = await app.readIgnoreFile(linked, 'local');
  const content = app.appendIgnoreRules(snapshot.content, ['/secret.txt']);
  await app.saveIgnoreFile(linked, snapshot, content);
  assert(!(await app.gitService.getStatus(linked)).untracked.some(item => item.path === 'secret.txt'));
  assert.equal(await fs.access(file(linked, '.gitignore')).then(() => true, () => false), false);
  await assert.rejects(app.saveIgnoreFile(linked, snapshot, content + '/other\n'), /changed/);
  await app.saveIgnoreFile(linked, { scope: 'local', content }, content + '# external edit\n');
  await app.undoIgnore(linked, snapshot, content);
  assert.equal((await app.readIgnoreFile(linked, 'local')).content, snapshot.content + '# external edit\n');
  assert.equal(await fs.readFile(file(linked, 'secret.txt'), 'utf8'), 'secret');
});


test('ignore additions preserve ordered exceptions and undo keeps later rules after a missing newline', async () => {
  const repo = await repository();
  await fs.writeFile(file(repo, '.gitignore'), '# comment without newline');
  await fs.writeFile(file(repo, 'a.csv'), 'a');
  const snapshot = await app.readIgnoreFile(repo, 'shared');
  const content = app.appendIgnoreRules(snapshot.content, ['*.csv', '!a.csv', '*.csv']);
  assert.equal(content, '# comment without newline\n*.csv\n!a.csv\n*.csv\n');
  await app.saveIgnoreFile(repo, snapshot, content);
  assert(!(await app.gitService.getStatus(repo)).untracked.some(f => f.path === 'a.csv'));
  await fs.appendFile(file(repo, '.gitignore'), '/later.txt\n');
  await app.undoIgnore(repo, snapshot, content);
  assert.equal(await fs.readFile(file(repo, '.gitignore'), 'utf8'), '# comment without newline\n/later.txt\n');
  assert.deepEqual(app.buildIgnoreRules(['a.csv'], 'custom', '# my comment\n*.csv\n!a.csv'), ['# my comment', '*.csv', '!a.csv']);
  const before = await app.readIgnoreFile(repo, 'shared');
  await app.saveIgnoreFile(repo, before, '*.csv\n');
  await fs.writeFile(file(repo, '.gitignore'), '/unrelated\n');
  await assert.rejects(app.undoIgnore(repo, before, '*.csv\n'), /changed/);
  assert.equal(await fs.readFile(file(repo, '.gitignore'), 'utf8'), '/unrelated\n');
});

test('ignore preview follows Git case sensitivity and reads ignored nested ignore files', async () => {
  const repo = await repository(); git(repo, 'config', 'core.ignorecase', 'false');
  await fs.mkdir(file(repo, 'nested'));
  await fs.writeFile(file(repo, 'nested/.gitignore'), '!keep.csv\n');
  await fs.writeFile(file(repo, 'nested/keep.csv'), 'keep');
  await fs.writeFile(file(repo, 'nested/UPPER.CSV'), 'upper');
  await fs.writeFile(file(repo, 'nested/drop.csv'), 'lower');
  const preview = await app.previewIgnore(repo, 'shared', '.gitignore\n*.csv\n');
  assert.deepEqual(preview.untracked.sort(), ['nested/.gitignore', 'nested/drop.csv']);
  const snapshot = await app.readIgnoreFile(repo, 'shared');
  await app.saveIgnoreFile(repo, snapshot, '.gitignore\n*.csv\n');
  assert.deepEqual((await app.gitService.getStatus(repo)).untracked.map(f => f.path).sort(), ['nested/UPPER.CSV', 'nested/keep.csv']);
  await fs.rm(file(repo, 'nested'), {recursive:true});
  await app.previewIgnore(repo, 'shared', '*.csv\n');
});


test('Actions refresh fetches fresh run status and steps independently of repository and PR failures', async () => {
  const store = app.useGitHubStore, gate = deferred();
  const old = { id: 25, status: 'in_progress', conclusion: null };
  const fresh = { ...old, status: 'completed', conclusion: 'success' };
  const jobs = [{ id: 42, status: 'completed', steps: [{ name: 'Build', status: 'completed', conclusion: 'success' }] }];
  store.setState({ currentOwner: 'owner', currentRepoName: 'repo', selectedRun: old, selectedRunJobs: [] });
  let calls = 0;
  const restore = stub(app.githubService, {
    getRepository: async () => { throw new Error('repository unavailable'); },
    getPullRequests: async () => { throw new Error('PR permission denied'); },
    getWorkflows: async () => [],
    getWorkflowRuns: async () => { calls++; await gate.promise; return [fresh]; },
    getRunJobs: async (owner, repo, id) => { assert.equal(id, 25); return jobs; },
  });
  try {
    const pending = store.getState().loadRepoData('owner', 'repo');
    assert.equal(store.getState().isRefreshingActions, true);
    gate.resolve(); await pending;
    assert.equal(store.getState().selectedRun.status, 'completed');
    assert.deepEqual(store.getState().selectedRunJobs, jobs);
    assert.equal(store.getState().isRefreshingActions, false);
    await store.getState().refreshActions(); assert.equal(calls, 2);
    const restoreWorkflows = stub(app.githubService, { getWorkflows: async () => { throw new Error('workflow definitions unavailable'); } });
    try {
      await store.getState().refreshActions();
      assert.equal(store.getState().selectedRun.conclusion, 'success');
      assert.deepEqual(store.getState().selectedRunJobs, jobs);
      assert.equal(store.getState().error, 'workflow definitions unavailable');
      assert.equal(store.getState().isRefreshingActions, false);
    } finally { restoreWorkflows(); }
  } finally { restore(); store.getState().clearRepo(); }
});

test('Actions refresh preserves older selections, reports job failures, and rejects stale repository replies', async () => {
  const store = app.useGitHubStore;
  const old = { id: 1, status: 'in_progress', conclusion: null };
  const fresh = { ...old, status: 'completed', conclusion: 'success' };
  store.setState({ currentOwner: 'owner', currentRepoName: 'repo', selectedRun: old });
  const restore = stub(app.githubService, {
    getWorkflows: async () => [], getWorkflowRuns: async () => [{ id: 99 }],
    getWorkflowRun: async (owner, repo, id) => { assert.equal(id, 1); return fresh; },
    getRunJobs: async () => { throw new Error('jobs unavailable'); },
  });
  try {
    await store.getState().refreshActions();
    assert.equal(store.getState().selectedRun.id, 1);
    assert.equal(store.getState().selectedRun.status, 'completed');
    assert.equal(store.getState().error, 'jobs unavailable');
    assert.equal(store.getState().isRefreshingActions, false);
    const gate = deferred();
    const restorePending = stub(app.githubService, { getWorkflowRuns: async () => { await gate.promise; return [fresh]; } });
    try {
      const pending = store.getState().refreshActions(); store.getState().clearRepo();
      gate.resolve(); await pending;
      assert.deepEqual(store.getState().workflowRuns, []);
      assert.equal(store.getState().selectedRun, null);
      assert.equal(store.getState().isRefreshingActions, false);
    } finally { restorePending(); }
  } finally { restore(); store.getState().clearRepo(); }
});

test('changing the selected run during refresh keeps the new selection and its jobs', async () => {
  const store = app.useGitHubStore, gate = deferred();
  const first = { id: 1 }, second = { id: 2 };
  store.setState({ currentOwner: 'owner', currentRepoName: 'repo', selectedRun: first });
  const restore = stub(app.githubService, {
    getWorkflows: async () => [],
    getWorkflowRuns: async () => { await gate.promise; return [first, second]; },
    getRunJobs: async (owner, repo, id) => [{ id: id * 10 }],
  });
  try {
    const pending = store.getState().refreshActions();
    await store.getState().selectRun(second); gate.resolve(); await pending;
    assert.equal(store.getState().selectedRun.id, 2);
    assert.deepEqual(store.getState().selectedRunJobs, [{ id: 20 }]);
    assert.deepEqual(store.getState().workflowRuns, [first, second]);
    assert.equal(store.getState().isRefreshingActions, false);
  } finally { restore(); store.getState().clearRepo(); }
});

test('Actions API reads bypass the HTTP cache, including paginated job steps', async () => {
  const savedFetch = globalThis.fetch; const urls = [];
  globalThis.fetch = async (url, options) => {
    urls.push(url); assert.equal(options.cache, 'no-store'); assert(options.signal);
    if (url.includes('/jobs')) return new Response(JSON.stringify({ jobs: [{ id: urls.length }] }), {
      headers: url.includes('page=2') ? {} : { Link: '<https://api.github.com/repos/o/r/actions/runs/1/jobs?page=2>; rel="next"' },
    });
    return new Response(JSON.stringify({ workflow_runs: [], workflows: [], id: 1 }));
  };
  try {
    await app.githubService.getWorkflowRuns('o', 'r', 5);
    await app.githubService.getWorkflowRun('o', 'r', 1);
    await app.githubService.getWorkflows('o', 'r');
    assert.equal((await app.githubService.getRunJobs('o', 'r', 1)).length, 2);
    assert.match(urls[0], /workflows\/5\/runs/);
  } finally { globalThis.fetch = savedFetch; }
});

test('running job logs show waiting, completed jobs load logs, and native string errors remain visible', async () => {
  const store=app.useGitHubStore;
  store.setState({currentOwner:'owner',currentRepoName:'repo'});
  let status='in_progress', downloads=0;
  const job={id:42,name:'Build',status,html_url:'https://github.com/owner/repo/actions/runs/1/job/42'};
  const restore=stub(app.githubService,{
    getJob:async()=>({...job,status}),
    getJobLogs:async()=>{downloads++;return {jobId:42,jobName:'Build',rawLogs:'compiled successfully'};},
  });
  try {
    await store.getState().openJobLogs(42,'Build');
    assert.equal(store.getState().activeJobLogs.state,'waiting');
    assert.equal(store.getState().activeJobLogs.rawLogs,'');assert.equal(downloads,0);
    assert.equal(store.getState().activeJobLogs.htmlUrl,job.html_url);
    status='completed';await store.getState().openJobLogs(42,'Build');
    assert.equal(store.getState().activeJobLogs.state,'ready');assert.equal(downloads,1);
    assert.equal(store.getState().activeJobLogs.rawLogs,'compiled successfully');
    const restoreError=stub(app.githubService,{getJobLogs:async()=>{throw 'HTTP 403: missing actions permission';}});
    try {
      await store.getState().openJobLogs(42,'Build');
      assert.equal(store.getState().activeJobLogs.state,'error');
      assert.equal(store.getState().activeJobLogs.error,'HTTP 403: missing actions permission');
      assert.equal(store.getState().activeJobLogs.rawLogs,'');
    } finally {restoreError();}
  } finally {restore();store.getState().clearRepo();}
});

test('closing or changing the repository invalidates pending job log requests', async () => {
  const store=app.useGitHubStore, gate=deferred();let downloads=0;
  store.setState({currentOwner:'owner',currentRepoName:'repo'});
  const restore=stub(app.githubService,{
    getJob:async()=>{await gate.promise;return {id:42,status:'completed',html_url:'https://github.com/owner/repo/actions/runs/1/job/42'};},
    getJobLogs:async()=>{downloads++;return {jobId:42,jobName:'Build',rawLogs:'late output'};},
  });
  try {
    const pending=store.getState().openJobLogs(42,'Build');
    assert.equal(store.getState().activeJobLogs.state,'loading');
    store.getState().closeJobLogs();gate.resolve();await pending;
    assert.equal(store.getState().activeJobLogs,null);assert.equal(downloads,0);
    const next=store.getState().openJobLogs(42,'Build');store.getState().clearRepo();await next;
    assert.equal(store.getState().activeJobLogs,null);assert.equal(store.getState().isLogsModalOpen,false);
  } finally {restore();store.getState().clearRepo();}
});


test('worktree listing preserves NUL-delimited paths and detached, locked, prunable and bare states', () => {
  const trees=app.parseWorktrees('worktree /repos/main\0HEAD abc\0branch refs/heads/main\0\0worktree /repos/中文 space\nline\0HEAD def\0detached\0locked portable drive\0prunable missing directory\0\0worktree /repos/bare\0bare\0\0');
  assert.equal(trees.length,3);assert.equal(trees[0].branch,'refs/heads/main');
  assert.equal(trees[1].path,'/repos/中文 space\nline');assert.equal(trees[1].detached,true);
  assert.equal(trees[1].locked,'portable drive');assert.equal(trees[1].prunable,'missing directory');
  assert.equal(trees[2].bare,true);
  assert(app.sameWorktreePath('E:\\code\\Repo\\','e:/code/repo'));
  assert(!app.sameWorktreePath('/code/Repo','/code/repo'));
});

test('worktrees can be created on new or existing branches and occupied targets are never overwritten', async () => {
  const repo=await repository();await fs.writeFile(file(repo,'base.txt'),'base\n');await commit(repo);
  const linked=path.join(tmp,`worktree-中文 space-${repoIndex}`);
  await app.gitService.createWorktree(repo,linked,'HEAD','feature/worktree');
  let trees=await app.gitService.getWorktrees(repo);
  assert(trees.some(tree=>app.sameWorktreePath(tree.path,linked)&&tree.branch==='refs/heads/feature/worktree'));
  const branches=await app.gitService.getBranches(repo);
  assert(app.sameWorktreePath(branches.find(branch=>branch.name==='feature/worktree').worktreePath,linked));
  assert.equal((await app.gitService.getStatus(linked)).currentBranch,'feature/worktree');
  git(repo,'branch','free');const existing=path.join(tmp,`worktree-existing-${repoIndex}`);
  await app.gitService.createWorktree(repo,existing,'free');
  assert.equal((await app.gitService.getStatus(existing)).currentBranch,'free');
  const occupied=path.join(tmp,`worktree-occupied-${repoIndex}`);await fs.mkdir(occupied);await fs.writeFile(file(occupied,'keep.txt'),'keep');
  await assert.rejects(app.gitService.createWorktree(repo,occupied,'HEAD','other'));
  assert.equal(await fs.readFile(file(occupied,'keep.txt'),'utf8'),'keep');
  await assert.rejects(app.gitService.createWorktree(repo,path.join(tmp,`duplicate-${repoIndex}`),'feature/worktree'));
  await assert.rejects(app.gitService.createWorktree(repo,'relative/path','HEAD','unsafe'),/absolute|绝对/);
  await assert.rejects(app.gitService.createWorktree(repo,path.join(tmp,'invalid-branch'),'HEAD','bad branch'));
  assert.equal(await fs.readFile(file(linked,'base.txt'),'utf8'),'base\n');
});

test('selecting an occupied branch opens its worktree and preserves dirty files in both directories', async () => {
  const repo=await repository();await fs.writeFile(file(repo,'base.txt'),'base\n');await commit(repo);
  const linked=path.join(tmp,`switch-worktree-${repoIndex}`);await app.gitService.createWorktree(repo,linked,'HEAD','feature/worktree');
  await fs.writeFile(file(repo,'base.txt'),'main dirty\n');await fs.writeFile(file(linked,'base.txt'),'linked dirty\n');
  git(repo,'remote','add','origin','https://example.invalid/repository.git');git(repo,'update-ref','refs/remotes/origin/feature/worktree','HEAD');git(repo,'branch','--set-upstream-to=origin/feature/worktree','feature/worktree');
  const store=app.useRepoStore;store.getState().setCurrentRepo(info(repo));await store.getState().refreshAll();
  try {
    await assert.rejects(store.getState().checkoutBranch('feature/worktree',{openWorktree:false}),/worktree|Worktree/);
    assert(app.sameWorktreePath(store.getState().currentRepo.path,repo));
    await store.getState().checkoutBranch('origin/feature/worktree');
    assert(app.sameWorktreePath(store.getState().currentRepo.path,linked));
    assert.equal(store.getState().status.currentBranch,'feature/worktree');
    await eventually(()=>store.getState().fileDiffLines.some(line=>line.content==='+linked dirty'));
    assert.equal(git(repo,'branch','--show-current').trim(),'main');
    assert.equal(await fs.readFile(file(repo,'base.txt'),'utf8'),'main dirty\n');
    assert.equal(await fs.readFile(file(linked,'base.txt'),'utf8'),'linked dirty\n');
    assert.equal(store.getState().openTabs.some(tab=>app.sameWorktreePath(tab.path,repo)),true);
    assert.equal(store.getState().openTabs.some(tab=>app.sameWorktreePath(tab.path,linked)),true);
  } finally {store.getState().setCurrentRepo(null);}
});
