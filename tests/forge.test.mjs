// 多平台托管（GitLab/Gitea/Gitee）测试：
// 1. parseForgeRemote：已知域名自动识别 kind、嵌套分组、scp/端口/.git 形态、
//    Windows 盘符与无点主机拒绝；
// 2. GitLabService：PAT 头、MR state 映射（opened/closed/locked→merged 语义）、
//    discussions 里 system note 过滤、pipeline 状态映射（fake fetch）；
// 3. GiteaService：token 头、PR merged 字段优先、combined status → 流水线映射；
// 4. GiteeService：access_token query 参数、v5 snake_case 映射、PUT 合并、
//    Issue owner 级更新路径、PR 对话/行内评论按 position 分流。
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
  await build({ stdin: { contents: `export { parseForgeRemote } from './src/services/integrations/remoteIdentity'; export { GitLabClient } from './src/plugins/gitlab/client'; export { GiteaClient } from './src/plugins/gitea/client'; export { GiteeClient } from './src/plugins/gitee/client';`, resolveDir: root }, bundle: true, platform: 'node', format: 'cjs', outfile: bundle, alias: { '@': path.join(root, 'src') }, logLevel: 'silent' });
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
    if (url.pathname === '/api/v1/repos/org/repo/actions/runs/42/cancel') {
      assert.equal(init.method, 'POST');
      return new Response(null, { status: 204 });
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
  await service.cancelWorkflowRun('org', 'repo', 42);
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

test('gitee service authenticates via access_token param and maps v5 pulls, comments and merge semantics', async () => {
  const service = new app.GiteeClient('https://gitee.com', 'gitee-pat');
  originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    assert.equal(url.origin, 'https://gitee.com');
    assert.equal(url.searchParams.get('access_token'), 'gitee-pat');
    calls.push({ path: url.pathname, method: init.method || 'GET', body: init.body ? JSON.parse(init.body) : null });
    const json = body => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
    if (url.pathname === '/api/v5/user') return json({ login: 'gitee-user', name: 'Gitee 用户', avatar_url: 'a' });
    if (url.pathname === '/api/v5/repos/team/proj/pulls') return json([
      { number: 3, title: '功能', state: 'open', head: { ref: 'feat' }, base: { ref: 'main' }, user: { login: 'amy' }, html_url: 'w3', created_at: 't1', updated_at: 't2' },
    ]);
    if (url.pathname === '/api/v5/repos/team/proj/pulls/3/comments') return json([
      { id: 1, body: '对话评论', user: { login: 'bob' }, created_at: 't3' },
      { id: 2, body: '行内评论', path: 'src/a.ts', position: 4, user: { login: 'amy' }, created_at: 't4' },
    ]);
    // 真机实测契约:patch 是对象 { diff, ... }、增删是字符串数字、非变更文件 status 为 null。
    if (url.pathname === '/api/v5/repos/team/proj/pulls/3/files') return json([
      { filename: 'src/a.ts', status: 'added', additions: '5', deletions: '0', patch: { diff: '@@ -0,0 +1,5 @@\n+line', new_path: 'src/a.ts', old_path: 'src/a.ts', new_file: true, renamed_file: false, deleted_file: false } },
      { filename: 'src/b.ts', status: 'deleted', additions: '0', deletions: '2', patch: { diff: '@@ -1,2 +0,0 @@\n-line', new_path: 'src/b.ts', old_path: 'src/b.ts', new_file: false, renamed_file: false, deleted_file: true } },
    ]);
    if (url.pathname === '/api/v5/repos/team/proj/pulls/3/merge') return new Response(null, { status: 204 });
    throw new Error(`unexpected fetch ${url.pathname}`);
  };

  const user = await service.verifyToken('gitee-pat');
  assert.equal(user.login, 'gitee-user');
  assert.equal(user.name, 'Gitee 用户');

  const pulls = await service.getPullRequests('team', 'proj', 'open');
  assert.equal(pulls[0].number, 3);
  assert.equal(pulls[0].draft, false);

  // 对话区/行内评论按 position 分流
  const issueComments = await service.getPullRequestIssueComments('team', 'proj', 3);
  assert.deepEqual(issueComments.map(comment => comment.body), ['对话评论']);
  const reviewComments = await service.getPullRequestReviewComments('team', 'proj', 3);
  assert.deepEqual(reviewComments.map(comment => [comment.path, comment.side, comment.line]), [['src/a.ts', 'RIGHT', 4]]);

  const files = await service.getPullRequestFiles('team', 'proj', 3);
  assert.deepEqual(files.files.map(file => [file.filename, file.status, file.additions, file.deletions]), [['src/a.ts', 'added', 5, 0], ['src/b.ts', 'removed', 0, 2]]);

  await service.mergePullRequest('team', 'proj', 3, { mergeMethod: 'squash' });
  const merge = calls.find(call => call.path === '/api/v5/repos/team/proj/pulls/3/merge');
  assert.equal(merge.method, 'PUT');
  assert.equal(merge.body.merge_method, 'squash');
});

test('gitee issue updates go through the owner-level path with repo in the body', async () => {
  const service = new app.GiteeClient('https://gitee.com', 'gitee-pat');
  originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    assert.equal(url.searchParams.get('access_token'), 'gitee-pat');
    calls.push({ path: url.pathname, method: init.method || 'GET', body: init.body ? JSON.parse(init.body) : null });
    const json = body => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
    if (url.pathname === '/api/v5/repos/team/proj/issues') return json([{ number: '7', title: '缺陷', state: 'open' }]);
    if (url.pathname === '/api/v5/repos/team/proj/issues/7') return json({ number: '7', title: '缺陷', state: 'open' });
    if (url.pathname === '/api/v5/repos/team/issues/7') return json({ number: '7', title: '缺陷', state: 'closed' });
    if (url.pathname === '/api/v5/repos/team/proj/issues/7/comments') return json([]);
    throw new Error(`unexpected fetch ${url.pathname}`);
  };

  const issues = await service.searchIssues('team', 'proj', { state: 'open', query: '', label: '', assignee: '', page: 1 });
  assert.equal(issues.items[0].number, '7');

  await service.updateIssue('team', 'proj', 7, { state: 'closed' });
  const patch = calls.find(call => call.method === 'PATCH');
  assert.equal(patch.path, '/api/v5/repos/team/issues/7');
  assert.equal(patch.body.repo, 'proj');
  assert.equal(patch.body.state, 'closed');
});
