import { before, after, afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { build } from 'esbuild';

const root = process.cwd(), nativeFetch = globalThis.fetch, saved = new Map();
let temporary, app, handler;
const calls = [];
const response = (body, status = 200, headers = {}) => new Response(status === 204 ? null : typeof body === 'string' ? body : JSON.stringify(body), { status, headers });
globalThis.localStorage = { getItem: key => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value), removeItem: key => saved.delete(key) };
const parameters = [{ name: 'SCENARIO', type: 'ChoiceParameterDefinition', choices: ['success', 'failure'], defaultParameterValue: { value: 'success' } },
  { name: 'BRANCH', type: 'StringParameterDefinition', defaultParameterValue: { value: 'main' } }];
const rawBuild = (result = 'SUCCESS', number = 1) => ({ number, building: result === null, result, timestamp: 100000, duration: 4000,
  actions: [{ parameters: [{ name: 'COMMIT_SHA', value: 'a'.repeat(40) }, { name: 'BRANCH', value: 'topic' }] }] });

before(async () => {
  temporary = await fs.mkdtemp(path.join(root, '.test-tmp-jenkins-'));
  const outfile = path.join(temporary, 'app.cjs');
  await build({ stdin: { contents: `export { JenkinsClient } from './src/plugins/jenkins/client'; export { JENKINS_PROVIDER } from './src/plugins/manifests';
    export * from './src/services/integrations/plugins'; export { useCiStore } from './src/stores/ciStore'; export { createCiChannel } from './src/services/integrations/ciService';
    export { bindCollaborationClient, collaborationService } from './src/services/collaboration/CollaborationService';`, resolveDir: root },
    outfile, bundle: true, format: 'cjs', platform: 'node', alias: { '@': path.join(root, 'src') }, logLevel: 'silent' });
  app = createRequire(import.meta.url)(outfile);
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(input);
    calls.push({ url, ...init });
    return handler(url, init);
  };
});
afterEach(() => {
  calls.length = 0; saved.clear();
  app.useCiStore.setState({ connections: [], bindings: {}, sources: {}, runtime: {}, restored: false, revision: 0 });
  app.setPluginEnabled('jenkins', true); app.bindCollaborationClient(null);
});
after(async () => {
  globalThis.fetch = nativeFetch; delete globalThis.localStorage;
  if (temporary && path.dirname(temporary) === root && path.basename(temporary).startsWith('.test-tmp-jenkins-')) await fs.rm(temporary, { recursive: true, force: true, maxRetries: 5 });
});

test('Jenkins contributes only implemented ci-cd capabilities through its independent assembly kind', () => {
  assert.equal(app.JENKINS_PROVIDER.connectionKind, 'ci-server');
  assert.deepEqual(app.JENKINS_PROVIDER.domains.map(item => item.domain), ['ci-cd']);
  assert.equal(app.getHostingPlugin('jenkins'), null);
  assert.equal(app.getCiPlugin('jenkins').manifest, app.JENKINS_PROVIDER);
  assert(!app.JENKINS_PROVIDER.domains[0].capabilities.includes('ci-cd:commit-checks'));
  assert(!app.JENKINS_PROVIDER.domains[0].capabilities.includes('ci-cd:workflow-source'));
});

test('instance and Job URLs reject traversal and credentials; authentication preserves context paths and UTF-8 usernames', async () => {
  for (const server of ['https://user:secret@ci.example', 'file:///tmp/ci', 'https://ci.example/?x=1']) assert.throws(() => new app.JenkinsClient(server, 'alice', 'token', ['job']));
  for (const job of ['../job', 'folder//job', '/job', 'folder/%2e%2e/job', 'https://ci.example/job', 'a\\b']) assert.throws(() => new app.JenkinsClient('https://ci.example', 'alice', 'token', [job]));
  assert.throws(() => new app.JenkinsClient('https://ci.example', 'bad:user', 'token', []));
  handler = url => { assert.equal(url.pathname, '/jenkins/whoAmI/api/json'); return response({ authenticated: true, name: '用户' }); };
  const client = new app.JenkinsClient('https://ci.example/jenkins/', '用户', 'secret', ['team/job with space']);
  assert.equal((await client.verifyToken('secret')).login, '用户');
  assert.equal(Buffer.from(calls[0].headers.Authorization.slice(6), 'base64').toString('utf8'), '用户:secret');
});

test('equal build numbers in different Jobs keep separate identities and cancellation targets', async () => {
  handler = (url, init) => {
    if (init.method === 'POST') return response('', 302, { location: new URL('./', url).href });
    if (url.pathname.includes('/queue/')) return response({ items: [] });
    return response({ builds: [rawBuild()] });
  };
  const client = new app.JenkinsClient('https://ci.example/jenkins', 'alice', 'token', ['team/first', 'team/second']);
  const runs = await client.getWorkflowRuns('', '');
  assert.notEqual(runs[0].id, runs[1].id);
  await client.cancelWorkflowRun('', '', runs[1].id);
  assert.equal(calls.at(-1).url.pathname, '/jenkins/job/team/job/second/1/stop');
  assert.equal(calls.filter(call => call.url.host === 'foreign.example').length, 0);
  assert.equal(runs[0].head_sha, 'a'.repeat(40));
});

