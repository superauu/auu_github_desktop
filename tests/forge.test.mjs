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
