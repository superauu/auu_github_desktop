import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { build } from 'esbuild';

const root = process.cwd();
let temporary, api;
/** fetch 桩记录的 Linear 请求：[{ url, headers, body(JSON) }] */
let linearRequests, tokenRequests, graphqlResponse, tokenResponse;

function respond(body, status = 200) {
  // headers 须带 content-type：tokenRequest 按 content-type 守卫端点漂移。
  return { status, ok: status >= 200 && status < 300, headers: new Map([['content-type', 'application/json']]), text: async () => JSON.stringify(body) };
}

before(async () => {
  temporary = await fs.mkdtemp(path.join(root, '.test-tmp-linear-'));
  const file = path.join(temporary, 'linear.cjs');
  await build({ stdin: { contents: `export { LinearClient } from './src/plugins/linear/client'; export { linearOAuthService, setLinearClientId } from './src/plugins/linear/oauth'; export { LINEAR_PROVIDER } from './src/plugins/manifests'; export { getTaskPlugin, installedTaskPlugins } from './src/services/integrations/plugins';`,
    resolveDir: root }, outfile: file, bundle: true, platform: 'node', format: 'cjs', alias: { '@': path.join(root, 'src') }, loader: { '.css': 'empty' }, logLevel: 'silent' });
  api = createRequire(import.meta.url)(file);

  linearRequests = []; tokenRequests = [];
  graphqlResponse = respond({ data: { issues: { nodes: [{
    id: 'b1b2c3d4-0000-4000-8000-000000000001', identifier: 'ENG-12', number: 12, title: '修复登录超时',
    description: '登录偶发超时', url: 'https://linear.app/acme/issue/ENG-12', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z',
    completedAt: null, canceledAt: null, state: { type: 'started', name: 'In Progress' },
    creator: { displayName: 'alice', name: 'alice', avatarUrl: 'https://a/1.png' },
    labels: { nodes: [{ id: 'label-uuid-1', name: 'bug', color: '#ff0000' }] },
    assignees: { nodes: [{ displayName: 'alice', name: 'alice', avatarUrl: 'https://a/1.png' }] },
    comments: { nodes: [{ id: 'c1' }, { id: 'c2' }] },
  }], pageInfo: { hasNextPage: true } } } });
  tokenResponse = respond({ access_token: 'at-1', refresh_token: 'rt-2', expires_in: 86399, scope: 'read,issues:create' });

  globalThis.fetch = async (url, init) => {
    const body = typeof init?.body === 'string' ? init.body : '';
    if (String(url).includes('/graphql')) {
      linearRequests.push({ url: String(url), headers: init?.headers ?? {}, body: JSON.parse(body) });
      return graphqlResponse;
    }
    tokenRequests.push({ url: String(url), headers: init?.headers ?? {}, body: new URLSearchParams(body) });
    return tokenResponse;
  };
  // OAuth 回跳命令桩：begin 记录端口，open_external_url 捕获授权 URL 里的 state，
  // wait 按可配置脚本返回回调；不配置脚本时模拟用户取消（返回错误重定向）。
  let session = null, authorizeUrl = null, waitScript = null;
  api.linearOAuthService.__test = {
    get authorizeUrl() { return authorizeUrl; }, get sessionId() { return session?.id; },
    scriptWait(script) { waitScript = script; },
  };
  globalThis.window = { __TAURI_INTERNALS__: { async invoke(command, args) {
    // window.__TAURI_INTERNALS__ 同时把 providerHttp 切到 Tauri 通道：
    // 在这里用 fetch 桩模拟 provider_http_request，保持与桌面端同一条代码路径。
    if (command === 'provider_http_request') {
      const { method, url, headers, body } = args.request;
      const response = await globalThis.__fetchShim(url, { method, headers, body: body ?? undefined });
      // headers 转小写键对象（生产 Rust 桥同款形状），tokenRequest 的 content-type 守卫依赖它。
      const headerMap = {};
      response.headers.forEach((value, name) => { headerMap[name.toLowerCase()] = value; });
      return { status: response.status, headers: headerMap, body: await response.text() };
    }
    if (command === 'cancel_provider_http_request') return null;
    if (command === 'oauth_loopback_begin') { session = { id: 'loopback-test-1', port: args.port }; return session; }
    if (command === 'open_external_url') { authorizeUrl = args.url; return null; }
    if (command === 'oauth_loopback_wait') {
      if (!waitScript) return { code: null, state: null, error: 'access_denied' };
      const scripted = typeof waitScript === 'function' ? waitScript(authorizeUrl) : waitScript;
      return scripted;
    }
    if (command === 'oauth_loopback_cancel') { session = null; return null; }
    throw new Error(`unexpected invoke ${command}`);
  } } };
  globalThis.__fetchShim = globalThis.fetch;
});

after(async () => {
  delete globalThis.fetch;
  delete globalThis.__fetchShim;
  delete globalThis.window;
  if (temporary && path.dirname(temporary) === root && path.basename(temporary).startsWith('.test-tmp-linear-')) await fs.rm(temporary, { recursive: true, force: true });
});

test('linear manifest declares the task-tracking domain without close-state-reason', () => {
  assert.equal(api.LINEAR_PROVIDER.connectionKind, 'task-account');
  assert.deepEqual(api.LINEAR_PROVIDER.domains, [{ domain: 'task-tracking', capabilities: [
    'task-tracking:list-issues', 'task-tracking:issue-detail', 'task-tracking:create-issue', 'task-tracking:update-issue', 'task-tracking:comment',
  ] }]);
  assert.equal(api.installedTaskPlugins().map(plugin => plugin.manifest.id).join(','), 'linear');
  assert.equal(api.getTaskPlugin('linear')?.manifest.name, 'Linear');
  assert.equal(api.getTaskPlugin('github'), null);
});

