import { before, after, afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { build } from 'esbuild';

const root = process.cwd(), values = new Map(), originalFetch = globalThis.fetch;
globalThis.localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
let app, temporary, dispose;
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const person = { id: 1, username: 'alice', name: 'Alice', avatar_url: 'https://gitlab.example/avatar.png', web_url: 'https://gitlab.example/alice' };
const project = { id: 42, name: 'Project', path: 'project', path_with_namespace: 'group/sub/project', default_branch: 'main', visibility: 'private', web_url: 'https://gitlab.example/group/sub/project' };
const mr = { id: 70, iid: 7, title: 'Fix', state: 'opened', sha: 'a'.repeat(40), source_branch: 'topic', target_branch: 'main', author: person,
  web_url: `${project.web_url}/-/merge_requests/7`, description: 'Closes group/sub/project#12', created_at: 't1', updated_at: 't2',
  diff_refs: { base_sha: 'b'.repeat(40), head_sha: 'a'.repeat(40), start_sha: 'c'.repeat(40) } };
const issue = { id: 120, iid: 12, title: 'Bug', state: 'opened', author: person, labels: ['bug'], assignees: [person], description: 'Reproduce', web_url: `${project.web_url}/-/issues/12`, created_at: 't1', updated_at: 't2' };
const pipeline = { id: 10, iid: 2, status: 'running', sha: 'a'.repeat(40), ref: 'topic', created_at: 't1', updated_at: 't2', web_url: `${project.web_url}/-/pipelines/10`, user: person };
const job = { id: 20, name: 'Tests', status: 'running', pipeline: { id: 10 }, web_url: `${project.web_url}/-/jobs/20` };
const definition = 'spec:\n  inputs:\n    dry_run:\n      type: boolean\n      default: false\n---\ntest:\n  script: echo test\n';
const repository = { id: 'repo', name: 'repo', path: '/repo', currentBranch: 'topic', lastOpenedAt: 0,
  collaborationRemote: { name: 'upstream', fetchUrl: 'git@gitlab.example:group/sub/project.git', pushUrl: 'git@gitlab.example:group/sub/project.git' } };
const entry = `export * from './src/services/integrations/plugins'; export * from './src/services/integrations/runtime';
  export { overviewService } from './src/features/repository/OverviewService'; export { gitService } from './src/services/git/GitService';
  export * from './src/services/integrations/serverUrl'; export * from './src/features/issues/workflowLogic';
  export * from './src/services/integrations/links'; export * from './src/services/integrations/repositoryBinding';
  export * from './src/services/collaboration/CollaborationService'; export * from './src/features/issues/issueLogic';
  export { useCollaborationStore } from './src/stores/collaborationStore'; export { useRepoStore } from './src/stores/repoStore';
  export { useIntegrationStore } from './src/stores/integrationStore';`;
async function bundle(name, plugins = []) {
  const outfile = path.join(temporary, `${name}.cjs`);
  const result = await build({ stdin: { contents: entry, resolveDir: root }, outfile, bundle: true, platform: 'node', format: 'cjs', metafile: true,
    alias: { '@': path.join(root, 'src') }, logLevel: 'silent', plugins });
  return { api: createRequire(import.meta.url)(outfile), inputs: Object.keys(result.metafile.inputs) };
}
function gitlabFixture() {
  const writes = [], requests = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input)), method = init.method || 'GET', body = init.body ? JSON.parse(init.body) : undefined;
    assert.equal(url.host, 'gitlab.example', 'GitLab-only workflows must never contact GitHub');
    assert.equal(init.headers['PRIVATE-TOKEN'], 'gitlab-pat');
    requests.push({ path: url.pathname, query: url.searchParams, method, body });
    if (method !== 'GET') writes.push({ path: url.pathname, method, body });
    const route = url.pathname.replace('/api/v4/projects/group%2Fsub%2Fproject', '');
    if (url.pathname === '/api/v4/user') return json(person);
    if (!route) return json(project);
    if (route === '/merge_requests' && method === 'POST') return json({ ...mr, source_branch: body.source_branch, title: body.title, description: body.description });
    if (route === '/merge_requests') return json([mr]);
    if (route === '/merge_requests/7') return json({ ...mr, state: body?.state_event === 'close' ? 'closed' : 'opened' });
    if (route === '/merge_requests/7/merge') return json({ ...mr, state: 'merged', merged_at: 'now' });
    if (route === '/merge_requests/7/approvals') return json({ approved_by: [{ user: person }] });
    if (route === '/merge_requests/7/approve') return json({ approved: true });
    if (route === '/merge_requests/7/diffs') return json([{ old_path: 'a.ts', new_path: 'a.ts', diff: '@@ -1 +1 @@\n-old\n+new' }]);
    if (route === '/merge_requests/7/discussions') return json(method === 'POST' ? { id: 'thread' } : [{ notes: [{ id: 1, author: person, body: 'Inline', position: { new_path: 'a.ts', new_line: 1 } }] }]);
    if (route === '/merge_requests/7/notes' || route === '/issues/12/notes') return json(method === 'POST' ? { id: 1, author: person, body: body.body } : []);
    if (route === '/issues') return json(method === 'POST' ? { ...issue, title: body.title } : [issue]);
    if (route === '/issues/12') return json({ ...issue, state: body?.state_event === 'close' ? 'closed' : 'opened', title: body?.title || issue.title });
    if (route === '/issues/12/related_merge_requests') return json([mr]);
    if (route === '/labels') return json([{ id: 1, name: 'bug', color: '#ff0000' }]);
    if (route === '/members/all') return json([person]);
    if (route === '/pipelines') return json([pipeline]);
    if (route === '/pipelines/10') return json(pipeline);
    if (route === '/pipelines/10/jobs') return json([job]);
    if (route === '/jobs/20') return json(job);
    if (route === '/jobs/20/trace') return new Response('Tests passed');
    if (route.includes('/repository/files/')) return new Response(definition);
    if (route === '/pipeline') return json(pipeline);
    if (route === '/pipelines/10/retry' || route === '/pipelines/10/cancel') return json(pipeline);
    if (route.includes('/repository/commits/') && route.endsWith('/statuses')) return json([{ id: 1, name: 'Tests', status: 'success' }]);
    throw Error(`Unexpected route: ${method} ${url.pathname}`);
  };
  return { writes, requests };
}
async function eventually(predicate) { for (let i = 0; i < 100; i++) { if (predicate()) return; await new Promise(setImmediate); } assert.fail('Plugin runtime did not settle'); }
before(async () => { temporary = await fs.mkdtemp(path.join(root, '.test-tmp-plugin-isolation-')); app = (await bundle('all')).api; });
afterEach(() => {
  dispose?.(); dispose = undefined;
  app.bindCollaborationClient(null); app.useCollaborationStore.getState().clearRepo();
  app.useCollaborationStore.setState({ profiles: [], activeProfileId: null, token: null, user: null, isAuthenticated: false, providerId: null, server: '', isConnecting: false, isAddingProfile: false });
  app.useRepoStore.setState({ currentRepo: null }); app.useIntegrationStore.getState().setContext(null, null);
  for (const plugin of app.installedHostingPlugins()) app.setPluginEnabled(plugin.manifest.id, true);
  values.clear(); globalThis.fetch = originalFetch;
});
after(async () => { delete globalThis.localStorage; if (temporary && path.dirname(temporary) === root && path.basename(temporary).startsWith('.test-tmp-plugin-isolation-')) await fs.rm(temporary, { recursive: true, force: true, maxRetries: 5 }); });

