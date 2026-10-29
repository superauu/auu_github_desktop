// 多平台托管（GitLab/Gitea）测试：
// 1. parseForgeRemote：已知域名自动识别 kind、嵌套分组、scp/端口/.git 形态、
//    Windows 盘符与无点主机拒绝；
// 2. GitLabService：PAT 头、MR state 映射（opened/closed/locked→merged 语义）、
//    discussions 里 system note 过滤、pipeline 状态映射（fake fetch）；
// 3. GiteaService：token 头、PR merged 字段优先、combined status → 流水线映射。
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { build } from 'esbuild';

const root = process.cwd();
let temporary, app, originalFetch;
before(async () => {
  temporary = await fs.mkdtemp(path.join(root, '.test-tmp-forge-'));
  const bundle = path.join(temporary, 'helpers.cjs');
  await build({ stdin: { contents: `export { parseForgeRemote } from './src/services/forge/remoteIdentity'; export { GitLabService, mapPipelineStatus as mapGitLabPipeline, mapPullState as mapGitLabPullState } from './src/services/gitlab/GitLabService'; export { GiteaService, mapPipelineStatus as mapGiteaPipeline, mapPullState as mapGiteaPullState } from './src/services/gitea/GiteaService';`, resolveDir: root }, bundle: true, platform: 'node', format: 'cjs', outfile: bundle, alias: { '@': path.join(root, 'src') }, logLevel: 'silent' });
  app = createRequire(import.meta.url)(bundle);
});
after(async () => {
  if (originalFetch) globalThis.fetch = originalFetch;
  if (temporary && path.dirname(temporary) === root && path.basename(temporary).startsWith('.test-tmp-forge-')) {
    await fs.rm(temporary, { recursive: true, force: true });
  }
});

test('parseForgeRemote classifies hosts, groups and rejects local forms', () => {
  // 已知公共域名直接给出 kind；GitLab 支持嵌套分组。
  assert.deepEqual(parse('https://github.com/owner/repo.git'), { host: 'github.com', ownerPath: 'owner', repo: 'repo', kind: 'github' });
  assert.deepEqual(parse('https://gitlab.com/group/sub/repo'), { host: 'gitlab.com', ownerPath: 'group/sub', repo: 'repo', kind: 'gitlab' });
  // scp / ssh / 端口 / 大小写形态。
  assert.equal(parse('git@gitlab.com:team/proj.git')?.kind, 'gitlab');
  assert.equal(parse('ssh://git@my-git.example.cn:2222/team/proj.git')?.host, 'my-git.example.cn');
  assert.equal(parse('https://GitLab.com/Team/Proj').kind, 'gitlab');
  // 自建域名不带 kind（由账号服务器匹配解析）。
  const selfHosted = parse('https://git.company.io/team/proj');
  assert.equal(selfHosted?.host, 'git.company.io');
  assert.equal(selfHosted?.kind, undefined);
  // 拒绝：Windows 盘符、无点主机、单段路径、空串。
  assert.equal(parse('E:/code/repo'), undefined);
  assert.equal(parse('E:\\code\\repo'), undefined);
  assert.equal(parse('localhost:repo'), undefined);
  assert.equal(parse('https://github.com/only-owner'), undefined);
  assert.equal(parse(''), undefined);
  function parse(url) { return app.parseForgeRemote(url); }
});