test('login redirects and foreign completion redirects never become successful trigger/cancel results', async () => {
  let redirect = false;
  handler = (url, init) => {
    if (init.method === 'POST') return response('', 302, { location: 'https://foreign.example/login' });
    if (redirect) return response('', 302, { location: '/login' });
    if (url.pathname.includes('/queue/')) return response({ items: [] });
    if (url.searchParams.get('tree')?.startsWith('builds')) return response({ builds: [rawBuild()] });
    return response({ property: [] });
  };
  const client = new app.JenkinsClient('https://ci.example', 'alice', 'token', ['build']);
  const [run] = await client.getWorkflowRuns('', '');
  await assert.rejects(client.cancelWorkflowRun('', '', run.id), error => error.status === 302);
  await assert.rejects(client.dispatchWorkflow('', '', 'build', { ref: '' }), error => error.status === 302);
  redirect = true;
  await assert.rejects(client.getWorkflows('', ''), error => error.status === 302);
  assert(!calls.some(call => call.url.host === 'foreign.example'));
});

test('queued Jobs are scoped to mapped paths and accept HTTP 204 cancellation', async () => {
  handler = (url, init) => init.method === 'POST' ? response(null, 204)
    : url.pathname.includes('/queue/') ? response({ items: [
      { id: 7, inQueueSince: 10, task: { url: 'https://ci.example/jenkins/job/team/job/build/' } },
      { id: 8, inQueueSince: 10, task: { url: 'https://foreign.example/jenkins/job/team/job/build/' } },
    ] }) : response({ builds: [] });
  const client = new app.JenkinsClient('https://ci.example/jenkins', 'alice', 'token', ['team/build']);
  const runs = await client.getWorkflowRuns('', '');
  assert.equal(runs.length, 1); assert.equal(runs[0].status, 'queued');
  await client.cancelWorkflowRun('', '', runs[0].id);
  assert.equal(calls.at(-1).url.pathname, '/jenkins/queue/cancelItem');
  assert.equal(calls.at(-1).url.searchParams.get('id'), '7');
});

test('Jenkins statuses retain unstable, cancellation and unknown results without reporting false success', async () => {
  handler = url => url.pathname.includes('/queue/') ? response({ items: [] }) : response({ builds: [
    rawBuild('UNSTABLE', 1), rawBuild('ABORTED', 2), rawBuild('FUTURE_STATUS', 3), rawBuild(null, 4),
  ] });
  const runs = await new app.JenkinsClient('https://ci.example', 'alice', 'token', ['build']).getWorkflowRuns('', '');
  assert.deepEqual(runs.map(run => run.conclusion), ['unstable', 'cancelled', null, null]);
  assert.equal(runs.at(-1).status, 'in_progress');
});

test('progressive logs use server byte offsets, retain multibyte text and do not duplicate concurrent reads', async () => {
  let logCalls = 0;
  handler = url => {
    if (url.pathname.includes('/queue/')) return response({ items: [] });
    if (url.pathname.endsWith('progressiveText')) {
      logCalls++;
      return logCalls === 1 ? response('中文\n', 200, { 'x-text-size': '7', 'x-more-data': 'true' })
        : response('done\n', 200, { 'x-text-size': '12' });
    }
    return response({ builds: [rawBuild()] });
  };
  const client = new app.JenkinsClient('https://ci.example', 'alice', 'token', ['build']);
  const [run] = await client.getWorkflowRuns('', '');
  const [one, duplicate] = await Promise.all([client.getJobLogs('', '', run.id), client.getJobLogs('', '', run.id)]);
  assert.equal(logCalls, 1); assert.equal(one.rawLogs, duplicate.rawLogs);
  const two = await client.getJobLogs('', '', run.id);
  assert.equal(calls.at(-1).url.searchParams.get('start'), '7');
  assert.equal(two.rawLogs, '中文\ndone\n'); assert.equal(two.live, false);
  await client.getJobLogs('', '', run.id); assert.equal(logCalls, 2);
});

