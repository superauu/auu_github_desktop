import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { build } from 'esbuild';

const root = process.cwd(), values = new Map(), originalFetch = globalThis.fetch;
const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
globalThis.localStorage = storage;
let app, tmp;
const repo = (path = '/repo') => ({ id: path, path, name: path, currentBranch: 'main', lastOpenedAt: 0 });
const status = () => ({ currentBranch: 'main', headOid: 'a'.repeat(40), trackingBranch: 'origin/main', staged: [{ path: 'a.ts', status: 'modified', staged: true }], unstaged: [{ path: 'a.ts', status: 'modified', staged: false }, { path: 'b.ts', status: 'conflicted', staged: false }], untracked: [], ahead: 2, behind: 1, isClean: false });
const entry = (index = 1) => ({ id: `op-${index}`, title: 'Git fetch', type: 'error', createdAt: Date.now(), description: 'Network unavailable', repoPath: '/repo', elapsedMs: 1234 });
before(async () => {
  tmp = await fs.mkdtemp(path.join(root, '.test-tmp-overview-')); const outfile = path.join(tmp, 'app.cjs');
  await build({ stdin: { contents: `export * from './src/features/repository/overviewLogic'; export * from './src/features/repository/OverviewService'; export * from './src/stores/operationHistoryStorage'; export { useToastStore } from './src/stores/toastStore'; export { gitService } from './src/services/git/GitService';`, resolveDir: root }, outfile, bundle: true, platform: 'node', format: 'cjs', alias: { '@': path.join(root, 'src') }, logLevel: 'silent', plugins: [{ name: 'native-permission', setup(builder) { builder.onLoad({ filter: /RepositoryAccess\.ts$/ }, () => ({ contents: `export const listRepositoryPermissions=async()=>globalThis.__overviewGrants||[]; export const authorizeGitBinary=async()=>{}; export const authorizeRepository=async()=>{};` })); } }] });
  app = createRequire(import.meta.url)(outfile);
});
beforeEach(() => { values.clear(); globalThis.localStorage = storage; delete globalThis.window; app.useToastStore.setState({ history: [], toasts: [], historyStorageFailed: false }); });
after(async () => { globalThis.fetch = originalFetch; delete globalThis.window; delete globalThis.__overviewGrants; if (tmp && path.dirname(tmp) === root && path.basename(tmp).startsWith('.test-tmp-overview-')) await fs.rm(tmp, { recursive: true, force: true, maxRetries: 5 }); });

test('overview deduplicates open and recent repositories with platform-aware path identity and counts files once', () => {
  assert.deepEqual(app.overviewRepositories([repo('C:\\Code\\App')], [repo('c:/code/app/'), repo('/Repo'), repo('/repo')]).map(item => item.path), ['C:\\Code\\App', '/Repo', '/repo']);
  assert.deepEqual(app.overviewCounts(status()), { changed: 2, conflicts: 1 });
});

test('scan concurrency is at most three and cancellation prevents remaining repositories from starting', async () => {
  const controller = new AbortController(); let running = 0, peak = 0, started = 0;
  await app.mapOverview(Array.from({ length: 20 }, (_, i) => i), async () => { started++; running++; peak = Math.max(peak, running); controller.abort(); await Promise.resolve(); running--; }, controller.signal);
  assert.ok(peak <= 3); assert.ok(started <= 3);
  let completed = 0; await app.mapOverview([1, 2, 3, 4, 5], async () => { completed++; }, new AbortController().signal); assert.equal(completed, 5);
});

test('native scans never prompt for unapproved repositories and explicit authorization permits a read', async () => {
  globalThis.window = { __TAURI_INTERNALS__: {} }; globalThis.__overviewGrants = ['/approved']; let calls = 0;
  app.gitService.getStatus = async () => { calls++; return status(); };
  app.gitService.getRepoOperationState = async () => ({ type: 'merge', inConflict: true, conflictedFiles: ['b.ts'] });
  await assert.rejects(app.overviewService.local(repo('/repo')), app.OverviewPermissionError); assert.equal(calls, 0);
  const allowed = await app.overviewService.local(repo('/repo'), true); assert.equal(allowed.operation.type, 'merge'); assert.equal(calls, 1);
  await app.overviewService.local(repo('/approved')); assert.equal(calls, 2);
});

