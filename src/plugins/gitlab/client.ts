import { normalizeServerUrl } from '@/services/integrations/serverUrl';
import { parsePipelineDefinition } from './inputs';
import { providerHttpRequest } from '@/services/http/providerHttp';
import { ProviderApiError, type CollaborationClient } from '@/services/collaboration/client';
import type { CollaborationUser, CollaborationPullRequest, CollaborationWorkflowRun, CollaborationJob, CollaborationCheckRun, WorkflowDispatchParams } from '@/services/collaboration/types';
import type { IssueInput, IssueListOptions, CollaborationIssue, IssueUser } from '@/services/collaboration/issueTypes';
import type { CreateReviewParams, CollaborationPullRequestReview, CollaborationReviewComment } from '@/services/collaboration/reviewTypes';

const user = (raw: any): IssueUser => ({ login: raw?.username ?? '', avatar_url: raw?.avatar_url });
function checkState(status: string): Pick<CollaborationCheckRun, 'status' | 'conclusion'> {
  if (status === 'running') return { status: 'in_progress', conclusion: null };
  const conclusions: Record<string, CollaborationCheckRun['conclusion']> = { success: 'success', failed: 'failure', canceled: 'cancelled', skipped: 'skipped' };
  return Object.hasOwn(conclusions, status) ? { status: 'completed', conclusion: conclusions[status] } : { status: 'queued', conclusion: null };
}
/** GitLab REST v4 到工作域契约的唯一转换边界。 */
export class GitLabClient implements CollaborationClient {
  constructor(private server: string, private token: string | null = null) { this.server = normalizeServerUrl(server); }
  setToken(token: string | null) { this.token = token; }
  private project(owner: string, repo: string) { return `/projects/${encodeURIComponent(`${owner}/${repo}`)}`; }
  private web(owner: string, repo: string) { return `${this.server}/${owner}/${repo}`; }
  private async request(path: string, method = 'GET', body?: unknown, query?: Record<string, string>): Promise<any> {
    const url = new URL(`${this.server}/api/v4${path}`);
    Object.entries(query ?? {}).forEach(([key, value]) => url.searchParams.set(key, value));
    const response = await providerHttpRequest(method, url.toString(), {
      ...(this.token ? { 'PRIVATE-TOKEN': this.token } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    }, body === undefined ? undefined : JSON.stringify(body));
    if (response.status < 200 || response.status >= 300) {
      let detail = response.body.slice(0, 500);
      try { detail = JSON.stringify(JSON.parse(response.body).message); } catch { /* text response */ }
      throw new ProviderApiError(response.status, `GitLab ${response.status}: ${detail}`);
    }
    if (response.status === 204 || !response.body) return null;
    return JSON.parse(response.body);
  }
  private async text(path: string, signal?: AbortSignal): Promise<string> {
    const response = await providerHttpRequest('GET', `${this.server}/api/v4${path}`, this.token ? { 'PRIVATE-TOKEN': this.token } : {}, undefined, { signal });
    if (response.status < 200 || response.status >= 300) throw new ProviderApiError(response.status, `GitLab ${response.status}: ${response.body.slice(0, 300)}`);
    return response.body;
  }
  private async pages(path: string, query?: Record<string, string>, maxPages = 10): Promise<any[]> {
    const results: any[] = [];
    for (let page = 1; page <= maxPages; page++) {
      const items = await this.request(path, 'GET', undefined, { ...query, page: String(page), per_page: '100' });
      results.push(...items);
      if (items.length < 100) break;
    }
    return results;
  }
  async verifyToken(token: string): Promise<CollaborationUser> {
    const previous = this.token; this.token = token;
    try {
      const raw = await this.request('/user');
      return { ...user(raw), id: raw.id, avatar_url: raw.avatar_url ?? '', name: raw.name, email: raw.email, bio: raw.bio,
        public_repos: raw.projects_limit ?? 0, html_url: raw.web_url ?? `${this.server}/${raw.username}` };
    } finally { this.token = previous; }
  }
  async getRepository(owner: string, repo: string) {
    const raw = await this.request(this.project(owner, repo));
    return { id: raw.id, name: raw.path, full_name: raw.path_with_namespace, private: raw.visibility !== 'public', html_url: raw.web_url,
      description: raw.description, stargazers_count: raw.star_count, forks_count: raw.forks_count,
      default_branch: raw.default_branch, open_issues_count: raw.open_issues_count ?? 0 };
  }
  async getRepositoryDefaultBranch(owner: string, repo: string) { return (await this.getRepository(owner, repo)).default_branch; }
  private issue(raw: any): CollaborationIssue {
    return { id: raw.id, number: raw.iid, title: raw.title, body: raw.description, state: raw.state === 'closed' ? 'closed' : 'open',
      html_url: raw.web_url, user: user(raw.author), labels: (raw.labels ?? []).map((name: string, id: number) => ({ id, name, color: '808080' })),
      assignees: (raw.assignees ?? []).map(user), comments: raw.user_notes_count ?? 0, created_at: raw.created_at, updated_at: raw.updated_at,
      closed_at: raw.closed_at, locked: raw.discussion_locked ?? false };
  }
  async searchIssues(owner: string, repo: string, options: IssueListOptions) {
    const items = await this.request(`${this.project(owner, repo)}/issues`, 'GET', undefined, {
      state: options.state === 'open' ? 'opened' : options.state, search: options.query, labels: options.label || 'Any',
      ...(options.assignee ? { 'assignee_username[]': options.assignee } : {}), scope: 'all', order_by: 'updated_at', sort: 'desc', page: String(options.page), per_page: '30',
    });
    // 计数用于分页，满页时保留下一页入口，不能把当前页长度伪装成全量总数。
    return { items: items.map((item: any) => this.issue(item)), total_count: (options.page - 1) * 30 + items.length + (items.length === 30 ? 1 : 0), incomplete_results: false };
  }
  async getIssue(owner: string, repo: string, number: number) { return this.issue(await this.request(`${this.project(owner, repo)}/issues/${number}`)); }
  private async issuePayload(owner: string, repo: string, input: Partial<IssueInput>) {
    const members = input.assignees ? await this.getIssueAssignees(owner, repo) : [];
    const assignees = input.assignees?.map(login => {
      const member = members.find(item => item.login === login);
      if (!member) throw new Error(`Assignee unavailable: ${login}`);
      return member.id;
    });
    return { ...(input.title === undefined ? {} : { title: input.title }), ...(input.body === undefined ? {} : { description: input.body }),
      ...(input.labels === undefined ? {} : { labels: input.labels.join(',') }), ...(assignees === undefined ? {} : { assignee_ids: assignees }) };
  }
  async createIssue(owner: string, repo: string, input: IssueInput) { return this.issue(await this.request(`${this.project(owner, repo)}/issues`, 'POST', await this.issuePayload(owner, repo, input))); }
  async updateIssue(owner: string, repo: string, number: number, input: Partial<IssueInput> & { state?: 'open' | 'closed' }) {
    return this.issue(await this.request(`${this.project(owner, repo)}/issues/${number}`, 'PUT', {
      ...await this.issuePayload(owner, repo, input), ...(input.state ? { state_event: input.state === 'open' ? 'reopen' : 'close' } : {}),
    }));
  }
  private note(raw: any) { return { id: raw.id, user: user(raw.author), body: raw.body, created_at: raw.created_at, updated_at: raw.updated_at, html_url: raw.web_url }; }
  async getIssueComments(owner: string, repo: string, number: number) { return (await this.pages(`${this.project(owner, repo)}/issues/${number}/notes`)).filter(item => !item.system).map(item => this.note(item)); }
  async createIssueComment(owner: string, repo: string, number: number, body: string) { return this.note(await this.request(`${this.project(owner, repo)}/issues/${number}/notes`, 'POST', { body })); }
  async getIssueTimeline(owner: string, repo: string, number: number) {
    return (await this.pages(`${this.project(owner, repo)}/issues/${number}/related_merge_requests`)).map(raw => ({
      event: 'cross-referenced', source: { issue: { number: raw.iid, title: raw.title, state: raw.state === 'opened' ? 'open' as const : 'closed' as const,
        html_url: raw.web_url, pull_request: { merged_at: raw.merged_at } } },
    }));
  }
  async getIssueLabels(owner: string, repo: string) { return (await this.pages(`${this.project(owner, repo)}/labels`)).map(raw => ({ id: raw.id, name: raw.name, color: (raw.color ?? '#808080').replace('#', ''), description: raw.description })); }
  async getIssueAssignees(owner: string, repo: string): Promise<(IssueUser & { id: number })[]> { return (await this.pages(`${this.project(owner, repo)}/members/all`)).map(raw => ({ ...user(raw), id: raw.id })); }
  private pull(raw: any): CollaborationPullRequest {
    return { id: raw.id, number: raw.iid, title: raw.title, state: raw.state === 'opened' ? 'open' : 'closed', merged_at: raw.merged_at ?? (raw.state === 'merged' ? raw.updated_at : null),
      draft: raw.draft ?? raw.work_in_progress ?? false, created_at: raw.created_at, updated_at: raw.updated_at, body: raw.description, html_url: raw.web_url,
      user: { ...user(raw.author), avatar_url: raw.author?.avatar_url ?? '' },
      head: { ref: raw.source_branch, sha: raw.sha ?? raw.diff_refs?.head_sha ?? '', label: raw.source_branch },
      base: { ref: raw.target_branch, sha: raw.diff_refs?.base_sha ?? '' }, labels: (raw.labels ?? []).map((name: string, id: number) => ({ id, name, color: '808080', description: null })) };
  }
  async getPullRequests(owner: string, repo: string, state: 'open' | 'closed' | 'all' = 'all', maxPages = 10) {
    const path = `${this.project(owner, repo)}/merge_requests`;
    if (state === 'closed') {
      const [closed, merged] = await Promise.all([this.pages(path, { state: 'closed' }, maxPages), this.pages(path, { state: 'merged' }, maxPages)]);
      return [...closed, ...merged].map(raw => this.pull(raw)).sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    }
    return (await this.pages(path, { state: state === 'open' ? 'opened' : 'all' }, maxPages)).map(raw => this.pull(raw));
  }
  async getPullRequest(owner: string, repo: string, number: number) { return this.pull(await this.request(`${this.project(owner, repo)}/merge_requests/${number}`)); }
  async createPullRequest(owner: string, repo: string, input: { title: string; head: string; headRepo?: string; base: string; body?: string; draft?: boolean }) {
    let sourceProject = this.project(owner, repo), sourceBranch = input.head;
    const colon = input.head.indexOf(':');
    if (colon >= 0) { sourceProject = this.project(input.head.slice(0, colon), input.headRepo || repo); sourceBranch = input.head.slice(colon + 1); }
    const target = await this.request(this.project(owner, repo));
    return this.pull(await this.request(`${sourceProject}/merge_requests`, 'POST', { source_branch: sourceBranch, target_branch: input.base,
      target_project_id: target.id, title: input.draft && !/^(Draft|WIP):/i.test(input.title) ? `Draft: ${input.title}` : input.title, description: input.body ?? '' }));
  }
  async updatePullRequestState(owner: string, repo: string, number: number, state: 'open' | 'closed') {
    return this.pull(await this.request(`${this.project(owner, repo)}/merge_requests/${number}`, 'PUT', { state_event: state === 'open' ? 'reopen' : 'close' }));
  }
  async mergePullRequest(owner: string, repo: string, number: number, options?: { mergeMethod?: 'merge' | 'squash' | 'rebase'; expectedHeadSha?: string; commitTitle?: string; commitMessage?: string }) {
    if (options?.mergeMethod === 'rebase') {
      // GitLab 的 rebase 是异步操作；不能先改写分支再假装合并完成。
      throw new Error('Choose merge or squash; GitLab controls fast-forward/rebase through project merge settings');
    }
    const raw = await this.request(`${this.project(owner, repo)}/merge_requests/${number}/merge`, 'PUT', {
      sha: options?.expectedHeadSha, squash: options?.mergeMethod === 'squash', merge_commit_message: options?.commitMessage || options?.commitTitle,
    });
    return { merged: raw.state === 'merged', message: raw.merge_error || raw.state };
  }
  async getPullRequestFiles(owner: string, repo: string, number: number, maxPages = 10) {
    const changes = await this.pages(`${this.project(owner, repo)}/merge_requests/${number}/diffs`, undefined, maxPages);
    return { files: changes.map(raw => ({ sha: '', filename: raw.new_path, previous_filename: raw.renamed_file ? raw.old_path : undefined,
      status: raw.new_file ? 'added' as const : raw.deleted_file ? 'removed' as const : raw.renamed_file ? 'renamed' as const : 'modified' as const,
      additions: (raw.diff ?? '').split('\n').filter((line: string) => line.startsWith('+') && !line.startsWith('+++')).length,
      deletions: (raw.diff ?? '').split('\n').filter((line: string) => line.startsWith('-') && !line.startsWith('---')).length,
      changes: (raw.diff ?? '').split('\n').length, patch: raw.too_large || raw.collapsed ? undefined : raw.diff,
    })), truncated: changes.length >= maxPages * 100 || changes.some(raw => raw.too_large || raw.collapsed) };
  }
  async getPullRequestReviews(owner: string, repo: string, number: number): Promise<CollaborationPullRequestReview[]> {
    const raw = await this.request(`${this.project(owner, repo)}/merge_requests/${number}/approvals`);
    return (raw.approved_by ?? []).map((item: any) => ({ id: item.user.id, user: user(item.user), state: 'APPROVED', body: '', submitted_at: null }));
  }
  async getPullRequestIssueComments(owner: string, repo: string, number: number) { return (await this.pages(`${this.project(owner, repo)}/merge_requests/${number}/notes`)).filter(raw => !raw.system && !raw.position).map(raw => this.note(raw)); }
  async getPullRequestReviewComments(owner: string, repo: string, number: number): Promise<CollaborationReviewComment[]> {
    const discussions = await this.pages(`${this.project(owner, repo)}/merge_requests/${number}/discussions`);
    return discussions.flatMap(raw => raw.notes ?? []).filter(raw => !raw.system && raw.position).map(raw => ({
      ...this.note(raw), path: raw.position.new_path || raw.position.old_path, side: raw.position.new_line ? 'RIGHT' : 'LEFT',
      line: raw.position.new_line ?? null, original_line: raw.position.old_line ?? null,
    }));
  }
  async createPullRequestReview(owner: string, repo: string, number: number, params: CreateReviewParams): Promise<CollaborationPullRequestReview> {
    if (params.event === 'REQUEST_CHANGES') throw new Error('This plugin supports comments and approvals; request-changes is unavailable through the GitLab REST API');
    const path = `${this.project(owner, repo)}/merge_requests/${number}`;
    const raw = await this.request(path);
    const me = await this.request('/user');
    const changes = params.comments?.length ? await this.pages(`${path}/diffs`) : [];
    // API 非事务，逐项提交；失败明确报告已成功的评论数，避免无提示重试造成重复。
    let written = 0;
    try {
      for (const comment of params.comments ?? []) {
        const change = changes.find(item => item.new_path === comment.path || item.old_path === comment.path);
        if (!change || !raw.diff_refs?.head_sha) throw new Error(`Diff unavailable: ${comment.path}`);
        const position = { ...raw.diff_refs, position_type: 'text', old_path: change.old_path, new_path: change.new_path,
          ...(comment.side === 'LEFT' ? { old_line: comment.line } : { new_line: comment.line }) };
        await this.request(`${path}/discussions`, 'POST', { body: comment.body, position }); written++;
      }
      if (params.body) { await this.request(`${path}/notes`, 'POST', { body: params.body }); written++; }
      if (params.event === 'APPROVE') await this.request(`${path}/approve`, 'POST', { sha: raw.sha });
    } catch (error) { throw new Error(`Review incomplete (${written} comments saved): ${String(error)}`, { cause: error }); }
    return { id: me.id, user: user(me), state: params.event === 'APPROVE' ? 'APPROVED' : 'COMMENTED', body: params.body ?? '', submitted_at: new Date().toISOString() };
  }
  async getWorkflows(owner: string, repo: string) {
    const project = await this.request(this.project(owner, repo));
    return [{ id: 0, name: project.name || repo, path: project.ci_config_path || '.gitlab-ci.yml', state: 'active' as const, badge_url: '', html_url: `${this.web(owner, repo)}/-/pipelines` }];
  }
  private run(raw: any): CollaborationWorkflowRun {
    const state = checkState(raw.status);
    return { id: raw.id, name: raw.name || `Pipeline #${raw.iid ?? raw.id}`, head_branch: raw.ref, head_sha: raw.sha,
      event: raw.source ?? 'pipeline', status: state.status === 'in_progress' ? 'in_progress' : state.status === 'completed' ? 'completed' : 'queued',
      conclusion: state.conclusion === 'stale' || state.conclusion === 'startup_failure' ? 'failure' : state.conclusion,
      html_url: raw.web_url, created_at: raw.created_at, updated_at: raw.updated_at ?? raw.created_at, run_number: raw.iid ?? raw.id,
      run_attempt: 1, actor: { ...user(raw.user), avatar_url: raw.user?.avatar_url ?? '' },
      head_commit: { id: raw.sha, message: raw.commit?.message ?? '', author: { name: raw.user?.name ?? '', email: '' } } };
  }
  async getWorkflowRuns(owner: string, repo: string, _workflowId?: number | string, branch?: string) {
    return (await this.pages(`${this.project(owner, repo)}/pipelines`, branch ? { ref: branch } : undefined)).map(raw => this.run(raw));
  }
  async getWorkflowRun(owner: string, repo: string, id: number) { return this.run(await this.request(`${this.project(owner, repo)}/pipelines/${id}`)); }
  private job(raw: any): CollaborationJob {
    const state = checkState(raw.status);
    return { id: raw.id, run_id: raw.pipeline?.id ?? 0, name: raw.name, status: state.status === 'in_progress' ? 'in_progress' : state.status === 'completed' ? 'completed' : 'queued',
      conclusion: state.conclusion === 'success' ? 'success' : state.conclusion === 'failure' ? 'failure' : state.conclusion === 'cancelled' ? 'cancelled' : state.conclusion === 'skipped' ? 'skipped' : null,
      started_at: raw.started_at, completed_at: raw.finished_at, steps: [], html_url: raw.web_url };
  }
  async getRunJobs(owner: string, repo: string, id: number) { return (await this.pages(`${this.project(owner, repo)}/pipelines/${id}/jobs`, { include_retried: 'false' })).map(raw => this.job(raw)); }
  async getJob(owner: string, repo: string, id: number) { return this.job(await this.request(`${this.project(owner, repo)}/jobs/${id}`)); }
  async getJobLogs(owner: string, repo: string, id: number) { return { jobId: id, jobName: `Job #${id}`, rawLogs: await this.text(`${this.project(owner, repo)}/jobs/${id}/trace`) }; }
  async getWorkflowYaml(owner: string, repo: string, path: string, ref = 'HEAD', signal?: AbortSignal) {
    signal?.throwIfAborted();
    const content = await this.text(`${this.project(owner, repo)}/repository/files/${encodeURIComponent(path)}/raw?ref=${encodeURIComponent(ref)}`, signal);
    signal?.throwIfAborted(); return { path, content };
  }
  async dispatchWorkflow(owner: string, repo: string, _id: number | string, params: WorkflowDispatchParams) {
    const workflows = await this.getWorkflows(owner, repo);
    const source = await this.getWorkflowYaml(owner, repo, workflows[0].path, params.ref);
    // 与 parseDispatchInputs 共用同一解析器：无效 YAML 显式报错，不再静默降级为旧式 variables。
    const definition = parsePipelineDefinition(source.content);
    const declared = new Map(definition.fields.map(field => [field.name, field]));
    const inputs = Object.fromEntries(Object.entries(params.inputs ?? {}).map(([key, value]) => [key,
      declared.get(key)?.type === 'boolean' ? value === 'true' : declared.get(key)?.type === 'number' ? Number(value) : value]));
    await this.request(`${this.project(owner, repo)}/pipeline`, 'POST', { ref: params.ref,
      ...(definition.usesInputs ? { inputs } : { variables: Object.entries(inputs).map(([key, value]) => ({ key, value: String(value) })) }) });
  }
  async rerunWorkflow(owner: string, repo: string, id: number) { await this.request(`${this.project(owner, repo)}/pipelines/${id}/retry`, 'POST'); }
  async cancelWorkflowRun(owner: string, repo: string, id: number) { await this.request(`${this.project(owner, repo)}/pipelines/${id}/cancel`, 'POST'); }
  async getCommitChecks(owner: string, repo: string, sha: string): Promise<CollaborationCheckRun[]> {
    const pipelines = await this.pages(`${this.project(owner, repo)}/pipelines`, { sha });
    return pipelines.map(raw => ({ id: raw.id, name: raw.name || `Pipeline #${raw.id}`, head_sha: sha, ...checkState(raw.status),
      started_at: raw.created_at, completed_at: ['success', 'failed', 'canceled', 'skipped'].includes(raw.status) ? raw.updated_at ?? raw.created_at : null, html_url: raw.web_url }));
  }
  async getWorkflowCheckRuns(owner: string, repo: string, sha: string) { const check_runs = await this.getCommitChecks(owner, repo, sha); return { total_count: check_runs.length, check_runs }; }
  async getWorkflowCommitStatuses(owner: string, repo: string, sha: string) {
    const statuses = (await this.pages(`${this.project(owner, repo)}/repository/commits/${encodeURIComponent(sha)}/statuses`, { all: 'false' })).map(raw => ({
      id: raw.id, context: raw.name, state: raw.status === 'success' ? 'success' as const : raw.status === 'failed' ? 'failure' as const : 'pending' as const, description: raw.description, target_url: raw.target_url,
    }));
    return { total_count: statuses.length, statuses };
  }
}
