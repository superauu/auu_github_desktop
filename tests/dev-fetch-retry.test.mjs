import { test } from 'node:test';
import assert from 'node:assert/strict';
import { retryDevFetch } from './dev-fetch-retry.mjs';

const failure = code => new TypeError('fetch failed', { cause: Object.assign(new Error(code), { code }) });

test('an ambiguous POST disconnection never executes a Git write twice', async () => {
  let writes = 0;
  const fetch = retryDevFetch(async () => { writes++; throw failure('UND_ERR_SOCKET'); }, { backoffMs: 0 });
  await assert.rejects(fetch('http://localhost/api/git', { method: 'POST' }), /fetch failed/);
  assert.equal(writes, 1);
});

test('a rejected connection may retry a POST because no request was accepted', async () => {
  let connections = 0, writes = 0;
  const fetch = retryDevFetch(async () => { if (++connections === 1) throw failure('ECONNREFUSED'); writes++; return 'ok'; }, { backoffMs: 0 });
  assert.equal(await fetch('http://localhost/api/git', { method: 'POST' }), 'ok');
  assert.equal(connections, 2); assert.equal(writes, 1);
});

test('read requests can recover from a reset response', async () => {
  let reads = 0;
  const fetch = retryDevFetch(async () => { if (++reads === 1) throw failure('ECONNRESET'); return 'ok'; }, { backoffMs: 0 });
  assert.equal(await fetch('http://localhost/api/fs/list-dirs'), 'ok'); assert.equal(reads, 2);
});

test('Git reads transported as POST can retry but commit messages cannot impersonate a read command', async () => {
  for (const [args, expected] of [[['-c', 'core.quotepath=false', '--literal-pathspecs', 'status', '--porcelain=v2'], 2], [['commit', '-m', 'status'], 1]]) {
    let calls = 0;
    const fetch = retryDevFetch(async () => { if (++calls === 1) throw failure('UND_ERR_SOCKET'); return 'ok'; }, { backoffMs: 0 });
    const operation = fetch('/api/git', { method: 'POST', body: JSON.stringify({ args }) });
    if (expected === 2) assert.equal(await operation, 'ok'); else await assert.rejects(operation, /fetch failed/);
    assert.equal(calls, expected);
  }
});

test('aggregate failures must all precede connection before retrying a POST', async () => {
  let calls = 0;
  const error = new TypeError('fetch failed', { cause: new AggregateError([failure('ECONNREFUSED'), failure('ECONNRESET')]) });
  const fetch = retryDevFetch(async () => { calls++; throw error; }, { backoffMs: 0 });
  await assert.rejects(fetch(new Request('http://localhost/api/git', { method: 'POST' })), /fetch failed/);
  assert.equal(calls, 1);
});

test('cancellation is respected for a Request signal as well as init.signal', async () => {
  let calls = 0; const controller = new AbortController(); controller.abort();
  const fetch = retryDevFetch(async () => { calls++; throw failure('ECONNREFUSED'); }, { backoffMs: 0 });
  await assert.rejects(fetch(new Request('http://localhost/api/git', { method: 'POST', signal: controller.signal })), /fetch failed/);
  assert.equal(calls, 1);
});