test('GitHub can be disabled while GitLab owns the complete collaboration workflow', async () => {
  app.setPluginEnabled('github', false);
  const fixture = gitlabFixture(), store = app.useCollaborationStore;
  store.getState().selectProvider('gitlab', 'https://gitlab.example');
  await store.getState().login('gitlab-pat');
  app.useRepoStore.setState({ currentRepo: repository }); dispose = app.startIntegrationRuntime();
  await eventually(() => store.getState().pullRequests.length === 1 && store.getState().selectedRunJobs.length === 1);
  assert.equal(app.getHostingPlugin('github'), null);
  assert.equal(store.getState().currentOwner, 'group/sub');
  assert.equal(store.getState().workflows[0].path, '.gitlab-ci.yml');
  assert.equal(app.getPullCheckoutRef(7), 'refs/merge-requests/7/head');
  const client = app.collaborationService, owner = 'group/sub', repo = 'project';
  assert.equal((await client.searchIssues(owner, repo, { state: 'open', query: '', label: '', assignee: '', page: 1 })).items[0].number, 12);
  assert.equal((await client.createIssue(owner, repo, { title: 'New issue', body: '', labels: ['bug'], assignees: ['alice'] })).title, 'New issue');
  assert.equal((await client.updateIssue(owner, repo, 12, { state: 'closed' })).state, 'closed');
  await client.createIssueComment(owner, repo, 12, 'Discuss');
  assert.equal((await client.getPullRequestFiles(owner, repo, 7)).files[0].patch.includes('+new'), true);
  assert.equal((await client.getPullRequestReviewComments(owner, repo, 7))[0].path, 'a.ts');
  await client.createPullRequestReview(owner, repo, 7, { event: 'APPROVE', body: 'Reviewed', comments: [{ path: 'a.ts', side: 'RIGHT', line: 1, body: 'Inline' }] });
  const created = await client.createPullRequest(owner, repo, { title: 'MR', head: 'topic', base: 'main', body: 'Closes #12' });
  assert.equal(created.head.ref, 'topic');
  assert.equal((await client.mergePullRequest(owner, repo, 7, { expectedHeadSha: mr.sha, mergeMethod: 'squash' })).merged, true);
  await client.updatePullRequestState(owner, repo, 7, 'closed');
  await store.getState().openJobLogs(20);
  assert.equal(store.getState().activeJobLogs.rawLogs, 'Tests passed');
  const fields = app.getHostingPlugin('gitlab').parseDispatchInputs(definition);
  assert.equal(fields[0].type, 'boolean');
  await client.dispatchWorkflow(owner, repo, 0, { ref: 'topic', inputs: { dry_run: 'false' } });
  await client.rerunWorkflow(owner, repo, 10, true); await client.cancelWorkflowRun(owner, repo, 10);
  await store.getState().fetchCommitChecks(mr.sha);
  assert.equal(store.getState().commitChecks[mr.sha][0].status, 'in_progress');
  assert.equal(app.issueUrl({ owner, repo, number: 12 }), `${project.web_url}/-/issues/12`);
  assert.equal(app.referencedPullRequests(await client.getIssueTimeline(owner, repo, 12)).length, 1);
  assert.ok(fixture.writes.some(write => write.path.endsWith('/pipeline') && write.body.inputs.dry_run === false));
  assert.ok(fixture.writes.some(write => write.path.endsWith('/merge') && write.body.sha === mr.sha));
  assert.ok(fixture.writes.some(write => write.path.endsWith('/discussions') && write.body.position.head_sha === mr.sha));
});

