/** Real hidden WebView -> IPC -> local GitLab fixture -> native keyring; no production profile. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { composePlugins, checkPluginComposition } from './plugin-composition.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
assert.equal(process.platform, 'win32', 'Native WebView acceptance currently runs on Windows');
checkPluginComposition();
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'auugit-integration-smoke-'));
const token = `synthetic-${randomUUID()}`, profile = `native-smoke-${randomUUID()}`, writes = [];
let server, built = false, environment, success = false;
const reportPath = path.join(root, 'test-results/integration-smoke.json');
const helper = path.join(root, 'src-tauri/target/debug/examples/integration_smoke.exe');
const run = (program, args, env, timeout) => new Promise((resolve, reject) => {
  const child = spawn(program, args, { cwd: root, windowsHide: true, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', data => { output += data; }); child.stderr.on('data', data => { output += data; });
  const timer = setTimeout(() => { child.kill(); reject(Error('Native integration acceptance timed out')); }, timeout);
  child.on('error', error => { clearTimeout(timer); reject(error); });
  child.on('close', code => { clearTimeout(timer); code === 0 ? resolve(output) : reject(Error(`Native helper failed (${code}): ${output.slice(-2000)}`)); });
});
try {
  const stamp = '2026-11-02T00:00:00Z', person = { id: 1, username: 'smoke-user', name: 'Native smoke', avatar_url: '' };
  const project = { id: 42, name: 'Smoke project', path: 'project', path_with_namespace: 'group/sub/project', default_branch: 'main' };
  const mr = { id: 7, iid: 7, title: 'Native MR', state: 'opened', source_branch: 'topic', target_branch: 'main', author: person, sha: 'a'.repeat(40), created_at: stamp, updated_at: stamp,
    diff_refs: { base_sha: 'b'.repeat(40), head_sha: 'a'.repeat(40), start_sha: 'c'.repeat(40) } };
  const pipeline = { id: 10, iid: 2, status: 'running', sha: 'a'.repeat(40), ref: 'topic', created_at: stamp, updated_at: stamp, user: person };
  const job = { id: 20, name: 'Native job', status: 'running', pipeline: { id: 10 } };
  server = http.createServer(async (request, response) => {
    const chunks = []; for await (const chunk of request) chunks.push(chunk);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {};
    const route = new URL(request.url, 'http://localhost').pathname.replace('/gitlab', '').replace('/api/v4/projects/group%2Fsub%2Fproject', '');
    const json = (value, status = 200) => { response.writeHead(status, { 'content-type': 'application/json' }); response.end(JSON.stringify(value)); };
    if (route === '/redirect') { response.writeHead(302, { location: 'http://127.0.0.1:1/credential-sink' }); response.end(); return; }
    if (route === '/slow') return;
    if (request.headers['private-token'] !== token) { json({ message: 'Unauthorized' }, 401); return; }
    if (request.method !== 'GET') writes.push({ route, body });
    if (route === '/large') { response.writeHead(200, { 'content-type': 'application/octet-stream' }); response.end(Buffer.alloc(33 * 1024 * 1024)); return; }
    if (route === '/api/v4/user') { json(person); return; }
    if (!route) { json(project); return; }
    if (route === '/issues/12') { json(body.title === 'forbidden' ? { message: 'Forbidden' } : { id: 12, iid: 12, title: 'Native task', state: 'opened', author: person, created_at: stamp, updated_at: stamp }, body.title === 'forbidden' ? 403 : 200); return; }
    if (route === '/issues/12/notes') { json({ id: 1, body: body.body, author: person }); return; }
    if (route === '/merge_requests') { json(request.method === 'POST' ? mr : [mr]); return; }
    if (route === '/merge_requests/7') { json(mr); return; }
    if (route === '/merge_requests/7/diffs') { json([{ old_path: 'a.ts', new_path: 'a.ts', diff: '@@ -1 +1 @@\n-old\n+new' }]); return; }
    if (route === '/merge_requests/7/notes') { json({ id: 1 }); return; }
    if (route === '/merge_requests/7/approve') { json({ approved: true }); return; }
    if (route === '/merge_requests/7/merge') { json({ ...mr, state: 'merged' }); return; }
    if (route === '/pipelines') { json([pipeline]); return; }
    if (route === '/pipelines/10' || route === '/pipeline' || route === '/pipelines/10/retry' || route === '/pipelines/10/cancel') { json(pipeline); return; }
    if (route === '/pipelines/10/jobs') { json([job]); return; }
    if (route === '/jobs/20') { json(job); return; }
    if (route === '/jobs/20/trace') { response.end('native live trace'); return; }
    if (route.includes('/repository/files/')) { response.end('spec:\n  inputs:\n    dry_run:\n      type: boolean\n      default: false\n---\ntest:\n  script: echo test\n'); return; }
    json({ message: `Unexpected fixture route: ${route}` }, 404);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const endpoint = `http://127.0.0.1:${server.address().port}/gitlab`, composition = composePlugins('gitlab');
  const isolation = `const fixtureValues = new Map(); Object.defineProperty(window, 'localStorage', { value: { getItem: key => fixtureValues.get(key) ?? null, setItem: (key, value) => fixtureValues.set(key, String(value)), removeItem: key => fixtureValues.delete(key) } });\n`;
  const result = await build({ entryPoints: [path.join(root, 'scripts/integration-smoke-entry.ts')], outfile: path.join(temporary, 'smoke.js'), bundle: true, platform: 'browser', format: 'iife', banner: { js: isolation },
    alias: { '@': path.join(root, 'src') }, metafile: true, logLevel: 'silent', plugins: [{ name: 'smoke-gitlab-only', setup(builder) {
      builder.onLoad({ filter: /src[\\/]plugins[\\/]index\.ts$/ }, () => ({ contents: composition.data, loader: 'ts' }));
      builder.onLoad({ filter: /src[\\/]plugins[\\/]ui\.ts$/ }, () => ({ contents: composition.ui, loader: 'ts' }));
    } }] });
  assert.ok(Object.keys(result.metafile.inputs).every(file => !/plugins[\\/](github|gitea|sentry)[\\/]/.test(file)));
  const assets = path.join(temporary, 'assets'); await fs.mkdir(assets); await fs.writeFile(path.join(assets, 'index.html'), '<!doctype html><html><body>Native integration acceptance</body></html>');
  environment = { TAURI_CONFIG: JSON.stringify({ identifier: 'com.auu.gitclient.integration-smoke', productName: 'AuuGit Integration Smoke', build: { devUrl: null, frontendDist: assets }, app: { windows: [] } }),
    AUUGIT_INTEGRATION_SMOKE_ROOT: temporary, AUUGIT_INTEGRATION_SMOKE_CONFIG: JSON.stringify({ server: endpoint, token, profile }) };
  process.stdout.write('Building isolated native integration helper...\n');
  await run('cargo', ['build', '--locked', '--manifest-path', 'src-tauri/Cargo.toml', '--no-default-features', '--example', 'integration_smoke'], environment, 300_000); built = true;
  await run(helper, [], environment, 75_000);
  const report = JSON.parse(await fs.readFile(path.join(temporary, 'result.json'), 'utf8')); assert.equal(report.success, true, report.error);
  assert.ok(writes.some(write => write.route === '/pipeline' && write.body.inputs.dry_run === false));
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, JSON.stringify({ ...report, platform: process.platform, realGitLabServer: false, transport: 'real-WebView-IPC', credentials: 'real-keyring-isolated-slot' }, null, 2));
  process.stdout.write(`${report.checks.length} native integration checks passed.\n`); success = true;
} catch (error) {
  const native = await fs.readFile(path.join(temporary, 'result.json'), 'utf8').then(JSON.parse).catch(() => null);
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, JSON.stringify({ success: false, error: native?.error || error.message }, null, 2));
  throw new Error(native?.error || error.message, { cause: error });
} finally {
  if (built) await run(helper, ['--cleanup'], environment, 15_000);
  if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  if (path.dirname(temporary) === os.tmpdir() && path.basename(temporary).startsWith('auugit-integration-smoke-')) await fs.rm(temporary, { recursive: true, force: true });
  if (!success) process.exitCode = 1;
}
