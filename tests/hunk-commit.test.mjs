import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { createServer } from 'vite';
import { retryDevFetch } from './dev-fetch-retry.mjs';

const root = process.cwd(), nativeFetch = globalThis.fetch, routedFetch = retryDevFetch(nativeFetch);
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
let tmp, app, server, base, index = 0;
const git = (cwd, ...args) => { const result = spawnSync('git', ['-c', 'core.quotepath=false', ...args], { cwd, encoding: 'utf8' }); if (result.status !== 0) throw Error(result.stderr || result.error?.message); return result.stdout; };
const write = (repo, file, content) => fs.writeFile(path.join(repo, file), content);
const original = Array.from({ length: 50 }, (_, i) => `line ${i + 1}\n`).join('');
const changed = original.replace('line 3\n', 'first change\nextra line\n').replace('line 30\n', '').replace('line 47\n', 'last change\n');
async function fixture(initial = true) {
  const repo = path.join(tmp, `repo-${++index}`); await fs.mkdir(repo);
  git(repo, 'init', '-b', 'main'); git(repo, 'config', 'user.name', 'Hunk Test'); git(repo, 'config', 'user.email', 'hunk@example.invalid'); git(repo, 'config', 'core.autocrlf', 'false'); git(repo, 'config', 'commit.gpgSign', 'false');
  if (initial) { await write(repo, 'a.txt', original); await write(repo, 'keep.txt', 'base\n'); git(repo, 'add', '-A'); git(repo, 'commit', '-m', 'initial'); }
  return repo;
}
async function staged() { const repo = await fixture(); await write(repo, 'a.txt', changed); git(repo, 'add', 'a.txt'); return repo; }
const group = (title, units, body = '') => ({ id: title, title, body, units: units.map(unit => typeof unit === 'string' ? unit : unit.id) });
const snapshot = repo => [git(repo, 'ls-files', '--stage', '-z'), git(repo, 'ls-files', '-v', '-z')];
const hook = (repo, contents) => fs.writeFile(path.join(repo, '.git', 'hooks', 'pre-commit'), `#!/bin/sh\n${contents}\n`, { mode: 0o755 });
before(async () => {
  tmp = await fs.mkdtemp(path.join(root, '.test-tmp-hunk-'));
  const outfile = path.join(tmp, 'app.cjs');
  await build({ stdin: { contents: `export * from './src/services/git/HunkCommitService'; export { validateTempIndexArguments } from './scripts/dev-temp-index';`, resolveDir: root }, bundle: true, platform: 'node', format: 'cjs', outfile, alias: { '@': path.join(root, 'src') }, logLevel: 'silent' });
  app = createRequire(import.meta.url)(outfile);
  server = await createServer({ configFile: path.join(root, 'vite.config.ts'), server: { host: '127.0.0.1', port: 0, strictPort: false, watch: null } });
  await server.listen(); base = `http://127.0.0.1:${server.httpServer.address().port}`;
  globalThis.fetch = (url, init) => routedFetch(typeof url === 'string' && url.startsWith('/api/') ? base + url : url, init);
});
after(async () => {
  globalThis.fetch = nativeFetch; await server?.close();
  if (tmp && path.dirname(tmp) === root && path.basename(tmp).startsWith('.test-tmp-hunk-')) await fs.rm(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 150 });
});

