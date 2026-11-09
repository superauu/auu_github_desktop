import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const fixtureDir = dirname(fileURLToPath(import.meta.url));
const root = resolve(fixtureDir, '../..');
const localDir = resolve(root, '.local/jenkins');
const connectionPath = resolve(localDir, 'connection.json');
const composeFile = resolve(fixtureDir, 'compose.yaml');
const baseUrl = 'http://localhost:8080/';
const jobPath = 'job/auugit-mock/';

function docker(...args) {
  const result = spawnSync('docker', args, { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`docker exited with ${result.status}`);
}

function connection() {
  if (!existsSync(connectionPath)) throw new Error('Local Jenkins is not initialized. Run: node infra/jenkins/local.mjs up');
  return JSON.parse(readFileSync(connectionPath, 'utf8'));
}

async function request(path, { user = 'auugit', method = 'GET', body, expected = [200], auth } = {}) {
  const account = auth === false ? null : (auth ?? connection().users[user]);
  const headers = {};
  if (account) headers.Authorization = `Basic ${Buffer.from(`${account.username}:${account.apiToken}`).toString('base64')}`;
  if (body) headers['Content-Type'] = 'application/x-www-form-urlencoded';
  const response = await fetch(new URL(path, baseUrl), {
    method, headers, body: body ? new URLSearchParams(body) : undefined,
    redirect: 'manual', signal: AbortSignal.timeout(15000),
  });
  if (!expected.includes(response.status)) {
    throw new Error(`${method} ${path}: HTTP ${response.status}; ${(await response.text()).slice(0, 350)}`);
  }
  return response;
}

async function json(path, options) {
  return (await request(path, options)).json();
}

async function until(description, callback, timeout = 120000) {
  const deadline = Date.now() + timeout;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const result = await callback();
      if (result) return result;
    } catch (error) { lastError = error; }
    await delay(1000);
  }
  throw new Error(`Timed out waiting for ${description}${lastError ? `: ${lastError.message}` : ''}`);
}

async function up() {
  mkdirSync(localDir, { recursive: true });
  for (const username of ['admin', 'auugit', 'auugit-reader']) {
    const path = resolve(localDir, `${username}.password`);
    if (!existsSync(path)) writeFileSync(path, `${randomBytes(24).toString('base64url')}\n`, { mode: 0o600 });
  }
  docker('compose', '-f', composeFile, 'up', '-d', '--build');
  console.log('Waiting for Jenkins initialization...');
  await until('Jenkins authenticated API', async () => {
    if (!existsSync(connectionPath)) return false;
    const identity = await json('whoAmI/api/json');
    return identity.authenticated && identity.name === 'auugit';
  }, 300000);
  await status();
  console.log(`Credentials: ${connectionPath}`);
}

function gitValue(...args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : '';
}