test('removing the GitHub plugin from composition builds and runs GitLab without importing GitHub', async () => {
  const isolated = await bundle('gitlab-only', [{ name: 'gitlab-only', setup(builder) {
    builder.onLoad({ filter: /src[\\/]plugins[\\/]index\.ts$/ }, () => ({ contents: `import { gitlabPlugin } from './gitlab'; export const HOSTING_PLUGINS = [gitlabPlugin]; export const ERROR_PLUGINS = [];`, loader: 'ts' }));
  } }]);
  assert.ok(isolated.inputs.every(name => !/plugins[\\/](github|gitea|sentry)[\\/]/.test(name)), 'The isolated API bundle must not contain other platform implementations');
  const api = isolated.api; gitlabFixture();
  api.useCollaborationStore.getState().selectProvider('gitlab', 'https://gitlab.example');
  await api.useCollaborationStore.getState().login('gitlab-pat');
  assert.equal((await api.collaborationService.getIssue('group/sub', 'project', 12)).title, 'Bug');
  api.useCollaborationStore.getState().clearRepo(); api.bindCollaborationClient(null);
  const ui = await build({ stdin: { contents: `export { App } from './src/app/App';`, resolveDir: root },
    outfile: path.join(temporary, 'gitlab-only-ui.js'), write: false, bundle: true, platform: 'browser', format: 'esm', metafile: true,
    alias: { '@': path.join(root, 'src') }, loader: { '.css': 'empty' }, logLevel: 'silent', plugins: [{ name: 'gitlab-only-ui', setup(builder) {
      builder.onLoad({ filter: /src[\\/]plugins[\\/]index\.ts$/ }, () => ({ contents: `import { gitlabPlugin } from './gitlab'; export const HOSTING_PLUGINS = [gitlabPlugin]; export const ERROR_PLUGINS = [];`, loader: 'ts' }));
      builder.onLoad({ filter: /src[\\/]plugins[\\/]ui\.ts$/ }, () => ({ contents: `export const getPluginAuthView = () => undefined;`, loader: 'ts' }));
    } }] });
  assert.ok(Object.keys(ui.metafile.inputs).every(name => !/plugins[\\/](github|gitea|sentry)[\\/]/.test(name)), 'The complete app UI must also build without other platform implementations');
});

