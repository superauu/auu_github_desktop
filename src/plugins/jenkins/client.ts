/** Jenkins is normalized here; domain/UI code never constructs Jenkins endpoints or interprets its statuses. */
import { providerHttpRequest, type ProviderHttpResponse } from '@/services/http/providerHttp';
import { normalizeServerUrl, instanceRelativePath } from '@/services/integrations/serverUrl';
import { ProviderApiError } from '@/services/collaboration/client';
import type { CiCdClient } from '@/services/collaboration/CiCdClient';
import type { AuthenticationClient } from '@/services/collaboration/AuthenticationClient';
import type { CollaborationUser, CollaborationWorkflow, CollaborationWorkflowRun, CollaborationJob, JobLogsData, WorkflowDispatchParams } from '@/services/collaboration/types';
import { workflowInputValues, type WorkflowInput } from '@/services/collaboration/WorkflowInputs';
import { LocalizedError } from '@/i18n';

interface BuildRef { job: string; number?: number; queueId?: number }
interface JenkinsBuild {
  number: number; displayName?: string; description?: string; building: boolean; result: string | null;
  timestamp: number; duration: number;
  actions?: { parameters?: { name: string; value: unknown }[]; causes?: { userId?: string; shortDescription?: string }[];
    lastBuiltRevision?: { SHA1?: string; branch?: { name: string }[] } }[];
}
interface QueueItem { id: number; inQueueSince: number; task?: { url: string; name: string }; actions?: JenkinsBuild['actions']; cancelled?: boolean; executable?: { number: number } }
interface JenkinsJob { name: string; fullName?: string; buildable?: boolean; builds?: JenkinsBuild[];
  property?: { parameterDefinitions?: { name: string; type?: string; _class?: string; description?: string; choices?: string[]; defaultParameterValue?: { value: unknown } }[] }[] }
interface Stage { id: string; name: string; status: string; startTimeMillis?: number; durationMillis?: number }

