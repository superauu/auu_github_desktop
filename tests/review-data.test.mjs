/**
 * 审查视图数据层测试:
 * (a) ReviewCheckpointService —— refs/auugit/review/<分支> 的 CAS 读取/推进/删除;
 * (b) GitService 审查范围方法 —— 参数校验(非十六进制哈希直接拒绝)、
 *     getCommitsInRange 反转与线性判定、getRangeDiffSummary 的 -z 双流合并、
 *     getRangeFileDiff/getRangePatch/isAncestor 的参数构造。
 * GitExecutor 以 test-stub 替换(经入口再导出暴露 __respond/__calls/__reset)。
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { build } from 'esbuild';

const root = process.cwd();
let app, tmp;

const EXECUTOR_STUB = `
const calls = [];
let responder = () => ({ exitCode: 0, stdout: '', stderr: '' });
export function __respond(fn) { responder = fn; }
export function __calls() { return calls; }
export function __reset(fn) { calls.length = 0; responder = fn || (() => ({ exitCode: 0, stdout: '', stderr: '' })); }
export class GitExecutionError extends Error {
  constructor(exitCode, stderr = '', stdout = '') { super('git exited with ' + exitCode); this.exitCode = exitCode; this.stderr = stderr; this.stdout = stdout; }
}
export async function executeGit(args) {
  calls.push(args);
  const r = responder(args);
  if (r.exitCode) throw new GitExecutionError(r.exitCode, r.stderr || '', r.stdout || '');
  return { exitCode: 0, stdout: r.stdout || '', stderr: r.stderr || '' };
}
export async function executeGitNow(args) { return executeGit(args); }
export async function executeGitTransaction(cwd, run) { return run(executeGit); }
export function serializeGitWrite() {}
export const GitQueue = { isReadOnlyGitCommand: () => true, serializeGitWrite: () => {} };
`;
const I18N_STUB = `export const tNow = (key) => key; export const t = (key) => key;`;

before(async () => {
  tmp = await fs.mkdtemp(path.join(root, '.test-tmp-review-data-'));
  const bundle = path.join(tmp, 'review-data.cjs');
  await build({
    stdin: {
      contents: [
        `export { reviewCheckpointService } from './src/services/git/ReviewCheckpointService';`,
        `export { GitService } from './src/services/git/GitService';`,
        `export { __respond, __calls, __reset } from './src/services/git/GitExecutor';`,
      ].join('\n'),
      resolveDir: root,
    },
    bundle: true, platform: 'node', format: 'cjs', outfile: bundle,
    alias: { '@': path.join(root, 'src') }, logLevel: 'silent',
    plugins: [{
      name: 'headless-review-data',
      setup(build) {
        build.onResolve({ filter: /^@\/i18n$/ }, () => ({ path: 'i18n', namespace: 'test-stub' }));
        build.onLoad({ filter: /.*/, namespace: 'test-stub' }, () => ({ contents: I18N_STUB, loader: 'js' }));
        build.onLoad({ filter: /GitExecutor\.ts$/ }, () => ({ contents: EXECUTOR_STUB, loader: 'ts' }));
      },
    }],
  });
  app = createRequire(import.meta.url)(bundle);
});

after(async () => {
  if (tmp && path.dirname(tmp) === root && path.basename(tmp).startsWith('.test-tmp-review-data-')) await fs.rm(tmp, { recursive: true, force: true, maxRetries: 5 });
});

const H1 = 'a'.repeat(40);
const H2 = 'b'.repeat(40);
const BAD = 'main; rm -rf';
const REPO = 'C:/repo';
const NUL = String.fromCharCode(0);

// ---------------------------------------------------------------------------
// (a) ReviewCheckpointService
// ---------------------------------------------------------------------------