test('disabling the active plugin invalidates repository data and never falls back to another service', async () => {
  gitlabFixture(); app.useCollaborationStore.getState().selectProvider('gitlab', 'https://gitlab.example');
  await app.useCollaborationStore.getState().login('gitlab-pat'); app.useRepoStore.setState({ currentRepo: repository });
  dispose = app.startIntegrationRuntime(); await eventually(() => app.useCollaborationStore.getState().pullRequests.length === 1);
  app.setPluginEnabled('gitlab', false);
  assert.equal(app.useIntegrationStore.getState().binding, null);
  assert.equal(app.useCollaborationStore.getState().currentOwner, null);
  assert.deepEqual(app.useCollaborationStore.getState().pullRequests, []);
  // 「当前平台」选择一并清空：残留会让导航门控与连接入口口径不一致。
  assert.equal(app.useCollaborationStore.getState().providerId, null);
  assert.throws(() => app.collaborationService.getIssue('group/sub', 'project', 12), error => error.key === 'connections.errors.noPluginConnected');
  // 重新启用插件：凭证未删，活跃 Profile 自动恢复会话，无需重启或重输令牌。
  app.setPluginEnabled('gitlab', true);
  await eventually(() => app.useCollaborationStore.getState().isAuthenticated);
  await eventually(() => app.useCollaborationStore.getState().pullRequests.length === 1);
  assert.equal(app.useCollaborationStore.getState().providerId, 'gitlab');
});

test('platform reference keys distinguish equal issue numbers on different instances', () => {
  assert.notEqual(app.issueKey({ owner: 'team', repo: 'project', number: 1, providerId: 'gitlab', server: 'https://one.example' }),
    app.issueKey({ owner: 'team', repo: 'project', number: 1, providerId: 'gitlab', server: 'https://two.example' }));
});

