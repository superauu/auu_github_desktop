/** Explicit opt-in smoke test against the local Docker fixture, through the actual domain channel. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { setTimeout as delay } from 'node:timers/promises';
import { build } from 'esbuild';

const root = process.cwd();
const config = JSON.parse(await fs.readFile(path.resolve(root, '.local/jenkins/connection.json'), 'utf8'));
const saved = new Map();
globalThis.localStorage = { getItem: key => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value), removeItem: key => saved.delete(key) };
const temporary = await fs.mkdtemp(path.join(root, '.test-tmp-jenkins-live-'));
const report = { checkedAt: new Date().toISOString(), checks: [], builds: [] };
const pass = name => { report.checks.push(name); console.log(`PASS ${name}`); };
const until = async (description, action) => {
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    const result = await action();
    if (result) return result;
    await delay(1000);
  }
  throw new Error(`Timeout: ${description}`);
};
let channel, longId;
try {
  const outfile = path.join(temporary, 'domain.cjs');
  await build({ stdin: { contents: `export { useCiStore } from './src/stores/ciStore'; export { createCiChannel } from './src/services/integrations/ciService';
    export { collaborationService, bindCollaborationClient } from './src/services/collaboration/CollaborationService';`, resolveDir: root },
    outfile, bundle: true, platform: 'node', format: 'cjs', alias: { '@': path.join(root, 'src') }, logLevel: 'silent' });
  const app = createRequire(import.meta.url)(outfile);
  const connect = async username => app.useCiStore.getState().connect({ providerId: 'jenkins', displayName: `Local ${username}`,
    baseUrl: config.url, username, token: config.users[username].apiToken, repoPath: root, jobPaths: [config.job] });
  const connection = await connect('auugit');
  channel = await app.createCiChannel(connection, [config.job]);
  app.bindCollaborationClient({ ciCd: { getWorkflows: async () => [{ id: 'existing-github-actions' }] } });
  assert.equal((await app.collaborationService.getWorkflows('owner', 'repo'))[0].id, 'existing-github-actions');
  assert(!saved.get('auu_git_ci_connections').includes(config.users.auugit.apiToken));
  pass('Independent CI connection, credential channel, secret-free settings; hosting channel preserved');
  const workflows = await channel.client.getWorkflows('', '');
  assert(workflows.some(item => item.id === config.job));
  const fields = await channel.client.getWorkflowInputs('', '', config.job);
  assert(fields.find(field => field.name === 'SCENARIO')?.options.includes('long'));
  pass('Job listing and server-native parameter definitions');
  const defaults = Object.fromEntries(fields.map(field => [field.name, field.defaultValue]));
  const trigger = async scenario => {
    const before = new Set((await channel.client.getWorkflowRuns('', '')).map(run => run.id));
    await channel.client.dispatchWorkflow('', '', config.job, { ref: '', inputs: { ...defaults, SCENARIO: scenario } });
    return until(`${scenario} to start`, async () => (await channel.client.getWorkflowRuns('', '')).find(run => !before.has(run.id) && run.status !== 'queued'));
  };
  for (const [scenario, expected] of [['success', 'success'], ['failure', 'failure'], ['unstable', 'unstable'], ['log-heavy', 'success']]) {
    const initial = await trigger(scenario);
    const final = await until(`${scenario} completion`, async () => {
      const run = await channel.client.getWorkflowRun('', '', initial.id);
      return run.status === 'completed' ? run : false;
    });
    assert.equal(final.conclusion, expected);
    const jobs = await channel.client.getRunJobs('', '', final.id);
    assert(jobs[0].steps.some(step => step.name === 'Build'));
    const logs = await channel.client.getJobLogs('', '', final.id);
    assert(logs.rawLogs.includes('中文日志'));
    if (scenario === 'log-heavy') assert(logs.rawLogs.includes('line 01000'));
    report.builds.push({ scenario, number: final.run_number, conclusion: final.conclusion });
    pass(`${scenario}: normalized status, stages and full UTF-8 logs`);
  }
  const initial = await trigger('long'); longId = initial.id;
  await until('streaming heartbeat', async () => (await channel.client.getJobLogs('', '', longId)).rawLogs.includes('AUUGIT_HEARTBEAT'));
  const beforeLog = (await channel.client.getJobLogs('', '', longId)).rawLogs;
  await until('log growth', async () => (await channel.client.getJobLogs('', '', longId)).rawLogs.length > beforeLog.length);
  pass('Running build progressive log growth through ci-cd:job-logs');
  await channel.client.dispatchWorkflow('', '', config.job, { ref: '', inputs: defaults });
  const queued = await until('queued build', async () => (await channel.client.getWorkflowRuns('', '')).find(run => run.status === 'queued'));
  await channel.client.cancelWorkflowRun('', '', queued.id);
  await until('queue removed', async () => !(await channel.client.getWorkflowRuns('', '')).some(run => run.id === queued.id));
  pass('Queue display and HTTP 204 queue cancellation');
  await channel.client.cancelWorkflowRun('', '', longId);
  const cancelled = await until('build stopped', async () => {
    const run = await channel.client.getWorkflowRun('', '', longId);
    return run.conclusion === 'cancelled' ? run : false;
  });
  longId = undefined;
  report.builds.push({ scenario: 'long', number: cancelled.run_number, conclusion: cancelled.conclusion });
  pass('Running build cancellation and ABORTED normalization');
  const readOnlyConnection = await connect('auugit-reader');
  const readOnly = await app.createCiChannel(readOnlyConnection, [config.job]);
  await readOnly.client.getWorkflowRuns('', '');
  await assert.rejects(readOnly.client.dispatchWorkflow('', '', config.job, { ref: '', inputs: defaults }), error => error.status === 403);
  // Leave the in-memory active source pointing at the normal account, not the negative-test account.
  app.useCiStore.getState().setSource(root, connection.id);
  pass('Read-only account reads builds; server rejects trigger with HTTP 403');
  await fs.writeFile(path.join(root, '.local/jenkins/auugit-integration-verification.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log('Local AuuGit Jenkins integration smoke test passed. No GitHub build was triggered.');
} finally {
  if (longId !== undefined && channel) await channel.client.cancelWorkflowRun('', '', longId).catch(() => {});
  delete globalThis.localStorage;
  if (path.dirname(temporary) === root && path.basename(temporary).startsWith('.test-tmp-jenkins-live-')) await fs.rm(temporary, { recursive: true, force: true, maxRetries: 5 });
}