test('gitlab service maps merge requests and filters system notes', async () => {
  const service = new app.GitLabService();
  service.configure('pat-token', 'https://gitlab.example.com');
  const calls = [];
  originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    calls.push({ url: url.pathname, headers: init?.headers || {} });
    const json = (body) => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) });
    if (url.pathname === '/api/v4/user') return json({ username: 'alice', name: 'Alice', avatar_url: undefined });
    if (url.pathname === '/api/v4/projects/42/merge_requests' && !url.pathname.includes('7')) {
      assert.equal(url.searchParams.get('state'), 'opened');
      return json([
        { iid: 7, title: '修复登录', state: 'opened', draft: true, source_branch: 'fix/login', target_branch: 'main', created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-02T00:00:00Z', web_url: 'https://gitlab.example.com/team/proj/-/merge_requests/7', author: { username: 'bob' } },
        { iid: 6, title: '重构', state: 'merged', draft: false, source_branch: 'ref', target_branch: 'main', created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-02T00:00:00Z', web_url: 'u6', author: { username: 'carol' } },
        { iid: 5, title: '废弃', state: 'locked', draft: false, source_branch: 'x', target_branch: 'main', created_at: 't', updated_at: 't', web_url: 'u5', author: { username: 'dave' } },
      ]);
    }
    if (url.pathname === '/api/v4/projects/42/merge_requests/7') {
      return json({ iid: 7, title: '修复登录', state: 'opened', draft: true, description: '说明文字', source_branch: 'fix/login', target_branch: 'main', created_at: 't1', updated_at: 't2', web_url: 'u7', author: { username: 'bob' } });
    }
    if (url.pathname === '/api/v4/projects/42/merge_requests/7/discussions') {
      return json([
        { id: 'a', notes: [{ id: 1, body: '真实评论', system: false, created_at: 't3', author: { username: 'erin' } }] },
        { id: 'b', notes: [{ id: 2, body: 'changed the description', system: true, created_at: 't4', author: { username: 'bob' } }] },
      ]);
    }
    if (url.pathname === '/api/v4/projects/42/pipelines') {
      return json([
        { id: 91, status: 'success', ref: 'fix/login', created_at: 't5', web_url: 'p91' },
        { id: 90, status: 'failed_with_warnings', ref: 'fix/login', created_at: 't6', web_url: 'p90' },
      ]);
    }
    throw new Error(`unexpected fetch ${url.pathname}`);
  };

  const user = await service.verifyToken();
  assert.deepEqual(user, { login: 'alice', name: 'Alice', avatarUrl: undefined });
  // PAT 头
  assert.equal(calls[0].headers['PRIVATE-TOKEN'], 'pat-token');

  const pulls = await service.listPullRequests(42, 'opened');
  assert.equal(pulls.length, 3);
  assert.equal(pulls[0].number, 7);
  assert.equal(pulls[0].state, 'open');
  assert.equal(pulls[0].draft, true);
  assert.equal(pulls[1].state, 'merged');
  assert.equal(pulls[2].state, 'closed');

  const detail = await service.getPullRequest(42, 7);
  assert.equal(detail.description, '说明文字');
  // system note（描述变更等）不进时间线。
  assert.deepEqual(detail.comments.map((comment) => comment.body), ['真实评论']);

  const pipelines = await service.listPipelines(42, 'fix/login');
  assert.equal(pipelines[0].status, 'success');
  assert.equal(pipelines[1].status, 'failed');
});

test('gitea service maps pulls and combined commit statuses', async () => {
  const service = new app.GiteaService();
  service.configure('gitea-token', 'https://gitea.example.com');
  originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(init?.headers?.Authorization, 'token gitea-token');
    const json = (body) => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) });
    if (url.pathname === '/api/v1/user') return json({ login: 'gina', full_name: 'Gina', avatar_url: 'a' });
    if (url.pathname === '/api/v1/repos/org/repo/pulls') {
      assert.equal(url.searchParams.get('state'), 'open');
      return json([
        { number: 12, title: '功能', state: 'open', merged: false, draft: false, base: { ref: 'main' }, head: { ref: 'feat' }, created_at: 't1', updated_at: 't2', html_url: 'w12', user: { login: 'hank' } },
        { number: 11, title: '旧功能', state: 'closed', merged: true, draft: false, base: { ref: 'main' }, head: { ref: 'old' }, created_at: 't', updated_at: 't', html_url: 'w11', user: { login: 'iris' } },
      ]);
    }
    if (url.pathname === '/api/v1/repos/org/repo/commits/feat/status') {
      return json({ statuses: [
        { id: 5, context: 'ci/build', state: 'success', target_url: 'https://ci.example.com/5', created_at: 't3' },
        { id: 4, context: 'ci/lint', state: 'failure', target_url: 'https://ci.example.com/4', created_at: 't4' },
      ] });
    }
    throw new Error(`unexpected fetch ${url.pathname}`);
  };

  const user = await service.verifyToken();
  assert.equal(user.login, 'gina');
  const pulls = await service.listPullRequests('org', 'repo', 'open');
  assert.equal(pulls[0].state, 'open');
  assert.equal(pulls[1].state, 'merged');
  const pipelines = await service.listPipelines('org', 'repo', 'feat');
  assert.deepEqual(pipelines.map((pipeline) => [pipeline.name, pipeline.status]), [['ci/build', 'success'], ['ci/lint', 'failed']]);
});

test('gitlab service paginates beyond the first page and stops on a partial page', async () => {
  const service = new app.GitLabService();
  service.configure('pat-token', 'https://gitlab.example.com');
  originalFetch = globalThis.fetch;
  const seenPages = [];
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.pathname === '/api/v4/projects/42/merge_requests') {
      const page = Number(url.searchParams.get('page'));
      seenPages.push(page);
      assert.equal(url.searchParams.get('per_page'), '30');
      const item = (iid) => ({ iid, title: `MR ${iid}`, state: 'opened', draft: false, source_branch: 'b', target_branch: 'main', created_at: 't', updated_at: 't', web_url: `u${iid}`, author: { username: 'bob' } });
      const json = (body) => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) });
      // 第一页满 30 条（无法判断是否还有下一页），第二页只有 3 条 → 第三页不再请求。
      return json(page === 1 ? Array.from({ length: 30 }, (_, i) => item(i + 1)) : Array.from({ length: 3 }, (_, i) => item(31 + i)));
    }
    throw new Error(`unexpected fetch ${url.pathname}`);
  };
  const pulls = await service.listPullRequests(42, 'opened');
  assert.deepEqual(seenPages, [1, 2]);
  assert.equal(pulls.length, 33);
  assert.equal(pulls[0].number, 1);
  assert.equal(pulls[32].number, 33);
});