test('staged hunks commit in reverse order while partial staging and unassigned hunks survive', async () => {
  const repo = await staged();
  await write(repo, 'a.txt', changed.replace('line 15\n', 'unstaged change\n'));
  await write(repo, 'keep.txt', 'staged keep\n'); git(repo, 'add', 'keep.txt'); await write(repo, 'keep.txt', 'working keep\n');
  const before = snapshot(repo), working = await fs.readFile(path.join(repo, 'a.txt')), head = git(repo, 'rev-parse', 'HEAD');
  const plan = await app.hunkCommitService.capture(repo), units = plan.units.filter(unit => unit.path === 'a.txt');
  assert.equal(units.length, 3); assert.ok(units.every(unit => unit.kind === 'hunk'));
  const groups = [group('feat: last', [units[2]], 'Why last goes first'), group('feat: first', [units[0]])];
  const preview = await app.hunkCommitService.preview(plan, groups, 1);
  assert.match(preview, /first change/); assert.doesNotMatch(preview, /last change|unstaged change/);
  assert.equal(git(repo, 'rev-parse', 'HEAD'), head); assert.deepEqual(snapshot(repo), before);
  const result = await app.hunkCommitService.execute(plan, groups);
  assert.equal(result.completed.length, 2); assert.equal(git(repo, 'rev-parse', result.recoveryRef), head);
  assert.equal(git(repo, 'show', 'HEAD~1:a.txt'), original.replace('line 47\n', 'last change\n'));
  assert.equal(git(repo, 'show', 'HEAD:a.txt'), original.replace('line 3\n', 'first change\nextra line\n').replace('line 47\n', 'last change\n'));
  assert.match(git(repo, 'log', '-2', '--format=%B'), /Why last goes first/);
  assert.match(git(repo, 'diff', '--cached'), /-line 30/); assert.match(git(repo, 'diff', '--cached'), /staged keep/);
  assert.deepEqual(snapshot(repo), before); assert.deepEqual(await fs.readFile(path.join(repo, 'a.txt')), working); assert.equal(await fs.readFile(path.join(repo, 'keep.txt'), 'utf8'), 'working keep\n');
});

test('all cumulative hunks reconstruct the original staged tree with deletions and insertions', async () => {
  const repo = await staged(), plan = await app.hunkCommitService.capture(repo);
  const groups = [group('delete middle', [plan.units[1]]), group('add first', [plan.units[0]]), group('change last', [plan.units[2]])];
  await app.hunkCommitService.execute(plan, groups);
  assert.equal(git(repo, 'rev-parse', 'HEAD^{tree}').trim(), plan.indexTree); assert.equal(git(repo, 'status', '--porcelain'), '');
});

test('whole-file units preserve binary, rename, deletion, mode and literal paths', async () => {
  const repo = await fixture();
  await write(repo, 'binary.dat', Buffer.from([0, 1, 2])); await write(repo, '--中文 [x].txt', 'old\r\nno newline');
  git(repo, 'add', '-A'); git(repo, 'commit', '-m', 'files');
  git(repo, 'mv', 'keep.txt', 'renamed.txt'); await fs.unlink(path.join(repo, '--中文 [x].txt'));
  await write(repo, 'binary.dat', Buffer.from([0, 3, 4])); await write(repo, '--新增 [x].txt', 'new\r\nno newline'); git(repo, 'add', '-A'); git(repo, 'update-index', '--chmod=+x', 'a.txt');
  const before = snapshot(repo), plan = await app.hunkCommitService.capture(repo);
  assert.ok(plan.units.every(unit => unit.kind === 'file')); assert.ok(plan.units.some(unit => unit.paths.includes('keep.txt') && unit.paths.includes('renamed.txt')));
  await app.hunkCommitService.execute(plan, plan.units.map((unit, i) => group(`whole file ${i}`, [unit])));
  assert.equal(git(repo, 'rev-parse', 'HEAD^{tree}').trim(), plan.indexTree); assert.deepEqual(snapshot(repo), before); assert.equal(git(repo, 'show', 'HEAD:--新增 [x].txt'), 'new\r\nno newline');
});

test('CRLF content without final newline can be split and preserves staged bytes', async () => {
  const repo = await fixture(), name = '--特殊 [x].txt';
  const initial = original.trimEnd().replaceAll('\n', '\r\n'); await write(repo, name, initial); git(repo, 'add', '--', name); git(repo, 'commit', '-m', 'CRLF');
  const next = initial.replace('line 3\r\n', 'first\r\nextra\r\n').replace('line 50', 'last'); await write(repo, name, next); git(repo, 'add', '--', name);
  const plan = await app.hunkCommitService.capture(repo); assert.equal(plan.units.length, 2);
  await app.hunkCommitService.execute(plan, [group('last', [plan.units[1]]), group('first', [plan.units[0]])]);
  assert.equal(git(repo, 'show', `HEAD:${name}`), next);
});

