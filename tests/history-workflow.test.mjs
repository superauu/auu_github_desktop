/**
 * 历史整理 plan 的审查范围扩展测试:
 * (a) 不带 base 的既有行为(最近 N 条、base 取首条父提交);
 * (b) 带 base(审查检查点)—— 范围锁定 base..HEAD、rev-list 预检超 30 报错、
 *     非十六进制 base 直接拒绝、返回 plan.base = 传入检查点。
 * GitExecutor 与 i18n 以 test-stub 替换。
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
  tmp = await fs.mkdtemp(path.join(root, '.test-tmp-history-workflow-'));
  const bundle = path.join(tmp, 'history-workflow.cjs');
  await build({
    stdin: {
      contents: [
        `export { historyWorkflowService } from './src/services/git/HistoryWorkflowService';`,
        `export { __respond, __calls, __reset } from './src/services/git/GitExecutor';`,
      ].join('\n'),
      resolveDir: root,
    },
    bundle: true, platform: 'node', format: 'cjs', outfile: bundle,
    alias: { '@': path.join(root, 'src') }, logLevel: 'silent',
    plugins: [{
      name: 'headless-history-workflow',
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
  if (tmp && path.dirname(tmp) === root && path.basename(tmp).startsWith('.test-tmp-history-workflow-')) await fs.rm(tmp, { recursive: true, force: true, maxRetries: 5 });
});

const BASE = 'a'.repeat(40);
const HEAD = 'b'.repeat(40);
const BAD = 'origin/main --upload-pack=evil';
const record = (hash, subject, parents) => [hash, hash.slice(0, 7), subject, '', 'dev', 'dev@x', '2026-10-26T10:00:00+00:00', parents, ''].join('\x1f') + '\x1e';

/** 默认响应:symbolic-ref=feature、rev-parse base→BASE、rev-list count 可控、log 输出可控 */
const defaultRespond = ({ count = '3\n', log = '' } = {}) => app.__reset((args) => {
  if (args[0] === 'symbolic-ref') return { stdout: 'feature\n' };
  if (args[0] === 'rev-parse') return { stdout: `${BASE}\n` };
  if (args[0] === 'rev-list') return { stdout: count };
  if (args[0] === 'log') return { stdout: log };
  if (args[0] === 'for-each-ref') return { stdout: '' };
  return { stdout: '' };
});

test('plan without base keeps the legacy last-N behavior and derives base from the first parent', async () => {
  defaultRespond({ log: record(HEAD, 'newer', BASE) + record(BASE, 'older', 'c'.repeat(40)) });
  const plan = await app.historyWorkflowService.plan('C:/repo', 5);
  assert.deepEqual(app.__calls()[1].slice(0, 2), ['log', '--first-parent']);
  assert.equal(app.__calls()[1][4], 'HEAD');
  assert.equal(plan.base, 'c'.repeat(40));
  assert.deepEqual(plan.commits.map((commit) => commit.hash), [BASE, HEAD]);
  assert.equal(plan.published, false);
});

test('plan with a checkpoint base locks the range to base..HEAD and reports it as plan.base', async () => {
  defaultRespond({ count: '3\n', log: record(HEAD, 'newer', 'x'.repeat(40)) });
  const plan = await app.historyWorkflowService.plan('C:/repo', 30, BASE);
  assert.ok(app.__calls().some((args) => args[0] === 'rev-list' && args[1] === '--count' && args[2] === `${BASE}..HEAD`));
  const logCall = app.__calls().find((args) => args[0] === 'log');
  assert.equal(logCall[4], `${BASE}..HEAD`, 'log range is locked to the checkpoint');
  assert.equal(plan.base, BASE);
  assert.equal(plan.head, HEAD);
  assert.equal(plan.branch, 'feature');
});

test('plan with a checkpoint base rejects ranges over 30 commits before touching log', async () => {
  defaultRespond({ count: '31\n' });
  await assert.rejects(app.historyWorkflowService.plan('C:/repo', 30, BASE), /review\.tidyRangeTooLarge/);
  assert.equal(app.__calls().some((args) => args[0] === 'log'), false, 'no log is fetched for an oversized range');
});

test('plan rejects non-hex checkpoint bases without any git call', async () => {
  defaultRespond();
  await assert.rejects(app.historyWorkflowService.plan('C:/repo', 30, BAD), /flow\.invalidPlan/);
  assert.equal(app.__calls().length, 1, 'only symbolic-ref ran before the validation');
});
