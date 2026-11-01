/**
 * Errors 集成 M4 测试（PRD docs/errors-integration-prd.md §12 M4 验收）：
 * 1. fixFlow 纯函数：分支名模板（slugify/非法字符安全化/短 ID 缺失回落）、
 *    中性 trailer 与幂等追加、PR 引用块幂等、分支新鲜度（stale 规则）；
 * 2. IssueGitLink 持久化：recordFixBranch find-or-create、recordFixCommit 仅记已链接分支
 *    且幂等、path 守卫、重启恢复（localStorage 重读）；
 * 3. 状态回写（§8.3）：成功即时更新列表；403 操作级失败向上抛且列表/健康态不变。
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { build } from 'esbuild';

const root = process.cwd();
let tmp, app, originalFetch;

const jsonResponse = (body, { status = 200 } = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
  text: async () => JSON.stringify(body),
  headers: { get: () => null, forEach: () => {} },
});

before(async () => {
  tmp = await fs.mkdtemp(path.join(root, '.test-tmp-errors-fix-'));
  const outfile = path.join(tmp, 'fix.cjs');
  await build({
    stdin: {
      contents: [
        `export { useErrorsStore } from './src/stores/errorsStore';`,
        `export { slugifyTitle, buildBranchName, buildCommitTrailer, appendCommitTrailer, buildPrReferenceBlock, appendPrReferenceBlock, splitBranchFreshness, BRANCH_NAME_TEMPLATE } from './src/services/errors/fixFlow';`,
        `export { storeIntegrationToken } from './src/services/errors/credentials';`,
      ].join(''),
      resolveDir: root,
    },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    outfile,
    alias: { '@': path.join(root, 'src') },
    logLevel: 'silent',
  });
  app = createRequire(import.meta.url)(outfile);
});
after(async () => {
  if (originalFetch) globalThis.fetch = originalFetch;
  delete globalThis.localStorage;
  if (tmp && path.dirname(tmp) === root && path.basename(tmp).startsWith('.test-tmp-errors-fix-')) {
    await fs.rm(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 150 });
  }
});

test('fixFlow：分支名模板安全化、slugify、trailer 幂等、PR 块幂等、stale 规则', () => {
  assert.equal(app.slugifyTitle('TypeError: Cannot read "id" of null!'), 'typeerror-cannot-read-id-of-null');
  assert.equal(app.slugifyTitle('---多字节 title---'), 'title');

  const parts = { providerId: 'sentry', shortId: 'FRONTEND-ABC', issueId: '42', title: 'TypeError: boom (v2)' };
  assert.equal(app.buildBranchName(app.BRANCH_NAME_TEMPLATE, parts), 'fix/sentry-FRONTEND-ABC-typeerror-boom-v2');
  // 短 ID 缺失回落 issueId；非法字符（空格/中文/冒号）折叠为 '-'
  assert.equal(app.buildBranchName(app.BRANCH_NAME_TEMPLATE, { ...parts, shortId: undefined }), 'fix/sentry-42-typeerror-boom-v2');
  assert.equal(app.buildBranchName('release/{shortId}', { ...parts, title: '修复 登录 bug' }), 'release/FRONTEND-ABC');
  assert.ok(!/[^a-zA-Z0-9/._-]/.test(app.buildBranchName('x/{titleSlug}', { ...parts, title: 'a b//c:d' })));

  assert.equal(app.buildCommitTrailer('sentry', 'FRONTEND-ABC'), 'Error-Tracking: sentry/FRONTEND-ABC');
  // 幂等：已含同一 trailer 行不重复追加
  const once = app.appendCommitTrailer('fix: thing\n\nError-Tracking: sentry/FRONTEND-ABC', 'Error-Tracking: sentry/FRONTEND-ABC');
  assert.equal(once, 'fix: thing\n\nError-Tracking: sentry/FRONTEND-ABC');
  const appended = app.appendCommitTrailer('fix: thing', 'Error-Tracking: sentry/FRONTEND-ABC');
  assert.equal(appended, 'fix: thing\n\nError-Tracking: sentry/FRONTEND-ABC');

  // PR 引用块幂等
  const blockParts = { providerName: 'Sentry', shortId: 'FRONTEND-ABC', externalUrl: 'https://sentry.io/x/42/' };
  const body = app.appendPrReferenceBlock('', blockParts);
  assert.ok(body.startsWith('Related production error: Sentry FRONTEND-ABC (https://sentry.io/x/42/)'));
  assert.equal(app.appendPrReferenceBlock(body, blockParts), body);

  // stale：本地清单找不到即 stale，绝不指向其他分支
  assert.deepEqual(app.splitBranchFreshness(['fix/a', 'fix/b'], ['fix/a', 'main']), { active: ['fix/a'], stale: ['fix/b'] });
});

test('IssueGitLink：find-or-create、提交记录仅限已链接分支、path 守卫、重启恢复', async () => {
  const storage = new Map();
  globalThis.localStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key),
  };
  const store = app.useErrorsStore;
  store.setState({ connections: [], runtime: {}, restored: true, mappingsByRepo: {}, linksByRepo: {}, activeRepoKey: null, activeRepoPath: null, issues: [], nextCursors: {}, syncing: false, syncErrors: {} });
  store.getState().loadRepoContext('git@github.com:o/r.git', 'E:\\repo');
  const repoKey = 'github.com/o/r';

  const issue = { connectionId: 'c1', providerId: 'sentry', externalProjectId: '101', issueId: '42', shortId: 'FRONTEND-ABC', externalUrl: 'u42' };
  const link = store.getState().recordFixBranch(issue, 'fix/sentry-FRONTEND-ABC-x');
  assert.equal(link.repoKey, repoKey);
  assert.equal(link.shortId, 'FRONTEND-ABC');
  // 同 issue 再记另一分支 → 追加而非新建
  store.getState().recordFixBranch(issue, 'fix/second');
  assert.deepEqual(store.getState().linksByRepo[repoKey].length, 1);
  assert.deepEqual(store.getState().linksByRepo[repoKey][0].branchNames, ['fix/sentry-FRONTEND-ABC-x', 'fix/second']);
  assert.ok(storage.get('auu_git_error_links').includes('fix/second'));

  // trailer / link 反查（path 匹配）
  assert.equal(store.getState().trailerForBranch('E:\\repo', 'fix/sentry-FRONTEND-ABC-x'), 'Error-Tracking: sentry/FRONTEND-ABC');
  assert.equal(store.getState().trailerForBranch('E:\\repo', 'main'), null);
  assert.equal(store.getState().trailerForBranch('E:\\other', 'fix/sentry-FRONTEND-ABC-x'), null); // path 守卫
  assert.equal(store.getState().linkForBranch('E:\\repo', 'fix/second')?.issueId, '42');

  // 提交记录：已链接分支幂等追加；未链接分支与 path 不符皆空操作
  store.getState().recordFixCommit('E:\\repo', 'fix/sentry-FRONTEND-ABC-x', 'sha1');
  store.getState().recordFixCommit('E:\\repo', 'fix/sentry-FRONTEND-ABC-x', 'sha1'); // 幂等
  store.getState().recordFixCommit('E:\\repo', 'main', 'sha2'); // 未链接
  store.getState().recordFixCommit('E:\\other', 'fix/sentry-FRONTEND-ABC-x', 'sha3'); // path 不符
  const linkAfter = store.getState().linkForIssue('c1', '42');
  assert.deepEqual(linkAfter?.commitShas, ['sha1']);

  // PR 记录
  store.getState().recordFixPullRequest('E:\\repo', 'fix/sentry-FRONTEND-ABC-x', { provider: 'github', number: 7, url: 'pr7' });
  store.getState().recordFixPullRequest('E:\\repo', 'fix/sentry-FRONTEND-ABC-x', { provider: 'github', number: 7, url: 'pr7' });
  assert.deepEqual(store.getState().linkForIssue('c1', '42')?.pullRequests, [{ provider: 'github', number: 7, url: 'pr7' }]);

  // 重启恢复：模拟新会话（重置内存 + 重新 loadRepoContext）
  store.setState({ linksByRepo: {}, activeRepoKey: null, activeRepoPath: null });
  store.getState().loadRepoContext('https://github.com/o/r.git', 'E:\\moved'); // 路径变了，remote 不变
  const restored = store.getState().linkForIssue('c1', '42');
  assert.deepEqual(restored?.branchNames, ['fix/sentry-FRONTEND-ABC-x', 'fix/second']);
  assert.deepEqual(restored?.commitShas, ['sha1']);
  assert.deepEqual(restored?.pullRequests.map((pr) => pr.number), [7]);
});

test('状态回写：成功即时更新列表；403 操作级失败向上抛且列表/健康态不变', async () => {
  const store = app.useErrorsStore;
  store.setState({
    connections: [{ id: 'c1', providerId: 'sentry', displayName: 'A', enabled: true, orgId: 'acme', domains: ['error-tracking'] }],
    runtime: {}, restored: true, mappingsByRepo: {}, linksByRepo: {}, activeRepoKey: null, activeRepoPath: null,
    issues: [{ connectionId: 'c1', providerId: 'sentry', externalProjectId: '101', issueId: '42', title: 'boom', severity: 'error', status: 'unresolved', externalUrl: 'u', rawData: { v: 1 } }],
    nextCursors: {}, syncing: false, syncErrors: {},
  });
  await app.storeIntegrationToken('c1', 'tok');
  originalFetch = globalThis.fetch;

  // 成功：PUT 返回更新后的 issue → 列表即时更新
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    if (init?.method === 'PUT' && url.pathname === '/api/0/issues/42/') {
      return jsonResponse({ id: '42', title: 'boom', level: 'error', status: 'resolved', count: '9', permalink: 'u', project: { id: 101 } });
    }
    return jsonResponse({}, { status: 404 });
  };
  await store.getState().updateIssueStatus('c1', '42', 'resolve');
  assert.equal(store.getState().issues[0].status, 'resolved');
  assert.equal(store.getState().issues[0].rawStatus, 'resolved');

  // 403（操作级）：向上抛，列表不变，健康态不变（不出现降级横幅依据）
  globalThis.fetch = async () => jsonResponse({ detail: 'forbidden' }, { status: 403 });
  await assert.rejects(store.getState().updateIssueStatus('c1', '42', 'resolve'), (error) => error.kind === 'forbidden');
  assert.equal(store.getState().issues[0].status, 'resolved'); // 保持上次成功状态
  assert.equal(store.getState().runtime['c1'], undefined); // 健康态未被触碰
});
