import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { build } from 'esbuild';

const root = process.cwd(), originalFetch = globalThis.fetch;
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
let app, tmp;

before(async () => {
  tmp = await fs.mkdtemp(path.join(root, '.test-tmp-oauth-'));
  const bundle = path.join(tmp, 'oauth.cjs');
  await build({
    stdin: {
      contents: `export { gitHubOAuthService } from './src/services/github/GitHubOAuthService'; export { githubService } from './src/services/github/GitHubService'; export * from './src/services/git/remoteIdentity';`,
      resolveDir: root,
    },
    bundle: true, platform: 'node', format: 'cjs', outfile: bundle, alias: { '@': path.join(root, 'src') }, logLevel: 'silent',
  });
  app = createRequire(import.meta.url)(bundle);
});

after(async () => {
  globalThis.fetch = originalFetch; delete globalThis.window;
  if (tmp && path.dirname(tmp) === root && path.basename(tmp).startsWith('.test-tmp-oauth-')) await fs.rm(tmp, { recursive: true, force: true, maxRetries: 5 });
});

const tokenJson = payload => new Response(JSON.stringify(payload), { headers: { 'Content-Type': 'application/json' } });
/** Yield to the event loop so the polling loop can settle after a mocked timer fires. */
const waitTurn = async () => { for (let i = 0; i < 10; i++) await new Promise(resolve => setImmediate(resolve)); };

test('device token polling keeps retrying through transient failures and returns the token', async context => {
  context.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const attempts = [];
  globalThis.fetch = async () => {
    attempts.push(1);
    if (attempts.length === 1) throw new TypeError('fetch failed'); // DNS blip: fetch rejects
    if (attempts.length === 2) return new Response('<html>gateway restarting</html>', { status: 502 }); // non-2xx without OAuth payload
    if (attempts.length === 3) return tokenJson({ error: 'authorization_pending' });
    return tokenJson({ access_token: 'gho_token', token_type: 'bearer' });
  };
  try {
    const pending = app.gitHubOAuthService.pollForToken('device-code', 5, 600);
    context.mock.timers.tick(5000); await waitTurn();
    assert.equal(attempts.length, 1);
    context.mock.timers.tick(5000); await waitTurn();
    assert.equal(attempts.length, 2);
    context.mock.timers.tick(5000); await waitTurn();
    assert.equal(attempts.length, 3);
    context.mock.timers.tick(5000); await waitTurn();
    assert.equal(attempts.length, 4);
    assert.equal(await pending, 'gho_token');
  } finally { globalThis.fetch = originalFetch; }
});

test('slow_down responses extend the polling interval instead of failing the flow', async context => {
  context.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const attempts = [];
  globalThis.fetch = async () => {
    attempts.push(1);
    return attempts.length === 1 ? tokenJson({ error: 'slow_down' }) : tokenJson({ access_token: 'gho_slow' });
  };
  try {
    const pending = app.gitHubOAuthService.pollForToken('device-code', 5, 600);
    context.mock.timers.tick(5000); await waitTurn();
    assert.equal(attempts.length, 1);
    context.mock.timers.tick(5000); await waitTurn();
    assert.equal(attempts.length, 1, 'the interval was extended by slow_down, so no second attempt fires yet');
    context.mock.timers.tick(5000); await waitTurn();
    assert.equal(attempts.length, 2);
    assert.equal(await pending, 'gho_slow');
  } finally { globalThis.fetch = originalFetch; }
});

test('terminal device flow errors stop polling immediately', async context => {
  context.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  try {
    for (const [error, pattern] of [
      ['access_denied', /拒绝|denied/i],
      ['expired_token', /过期|expired/i],
      ['unsupported_response_type', /unsupported_response_type/],
      ['device_flow_disabled', /device_flow_disabled/],
    ]) {
      let calls = 0;
      globalThis.fetch = async () => { calls++; return tokenJson({ error, error_description: `terminal: ${error}` }); };
      const pending = app.gitHubOAuthService.pollForToken('device-code', 5, 600);
      const expectation = assert.rejects(pending, pattern);
      context.mock.timers.tick(5000); await waitTurn();
      await expectation;
      assert.equal(calls, 1, `${error} must not be retried`);
    }
  } finally { globalThis.fetch = originalFetch; }
});

test('polling gives up only at expiry after transient failures and reports the last failure', async context => {
  context.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new TypeError('fetch failed'); };
  try {
    const pending = app.gitHubOAuthService.pollForToken('device-code', 5, 11);
    const expectation = assert.rejects(pending, error => /已超时|timed out/i.test(error.message) && error.message.includes('fetch failed'));
    context.mock.timers.tick(5000); await waitTurn();
    context.mock.timers.tick(5000); await waitTurn();
    context.mock.timers.tick(5000); await waitTurn();
    await expectation;
    assert.equal(calls, 3, 'polling continues at 5s steps until the 11s deadline has passed');
  } finally { globalThis.fetch = originalFetch; }
});

test('Tauri polling recovers from transient bridge failures and returns the token', async context => {
  context.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const replies = [
    () => { throw new Error('error sending request'); },
    () => { throw new Error('HTTP 502: Bad Gateway'); },
    () => JSON.stringify({ error: 'authorization_pending' }),
    () => JSON.stringify({ access_token: 'gho_native' }),
  ];
  let index = -1;
  globalThis.window = { __TAURI_INTERNALS__: { invoke: async () => { index++; return replies[index](); } } };
  try {
    const pending = app.gitHubOAuthService.pollForToken('device-code', 5, 600);
    for (let i = 0; i < 4; i++) { context.mock.timers.tick(5000); await waitTurn(); }
    assert.equal(await pending, 'gho_native');
    assert.equal(index, 3);
  } finally { delete globalThis.window; }
});