test('unborn branches support first commits through an empty temporary index', async () => {
  const repo = await fixture(false); await write(repo, '--new.txt', 'new\n'); await write(repo, 'other.txt', 'other\n'); git(repo, 'add', '-A');
  const before = snapshot(repo), plan = await app.hunkCommitService.capture(repo); assert.equal(plan.head, '');
  const result = await app.hunkCommitService.execute(plan, plan.units.map((unit, i) => group(`root ${i}`, [unit])));
  assert.equal(result.completed.length, 2); assert.equal(result.recoveryRef, undefined); assert.deepEqual(snapshot(repo), before); assert.equal(git(repo, 'status', '--porcelain'), '');
});

test('intent-to-add, assume-unchanged and skip-worktree entries are not rewritten', async () => {
  const repo = await staged(); await write(repo, 'intent.txt', 'not staged\n'); git(repo, 'add', '-N', 'intent.txt'); git(repo, 'update-index', '--assume-unchanged', 'keep.txt');
  await write(repo, 'skip.txt', 'skip\n'); git(repo, 'add', 'skip.txt'); git(repo, 'update-index', '--skip-worktree', 'skip.txt');
  const before = snapshot(repo), plan = await app.hunkCommitService.capture(repo); await app.hunkCommitService.execute(plan, [group('one', [plan.units.find(unit => unit.path === 'a.txt')])]);
  assert.deepEqual(snapshot(repo), before); assert.match(git(repo, 'diff'), /intent.txt/); assert.ok(plan.units.every(unit => unit.path !== 'intent.txt'));
});

test('index edits, HEAD movement, branch changes and merge state reject stale plans before commits', async () => {
  for (const mutation of ['index', 'head', 'branch', 'merge']) {
    const repo = await staged(), plan = await app.hunkCommitService.capture(repo), head = git(repo, 'rev-parse', 'HEAD');
    if (mutation === 'index') { await write(repo, 'keep.txt', 'new staging\n'); git(repo, 'add', 'keep.txt'); }
    if (mutation === 'head') git(repo, 'commit', '--allow-empty', '-m', 'external');
    if (mutation === 'branch') git(repo, 'switch', '-c', 'other');
    if (mutation === 'merge') await fs.writeFile(path.join(repo, '.git', 'MERGE_HEAD'), head);
    const expected = snapshot(repo), now = git(repo, 'rev-parse', 'HEAD');
    await assert.rejects(app.hunkCommitService.execute(plan, [group('stale', [plan.units[0]])]), /变化|changed/);
    assert.equal(git(repo, 'rev-parse', 'HEAD'), now); assert.deepEqual(snapshot(repo), expected); assert.equal(git(repo, 'for-each-ref', 'refs/auugit/recovery'), '');
  }
});

test('a failing first hook preserves real index and worktree without a commit', async () => {
  const repo = await staged(), plan = await app.hunkCommitService.capture(repo), before = snapshot(repo), head = git(repo, 'rev-parse', 'HEAD');
  await hook(repo, 'echo rejected >&2\nexit 1');
  await assert.rejects(app.hunkCommitService.execute(plan, [group('blocked', [plan.units[0]])]), error => error instanceof app.HunkCommitError && error.completed.length === 0);
  assert.equal(git(repo, 'rev-parse', 'HEAD'), head); assert.deepEqual(snapshot(repo), before); assert.equal(await fs.readFile(path.join(repo, 'a.txt'), 'utf8'), changed);
});

