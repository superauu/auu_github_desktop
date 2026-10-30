/** Real Windows updater -> signature verification -> silent NSIS installation.
 * Uses a separate product identity and a temporary directory, then uninstalls it.
 * Never reads production signing keys or installs over the user's AuuGit.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tauri = path.join(project, 'node_modules/@tauri-apps/cli/tauri.js');
const release = path.join(project, 'src-tauri/target/release');
const executable = path.join(release, 'auugit.exe');
const renamed = path.join(release, 'auugit-quality-smoke.exe');
const reportPath = path.join(project, 'test-results/updater-smoke.json');
const { version } = JSON.parse(await fs.readFile(path.join(project, 'package.json'), 'utf8'));
const parts = version.split('.').map(Number);
const fromVersion = parts[2] > 0 ? `${parts[0]}.${parts[1]}.${parts[2] - 1}` : '0.0.0';
assert.notEqual(version, fromVersion, 'the smoke test needs a lower source version');
assert.equal(process.platform, 'win32', 'This installation smoke test is Windows-only');
await fs.access(executable);
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'auugit-updater-smoke-'));
const installed = path.join(temporary, 'installed');
await fs.mkdir(installed);
const logs = [];
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const run = (program, args, env = {}) => new Promise((resolve, reject) => {
  const child = spawn(program, args, { cwd: project, windowsHide: true, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', data => { output += data; });
  child.stderr.on('data', data => { output += data; });
  const timer = setTimeout(() => { child.kill(); reject(new Error(`${path.basename(program)} smoke step timed out`)); }, 300_000);
  child.on('error', reject);
  child.on('close', code => { clearTimeout(timer); if (!args.includes('generate')) logs.push(output); code === 0 ? resolve(output) : reject(new Error(`${path.basename(program)} failed (${code}): ${output.slice(-4000)}`)); });
});
const cli = args => run(process.execPath, [tauri, ...args]);
const readJSON = async filename => JSON.parse(await fs.readFile(filename, 'utf8'));
let server, installer, completed = false, renamedCreated = false;
const report = { platform: process.platform, fromVersion, version, stages: [], success: false };
try {
  console.log('Preparing an isolated installer and ephemeral signing key...');
  await fs.copyFile(executable, renamed, fs.constants.COPYFILE_EXCL);
  renamedCreated = true;
  const bundleConfig = path.join(temporary, 'bundle.json');
  await fs.writeFile(bundleConfig, JSON.stringify({
    productName: 'AuuGit Quality Smoke', mainBinaryName: 'auugit-quality-smoke', identifier: 'com.auu.gitclient.quality-smoke',
    bundle: { createUpdaterArtifacts: false, windows: { webviewInstallMode: { type: 'skip' }, nsis: { installMode: 'currentUser', startMenuFolder: 'AuuGit Quality Smoke' } } },
  }));
  await cli(['bundle', '--ci', '--no-sign', '--no-binary-patching', '--bundles', 'nsis', '--config', bundleConfig]);
  const nsis = path.join(release, 'bundle/nsis');
  const names = await fs.readdir(nsis);
  const installerName = names.find(name => name.startsWith('AuuGit Quality Smoke_') && name.endsWith('-setup.exe'));
  assert.ok(installerName, 'isolated NSIS installer');
  installer = path.join(nsis, installerName);
  const key = path.join(temporary, 'signing.key');
  await cli(['signer', 'generate', '--ci', '--write-keys', key]);
  await run(process.execPath, [tauri, 'signer', 'sign', '--private-key-path', key, '--app-version', version, installer], { TAURI_SIGNING_PRIVATE_KEY_PASSWORD: '' });
  const pubkey = (await fs.readFile(key + '.pub', 'utf8')).trim();
  const signature = (await fs.readFile(installer + '.sig', 'utf8')).trim();
  const valid = await fs.readFile(installer), tampered = Buffer.from(valid);
  tampered[tampered.length - 1] ^= 1;
  let corrupt = true;
  server = http.createServer((request, response) => {
    if (request.url === '/latest.json') {
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({ version, platforms: { 'windows-x86_64': { signature, url: `http://127.0.0.1:${server.address().port}/update.exe` } } }));
    } else if (request.url === '/update.exe') {
      const bytes = corrupt ? tampered : valid;
      response.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': bytes.length }); response.end(bytes);
    } else { response.writeHead(404); response.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const config = JSON.stringify({ version: fromVersion, productName: 'AuuGit Quality Smoke', identifier: 'com.auu.gitclient.quality-smoke',
    app: { windows: [] },
    plugins: { updater: { pubkey, endpoints: [`http://127.0.0.1:${server.address().port}/latest.json`], dangerousInsecureTransportProtocol: true, windows: { installMode: 'quiet' } } },
  });
  const environment = { TAURI_CONFIG: config, AUUGIT_UPDATER_SMOKE_ROOT: temporary, AUUGIT_UPDATER_SMOKE_VERSION: version };
  console.log('Building the headless native updater helper...');
  await run('cargo', ['build', '--locked', '--manifest-path', 'src-tauri/Cargo.toml', '--example', 'updater_smoke'], environment);
  const helper = path.join(project, 'src-tauri/target/debug/examples/updater_smoke.exe');
  console.log('Checking that a corrupted package is rejected...');
  await run(helper, [], { ...environment, AUUGIT_UPDATER_SMOKE_REJECT: '1' });
  const rejected = await readJSON(path.join(temporary, 'tampered-result.json'));
  assert.equal(rejected.stage, 'signature-rejected'); report.stages.push(rejected.stage);
  // The updater compares the older helper context against the current signed
  // package. This marker makes replacement by the real installer observable.
  await fs.writeFile(path.join(installed, 'auugit-quality-smoke.exe'), 'old installation marker');
  corrupt = false;
  console.log('Downloading, verifying and installing the signed update...');
  await run(helper, [], environment);
  const outcome = await readJSON(path.join(temporary, 'install-result.json'));
  assert.equal(outcome.stage, 'verified-install-requested'); report.stages.push(outcome.stage);
  const expected = digest(await fs.readFile(executable));
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    try { if (digest(await fs.readFile(path.join(installed, 'auugit-quality-smoke.exe'))) === expected) { completed = true; break; } } catch { /* NSIS is replacing the file. */ }
    await pause(250);
  }
  assert.ok(completed, 'NSIS replaced the isolated installation with the exact production EXE');
  report.stages.push('installed-production-executable'); report.success = true;
  console.log('PASS: discovery, corrupted-signature rejection, verified download and real NSIS installation.');
} finally {
  // The installer owns only this identity and this temporary install directory.
  const uninstaller = path.join(installed, 'uninstall.exe');
  try { await fs.access(uninstaller); await run(uninstaller, ['/S']); await pause(2000); report.stages.push('uninstalled-smoke-product'); } catch (error) { if (error.code !== 'ENOENT') report.cleanupError = error.message; }
  await new Promise(resolve => server ? server.close(resolve) : resolve());
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
  await fs.writeFile(path.join(path.dirname(reportPath), 'updater-smoke.log'), logs.join('\n'));
  if (renamedCreated) await fs.rm(renamed, { force: true });
  const resolved = path.resolve(temporary);
  assert.equal(path.dirname(resolved), path.resolve(os.tmpdir()));
  assert.ok(path.basename(resolved).startsWith('auugit-updater-smoke-'));
  if (!report.cleanupError) await fs.rm(resolved, { recursive: true, force: true, maxRetries: 5 });
  console.log(`Smoke report: ${reportPath}`);
}
assert.ok(!report.cleanupError, `smoke product cleanup failed: ${report.cleanupError}`);