test('linear client maps workspace issues into the collaboration contract', async () => {
  const client = new api.LinearClient('lin-token');
  const result = await client.searchIssues('ENG', 'linear', { state: 'open', query: '', label: '', assignee: '', page: 1 });
  const request = linearRequests.at(-1);
  assert.equal(request.url, 'https://api.linear.app/graphql');
  assert.equal(request.headers.Authorization, 'Bearer lin-token');
  assert.deepEqual(request.body.variables.filter, { state: { type: { nin: ['completed', 'canceled'] } }, team: { key: { eq: 'ENG' } } });
  const issue = result.items[0];
  assert.equal(issue.identifier, 'ENG-12');
  assert.equal(issue.number, 12);
  assert.equal(issue.state, 'open');
  assert.equal(issue.labels[0].color, 'ff0000');
  assert.equal(issue.comments, 2);
  assert.equal(issue.user.login, 'alice');
  // 非满页不虚报总数（满页 + hasNextPage 才保留下一页入口）。
  assert.equal(result.total_count, 1);
  // '@me' 走 isMe 过滤；团队键随 owner 收窄范围。
  await client.searchIssues('ENG', 'linear', { state: 'all', query: '', label: '', assignee: '@me', page: 1 });
  assert.deepEqual(linearRequests.at(-1).body.variables.filter, { assignee: { isMe: { eq: true } }, team: { key: { eq: 'ENG' } } });
});

test('linear client locates issues by team key and number and reports auth failures as 401', async () => {
  const client = new api.LinearClient('lin-token');
  const found = await client.getIssue('ENG', 'linear', 12);
  assert.deepEqual(linearRequests.at(-1).body.variables.filter, { number: { eq: 12 }, team: { key: { eq: 'ENG' } } });
  assert.equal(found.state_reason, null);
  graphqlResponse = respond({ errors: [{ message: 'Unauthorized', extensions: { code: 'UNAUTHORIZED' } }] });
  try {
    await client.getIssue('ENG', 'linear', 12);
    assert.fail('must throw');
  } catch (error) {
    assert.equal(error.status, 401);
  } finally {
    graphqlResponse = respond({ data: { issues: { nodes: [], pageInfo: { hasNextPage: false } } } });
  }
  await assert.rejects(client.getIssue('ENG', 'linear', 999), error => error.status === 404);
});

test('organization users are queried as a plain list without unsupported arguments', async () => {
  const client = new api.LinearClient('lin-token');
  await client.getIssueAssignees('all', 'linear');
  const query = linearRequests.at(-1).body.query;
  assert.match(query, /organization \{ users \{/);
  assert.doesNotMatch(query, /enabled/);
});

test('oauth authorize runs the PKCE loopback flow and validates state', async () => {
  api.setLinearClientId('cli-test');
  try {
    // state 不匹配 → 拒绝；URL 携带 S256 challenge 且回跳端口固定。
    api.linearOAuthService.__test.scriptWait(() => ({ code: 'auth-1', state: 'forged', error: null }));
    await assert.rejects(api.linearOAuthService.authorize(), error => /state mismatch/.test(error.message));
    assert.match(api.linearOAuthService.__test.authorizeUrl, /code_challenge_method=S256/);
    assert.match(api.linearOAuthService.__test.authorizeUrl, /redirect_uri=http%3A%2F%2F127.0.0.1%3A53862%2Fcallback/);
    assert.match(api.linearOAuthService.__test.authorizeUrl, /scope=read%2Cissues%3Acreate/);
    // state 匹配 → 换令牌，form 表单携带 code_verifier 而非 client_secret。
    api.linearOAuthService.__test.scriptWait(url => {
      const state = new URL(url).searchParams.get('state');
      return { code: 'auth-1', state, error: null };
    });
    const tokens = await api.linearOAuthService.authorize();
    const exchange = tokenRequests.at(-1);
    assert.equal(exchange.url, 'https://api.linear.app/oauth/token');
    assert.equal(exchange.body.get('grant_type'), 'authorization_code');
    assert.equal(exchange.body.get('code'), 'auth-1');
    assert.ok((exchange.body.get('code_verifier') ?? '').length >= 43);
    assert.equal(exchange.body.get('client_secret'), null);
    assert.deepEqual(tokens, { accessToken: 'at-1', refreshToken: 'rt-2', expiresAt: tokens.expiresAt, scope: 'read,issues:create' });
    assert.ok(tokens.expiresAt > Date.now() + 24 * 3600 * 1000 - 120_000);
  } finally { api.setLinearClientId(''); }
});

test('oauth refresh carries the rotating refresh token', async () => {
  api.setLinearClientId('cli-test');
  try {
    const tokens = await api.linearOAuthService.refresh('rt-1');
    const refresh = tokenRequests.at(-1);
    assert.equal(refresh.body.get('grant_type'), 'refresh_token');
    assert.equal(refresh.body.get('refresh_token'), 'rt-1');
    assert.equal(tokens.refreshToken, 'rt-2');
  } finally { api.setLinearClientId(''); }
});

test('unconfigured client id yields a guiding error instead of a broken authorize URL', async () => {
  // 生产默认已注入真实 client_id；该测试显式清空以覆盖「未配置」引导分支。
  api.setLinearClientId('');
  await assert.rejects(api.linearOAuthService.authorize(), error => error.message.includes('Linear OAuth'));
});