function ciFixture(options = {}) {
  const requests = [];
  app.gitService.listRemotes = async () => [{ name: 'origin', fetchUrl: options.url || 'https://github.com/team/project.git', pushUrl: 'https://github.com/other/fork.git' }];
  app.gitService.getBranchCommitHash = async (_path, ref) => { assert.equal(ref, 'origin/main'); return 'b'.repeat(40); };
  globalThis.fetch = async (url, init) => {
    requests.push({ url, authorization: init.headers.Authorization });
    if (String(url).includes('/check-runs')) return new Response(JSON.stringify(options.checks || { total_count: 1, check_runs: [{ status: 'completed', conclusion: 'success' }] }), { status: options.failChecks ? 403 : 200 });
    return new Response(JSON.stringify(options.statuses || { total_count: 1, statuses: [{ state: 'success' }] }));
  };
  return requests;
}
test('CI uses the remote tracking SHA and fetch repository with an isolated account token', async () => {
  const requests = ciFixture(); const result = await app.overviewService.ci(repo(), status(), 'account-one', true);
  assert.equal(result.state, 'passing'); assert.equal(result.sha, 'b'.repeat(40)); assert.equal(result.ref, 'origin/main'); assert.equal(requests.length, 2);
  assert.equal(result.url, `https://github.com/team/project/commit/${'b'.repeat(40)}/checks`);
  for (const request of requests) { assert.match(request.url, /team\/project\/commits\/bbbb/); assert.doesNotMatch(request.url, /aaaa|other\/fork/); assert.equal(request.authorization, 'Bearer account-one'); }
});
test('partial and truncated CI never look passing, while a known failed check remains visible', async () => {
  ciFixture({ failChecks: true }); assert.equal((await app.overviewService.ci(repo(), status(), null, true)).state, 'unknown');
  ciFixture({ checks: { total_count: 2, check_runs: [{ status: 'completed', conclusion: 'success' }] } }); assert.equal((await app.overviewService.ci(repo(), status(), null, true)).state, 'unknown');
  ciFixture({ checks: { total_count: 2, check_runs: [{ status: 'completed', conclusion: 'failure' }] } }); assert.equal((await app.overviewService.ci(repo(), status(), null, true)).state, 'failed');
});
test('unauthenticated, untracked and unsupported repositories make no CI requests', async () => {
  const requests = ciFixture({ url: 'https://gitlab.com/team/project.git' });
  assert.equal((await app.overviewService.ci(repo(), status(), null, false)).state, 'auth');
  assert.equal((await app.overviewService.ci(repo(), { ...status(), trackingBranch: undefined }, null, true)).state, 'unpublished');
  assert.equal((await app.overviewService.ci(repo(), status(), null, true)).state, 'unsupported'); assert.equal(requests.length, 0);
});

test('history round-trips metadata without executable actions, unknown fields or toast state', () => {
  app.useToastStore.getState().record({ ...entry(), action: { label: 'Retry', onClick() { throw Error('must not restore'); } }, secretExtra: 'SHOULD_NOT_PERSIST' });
  const restored = app.loadOperationHistory(); assert.equal(restored.failed, false); assert.equal(restored.history.length, 1); assert.equal(restored.history[0].elapsedMs, 1234); assert.equal(restored.history[0].action, undefined);
  assert.doesNotMatch(values.get(app.OPERATION_HISTORY_KEY), /Retry|onClick|SHOULD_NOT_PERSIST|toasts|action/);
});
test('stored diagnostics redact URL credentials, tokens, authorization headers and private keys', () => {
  const secret = 'https://user:private-password@example.test/repo?access_token=private-token Authorization: Bearer private-bearer ghp_12345678901234567890 api_key="private-api"\n-----BEGIN PRIVATE KEY-----\nsecret-key\n-----END PRIVATE KEY-----';
  app.saveOperationHistory([{ ...entry(), description: secret }]); const raw = values.get(app.OPERATION_HISTORY_KEY);
  for (const value of ['private-password', 'private-token', 'private-bearer', 'ghp_12345678901234567890', 'private-api', 'secret-key']) assert.ok(!raw.includes(value));
  assert.match(raw, /redacted/);
  const quoted = 'password="a private password" secret=\'two secret parts\' api_key="escaped\\" private content" token="unfinished secret value';
  const redacted = app.redactOperationText(quoted);
  for (const value of ['private password', 'two secret parts', 'escaped', 'private content', 'unfinished secret value']) assert.ok(!redacted.includes(value));
});
test('history retention bounds count, age and text size and ignores invalid or future entries', () => {
  app.saveOperationHistory(Array.from({ length: 150 }, (_, i) => ({ ...entry(i), description: 'x'.repeat(20000) })));
  const result = app.loadOperationHistory(); assert.ok(result.history.length <= 100); assert.ok(result.history.every(item => item.description.length <= 8000)); assert.ok(values.get(app.OPERATION_HISTORY_KEY).length <= 1_000_000);
  values.set(app.OPERATION_HISTORY_KEY, JSON.stringify({ version: 1, entries: [entry(), { ...entry(2), createdAt: Date.now() - 31 * 86400_000 }, { ...entry(3), createdAt: Date.now() + 86400_000 }, { ...entry(4), type: 'evil', action: {} }] }));
  assert.equal(app.loadOperationHistory().history.length, 1);
});
test('corrupt or unavailable history storage is nonfatal and reports failure without losing this session', () => {
  values.set(app.OPERATION_HISTORY_KEY, '{broken'); assert.equal(app.loadOperationHistory().failed, true);
  globalThis.localStorage = { ...storage, setItem() { throw Error('quota'); } };
  app.useToastStore.getState().record(entry()); assert.equal(app.useToastStore.getState().history.length, 1); assert.equal(app.useToastStore.getState().historyStorageFailed, true);
});
test('clearing history removes persisted entries and consuming a live action keeps metadata', () => {
  app.useToastStore.getState().record({ ...entry(), action: { label: 'retry', onClick() {} } });
  const id = app.useToastStore.getState().history[0].id; app.useToastStore.getState().consumeAction(id); assert.equal(app.useToastStore.getState().history[0].action, undefined); assert.equal(app.loadOperationHistory().history.length, 1);
  app.useToastStore.getState().clearHistory(); assert.equal(values.get(app.OPERATION_HISTORY_KEY), undefined); assert.deepEqual(app.loadOperationHistory().history, []);
});
