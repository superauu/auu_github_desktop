/**
 * Errors 集成 M2 测试（PRD docs/errors-integration-prd.md §12 M2 验收）：
 * 1. SentryClient fixture 契约：Bearer 头、baseUrl 归一与 http(s) 限制、组织/项目映射、
 *    issue 字段映射（fatal→critical、count 字符串、userCount=-1→缺失、reprocessing→unresolved）、
 *    Link 分页游标、latest event 堆栈帧逆序、状态回写 PUT 载荷；
 * 2. 错误分类：401/网络/5xx 为连接级，403/429 为操作级（§8.3）；
 * 3. store 连接流：completeConnection（org 校验+凭证入 keyring/dev Map+域快照）、
 *    retestConnection 失败只改健康态、域快照保留（§4.4）。
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
  // 真 Response 的 headers.get 不区分大小写；fake 同样把存储键归一小写
  headers: {
    get: (key) => {
      const normalized = Object.fromEntries(Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value]));
      return normalized[String(key).toLowerCase()] ?? null;
    },
  },
});

before(async () => {
  tmp = await fs.mkdtemp(path.join(root, '.test-tmp-errors-sentry-'));
  const outfile = path.join(tmp, 'sentry.cjs');
  await build({
    stdin: {
      contents: [
        `export { useErrorsStore } from './src/stores/errorsStore';`,
        `export { SentryClient, mapSentryIssue, mapSentryEventFrames, parseLinkCursor, buildStatusUpdate, normalizeBaseUrl } from './src/services/errors/providers/sentry';`,
        `export { createProviderClient, ProviderRequestError, isConnectionLevelError } from './src/services/errors/providerService';`,
        `export { storeIntegrationToken, getIntegrationToken } from './src/services/errors/credentials';`,
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
  if (tmp && path.dirname(tmp) === root && path.basename(tmp).startsWith('.test-tmp-errors-sentry-')) {
    await fs.rm(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 150 });
  }
});

const installFetch = (handler) => {
  originalFetch = globalThis.fetch;
  calls = [];
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    calls.push({ url, init: init ?? {}, headers: init?.headers ?? {} });
    return handler(url, init ?? {});
  };
};

test('SentryClient：Bearer 头、baseUrl 归一、http(s) 限制与组织/项目映射', async () => {
  assert.equal(app.normalizeBaseUrl('https://sentry.example.com/'), 'https://sentry.example.com');
  assert.equal(app.normalizeBaseUrl(undefined), 'https://sentry.io');
  assert.throws(() => app.normalizeBaseUrl('ftp://x'), (error) => error.kind === 'unknown');

  installFetch((url) => {
    if (url.pathname === '/api/0/organizations/') {
      assert.equal(calls[0].headers.Authorization, 'Bearer st-token');
      return jsonResponse([
        { id: 7, slug: 'acme', name: 'Acme Inc' },
        { id: 9, slug: 'personal', name: 'Personal' },
      ]);
    }
    if (url.pathname === '/api/0/organizations/acme/projects/') {
      return jsonResponse([{ id: 101, slug: 'frontend', name: 'Frontend', platform: 'javascript' }]);
    }
    return jsonResponse({}, { status: 404 });
  });

  const client = app.createProviderClient('sentry', { token: 'st-token', baseUrl: 'https://sentry.example.com/' });
  const orgs = await client.listOrganizations();
  assert.deepEqual(orgs, [
    { id: '7', slug: 'acme', name: 'Acme Inc' },
    { id: '9', slug: 'personal', name: 'Personal' },
  ]);
  const projects = await client.listProjects('acme');
  assert.deepEqual(projects, [{ id: '101', slug: 'frontend', name: 'Frontend', platform: 'javascript' }]);
  await client.verify();
});

test('SentryClient：issue 字段映射到统一模型，Link 头产出分页游标', async () => {
  installFetch((url) => {
    assert.equal(url.pathname, '/api/0/organizations/acme/issues/');
    assert.equal(url.searchParams.get('project'), '101,102');
    assert.equal(url.searchParams.get('query'), 'is:unresolved');
    return jsonResponse(
      [
        {
          id: '42', shortId: 'FRONTEND-ABC', title: 'TypeError: boom',
          metadata: { type: 'TypeError', value: 'Cannot read properties of undefined' },
          level: 'fatal', status: 'reprocessing', count: '128', userCount: -1,
          firstSeen: '2026-10-01T00:00:00Z', lastSeen: '2026-10-31T00:00:00Z',
          permalink: 'https://sentry.example.com/acme/frontend/issues/42/',
          project: { id: 101 },
        },
      ],
      { headers: { Link: '<https://sentry.example.com/api/0/organizations/acme/issues/?cursor=100:1:1>; rel="next"; results="true"' } },
    );
  });

  const client = app.createProviderClient('sentry', { token: 't' });
  const page = await client.listIssues({ orgId: 'acme', projectIds: ['101', '102'] });
  const issue = page.issues[0];
  assert.equal(page.nextCursor, '100:1:1');
  assert.equal(issue.providerId, 'sentry');
  assert.equal(issue.issueId, '42');
  assert.equal(issue.shortId, 'FRONTEND-ABC');
  assert.equal(issue.severity, 'critical');
  assert.equal(issue.status, 'unresolved'); // reprocessing 归一
  assert.equal(issue.rawStatus, 'reprocessing'); // 原始语义保留给详情页
  assert.equal(issue.eventCount, 128); // 字符串数字
  assert.equal(issue.affectedUsers, undefined); // -1 = 未知 → 缺失
  assert.equal(issue.externalUrl, 'https://sentry.example.com/acme/frontend/issues/42/');
  assert.equal(issue.message, 'Cannot read properties of undefined');

  // 无 Link 头 → null（已到当前条件末尾）
  installFetch(() => jsonResponse([], {}));
  const last = await client.listIssues({ orgId: 'acme', query: 'is:unresolved', cursor: '100:1:1' });
  assert.equal(last.nextCursor, null);
});

test('SentryClient：latest event 堆栈帧逆序（抛出点在前）并映射上下文行', () => {
  const frames = app.mapSentryEventFrames({
    entries: [
      {
        type: 'exception',
        data: {
          values: [
            {
              type: 'TypeError', value: 'boom',
              stacktrace: {
                frames: [
                  { function: 'main', filename: 'app/index.ts', lineno: 10, colno: 3, context: [[9, 'const a = 1;'], [10, 'boom();']] },
                  { function: 'render', absPath: '/app/src/ui.tsx', lineno: 22, colno: 7, context: [[21, 'x'], [22, 'y']] },
                ],
              },
            },
          ],
        },
      },
      { type: 'breadcrumbs', data: {} },
    ],
  });
  assert.equal(frames.length, 2);
  assert.equal(frames[0].func, 'render'); // 逆序：抛出点在前
  assert.equal(frames[0].file, '/app/src/ui.tsx'); // filename 缺失回落 absPath
  assert.deepEqual(frames[1].contextLines, ['const a = 1;', 'boom();']);
});

test('SentryClient：状态回写 PUT 载荷与操作级错误分类', async () => {
  installFetch((url, init) => {
    if (init.method === 'PUT') return jsonResponse({ id: '42', status: 'resolved' });
    return jsonResponse({ detail: 'nope' }, { status: 401 });
  });
  const client = app.createProviderClient('sentry', { token: 't' });
  await client.updateStatus('42', 'resolveInNextRelease');
  const put = calls[0];
  assert.equal(put.init.method, 'PUT');
  assert.equal(put.url.pathname, '/api/0/issues/42/');
  assert.deepEqual(JSON.parse(put.init.body), { status: 'resolved', statusDetails: { inNextRelease: true } });

  // 错误分类（§8.3）：auth/network/server 连接级；forbidden/rateLimited 操作级
  // （esbuild CJS 会重命名类绑定，prototype.name 不可靠；以实例与 instanceof 为准）
  assert.equal(new app.ProviderRequestError('auth', 'x').name, 'ProviderRequestError');
  const cases = [
    [401, 'auth', true],
    [403, 'forbidden', false],
    [404, 'notFound', false],
    [429, 'rateLimited', false],
    [500, 'server', true],
  ];
  for (const [status, kind, connectionLevel] of cases) {
    installFetch(() => jsonResponse({ detail: 'x' }, { status }));
    const client2 = app.createProviderClient('sentry', { token: 't' });
    await assert.rejects(client2.listOrganizations(), (error) => {
      assert.equal(error.kind, kind, `status ${status}`);
      assert.equal(error.status, status);
      assert.equal(app.isConnectionLevelError(error), connectionLevel, `status ${status}`);
      return true;
    });
  }
});

test('errorsStore 连接流：complete 校验组织并写域快照，retest 401 只改健康态', async () => {
  const storage = new Map();
  globalThis.localStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key),
  };
  const store = app.useErrorsStore;
  store.setState({ connections: [], runtime: {}, restored: false });
  let forceStatus = null; // 模拟 token 被吊销等场景：非空时组织接口强制返回该状态码
  installFetch((url) => {
    if (url.pathname === '/api/0/organizations/') {
      if (forceStatus) return jsonResponse({ detail: 'Invalid token' }, { status: forceStatus });
      const header = calls[calls.length - 1].headers.Authorization ?? '';
      if (header !== 'Bearer good-token') return jsonResponse({ detail: 'Invalid token' }, { status: 401 });
      return jsonResponse([{ id: 7, slug: 'acme', name: 'Acme Inc' }]);
    }
    return jsonResponse({}, { status: 404 });
  });

  // verify 不落任何状态
  const orgs = await store.getState().verifyConnection({ providerId: 'sentry', token: 'good-token' });
  assert.deepEqual(orgs, [{ id: '7', slug: 'acme', name: 'Acme Inc' }]);
  assert.deepEqual(store.getState().connections, []);

  // 未知组织 → 抛错且不建连接
  await assert.rejects(
    store.getState().completeConnection({ providerId: 'sentry', displayName: 'X', token: 'good-token', orgId: '999' }),
    (error) => error.kind === 'notFound',
  );
  assert.deepEqual(store.getState().connections, []);

  // 正常连接：token 入凭证层（keyring/dev Map），域快照与健康态写入
  const created = await store.getState().completeConnection({
    providerId: 'sentry', displayName: '公司 Sentry', token: 'good-token', orgId: '7',
  });
  assert.equal(await app.getIntegrationToken(created.id), 'good-token');
  assert.deepEqual(created.domains, ['error-tracking']);
  assert.deepEqual(store.getState().domainConnections('error-tracking'), [{ enabled: true, domains: ['error-tracking'] }]);
  assert.equal(store.getState().getRuntime(created.id).health, 'connected');
  assert.ok(!storage.get('auu_git_error_connections').includes('good-token')); // 凭证绝不落盘

  // retest 失败（token 被吊销 → 强制 401）：健康态 error，域快照保留（§4.4 网络失败≠权限为空）
  forceStatus = 401;
  await store.getState().retestConnection(created.id);
  forceStatus = null;
  assert.equal(store.getState().getRuntime(created.id).health, 'error');
  assert.equal(store.getState().connections[0].domains[0], 'error-tracking');
  // 导航存在性不受健康态影响
  assert.deepEqual(store.getState().domainConnections('error-tracking').length, 1);

  // retest 成功：健康态恢复 connected，域快照刷新
  store.setState({ runtime: {} }); // 清掉错误态再测成功路径
  await store.getState().retestConnection(created.id);
  assert.equal(store.getState().getRuntime(created.id).health, 'connected');
  assert.equal(store.getState().connections[0].domains[0], 'error-tracking');
});