test('a later failing hook reports the successful commit once and leaves remaining content staged', async () => {
  const repo = await staged(), plan = await app.hunkCommitService.capture(repo), before = snapshot(repo), progress = [];
  await hook(repo, 'if git show :a.txt | grep -q "first change"; then echo rejected >&2; exit 1; fi');
  await assert.rejects(app.hunkCommitService.execute(plan, [group('last', [plan.units[2]]), group('first', [plan.units[0]])], { onProgress: list => progress.push(list.length) }), error => error instanceof app.HunkCommitError && error.completed.length === 1 && !!error.recoveryRef);
  assert.deepEqual(progress, [1]); assert.equal(git(repo, 'rev-list', '--count', 'HEAD').trim(), '2'); assert.deepEqual(snapshot(repo), before); assert.match(git(repo, 'diff', '--cached'), /first change/);
});

test('hook changes in the alternate index stop subsequent commits and are reported honestly', async () => {
  const repo = await staged(), plan = await app.hunkCommitService.capture(repo), before = snapshot(repo);
  await hook(repo, 'printf "hook change\\n" > keep.txt\ngit add keep.txt');
  await assert.rejects(app.hunkCommitService.execute(plan, [group('last', [plan.units[2]]), group('first', [plan.units[0]])]), error => error.completed.length === 1 && /钩子|hook/.test(error.message));
  assert.equal(git(repo, 'show', 'HEAD:keep.txt'), 'hook change\n'); assert.deepEqual(snapshot(repo), before); assert.equal(git(repo, 'rev-list', '--count', 'HEAD').trim(), '2');
});

test('lost commit responses reconcile HEAD exactly once without replaying a commit', async () => {
  const repo = await staged(), plan = await app.hunkCommitService.capture(repo), previous = globalThis.fetch; let writes = 0;
  globalThis.fetch = async (url, init) => { const data = url === '/api/git' ? JSON.parse(init.body) : {}; const response = await previous(url, init); if (data.indexTree && data.args.includes('commit')) { writes++; await response.text(); throw Error('Lost response after commit'); } return response; };
  try { await assert.rejects(app.hunkCommitService.execute(plan, [group('one', [plan.units[0]]), group('two', [plan.units[1]])]), error => error.completed.length === 1 && /Lost response/.test(error.message)); }
  finally { globalThis.fetch = previous; }
  assert.equal(writes, 1); assert.equal(git(repo, 'rev-list', '--count', 'HEAD').trim(), '2');
});

test('stop between commits preserves completed results and does not consume later groups', async () => {
  const repo = await staged(), plan = await app.hunkCommitService.capture(repo); let proceed = true;
  await assert.rejects(app.hunkCommitService.execute(plan, [group('one', [plan.units[0]]), group('two', [plan.units[1]])], { canContinue: () => proceed, onProgress: () => { proceed = false; } }), error => error.completed.length === 1 && /停止|stopped/.test(error.message));
  assert.equal(git(repo, 'rev-list', '--count', 'HEAD').trim(), '2'); assert.match(git(repo, 'diff', '--cached'), /-line 30/);
});

test('external index edits between commits are detected and never overwritten', async () => {
  const repo = await staged(), plan = await app.hunkCommitService.capture(repo); let external;
  await assert.rejects(app.hunkCommitService.execute(plan, [group('one', [plan.units[0]]), group('two', [plan.units[1]])], { onProgress: () => { git(repo, 'restore', '--staged', 'a.txt'); external = snapshot(repo); } }), error => error.completed.length === 1 && /变化|changed/.test(error.message));
  assert.deepEqual(snapshot(repo), external); assert.equal(git(repo, 'rev-list', '--count', 'HEAD').trim(), '2');
});