test('checkpoint get resolves refs/auugit/review/<branch> and maps failure to null', async () => {
  app.__reset(() => ({ stdout: `${H2}\n` }));
  const found = await app.reviewCheckpointService.get(REPO, 'feature/ai-loop');
  assert.deepEqual(app.__calls(), [['rev-parse', '--verify', '--end-of-options', `refs/auugit/review/feature/ai-loop^{commit}`]]);
  assert.deepEqual(found, { ref: 'refs/auugit/review/feature/ai-loop', hash: H2 });

  app.__reset(() => ({ exitCode: 128, stderr: 'fatal: Needed a single revision' }));
  assert.equal(await app.reviewCheckpointService.get(REPO, 'main'), null);
});

test('checkpoint set uses all-zero old value on first creation and the expected hash for CAS', async () => {
  app.__reset();
  await app.reviewCheckpointService.set(REPO, 'main', H2, null);
  assert.deepEqual(app.__calls(), [['update-ref', 'refs/auugit/review/main', H2, '0'.repeat(40)]]);

  app.__reset();
  await app.reviewCheckpointService.set(REPO, 'main', H1, H2);
  assert.deepEqual(app.__calls(), [['update-ref', 'refs/auugit/review/main', H1, H2]]);

  app.__reset();
  await assert.rejects(app.reviewCheckpointService.set(REPO, 'main', BAD, null));
  assert.equal(app.__calls().length, 0, 'non-hex input must never reach git');
  await assert.rejects(app.reviewCheckpointService.set(REPO, 'main', H1, BAD));
  assert.equal(app.__calls().length, 0);
});

test('checkpoint clear deletes with CAS and non-hex expected values are rejected', async () => {
  app.__reset();
  await app.reviewCheckpointService.clear(REPO, 'main', H1);
  assert.deepEqual(app.__calls(), [['update-ref', '--no-deref', '-d', 'refs/auugit/review/main', H1]]);

  app.__reset();
  await assert.rejects(app.reviewCheckpointService.clear(REPO, 'main', BAD));
  assert.equal(app.__calls().length, 0);
});

// ---------------------------------------------------------------------------
// (b) GitService 审查范围方法
// ---------------------------------------------------------------------------

const logRecord = (hash, short, subject, body, name, email, date, parents) =>
  [hash, short, subject, body, name, email, date, parents, ''].join('\x1f') + '\x1e';

test('getCommitsInRange validates hex input, reverses log order and detects merges', async () => {
  app.__reset(() => ({
    stdout: [
      logRecord(H2, 'b'.repeat(7), 'second subject', 'body two', 'Bob', 'bob@x', '2026-10-26T10:00:00+00:00', H1),
      logRecord(H1, 'a'.repeat(7), 'first subject', 'body one', 'Alice', 'alice@x', '2026-10-25T10:00:00+00:00', 'c'.repeat(40)),
    ].join(''),
  }));
  const service = new app.GitService();
  const { commits, linear, truncated } = await service.getCommitsInRange(REPO, H1, H2);
  assert.deepEqual(app.__calls(), [['log', '--first-parent', '-n', '500', '--format=%H%x1f%h%x1f%s%x1f%b%x1f%an%x1f%ae%x1f%aI%x1f%P%x1f%D%x1e', `${H1}..${H2}`, '--']]);
  assert.deepEqual(commits.map((commit) => commit.hash), [H1, H2], 'oldest first for review reading order');
  assert.equal(commits[0].subject, 'first subject');
  assert.equal(linear, true);
  assert.equal(truncated, false);

  // 合并提交:parents 含两项 → linear=false
  app.__respond(() => ({ stdout: logRecord(H2, 'b'.repeat(7), 'merge', '', 'Bob', 'bob@x', '2026-10-26T10:00:00+00:00', `${H1} ${'c'.repeat(40)}`) }));
  const merged = await service.getCommitsInRange(REPO, H1, H2);
  assert.equal(merged.linear, false);

  // 非十六进制 base/head 直接拒绝,不触达 git
  app.__reset();
  await assert.rejects(service.getCommitsInRange(REPO, BAD, H2));
  await assert.rejects(service.getCommitsInRange(REPO, H1, BAD));
  assert.equal(app.__calls().length, 0);
});