async function enqueue(scenario, extra = {}) {
  assert(['success', 'failure', 'unstable', 'long', 'log-heavy'].includes(scenario), 'Unknown scenario');
  const response = await request(`${jobPath}buildWithParameters`, {
    method: 'POST', expected: [201], body: {
      SCENARIO: scenario, COMMIT_SHA: gitValue('rev-parse', 'HEAD'),
      BRANCH: gitValue('branch', '--show-current') || 'main',
      REPOSITORY_URL: gitValue('remote', 'get-url', 'origin'),
      LONG_SECONDS: '120', LOG_LINES: '1000', ...extra,
    },
  });
  const location = response.headers.get('location');
  assert(location, 'Jenkins did not return a queue Location');
  // Jenkins may use its canonical host; keep API calls on the configured loopback URL.
  const queuePath = new URL(location, baseUrl).pathname.replace(/^\//, '');
  return { queuePath, queueId: Number(queuePath.match(/item\/(\d+)/)?.[1]) };
}

async function started(queued) {
  return until(`queue item ${queued.queueId} to start`, async () => {
    const item = await json(`${queued.queuePath}api/json`);
    if (item.cancelled) throw new Error('Queued build was cancelled');
    return item.executable?.number;
  });
}

async function completed(number) {
  return until(`build #${number} to finish`, async () => {
    const build = await json(`${jobPath}${number}/api/json`);
    return !build.building && build.result ? build : false;
  });
}

async function status() {
  const response = await request('api/json?tree=jobs[name,color,url]');
  const state = await response.json();
  console.log(JSON.stringify({ url: baseUrl, version: response.headers.get('x-jenkins'), jobs: state.jobs }, null, 2));
}

async function verify() {
  const report = { url: baseUrl, verifiedAt: new Date().toISOString(), checks: [], builds: [] };
  const check = (name) => { report.checks.push(name); console.log(`PASS ${name}`); };
  const identity = await json('whoAmI/api/json');
  assert.equal(identity.name, 'auugit');
  check('API token authentication');
  await request('api/json', { auth: { username: 'auugit', apiToken: 'intentionally-invalid' }, expected: [401, 403] });
  check('Invalid token rejected');
  await request('api/json', { auth: false, expected: [401, 403] });
  check('Anonymous access rejected');
  await request(`${jobPath}api/json`, { user: 'auugit-reader' });
  await request(`${jobPath}buildWithParameters`, { user: 'auugit-reader', method: 'POST', body: { SCENARIO: 'success' }, expected: [403] });
  await request(`${jobPath}config.xml`, { expected: [403] });
  check('Read-only account reads builds but cannot trigger; integration account cannot configure jobs');

  for (const [scenario, expected] of [['success', 'SUCCESS'], ['failure', 'FAILURE'], ['unstable', 'UNSTABLE'], ['log-heavy', 'SUCCESS']]) {
    const number = await started(await enqueue(scenario));
    const build = await completed(number);
    assert.equal(build.result, expected, `Build #${number} ${scenario}`);
    const log = await (await request(`${jobPath}${number}/consoleText`)).text();
    assert(log.includes('中文日志'), 'UTF-8 log output missing');
    const stages = await json(`${jobPath}${number}/wfapi/describe`);
    assert(stages.stages.some(stage => stage.name === 'Build'), 'Pipeline stage API missing Build stage');
    assert(build.artifacts.some(artifact => artifact.fileName === 'build-info.json'), 'Build summary artifact missing');
    const summary = await json(`${jobPath}${number}/artifact/artifacts/build-info.json`);
    assert.equal(summary.scenario, scenario);
    assert.equal(summary.result, expected);
    assert.equal(summary.commitSha, gitValue('rev-parse', 'HEAD'));
    assert.equal(summary.scmCheckout, false);
    const tests = await json(`${jobPath}${number}/testReport/api/json`);
    assert.equal(tests.failCount, ['failure', 'unstable'].includes(scenario) ? 1 : 0);
    if (scenario === 'log-heavy') assert(log.includes('line 01000'), 'Expected 1000 log lines');
    report.builds.push({ number, scenario, result: build.result, url: `${baseUrl}${jobPath}${number}/` });
    check(`${scenario}: ${expected}, stages, UTF-8 logs, test report, artifact and SHA metadata`);
  }

  const longNumber = await started(await enqueue('long', { LONG_SECONDS: '120' }));
  let queued;
  try {
    await until('long build heartbeat', async () => {
      const log = await (await request(`${jobPath}${longNumber}/consoleText`)).text();
      return log.includes('AUUGIT_HEARTBEAT');
    });
    const progress = await request(`${jobPath}${longNumber}/logText/progressiveText?start=0`);
    const firstLog = await progress.text();
    assert(firstLog.includes('AUUGIT_LONG_STARTED'));
    assert.equal(progress.headers.get('x-more-data'), 'true');
    const offset = progress.headers.get('x-text-size');
    assert(Number(offset) > 0);
    await delay(2500);
    const next = await request(`${jobPath}${longNumber}/logText/progressiveText?start=${offset}`);
    assert(Number(next.headers.get('x-text-size')) > Number(offset));
    check('Running build streams progressive logs with byte offsets');

    queued = await enqueue('success');
    await until('second build to wait in queue', async () => {
      const item = await json(`${queued.queuePath}api/json`);
      return item.blocked && !item.executable;
    });
    await request(`queue/cancelItem?id=${queued.queueId}`, { method: 'POST', expected: [200, 204, 302] });
    await until('queued build cancellation', async () => {
      const response = await request(`${queued.queuePath}api/json`, { expected: [200, 404] });
      return response.status === 404 || (await response.json()).cancelled;
    });
    check('Concurrent build queues and queued item can be cancelled');
  } finally {
    if (queued) await request(`queue/cancelItem?id=${queued.queueId}`, { method: 'POST', expected: [200, 204, 302, 404] }).catch(() => {});
    await request(`${jobPath}${longNumber}/stop`, { method: 'POST', expected: [200, 302] });
    const build = await completed(longNumber);
    assert.equal(build.result, 'ABORTED');
    report.builds.push({ number: longNumber, scenario: 'long', result: build.result, url: `${baseUrl}${jobPath}${longNumber}/` });
    check('Running build can be stopped: ABORTED');
  }
  writeFileSync(resolve(localDir, 'verification.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Verification saved: ${resolve(localDir, 'verification.json')}`);
}

try {
  const command = process.argv[2] ?? 'status';
  if (command === 'up') await up();
  else if (command === 'status') await status();
  else if (command === 'verify') await verify();
  else if (command === 'trigger') {
    const scenario = process.argv[3] ?? 'success';
    const queued = await enqueue(scenario);
    console.log(JSON.stringify({ scenario, ...queued }, null, 2));
  } else if (command === 'stop') docker('compose', '-f', composeFile, 'stop');
  else if (command === 'logs') docker('compose', '-f', composeFile, 'logs', '--tail', '100');
  else throw new Error('Usage: node infra/jenkins/local.mjs [up|status|verify|trigger <scenario>|stop|logs]');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