function jobParts(value: string): string[] {
  const parts = value.trim().split('/');
  if (!parts.length || parts.some(part => !part || part === '.' || part === '..' || /[%\\?#]/.test(part) || [...part].some(char => char.charCodeAt(0) < 32))) {
    throw new LocalizedError('ciDomain.invalidJobPath');
  }
  return parts;
}
const jobUrlPath = (job: string) => jobParts(job).map(part => `job/${encodeURIComponent(part)}/`).join('');
const iso = (time: number | undefined) => new Date(time || 0).toISOString();
/** Keep raw bytes in the cursor cache; Jenkins' encoded ConsoleNotes are not user-facing log text. */
function consoleText(raw: string): string {
  // eslint-disable-next-line no-control-regex -- Jenkins ConsoleNote delimiters are ANSI conceal/reset sequences.
  let text = raw.replace(/\x1b\[8mha:[\s\S]*?\x1b\[0m/g, '');
  const marker = `${String.fromCharCode(27)}[8mha:`;
  const unfinished = text.indexOf(marker);
  if (unfinished >= 0) text = text.slice(0, unfinished);
  // A progressive response can also end part-way through the opening delimiter.
  for (let length = marker.length - 1; length > 0; length--) {
    if (text.endsWith(marker.slice(0, length))) { text = text.slice(0, -length); break; }
  }
  // eslint-disable-next-line no-control-regex -- This plain-text viewer does not render terminal SGR styling.
  return text.replace(/\x1b\[[0-9;]*m/g, '');
}
const conclusion = (result: string | null): CollaborationJob['conclusion'] => {
  switch (result) {
    case 'SUCCESS': return 'success';
    case 'FAILURE': case 'FAILED': return 'failure';
    case 'UNSTABLE': return 'unstable';
    case 'ABORTED': return 'cancelled';
    case 'NOT_BUILT': case 'NOT_EXECUTED': return 'skipped';
    default: return null;
  }
};

export class JenkinsClient implements AuthenticationClient, Partial<CiCdClient> {
  readonly server: string;
  readonly jobPaths: readonly string[];
  private identities = new Map<string, number>();
  private builds = new Map<number, BuildRef>();
  private logs = new Map<number, { offset: number; text: string; more: boolean }>();
  private pendingLogs = new Map<number, Promise<JobLogsData>>();

  constructor(server: string, private username: string, private token: string | null, jobPaths: readonly string[]) {
    this.server = normalizeServerUrl(server);
    if (!username.trim() || /[:\r\n]/.test(username)) throw new LocalizedError('ciDomain.invalidUsername');
    this.username = username.trim();
    this.jobPaths = [...new Set(jobPaths.map(job => jobParts(job).join('/')))];
  }
  setToken(token: string | null) { this.token = token; }
  private id(key: string) {
    // Collision-free per-client handles keep identical build numbers in different Jobs separate.
    if (!this.identities.has(key)) this.identities.set(key, this.identities.size + 1);
    return this.identities.get(key)!;
  }
  private ref(id: number): BuildRef {
    const ref = this.builds.get(id);
    if (!ref) throw new LocalizedError('ciDomain.runUnavailable');
    return ref;
  }
  private job(id: number | string): string {
    if (typeof id !== 'string' || !this.jobPaths.includes(id)) throw new LocalizedError('ciDomain.invalidJobPath');
    return id;
  }
  private async request(path: string, method = 'GET', body?: string, signal?: AbortSignal): Promise<ProviderHttpResponse> {
    const bytes = new TextEncoder().encode(`${this.username}:${this.token ?? ''}`);
    const response = await providerHttpRequest(method, `${this.server}/${path}`, {
      Authorization: `Basic ${btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join(''))}`,
      ...(body !== undefined ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
    }, body, { signal });
    // Stop/cancel commonly redirect back to the build or queue. A login/foreign redirect is not success.
    let completionRedirect = false;
    if (method === 'POST' && response.status === 302 && response.headers.location) {
      const target = new URL(response.headers.location, `${this.server}/${path}`);
      const relative = instanceRelativePath(target.href, this.server);
      completionRedirect = path.endsWith('/stop') ? relative === `/${path.slice(0, -4)}`
        : path.startsWith('queue/cancelItem?') && (relative === '/queue/' || relative === '/');
    }
    // Never follow or forward credentials to a Location.
    if (!(response.status >= 200 && response.status < 300) && !completionRedirect) {
      throw new ProviderApiError(response.status, new LocalizedError('ciDomain.httpError', { status: response.status }).message);
    }
    return response;
  }
  private async json<T>(path: string, signal?: AbortSignal): Promise<T> {
    const response = await this.request(path, 'GET', undefined, signal);
    try { return JSON.parse(response.body) as T; }
    catch { throw new ProviderApiError(502, new LocalizedError('ciDomain.invalidResponse').message); }
  }
  async verifyToken(token: string): Promise<CollaborationUser> {
    const previous = this.token;
    this.token = token;
    try {
      const user = await this.json<{ authenticated: boolean; name: string }>('whoAmI/api/json');
      if (!user.authenticated || user.name !== this.username) throw new ProviderApiError(401, new LocalizedError('ciDomain.authFailed').message);
      return { login: user.name, id: 0, name: user.name, avatar_url: '', email: null, bio: null, public_repos: 0,
        html_url: `${this.server}/user/${encodeURIComponent(user.name)}/` };
    } finally { this.token = previous; }
  }
  private jobData(job: string, signal?: AbortSignal) {
    return this.json<JenkinsJob>(`${jobUrlPath(job)}api/json?tree=name,fullName,buildable,property[parameterDefinitions[name,type,_class,description,choices,defaultParameterValue[value]]]`, signal);
  }
  async getWorkflows(_owner: string, _repo: string): Promise<CollaborationWorkflow[]> {
    return Promise.all(this.jobPaths.map(async path => {
      const job = await this.jobData(path);
      return { id: path, name: job.fullName || job.name, path, state: job.buildable === false ? 'disabled_manually' as const : 'active' as const,
        html_url: `${this.server}/${jobUrlPath(path)}`, badge_url: '' };
    }));
  }
  async getWorkflowInputs(_owner: string, _repo: string, workflowId: number | string, signal?: AbortSignal): Promise<WorkflowInput[]> {
    const raw = await this.jobData(this.job(workflowId), signal);
    return (raw.property ?? []).flatMap(property => property.parameterDefinitions ?? []).map(field => {
      const kind = field.type || field._class?.split('.').pop() || '';
      // Password/file/credential/reference parameters must not be rendered or sent as plain strings.
      const type = kind === 'ChoiceParameterDefinition' ? 'choice' : kind === 'BooleanParameterDefinition' ? 'boolean'
        : ['StringParameterDefinition', 'TextParameterDefinition'].includes(kind) ? 'string' : null;
      if (!type) throw new LocalizedError('ciDomain.unsupportedParameter', { name: field.name });
      return { name: field.name, description: field.description ?? '', type, required: false,
        defaultValue: String(field.defaultParameterValue?.value ?? ''), options: field.choices ?? [] };
    });
  }
  private run(raw: JenkinsBuild, job: string): CollaborationWorkflowRun {
    const id = this.id(`build:${job}:${raw.number}`);
    this.builds.set(id, { job, number: raw.number });
    const actions = raw.actions ?? [];
    const parameters = Object.fromEntries(actions.flatMap(action => action.parameters ?? []).map(item => [item.name, String(item.value ?? '')]));
    const revision = actions.find(action => action.lastBuiltRevision)?.lastBuiltRevision;
    const sha = revision?.SHA1 || parameters.COMMIT_SHA || '';
    const branch = revision?.branch?.[0]?.name || parameters.BRANCH || '';
    const actor = actions.flatMap(action => action.causes ?? []).find(cause => cause.userId)?.userId || '';
    return { id, name: `${job} · ${raw.displayName || `#${raw.number}`}`, run_number: raw.number, run_attempt: 1,
      head_branch: branch, head_sha: sha, event: 'build', status: raw.building ? 'in_progress' : 'completed',
      conclusion: raw.building ? null : conclusion(raw.result), html_url: `${this.server}/${jobUrlPath(job)}${raw.number}/`,
      created_at: iso(raw.timestamp), updated_at: iso(raw.building ? Date.now() : raw.timestamp + raw.duration),
      duration_ms: raw.building ? Math.max(0, Date.now() - raw.timestamp) : raw.duration,
      actor: { login: actor, avatar_url: '' }, head_commit: { id: sha, message: raw.description ?? '', author: { name: actor, email: '' } } };
  }
  private queued(raw: QueueItem, job: string): CollaborationWorkflowRun {
    const id = this.id(`queue:${raw.id}`);
    this.builds.set(id, { job, queueId: raw.id });
    return { id, name: `${job} · queue #${raw.id}`, run_number: raw.id, run_attempt: 1, head_branch: '', head_sha: '',
      event: 'queue', status: 'queued', conclusion: null, html_url: `${this.server}/${jobUrlPath(job)}`,
      created_at: iso(raw.inQueueSince), updated_at: iso(raw.inQueueSince), actor: { login: '', avatar_url: '' },
      head_commit: { id: '', message: '', author: { name: '', email: '' } } };
  }
  async getWorkflowRuns(_owner: string, _repo: string, workflowId?: number | string, branch?: string): Promise<CollaborationWorkflowRun[]> {
    const jobs = workflowId === undefined ? this.jobPaths : [this.job(workflowId)];
    const queue = await this.json<{ items: QueueItem[] }>('queue/api/json?tree=items[id,inQueueSince,cancelled,executable[number],task[url,name]]');
    const histories = await Promise.all(jobs.map(async job => {
      const raw = await this.json<JenkinsJob>(`${jobUrlPath(job)}api/json?tree=builds[number,displayName,description,building,result,timestamp,duration,actions[parameters[name,value],causes[userId],lastBuiltRevision[SHA1,branch[name]]]]{0,50}`);
      return (raw.builds ?? []).map(build => this.run(build, job));
    }));
    const queued = queue.items.filter(item => !item.cancelled && !item.executable).flatMap(item => {
      // Do not trust the server's URLs as request targets. Match only the explicitly mapped Jobs.
      const relative = item.task?.url ? instanceRelativePath(item.task.url, this.server) : null;
      const job = jobs.find(path => relative === `/${jobUrlPath(path)}`);
      return job ? [this.queued(item, job)] : [];
    });
    return [...queued, ...histories.flat()].filter(run => !branch || run.head_branch === branch)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
  async getWorkflowRun(_owner: string, _repo: string, runId: number): Promise<CollaborationWorkflowRun> {
    const ref = this.ref(runId);
    if (ref.number !== undefined) return this.run(await this.json<JenkinsBuild>(`${jobUrlPath(ref.job)}${ref.number}/api/json`), ref.job);
    const item = await this.json<QueueItem>(`queue/item/${ref.queueId}/api/json`);
    if (item.executable) return this.run(await this.json<JenkinsBuild>(`${jobUrlPath(ref.job)}${item.executable.number}/api/json`), ref.job);
    return this.queued(item, ref.job);
  }
  async getRunJobs(owner: string, repo: string, runId: number): Promise<CollaborationJob[]> {
    const ref = this.ref(runId);
    if (ref.number === undefined) return [];
    const run = await this.getWorkflowRun(owner, repo, runId);
    let stages: Stage[];
    try { stages = (await this.json<{ stages: Stage[] }>(`${jobUrlPath(ref.job)}${ref.number}/wfapi/describe`)).stages ?? []; }
    catch (error) {
      if (error instanceof ProviderApiError && error.status === 404) throw new LocalizedError('ciDomain.stageApiRequired');
      throw error;
    }
    return [{ id: runId, run_id: runId, name: ref.job, status: run.status === 'waiting' ? 'queued' : run.status,
      conclusion: run.conclusion === 'timed_out' || run.conclusion === 'action_required' ? null : run.conclusion,
      started_at: run.created_at, completed_at: run.status === 'completed' ? run.updated_at : null, html_url: run.html_url,
      steps: stages.map((stage, index) => ({ number: index + 1, name: stage.name,
        status: stage.status === 'IN_PROGRESS' || stage.status === 'PAUSED_PENDING_INPUT' ? 'in_progress' : stage.status === 'NOT_EXECUTED' ? 'queued' : 'completed',
        conclusion: conclusion(stage.status), started_at: iso(stage.startTimeMillis),
        completed_at: stage.status === 'IN_PROGRESS' ? undefined : iso((stage.startTimeMillis || 0) + (stage.durationMillis || 0)) })) }];
  }
  async getJob(owner: string, repo: string, jobId: number): Promise<CollaborationJob> {
    const jobs = await this.getRunJobs(owner, repo, jobId);
    if (!jobs[0]) throw new LocalizedError('ciDomain.runUnavailable');
    return jobs[0];
  }
  async getJobLogs(_owner: string, _repo: string, jobId: number): Promise<JobLogsData> {
    const pending = this.pendingLogs.get(jobId);
    if (pending) return pending;
    const operation = this.readLogs(jobId).finally(() => this.pendingLogs.delete(jobId));
    this.pendingLogs.set(jobId, operation);
    return operation;
  }
  private async readLogs(jobId: number): Promise<JobLogsData> {
    const ref = this.ref(jobId);
    if (ref.number === undefined) throw new LocalizedError('ciDomain.runUnavailable');
    const previous = this.logs.get(jobId) ?? { offset: 0, text: '', more: true };
    if (!previous.more) return { jobId, jobName: ref.job, rawLogs: consoleText(previous.text), live: false };
    const response = await this.request(`${jobUrlPath(ref.job)}${ref.number}/logText/progressiveText?start=${previous.offset}`);
    const offset = Number(response.headers['x-text-size']);
    if (!Number.isSafeInteger(offset) || offset < previous.offset) throw new LocalizedError('ciDomain.invalidLogOffset');
    const text = previous.text + response.body;
    if (new TextEncoder().encode(text).length > 16 * 1024 * 1024) throw new LocalizedError('ciDomain.logsTooLarge');
    const more = response.headers['x-more-data'] === 'true';
    this.logs.set(jobId, { offset, text, more });
    return { jobId, jobName: ref.job, rawLogs: consoleText(text), live: more, htmlUrl: `${this.server}/${jobUrlPath(ref.job)}${ref.number}/console` };
  }
  async dispatchWorkflow(owner: string, repo: string, workflowId: number | string, params: WorkflowDispatchParams): Promise<void> {
    const job = this.job(workflowId);
    const inputs = await this.getWorkflowInputs(owner, repo, workflowId);
    const values = workflowInputValues(inputs, { ...Object.fromEntries(inputs.map(input => [input.name, input.defaultValue])), ...params.inputs });
    // Only declared input names are submitted; ref is not invented as a Jenkins parameter.
    const response = await this.request(`${jobUrlPath(job)}${inputs.length ? 'buildWithParameters' : 'build'}`, 'POST', new URLSearchParams(values).toString());
    if (response.status !== 201) throw new ProviderApiError(response.status, new LocalizedError('ciDomain.triggerNotAccepted').message);
  }
  async cancelWorkflowRun(_owner: string, _repo: string, runId: number): Promise<void> {
    const ref = this.ref(runId);
    if (ref.number !== undefined) await this.request(`${jobUrlPath(ref.job)}${ref.number}/stop`, 'POST', '');
    else await this.request(`queue/cancelItem?id=${ref.queueId}`, 'POST', '');
  }
}
