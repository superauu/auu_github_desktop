/**
 * Errors 集成 M3 测试（PRD docs/errors-integration-prd.md §12 M3 验收）：
 * 1. 列表查询：作用域（本仓库/全部）、来源/severity/搜索过滤、lastSeen 合并排序、徽标口径；
 * 2. 堆栈跳转三档（§8.4）：前缀映射精确、模糊唯一、后缀择优、多候选、不可定位；
 * 3. sync 多源合并：单连接失败不影响其他来源（§7.3.2）、失败保留旧数据、游标增量加载与去重；
 * 4. 仓库级映射分桶：repoKey 计算与持久化、切换仓库隔离（§5.3/§6.2）；
 * 5. Sentry suspect commits 映射。
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { build } from 'esbuild';

const root = process.cwd();
let tmp, app, originalFetch, calls;

const jsonResponse = (body, { status = 200, headers = {} } = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
  headers: {
    get: (key) => {
      const normalized = Object.fromEntries(Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value]));
      return normalized[String(key).toLowerCase()] ?? null;
    },
  },
});

before(async () => {
  tmp = await fs.mkdtemp(path.join(root, '.test-tmp-errors-view-'));
  const outfile = path.join(tmp, 'errors-view.cjs');
  await build({
    stdin: {
      contents: [
        `export { useErrorsStore } from './src/stores/errorsStore';`,
        `export { storeIntegrationToken } from './src/services/errors/credentials';`,
        `export { filterIssues, countUnresolved, scopeProjectIds } from './src/services/errors/issueQuery';`,
        `export { resolveStackFrame } from './src/services/errors/stackNavigation';`,
        `export { SentryClient } from './src/services/errors/providers/sentry';`,
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
  if (tmp && path.dirname(tmp) === root && path.basename(tmp).startsWith('.test-tmp-errors-view-')) {
    await fs.rm(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 150 });
  }
});

const makeIssue = (overrides) => ({
  connectionId: 'conn-a', providerId: 'sentry', externalProjectId: '101', issueId: 'x',
  title: 'boom', severity: 'error', status: 'unresolved', externalUrl: 'u', ...overrides,
});

test('列表查询：作用域、来源、severity、搜索过滤与 lastSeen 合并排序', () => {
  const issues = [
    makeIssue({ issueId: '1', connectionId: 'conn-a', externalProjectId: '101', severity: 'critical', lastSeen: '2026-10-30T00:00:00Z', title: 'null crash' }),
    makeIssue({ issueId: '2', connectionId: 'conn-b', externalProjectId: '201', severity: 'warning', lastSeen: '2026-10-31T00:00:00Z', title: 'slow query' }),
    makeIssue({ issueId: '3', connectionId: 'conn-a', externalProjectId: '999', lastSeen: '2026-10-29T00:00:00Z', title: 'unmapped project' }),
  ];
  const mappings = { repo1: [{ connectionId: 'conn-a', externalProjectId: '101' }], repo2: [{ connectionId: 'conn-b', externalProjectId: '201' }] };

  // scope=repo：仅当前仓库映射的项目
  const repoOnly = app.filterIssues(issues, {
    scope: 'repo', repoKey: 'repo1', mappedProjectIds: app.scopeProjectIds('repo', 'repo1', mappings, null),
    connectionId: null, severity: 'all', search: '',
  });
  assert.deepEqual(repoOnly.map((issue) => issue.issueId), ['1']);

  // scope=all：跨仓库映射并集，按 lastSeen 倒序
  const all = app.filterIssues(issues, {
    scope: 'all', repoKey: null, mappedProjectIds: app.scopeProjectIds('all', null, mappings, null),
    connectionId: null, severity: 'all', search: '',
  });
  assert.deepEqual(all.map((issue) => issue.issueId), ['2', '1']); // 未映射的 3 被排除

  // 来源筛选 + severity + 搜索
  const filtered = app.filterIssues(issues, {
    scope: 'all', repoKey: null, mappedProjectIds: new Set(['101', '201']),
    connectionId: 'conn-b', severity: 'warning', search: 'SLOW',
  });
  assert.deepEqual(filtered.map((issue) => issue.issueId), ['2']);

  // 徽标口径：unresolved 数
  assert.equal(app.countUnresolved(issues, {
    scope: 'all', repoKey: null, mappedProjectIds: new Set(['101', '201']),
    connectionId: null, severity: 'all', search: '',
  }), 2);
});

test('堆栈跳转三档：前缀映射精确、模糊唯一、后缀择优、多候选、不可定位', () => {
  const tracked = ['src/ui.tsx', 'src/lib/index.ts', 'src/lib/utils.ts', 'other/utils.ts', 'package.json'];
  const options = (prefixMap) => ({ prefixMap, trackedFiles: tracked });

  // 第 1 档：前缀映射精确命中
  const exact = app.resolveStackFrame({ file: '/srv/app/ui.tsx', line: 22 }, options([{ from: '/srv/app', to: 'src' }]));
  assert.deepEqual(exact, { kind: 'exact', path: 'src/ui.tsx', line: 22 });

  // 第 2 档：唯一模糊匹配
  const unique = app.resolveStackFrame({ file: 'x/y/index.ts', line: 7 }, options(undefined));
  assert.deepEqual(unique, { kind: 'unique', path: 'src/lib/index.ts', line: 7 });

  // 第 2 档：多候选按公共后缀择优（src/lib/utils.ts 后缀 3 段全中）
  const best = app.resolveStackFrame({ file: 'src/lib/utils.ts', line: 1 }, options(undefined));
  assert.deepEqual(best, { kind: 'unique', path: 'src/lib/utils.ts', line: 1 });

  // 第 2 档：并列后缀 → 多候选选择器（重名 utils.ts，不得静默选第一个）
  const ambiguous = app.resolveStackFrame({ file: 'a/utils.ts', line: null }, options(undefined));
  assert.equal(ambiguous.kind, 'ambiguous');
  assert.deepEqual([...ambiguous.candidates].sort(), ['other/utils.ts', 'src/lib/utils.ts']);

  // 第 3 档：不可定位（显式提示，不静默）
  const unresolved = app.resolveStackFrame({ file: 'nope/zzz.mjs', line: 3 }, options(undefined));
  assert.deepEqual(unresolved, { kind: 'unresolved', framePath: 'nope/zzz.mjs' });
});

test('sync 多源合并：单连接失败不影响其他来源，失败保留旧数据，游标增量去重', async () => {
  const store = app.useErrorsStore;
  store.setState({
    connections: [
      { id: 'conn-a', providerId: 'sentry', displayName: 'A', enabled: true, orgId: 'acme', domains: ['error-tracking'] },
      { id: 'conn-b', providerId: 'sentry', displayName: 'B', enabled: true, orgId: 'personal', domains: ['error-tracking'] },
    ],
    runtime: {}, restored: true, mappingsByRepo: { r1: [{ connectionId: 'conn-a', externalProjectId: '101', externalProjectName: 'p1' }, { connectionId: 'conn-b', externalProjectId: '201', externalProjectName: 'p2' }] },
    activeRepoKey: 'r1', scope: 'all', issues: [], nextCursors: {}, syncing: false, syncErrors: {},
  });
  // 凭证入 dev Map（桌面端等价于 keyring 条目）
  await app.storeIntegrationToken('conn-a', 'ta');
  await app.storeIntegrationToken('conn-b', 'tb');
  originalFetch = globalThis.fetch;
  calls = [];
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    calls.push({ url, headers: init?.headers ?? {} });
    if (url.pathname === '/api/0/organizations/acme/issues/') {
      if (url.searchParams.get('cursor') === 'c2') {
        return jsonResponse([
          { id: 'dup', title: 'dup issue', level: 'error', status: 'unresolved', count: '1', userCount: 1, permalink: 'u1', project: { id: 101 } },
          { id: 'new', title: 'new issue', level: 'error', status: 'unresolved', count: '2', userCount: 2, permalink: 'u2', project: { id: 101 } },
        ], {});
      }
      return jsonResponse([
        { id: 'dup', title: 'dup issue', level: 'fatal', status: 'unresolved', count: '9', permalink: 'u1', project: { id: 101 } },
      ], { headers: { Link: '<https://sentry.invalid/api/0/organizations/acme/issues/?cursor=c2>; rel="next"' } });
    }
    if (url.pathname === '/api/0/organizations/personal/issues/') return jsonResponse({ detail: 'server exploded' }, { status: 500 });
    return jsonResponse({}, { status: 404 });
  };

  await store.getState().sync();
  let state = store.getState();
  // A 的数据入库且 connectionId 回填；B 失败入 syncErrors、无数据
  assert.deepEqual(state.issues.map((issue) => issue.issueId), ['dup']);
  assert.equal(state.issues[0].connectionId, 'conn-a');
  assert.equal(state.issues[0].severity, 'critical');
  assert.equal(state.nextCursors['conn-a'], 'c2');
  assert.ok(state.syncErrors['conn-b']);
  assert.equal(state.syncErrors['conn-a'], undefined);

  // 失败连接重试成功前保留旧数据：B 曾有旧数据（手工注入）→ sync 失败后仍在
  store.setState({ issues: [...state.issues, makeIssue({ issueId: 'stale-b', connectionId: 'conn-b' })] });
  await store.getState().sync();
  assert.ok(store.getState().issues.some((issue) => issue.issueId === 'stale-b'));

  // 加载更多：游标增量 + 按 issueId 去重
  await store.getState().loadMore();
  state = store.getState();
  const ids = state.issues.filter((issue) => issue.connectionId === 'conn-a').map((issue) => issue.issueId);
  assert.deepEqual(ids, ['dup', 'new']);
  assert.equal(state.nextCursors['conn-a'], null); // 第二页无 Link → 已到末尾
});

test('仓库级映射分桶：repoKey 计算持久化，切换仓库互相隔离', () => {
  const storage = new Map();
  globalThis.localStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key),
  };
  const store = app.useErrorsStore;
  store.setState({ connections: [], runtime: {}, restored: true, mappingsByRepo: {}, activeRepoKey: null, issues: [], nextCursors: {}, syncing: false, syncErrors: {} });

  store.getState().loadRepoContext('git@github.com:owner/repo.git', 'E:\\code\\repo');
  assert.equal(store.getState().activeRepoKey, 'github.com/owner/repo');
  store.getState().addMapping('conn-a', { id: '101', name: 'frontend' });
  assert.equal(store.getState().mappingsByRepo['github.com/owner/repo'].length, 1);
  assert.ok(storage.get('auu_git_error_mappings').includes('github.com/owner/repo'));

  // 切到另一个仓库：该仓无映射（未产生空桶）；切回来仍在
  store.getState().loadRepoContext('https://github.com/other/repo.git', 'E:\\code\\other');
  assert.deepEqual(store.getState().mappingsByRepo['github.com/other/repo'] ?? [], []);
  store.getState().loadRepoContext('https://github.com/owner/repo', 'E:\\moved\\repo'); // 路径变了，remote 不变 → 关联保持
  assert.equal(store.getState().mappingsByRepo['github.com/owner/repo'].length, 1);

  store.getState().removeMapping('conn-a', '101');
  assert.deepEqual(store.getState().mappingsByRepo['github.com/owner/repo'], []);
});

test('Sentry suspect commits 映射为统一 CommitRef', async () => {
  originalFetch = globalThis.fetch;
  globalThis.fetch = async () => jsonResponse([
    { commitId: 'ignored', commit: { id: 'a1b2c3d4e5f6', message: 'fix: guard\n\ndetail', author: { name: 'Alice' } }, repository: { name: 'acme/frontend' } },
    { commit: {} },
  ]);
  const client = new app.SentryClient({ token: 't' });
  const commits = await client.listSuspectCommits('42');
  assert.deepEqual(commits, [
    { sha: 'a1b2c3d4e5f6', message: 'fix: guard\n\ndetail', author: 'Alice', repository: 'acme/frontend' },
  ]);
});
