import { before, after, afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { build } from 'esbuild';

const root = process.cwd(), originalFetch = globalThis.fetch, originalWindow = globalThis.window;
let temporary, api;
before(async () => {
  temporary = await fs.mkdtemp(path.join(root, '.test-tmp-provider-http-'));
  const file = path.join(temporary, 'transport.cjs');
  await build({ stdin: { contents: `export * from './src/services/http/providerHttp';`, resolveDir: root }, outfile: file, bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent' });
  api = createRequire(import.meta.url)(file);
});
afterEach(() => { globalThis.fetch = originalFetch; if (originalWindow === undefined) delete globalThis.window; else globalThis.window = originalWindow; });
after(async () => { if (temporary && path.dirname(temporary) === root && path.basename(temporary).startsWith('.test-tmp-provider-http-')) await fs.rm(temporary, { recursive: true, force: true }); });
const listen = async handler => { const server = createServer(handler); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); return { server, url: `http://127.0.0.1:${server.address().port}` }; };
const close = server => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });

test('browser redirects never forward private tokens to a different origin', async () => {
  let leaked = 0;
  const destination = await listen((_req, res) => { leaked++; res.end('unexpected'); });
  const source = await listen((req, res) => { assert.equal(req.headers['private-token'], 'synthetic-token'); res.writeHead(302, { location: destination.url }); res.end(); });
  try { assert.equal((await api.providerHttpRequest('GET', source.url, { 'PRIVATE-TOKEN': 'synthetic-token' })).status, 302); assert.equal(leaked, 0); }
  finally { await Promise.all([close(source.server), close(destination.server)]); }
});
test('invalid credential-bearing URLs fail before any transport', async () => {
  globalThis.fetch = async () => assert.fail('Must not send credentials');
  await assert.rejects(api.providerHttpRequest('GET', 'https://user:secret@example.com', {}), /Invalid provider URL/);
});
test('oversized declared and streamed bodies are rejected', async () => {
  let declaredCancelled = false;
  globalThis.fetch = async () => new Response(new ReadableStream({ cancel() { declaredCancelled = true; } }), { headers: { 'content-length': String(33 * 1024 * 1024) } });
  await assert.rejects(api.providerHttpRequest('GET', 'https://example.com', {}), /too large/);
  assert.equal(declaredCancelled, true);
  let cancelled = false;
  globalThis.fetch = async () => new Response(new ReadableStream({ pull(controller) { controller.enqueue(new Uint8Array(32 * 1024 * 1024 + 1)); }, cancel() { cancelled = true; } }));
  await assert.rejects(api.providerHttpRequest('GET', 'https://example.com', {}), /too large/); assert.equal(cancelled, true);
});

test('browser providerFetch honors cancellation before making a request', async () => {
  globalThis.fetch = async () => assert.fail('Already cancelled');
  await assert.rejects(api.providerFetch('https://example.com', { signal: AbortSignal.abort() }), error => error.name === 'AbortError');
});
test('abort reaches native IPC immediately and late native completions stay ignored', async () => {
  const calls = []; let finish;
  globalThis.window = { __TAURI_INTERNALS__: { invoke: async (command, args) => {
    calls.push({ command, args });
    if (command === 'provider_http_request') return new Promise(resolve => { finish = resolve; });
    return null;
  } } };
  const controller = new AbortController();
  const pending = api.providerHttpRequest('GET', 'https://example.com', {}, undefined, { signal: controller.signal });
  while (!finish) await new Promise(setImmediate);
  controller.abort(); await assert.rejects(pending, error => error.name === 'AbortError');
  assert.equal(calls[1].command, 'cancel_provider_http_request');
  assert.equal(calls[1].args.id, calls[0].args.request.id);
  finish({ status: 200, headers: {}, body: 'late' }); await new Promise(setImmediate);
});
test('pre-aborted requests never enter native IPC', async () => {
  globalThis.window = { __TAURI_INTERNALS__: { invoke: async () => assert.fail('Already cancelled') } };
  await assert.rejects(api.providerHttpRequest('GET', 'https://example.com', {}, undefined, { signal: AbortSignal.abort() }), error => error.name === 'AbortError');
});
test('native timeouts also send cancellation', async () => {
  const calls = [];
  globalThis.window = { __TAURI_INTERNALS__: { invoke: async command => { calls.push(command); if (command === 'provider_http_request') return new Promise(() => {}); } } };
  const keepAlive = setTimeout(() => {}, 100);
  try { await assert.rejects(api.providerHttpRequest('GET', 'https://example.com', {}, undefined, { timeoutMs: 5 }), error => error.name === 'TimeoutError'); assert.ok(calls.includes('cancel_provider_http_request')); }
  finally { clearTimeout(keepAlive); }
});
