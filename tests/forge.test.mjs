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
  await build({ stdin: { contents: `export { parseForgeRemote } from './src/services/integrations/remoteIdentity'; export { GitLabClient } from './src/plugins/gitlab/client'; export { GiteaClient } from './src/plugins/gitea/client';`, resolveDir: root }, bundle: true, platform: 'node', format: 'cjs', outfile: bundle, alias: { '@': path.join(root, 'src') }, logLevel: 'silent' });
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
  const service = new app.GitLabClient('https://gitlab.example.com', 'pat-token');
  const calls = [];
  originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    calls.push({ url: url.pathname, headers: init?.headers || {} });
    const json = body => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
    if (url.pathname === '/api/v4/user') return json({ username: 'alice', name: 'Alice', avatar_url: undefined });
    if (url.pathname === '/api/v4/projects/team%2Fproj/merge_requests' && !url.pathname.includes('7')) {
      assert.equal(url.searchParams.get('state'), 'opened');
      return json([
        { iid: 7, title: '修复登录', state: 'opened', draft: true, source_branch: 'fix/login', target_branch: 'main', created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-02T00:00:00Z', web_url: 'https://gitlab.example.com/team/proj/-/merge_requests/7', author: { username: 'bob' } },
        { iid: 6, title: '重构', state: 'merged', draft: false, source_branch: 'ref', target_branch: 'main', created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-02T00:00:00Z', web_url: 'u6', author: { username: 'carol' } },
        { iid: 5, title: '废弃', state: 'locked', draft: false, source_branch: 'x', target_branch: 'main', created_at: 't', updated_at: 't', web_url: 'u5', author: { username: 'dave' } },
      ]);
    }
    if (url.pathname === '/api/v4/projects/team%2Fproj/merge_requests/7') {
      return json({ iid: 7, title: '修复登录', state: 'opened', draft: true, description: '说明文字', source_branch: 'fix/login', target_branch: 'main', created_at: 't1', updated_at: 't2', web_url: 'u7', author: { username: 'bob' } });
    }
    if (url.pathname === '/api/v4/projects/team%2Fproj/merge_requests/7/notes') {
      return json([
        { id: 1, body: '真实评论', system: false, created_at: 't3', author: { username: 'erin' } },
        { id: 2, body: 'changed the description', system: true, created_at: 't4', author: { username: 'bob' } },
      ]);
    }
    if (url.pathname === '/api/v4/projects/team%2Fproj/pipelines') {
      return json([
        { id: 91, status: 'success', ref: 'fix/login', created_at: 't5', web_url: 'p91' },
        { id: 90, status: 'failed', ref: 'fix/login', created_at: 't6', web_url: 'p90' },
      ]);
    }
    throw new Error(`unexpected fetch ${url.pathname}`);
  };

  const user = await service.verifyToken('pat-token');
  assert.equal(user.login, 'alice'); assert.equal(user.name, 'Alice');
  // PAT 头
  assert.equal(calls[0].headers['PRIVATE-TOKEN'], 'pat-token');

  const pulls = await service.getPullRequests('team', 'proj', 'open');
  assert.equal(pulls.length, 3);
  assert.equal(pulls[0].number, 7);
  assert.equal(pulls[0].state, 'open');
  assert.equal(pulls[0].draft, true);
  assert.ok(pulls[1].merged_at); assert.equal(pulls[1].state, 'closed');
  assert.equal(pulls[2].state, 'closed');

  const detail = await service.getPullRequest('team', 'proj', 7);
  assert.equal(detail.body, '说明文字');
  // system note（描述变更等）不进时间线。
  assert.deepEqual((await service.getPullRequestIssueComments('team', 'proj', 7)).map(comment => comment.body), ['真实评论']);

  const pipelines = await service.getWorkflowRuns('team', 'proj', undefined, 'fix/login');
  assert.equal(pipelines[0].conclusion, 'success');
  assert.equal(pipelines[1].conclusion, 'failure');
});

test('gitea service maps pulls and combined commit statuses', async () => {
  const service = new app.GiteaClient('https://gitea.example.com', 'gitea-token');
  originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(new Headers(init.headers).get('authorization'), 'token gitea-token');
    const json = body => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
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

  const user = await service.verifyToken('gitea-token');
  assert.equal(user.login, 'gina');
  const pulls = await service.getPullRequests('org', 'repo', 'open');
  assert.equal(pulls[0].state, 'open');
  assert.ok(pulls[1].merged_at); assert.equal(pulls[1].state, 'closed');
  const pipelines = await service.getCommitChecks('org', 'repo', 'feat');
  assert.deepEqual(pipelines.map((pipeline) => [pipeline.name, pipeline.conclusion]), [['ci/build', 'success'], ['ci/lint', 'failure']]);
});

test('gitlab service paginates beyond the first page and stops on a partial page', async () => {
  const service = new app.GitLabClient('https://gitlab.example.com', 'pat-token');
  originalFetch = globalThis.fetch;
  const seenPages = [];
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.pathname === '/api/v4/projects/team%2Fproj/merge_requests') {
      const page = Number(url.searchParams.get('page'));
      seenPages.push(page);
      assert.equal(url.searchParams.get('per_page'), '100');
      const item = (iid) => ({ iid, title: `MR ${iid}`, state: 'opened', draft: false, source_branch: 'b', target_branch: 'main', created_at: 't', updated_at: 't', web_url: `u${iid}`, author: { username: 'bob' } });
      const json = body => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
      // 第一页满 30 条（无法判断是否还有下一页），第二页只有 3 条 → 第三页不再请求。
      return json(page === 1 ? Array.from({ length: 100 }, (_, i) => item(i + 1)) : Array.from({ length: 3 }, (_, i) => item(101 + i)));
    }
    throw new Error(`unexpected fetch ${url.pathname}`);
  };
  const pulls = await service.getPullRequests('team', 'proj', 'open');
  assert.deepEqual(seenPages, [1, 2]);
  assert.equal(pulls.length, 103);
  assert.equal(pulls[0].number, 1);
  assert.equal(pulls[102].number, 103);
});

test('all hosting plugins share one store and stale PR queries cannot replace the next repository', async () => {
  const temp = await fs.mkdtemp(path.join(root, '.test-tmp-forge-store-'));
  try {
    const outfile = path.join(temp, 'store.cjs');
    await build({stdin:{contents:`export {useCollaborationStore} from './src/stores/collaborationStore'; export {bindCollaborationClient} from './src/services/collaboration/CollaborationService';`,resolveDir:root},bundle:true,platform:'node',format:'cjs',outfile,alias:{'@':path.join(root,'src')},logLevel:'silent'});
    const {useCollaborationStore:store,bindCollaborationClient}=createRequire(import.meta.url)(outfile);
    let resolve;const delayed=new Promise(done=>{resolve=done;});
    store.setState({currentOwner:'group/sub',currentRepoName:'A'});bindCollaborationClient({getPullRequests:()=>delayed});
    const old=store.getState().loadPullRequests();store.getState().clearRepo();
    store.setState({currentOwner:'team',currentRepoName:'B'});bindCollaborationClient({getPullRequests:async()=>[{id:2,title:'B'}]});
    await store.getState().loadPullRequests();resolve([{id:1,title:'A'}]);await old;
    assert.equal(store.getState().pullRequests[0].title,'B');
    bindCollaborationClient(null);store.getState().clearRepo();
  } finally {if(path.dirname(temp)===root&&path.basename(temp).startsWith('.test-tmp-forge-store-'))await fs.rm(temp,{recursive:true,force:true,maxRetries:5});}
});