test('Tauri polling stops immediately when the bridge flattens a terminal OAuth error into its HTTP text', async context => {
  context.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  let calls = 0;
  globalThis.window = {
    __TAURI_INTERNALS__: {
      invoke: async () => {
        calls++;
        throw new Error('HTTP 403: {"error":"access_denied","error_description":"Authorization was denied by the owner"}');
      },
    },
  };
  try {
    const pending = app.gitHubOAuthService.pollForToken('device-code', 5, 600);
    const expectation = assert.rejects(pending, /denied by the owner|拒绝/);
    context.mock.timers.tick(5000); await waitTurn();
    await expectation;
    assert.equal(calls, 1);
  } finally { delete globalThis.window; }
});

test('polling remains cancellable through the AbortSignal', async context => {
  context.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  globalThis.fetch = async () => { assert.fail('must not reach the network after cancellation'); };
  try {
    const controller = new AbortController();
    const pending = app.gitHubOAuthService.pollForToken('device-code', 5, 600, { signal: controller.signal });
    const expectation = assert.rejects(pending, { name: 'AbortError' });
    controller.abort();
    await expectation;
  } finally { globalThis.fetch = originalFetch; }
});

test('every GitHub API request carries a 20s timeout signal', async () => {
  const captured = [];
  globalThis.fetch = async (url, init) => {
    const target = String(url);
    captured.push({ url: target, signal: init?.signal });
    if (target.endsWith('/user')) return new Response(JSON.stringify({ login: 'octocat' }));
    if (target.includes('/logs')) return new Response('log line');
    if (target.endsWith('/merge')) return new Response(JSON.stringify({ merged: true, message: 'Merged' }));
    if (target.includes('/pulls?')) return new Response(JSON.stringify([{ id: 1 }]));
    if (target.endsWith('/cancel') || target.endsWith('/rerun') || target.endsWith('/dispatches')) return new Response(null, { status: 204 });
    if (target.includes('/pulls')) return new Response(JSON.stringify({ id: 1, number: 1, state: 'open' }));
    return new Response(JSON.stringify({ id: 1, default_branch: 'main' }));
  };
  try {
    await app.githubService.verifyToken('tok');
    await app.githubService.getRepository('o', 'r');
    await app.githubService.getPullRequests('o', 'r', 'all');
    await app.githubService.createPullRequest('o', 'r', { title: 't', head: 'h', base: 'b' });
    await app.githubService.mergePullRequest('o', 'r', 1);
    await app.githubService.updatePullRequestState('o', 'r', 1, 'closed');
    await app.githubService.dispatchWorkflow('o', 'r', 1, { ref: 'main' });
    await app.githubService.rerunWorkflow('o', 'r', 1);
    await app.githubService.cancelWorkflowRun('o', 'r', 1);
    await app.githubService.getJobLogs('o', 'r', 1);
    assert.equal(captured.length, 10);
    for (const entry of captured) {
      assert.ok(entry.signal instanceof AbortSignal, `timeout signal missing on ${entry.url}`);
      assert.equal(entry.signal.aborted, false);
    }
  } finally { globalThis.fetch = originalFetch; }
});

test('pagination stops at the page cap and callers may adjust it', async () => {
  const fetched = [];
  globalThis.fetch = async (url) => {
    fetched.push(String(url));
    const page = fetched.length;
    return new Response(JSON.stringify([{ n: page }]), { headers: { link: `<https://api.github.com/repos/o/r/pulls?state=all&per_page=100&page=${page + 1}>; rel="next"` } });
  };
  try {
    const adjusted = await app.githubService.getPullRequests('o', 'r', 'all', 3);
    assert.equal(fetched.length, 3);
    assert.equal(adjusted.length, 3);
    fetched.length = 0;
    const limited = await app.githubService.getPullRequests('o', 'r', 'all');
    assert.equal(fetched.length, 10);
    assert.equal(limited.length, 10);
  } finally { globalThis.fetch = originalFetch; }
});

test('remote identity recognizes https, ssh, git protocol and scp-style GitHub URLs', () => {
  const cases = [
    ['https://github.com/owner/repo.git', 'owner', 'repo'],
    ['https://github.com/owner/repo', 'owner', 'repo'],
    ['https://github.com/owner/repo/', 'owner', 'repo'],
    ['git@github.com:owner/repo.git', 'owner', 'repo'],
    ['git@github.com:owner/repo', 'owner', 'repo'],
    ['git://github.com/owner/repo.git', 'owner', 'repo'],
    ['git://github.com/owner/repo', 'owner', 'repo'],
    ['github.com:owner/repo.git', 'owner', 'repo'],
    ['github.com:owner/repo', 'owner', 'repo'],
    ['ssh://git@github.com/owner/repo.git', 'owner', 'repo'],
    ['ssh://github.com/owner/repo', 'owner', 'repo'],
    ['https://github.com/Owner_Name/Repo.Name.git', 'Owner_Name', 'Repo.Name'],
  ];
  for (const [url, owner, repo] of cases) assert.deepEqual(app.parseGitHubRemote(url), { owner, repo }, url);
  for (const url of [
    'https://gitlab.com/owner/repo.git',
    'https://github.com.evil.invalid/owner/repo',
    'https://user@github.com/owner/repo',
    'git@github.com:owner/extra/repo',
    'https://github.com/owner',
    'git@github.com/owner/repo',
    'not a remote',
    '',
  ]) assert.equal(app.parseGitHubRemote(url), undefined, url);
});