test('Gitea adapts native review anchors, textual diffs, string workflow IDs and merged state', async () => {
  const requests = [], paths = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input)); assert.equal(url.origin, 'https://forge.example');
    assert.equal(new Headers(init.headers).get('authorization'), 'token forge-pat'); paths.push(url.pathname);
    if (init.method === 'POST') { requests.push(JSON.parse(init.body)); return json({ id: 1, state: 'COMMENT', user: { login: 'alice' } }); }
    const route = url.pathname.replace('/api/v1/repos/team/project', '');
    if (route === '/pulls/7/files') return json([{ filename: 'new name.ts', previous_filename: 'old name.ts', status: 'renamed' }]);
    if (route === '/pulls/7.diff') return new Response('diff --git a/old name.ts b/new name.ts\n--- a/old name.ts\n+++ b/new name.ts\n@@ -1 +1 @@\n-old\n+new\n');
    if (route === '/pulls/7/reviews') return json([{ id: 1, state: 'REQUEST_CHANGES', user: { login: 'alice' } }]);
    if (route === '/pulls/7/reviews/1/comments') return json([{ id: 1, path: 'new name.ts', position: 2, original_position: 0 }]);
    if (route === '/pulls/7') return json({ number: 7, merged: true, updated_at: 'now' });
    if (route === '/actions/workflows') return json({ workflows: [{ id: 'test.yml', path: '.gitea/workflows/test.yml', name: 'Test' }] });
    if (route === '/actions/runs') return json({ workflow_runs: [{ id: 1, path: '.gitea/workflows/test.yml@refs/heads/main', display_title: 'Tests', head_sha: 'sha' }, { id: 2, path: '.gitea/workflows/other.yml' }] });
    throw Error(route);
  };
  const client = app.getHostingPlugin('gitea').createClient('https://forge.example', 'forge-pat');
  assert.equal((await client.getPullRequest('team', 'project', 7)).merged_at, 'now');
  assert.match((await client.getPullRequestFiles('team', 'project', 7)).files[0].patch, /\+new/);
  assert.equal((await client.getPullRequestReviews('team', 'project', 7))[0].state, 'CHANGES_REQUESTED');
  assert.deepEqual((await client.getPullRequestReviewComments('team', 'project', 7)).map(({ side, line }) => ({ side, line })), [{ side: 'RIGHT', line: 2 }]);
  await client.createPullRequestReview('team', 'project', 7, { event: 'COMMENT', comments: [{ path: 'a.ts', side: 'LEFT', line: 3, body: 'Fix' }] });
  assert.equal(requests[0].comments[0].old_position, 3);
  assert.deepEqual((await client.getWorkflowRuns('team', 'project', 'test.yml')).map(run => run.id), [1]);
  await assert.rejects(client.cancelWorkflowRun('team', 'project', 1), /unavailable/);
  assert.ok(!paths.some(path => path.includes('/cancel') || path.includes('/workflows/test.yml/runs')));
});