test('stale forge loads cannot overwrite the newer repository state', async () => {
  // forgeStore 依赖 localStorage mock（本文件原有用例只测 service 层，未装 mock）。
  const saved = new Map();
  const previousFetch = globalThis.fetch;
  globalThis.localStorage = {
    getItem: (key) => saved.get(key) ?? null,
    setItem: (key, value) => saved.set(key, String(value)),
    removeItem: (key) => saved.delete(key),
  };
  const storeTmp = await fs.mkdtemp(path.join(root, '.test-tmp-forge-store-'));
  try {
    const bundle = path.join(storeTmp, 'forge-store.cjs');
    await build({
      stdin: { contents: `export * from './src/stores/forgeStore'; export { gitlabService } from './src/services/gitlab/GitLabService'; export { giteaService } from './src/services/gitea/GiteaService';`, resolveDir: root },
      bundle: true, platform: 'node', format: 'cjs', outfile: bundle,
      alias: { '@': path.join(root, 'src') }, logLevel: 'silent',
    });
    const storeApp = createRequire(import.meta.url)(bundle);
    const { useForgeStore, gitlabService, giteaService } = storeApp;
    // 全新 bundle 的 service 单例未配置：store 用的是同一份实例，必须先配置再驱动。
    gitlabService.configure('pat-token', 'https://gitlab.example.com');
    giteaService.configure('gitea-token', 'https://gitea.example.com');

    const delayed = (value, milliseconds) => new Promise((resolve) => setTimeout(() => resolve(value), milliseconds));
    globalThis.fetch = async (input) => {
      const url = new URL(String(input));
      const json = (body) => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) });
      // 仓库 A（gitlab）：projectId 慢返回——A 的 loadPulls 在切换到 B 之后才落地。
      if (url.pathname === '/api/v4/projects/team%2Fproj') return delayed({ id: 42 }, 40);
      if (url.pathname === '/api/v4/projects/42/merge_requests') {
        return json([{ iid: 7, title: 'A 仓库的 PR', state: 'opened', draft: false, source_branch: 'a', target_branch: 'main', created_at: 't', updated_at: 't', web_url: 'wa', author: { username: 'bob' } }]);
      }
      // 仓库 B（gitea）：全部快速返回。
      if (url.pathname === '/api/v1/repos/org/repo/pulls') {
        return json([{ number: 12, title: 'B 仓库的 PR', state: 'open', merged: false, draft: false, base: { ref: 'main' }, head: { ref: 'feat' }, created_at: 't', updated_at: 't', html_url: 'wb', user: { login: 'hank' } }]);
      }
      throw new Error(`unexpected fetch ${url.pathname}`);
    };

    // 仓库 A 在途；detect() 切仓库作废其代数，B 的加载随后完成。
    useForgeStore.setState({ gitea: { server: 'https://gitea.example.com', user: { login: 'gina' } }, detection: { kind: 'gitlab', server: 'https://gitlab.example.com', ownerPath: 'team', repo: 'proj' } });
    const stale = useForgeStore.getState().loadPulls();
    await useForgeStore.getState().detect('E:/code/repo-b');
    useForgeStore.setState({ detection: { kind: 'gitea', server: 'https://gitea.example.com', ownerPath: 'org/repo', repo: 'repo' } });
    await useForgeStore.getState().loadPulls();
    await stale;

    const state = useForgeStore.getState();
    assert.equal(state.pulls.length, 1);
    assert.equal(state.pulls[0].title, 'B 仓库的 PR');
    assert.equal(state.pullsLoading, false);
    assert.equal(state.pullsError, '');

    // detect 后 detection 已被清空（node 下 getOriginUrl 不可达即回落 null）——
    // 手动设置 B 的 detection 只为驱动 loadPulls，与真实 detect 成功后的状态一致。
  } finally {
    globalThis.fetch = previousFetch;
    delete globalThis.localStorage;
    if (storeTmp && path.dirname(storeTmp) === root && path.basename(storeTmp).startsWith('.test-tmp-forge-store-')) {
      await fs.rm(storeTmp, { recursive: true, force: true });
    }
  }
});