test('native parameter schemas produce form data, reject unsupported secret types and surface permission failures', async () => {
  handler = (url, init) => init.method === 'POST' ? response('', 201) : response({ property: [{ parameterDefinitions: parameters }] });
  const client = new app.JenkinsClient('https://ci.example', 'alice', 'token', ['team/build']);
  await client.dispatchWorkflow('', '', 'team/build', { ref: 'unrelated', inputs: { SCENARIO: 'failure', BRANCH: 'topic/a&b', injected: 'no' } });
  assert.equal(calls.at(-1).url.pathname, '/job/team/job/build/buildWithParameters');
  const body = new URLSearchParams(calls.at(-1).body);
  assert.equal(body.get('BRANCH'), 'topic/a&b'); assert.equal(body.has('injected'), false); assert.equal(body.has('ref'), false);
  handler = () => response({ property: [{ parameterDefinitions: [{ name: 'PASSWORD', type: 'PasswordParameterDefinition' }] }] });
  await assert.rejects(client.getWorkflowInputs('', '', 'team/build'), /PASSWORD/);
  handler = () => response('forbidden', 403);
  await assert.rejects(client.cancelWorkflowRun('', '', 123), /构建|build/i);
  await assert.rejects(client.getWorkflows('', ''), error => error.status === 403);
});

test('console notes split across progressive responses stay hidden without changing the server byte offset', async () => {
  const escape = String.fromCharCode(27);
  const note = `${escape}[8mha:encoded-console-note${escape}[0m`;
  const chunks = [`中文\n${note.slice(0, 12)}`, `${note.slice(12)}${escape}[32mFinished: SUCCESS${escape}[0m\n`];
  let index = 0, offset = 0;
  handler = url => {
    if (url.pathname.includes('/queue/')) return response({ items: [] });
    if (url.pathname.endsWith('progressiveText')) {
      assert.equal(Number(url.searchParams.get('start')), offset);
      const chunk = chunks[index++]; offset += Buffer.byteLength(chunk);
      return response(chunk, 200, { 'x-text-size': String(offset), ...(index === 1 ? { 'x-more-data': 'true' } : {}) });
    }
    return response({ builds: [rawBuild()] });
  };
  const client = new app.JenkinsClient('https://ci.example', 'alice', 'token', ['build']);
  const [run] = await client.getWorkflowRuns('', '');
  assert.equal((await client.getJobLogs('', '', run.id)).rawLogs, '中文\n');
  assert.equal((await client.getJobLogs('', '', run.id)).rawLogs, '中文\nFinished: SUCCESS\n');
  assert.equal((await client.getJobLogs('', '', run.id)).rawLogs, '中文\nFinished: SUCCESS\n');
});

test('CI connection persistence is secret-free, repository scoped, and never replaces the hosting channel', async () => {
  handler = url => url.pathname.includes('whoAmI') ? response({ authenticated: true, name: 'alice' }) : response({ name: 'build', buildable: true });
  app.bindCollaborationClient({ ciCd: { getWorkflows: async () => [{ id: 'github-actions' }] } });
  const connection = await app.useCiStore.getState().connect({ providerId: 'jenkins', displayName: 'Local CI', baseUrl: 'https://ci.example', username: 'alice', token: 'secret-pat', repoPath: '/repo-a', jobPaths: ['build'] });
  const persisted = saved.get('auu_git_ci_connections');
  assert(!persisted.includes('secret-pat')); assert(!persisted.includes('apiToken'));
  assert.equal(app.useCiStore.getState().bindings['/repo-a'][0].connectionId, connection.id);
  assert.equal(app.useCiStore.getState().bindings['/repo-b'], undefined);
  assert.equal((await app.collaborationService.getWorkflows('owner', 'repo'))[0].id, 'github-actions');
  const channel = await app.createCiChannel(connection, ['build']);
  assert.equal(channel.has('getWorkflows'), true);
  assert.equal(channel.has('getWorkflowYaml'), false);
  assert.equal(channel.has('getCommitChecks'), false);
  await assert.rejects(async () => channel.client.getWorkflowYaml('', '', 'Jenkinsfile'), /能力|操作|capability/i);
  app.useCiStore.getState().updateConnection(connection.id, false);
  await assert.rejects(async () => channel.client.getWorkflows('', ''), /能力|操作|capability/i);
});

test('domain gateway checks the declaration even when a client has an implementation, and rejects disabled plugins', async () => {
  handler = url => url.pathname.includes('whoAmI') ? response({ authenticated: true, name: 'alice' }) : response({ name: 'build' });
  const connection = await app.useCiStore.getState().connect({ providerId: 'jenkins', displayName: 'Local', baseUrl: 'https://ci.example', username: 'alice', token: 'secret', repoPath: '/repo', jobPaths: ['build'] });
  const channel = await app.createCiChannel(connection, ['build']);
  const contribution = app.JENKINS_PROVIDER.domains[0], original = contribution.capabilities;
  try {
    contribution.capabilities = original.filter(item => item !== 'ci-cd:list-pipelines');
    assert.equal(channel.has('getWorkflows'), false);
    await assert.rejects(async () => channel.client.getWorkflows('', ''), /能力|操作|capability/i);
  } finally { contribution.capabilities = original; }
  app.setPluginEnabled('jenkins', false);
  assert.equal(channel.has('dispatchWorkflow'), false);
  await assert.rejects(async () => channel.client.dispatchWorkflow('', '', 'build', { ref: '' }), /能力|操作|capability/i);
});