test('getCommitsInRange flags truncation when the limit is reached', async () => {
  const service = new app.GitService();
  app.__respond(() => ({ stdout: logRecord(H2, 'b'.repeat(7), 's', '', 'Bob', 'b@x', '2026-10-26T10:00:00+00:00', H1) }));
  const result = await service.getCommitsInRange(REPO, H1, H2, 1);
  assert.equal(result.truncated, true, 'commits.length >= limit must be flagged');
  assert.deepEqual(app.__calls()[0].slice(2, 4), ['-n', '1']);
});

test('getRangeDiffSummary merges -z name-status with -z numstat and totals lines', async () => {
  const service = new app.GitService();
  app.__respond((args) => {
    if (args.includes('--name-status')) return { stdout: ['M', 'src/app.ts', 'A', '.env', 'D', 'src/old.ts', ''].join(NUL) };
    return { stdout: ['10\t2\tsrc/app.ts', '-\t-\t.env', '40\t120\tsrc/old.ts', ''].join(NUL) };
  });
  const summary = await service.getRangeDiffSummary(REPO, H1, H2);
  assert.deepEqual(summary.files, [
    { path: 'src/app.ts', status: 'modified', staged: false, insertions: 10, deletions: 2 },
    { path: '.env', status: 'added', staged: false, insertions: 0, deletions: 0 },
    { path: 'src/old.ts', status: 'deleted', staged: false, insertions: 40, deletions: 120 },
  ]);
  assert.equal(summary.insertions, 50);
  assert.equal(summary.deletions, 122);

  app.__reset();
  await assert.rejects(service.getRangeDiffSummary(REPO, BAD, H2));
  assert.equal(app.__calls().length, 0);
});

test('getRangeFileDiff, getRangePatch and isAncestor construct whitelisted read-only calls', async () => {
  const service = new app.GitService();

  app.__respond(() => ({ stdout: 'diff --git a/x b/x\n' }));
  const lines = await service.getRangeFileDiff(REPO, H1, H2, 'src/app.ts');
  assert.deepEqual(app.__calls(), [['--literal-pathspecs', 'diff', '--no-color', H1, H2, '--', 'src/app.ts']]);
  assert.ok(Array.isArray(lines));

  app.__reset(() => ({ stdout: 'patch-payload' }));
  const patch = await service.getRangePatch(REPO, H1, H2, 5);
  assert.equal(patch, 'patch', 'capChars truncates the payload');
  assert.deepEqual(app.__calls(), [['diff', '--no-color', '--no-ext-diff', '--no-textconv', H1, H2, '--']]);

  app.__reset(() => ({ stdout: '0\n' }));
  assert.equal(await service.isAncestor(REPO, H1, H2), true);
  app.__reset(() => ({ stdout: '3\n' }));
  assert.equal(await service.isAncestor(REPO, H2, H1), false);
  app.__reset(() => ({ stdout: '0\n' }));
  assert.equal(await service.isAncestor(REPO, H2, H2), true, 'equal commits count as ancestors');

  app.__reset();
  await assert.rejects(service.getRangePatch(REPO, BAD, H2, 100));
  await assert.rejects(service.isAncestor(REPO, H1, BAD));
  assert.equal(app.__calls().length, 0);
});

test('getRangeCommitCount counts the first-parent range and validates hex input', async () => {
  const service = new app.GitService();
  app.__reset(() => ({ stdout: '7\n' }));
  assert.equal(await service.getRangeCommitCount(REPO, H1, H2), 7);
  assert.deepEqual(app.__calls(), [['rev-list', '--first-parent', '--count', `${H1}..${H2}`]]);

  app.__reset(() => ({ stdout: '\n' }));
  assert.equal(await service.getRangeCommitCount(REPO, H1, H2), 0, 'empty output maps to zero');

  app.__reset();
  await assert.rejects(service.getRangeCommitCount(REPO, BAD, H2));
  assert.equal(app.__calls().length, 0);
});