test('production domain features do not import platform-specific services or stores', async () => {
  const files = await fs.readdir(path.join(root, 'src'), { recursive: true });
  for (const file of files.map(name => name.replaceAll('\\', '/'))) {
    if (!/\.tsx?$/.test(file) || /^(plugins|dev)\//.test(file)) continue;
    const source = await fs.readFile(path.join(root, 'src', file), 'utf8');
    assert.doesNotMatch(source, /(?:from\s*|import\s*\()\s*['"][^'"]*(?:services\/(?:github|gitlab|gitea)\/|stores\/githubStore|plugins\/(?:github|gitlab|gitea)\/)/, file);
  }
});

test('desktop GitHub requests use the same native provider transport without browser host exceptions', async () => {
  const previousWindow = globalThis.window, requests = [];
  globalThis.window = { __TAURI_INTERNALS__: { invoke: async (command, args) => {
    assert.equal(command, 'provider_http_request'); requests.push(args.request);
    return { status: 200, headers: {}, body: JSON.stringify({ id: 1, login: 'alice' }) };
  } } };
  globalThis.fetch = async () => { assert.fail('Desktop plugin must use native transport'); };
  try {
    const client = app.getHostingPlugin('github').createClient('https://github.com', 'native-pat');
    assert.equal((await client.verifyToken('native-pat')).login, 'alice');
    assert.equal(requests[0].url, 'https://api.github.com/user');
    assert.equal(requests[0].headers.authorization, 'Bearer native-pat');
  } finally { if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow; }
});

test('selecting a platform while adding an account preserves the new slot and cancel restores the previous session', async () => {
  gitlabFixture(); const store = app.useCollaborationStore;
  store.getState().selectProvider('gitlab', 'https://gitlab.example'); await store.getState().login('gitlab-pat');
  const original = store.getState().activeProfileId;
  store.getState().addProfile('gitlab', 'https://gitlab.example');
  const pending = store.getState().activeProfileId;
  assert.notEqual(pending, original);
  store.getState().selectProvider('gitlab', 'https://gitlab.example');
  assert.equal(store.getState().activeProfileId, pending, 'The form must not replace an existing account');
  store.getState().selectProvider('gitea', 'https://forge.example');
  assert.equal(store.getState().activeProfileId, pending);
  assert.equal(store.getState().profiles.find(item => item.id === pending).providerId, 'gitea');
  store.getState().cancelAddProfile(); store.getState().finishConnection();
  await eventually(() => store.getState().isAuthenticated);
  assert.equal(store.getState().activeProfileId, original);
  assert.equal(store.getState().providerId, 'gitlab'); assert.equal(store.getState().server, 'https://gitlab.example');
  assert.equal(store.getState().token, 'gitlab-pat'); assert.equal(store.getState().profiles.length, 1);
});

test('repository bindings prefer the selected account when several accounts share an instance', () => {
  app.useCollaborationStore.setState({ activeProfileId: 'work', profiles: [
    { id: 'personal', label: 'Personal', providerId: 'gitlab', server: 'https://gitlab.example' },
    { id: 'work', label: 'Work', providerId: 'gitlab', server: 'https://gitlab.example' },
  ] });
  const binding = app.resolveHostingBinding(repository.collaborationRemote, app.hostingConnections());
  assert.equal(binding.connectionId, 'work');
});

test('relative-root instances isolate HTTP paths and preserve nested GitLab namespaces and links', async () => {
  const connections = [
    { id: 'root', providerId: 'gitlab', server: 'https://shared.example', enabled: true },
    { id: 'nested', providerId: 'gitlab', server: 'https://shared.example/gitlab/', enabled: true },
  ];
  const remote = { name: 'origin', fetchUrl: 'https://shared.example/gitlab/group/sub/project.git' };
  const binding = app.resolveHostingBinding(remote, connections);
  assert.equal(binding.connectionId, 'nested'); assert.equal(binding.ownerPath, 'group/sub');
  assert.equal(binding.server, 'https://shared.example/gitlab');
  assert.equal(app.resolveHostingBinding({ ...remote, fetchUrl: 'https://shared.example/gitlab2/group/project.git' }, [connections[1]]), null);
  assert.equal(app.resolveHostingBinding({ ...remote, fetchUrl: 'git@shared.example:group/sub/project.git' }, connections), null, 'SSH cannot distinguish multiple API instances on the same host');
  app.useIntegrationStore.getState().setContext('/prefix', binding);
  assert.equal(app.issueUrl({ owner: 'group/sub', repo: 'project', number: 12 }), 'https://shared.example/gitlab/group/sub/project/-/issues/12');
  assert.deepEqual(app.pullRequestReference('https://shared.example/gitlab/group/sub/project/-/merge_requests/7'), { owner: 'group/sub', repo: 'project', number: 7 });
  assert.equal(app.isCurrentPlatformUrl('https://shared.example/another/project/-/issues/12'), false);
  assert.equal(app.issueReferences('https://shared.example/gitlab/group/sub/project/-/issues/12', 'group/sub', 'project')[0].owner, 'group/sub');
  globalThis.fetch = async (url, init) => {
    assert.equal(String(url), 'https://shared.example/gitlab/api/v4/projects/group%2Fsub%2Fproject/issues/12');
    assert.equal(init.headers['PRIVATE-TOKEN'], 'synthetic-prefix-token'); return json(issue);
  };
  const client = app.getHostingPlugin('gitlab').createClient(binding.server, 'synthetic-prefix-token');
  assert.equal((await client.taskTracking.getIssue('group/sub', 'project', 12)).number, 12);
});

test('server normalization rejects credentials and ambiguous encoded path separators', () => {
  assert.equal(app.normalizeServerUrl('HTTPS://SHARED.EXAMPLE:443/gitlab///'), 'https://shared.example/gitlab');
  for (const url of ['https://user:secret@host.example', 'https://host.example/git%2Flab', 'https://host.example/a%2eb', 'https://host.example/?token=x']) assert.throws(() => app.normalizeServerUrl(url));
});

test('task-only plugins do not have to implement or query code-hosting, repository metadata or CI', async () => {
  const isolated = await bundle('task-only', [{ name: 'task-only', setup(builder) {
    builder.onLoad({ filter: /src[\\/]plugins[\\/]index\.ts$/ }, () => ({ loader: 'ts', contents: `
      import { GitLabClient } from './gitlab/client';
      let token = null;
      export const HOSTING_PLUGINS = [{
        manifest: { id: 'gitlab', name: 'Tasks', primaryDomain: 'task-tracking', connectionKind: 'hosting-account', domains: [{ domain: 'task-tracking', capabilities: ['task-tracking:list-issues', 'task-tracking:issue-detail'] }] },
        defaultServer: 'https://gitlab.example', defaultProfileId: 'task-default', publicHosts: ['gitlab.example'],
        credentials: { read: async () => token, write: async value => { token = value; }, remove: async () => { token = null; } },
        issuePath: number => '/-/issues/' + number,
        createClient(server, secret) { const client = new GitLabClient(server, secret); return { verifyToken: value => client.verifyToken(value), setToken: value => client.setToken(value), taskTracking: client }; },
      }]; export const ERROR_PLUGINS = [];
    ` }));
  } }]);
  const fixture = gitlabFixture(), api = isolated.api, state = api.useCollaborationStore;
  state.getState().selectProvider('gitlab', 'https://gitlab.example'); await state.getState().login('gitlab-pat');
  api.useRepoStore.setState({ currentRepo: repository }); const cleanup = api.startIntegrationRuntime();
  try {
    await eventually(() => state.getState().currentOwner === 'group/sub' && !state.getState().isLoading);
    assert.equal((await api.collaborationService.getIssue('group/sub', 'project', 12)).number, 12);
    assert.equal(api.hasCollaborationDomain('taskTracking'), true); assert.equal(api.hasCollaborationDomain('codeHosting'), false); assert.equal(api.hasCollaborationDomain('ciCd'), false);
    assert.throws(() => api.collaborationService.updateIssue('group/sub', 'project', 12, { title: 'must not write' }), error => error.key === 'connections.errors.capabilityUnavailable');
    api.gitService.listRemotes = async () => [repository.collaborationRemote];
    api.gitService.getBranchCommitHash = async () => assert.fail('Task-only overview must not start a CI query');
    assert.equal((await api.overviewService.ci(repository, { trackingBranch: 'upstream/topic' }, null, true)).state, 'unsupported');
    assert.ok(fixture.requests.every(request => request.path === '/api/v4/user' || request.path.endsWith('/issues/12')));
    assert.deepEqual(state.getState().pullRequests, []); assert.deepEqual(state.getState().workflowRuns, []); assert.equal(state.getState().error, null);
  } finally { cleanup(); }
});

test('a local-only runtime starts without plugins, authentication errors or provider traffic', async () => {
  const { api } = await bundle('local-only', [{ name: 'local-only', setup(builder) {
    builder.onLoad({ filter: /src[\\/]plugins[\\/]index\.ts$/ }, () => ({ contents: 'export const HOSTING_PLUGINS = []; export const ERROR_PLUGINS = [];', loader: 'ts' }));
  } }]);
  globalThis.fetch = async () => assert.fail('Local-only startup must not contact a provider');
  api.useRepoStore.setState({ currentRepo: { ...repository, collaborationRemote: null } });
  const cleanup = api.startIntegrationRuntime();
  try { await api.useCollaborationStore.getState().initAuth(); assert.equal(api.useCollaborationStore.getState().error, null); assert.equal(api.currentCollaborationClient(), null); }
  finally { cleanup(); }
});