test('validation rejects duplicate or unknown units, empty groups and unsafe alternate-index commands', async () => {
  const repo = await staged(), plan = await app.hunkCommitService.capture(repo);
  for (const groups of [[], [group('', [plan.units[0]])], [group('empty', [])], [group('one', [plan.units[0]]), group('two', [plan.units[0]])], [group('unknown', ['missing'])]]) assert.throws(() => app.validateHunkGroups(plan, groups));
  for (const tree of ['HEAD', '../index', 'C:/index', '--empty']) assert.throws(() => app.validateTempIndexArguments(['write-tree'], tree));
  for (const args of [['commit', '--all', '-m', 'x'], ['read-tree', '-u', 'HEAD'], ['apply', '-'], ['restore', '--worktree', '.'], ['reset', '--hard']]) assert.throws(() => app.validateTempIndexArguments(args, 'empty'));
  const response = await nativeFetch(base + '/api/git', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-AuuGit-Request': '1' }, body: JSON.stringify({ cwd: repo, args: ['commit', '--all', '-m', 'bad'], indexTree: plan.indexTree }) });
  assert.equal(response.status, 400); assert.equal(git(repo, 'rev-list', '--count', 'HEAD').trim(), '1');
});

test('diff prefix configuration and non-UTF8 text cannot corrupt partial commits', async () => {
  const repo = await fixture(); git(repo, 'config', 'diff.noprefix', 'true'); git(repo, 'config', 'diff.srcPrefix', 'custom/');
  await write(repo, 'latin.txt', Buffer.from([0x63, 0x61, 0x66, 0xe9, 0x0a])); git(repo, 'add', 'latin.txt'); git(repo, 'commit', '-m', 'legacy text');
  const bytes = Buffer.from([0x63, 0x61, 0x66, 0xe9, 0x21, 0x0a]); await write(repo, 'latin.txt', bytes); await write(repo, 'a.txt', changed); git(repo, 'add', '-A');
  const plan = await app.hunkCommitService.capture(repo), legacy = plan.units.find(unit => unit.path === 'latin.txt'), hunks = plan.units.filter(unit => unit.path === 'a.txt');
  assert.equal(legacy.kind, 'file'); assert.equal(hunks.length, 3);
  await app.hunkCommitService.execute(plan, [group('text and bytes', [legacy, hunks[2]]), group('other hunks', hunks.slice(0, 2))]);
  assert.equal(git(repo, 'rev-parse', 'HEAD^{tree}').trim(), plan.indexTree); assert.deepEqual(await fs.readFile(path.join(repo, 'latin.txt')), bytes);
});

test('HEAD advancing during commit setup stops the sequence after reporting its actual commit', async () => {
  const repo = await staged(), plan = await app.hunkCommitService.capture(repo), before = snapshot(repo), previous = globalThis.fetch; let moved = false;
  globalThis.fetch = async (url, init) => {
    const data = url === '/api/git' ? JSON.parse(init.body) : {};
    if (!moved && data.indexTree && data.args.includes('commit')) {
      moved = true;
      const external = git(repo, 'commit-tree', plan.baseTree, '-p', plan.head, '-m', 'external HEAD advance').trim();
      git(repo, 'update-ref', 'HEAD', external, plan.head);
    }
    return previous(url, init);
  };
  try { await assert.rejects(app.hunkCommitService.execute(plan, [group('one', [plan.units[0]]), group('two', [plan.units[1]])]), error => error.completed.length === 1 && /变化|changed/.test(error.message)); }
  finally { globalThis.fetch = previous; }
  assert.deepEqual(snapshot(repo), before); assert.equal(git(repo, 'rev-list', '--count', 'HEAD').trim(), '3'); assert.equal(git(repo, 'log', '-1', '--format=%s').trim(), 'one');
});

test('AI snapshot verification is read-only and rejects an edited staging area', async () => {
  const repo = await staged(), plan = await app.hunkCommitService.capture(repo), before = snapshot(repo), head = git(repo, 'rev-parse', 'HEAD');
  await app.hunkCommitService.verify(plan); assert.deepEqual(snapshot(repo), before); assert.equal(git(repo, 'rev-parse', 'HEAD'), head);
  git(repo, 'restore', '--staged', 'a.txt'); const edited = snapshot(repo);
  await assert.rejects(app.hunkCommitService.verify(plan), /变化|changed/); assert.deepEqual(snapshot(repo), edited); assert.equal(git(repo, 'for-each-ref', 'refs/auugit/recovery'), '');
});
