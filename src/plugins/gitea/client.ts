import { normalizeServerUrl } from '@/services/integrations/serverUrl';
import { providerHttpRequest } from '@/services/http/providerHttp';
import { unquoteGitPath } from '@/services/git/PorcelainParser';
import { tNow } from '@/i18n';
import type { CollaborationCommitStatus, CollaborationIssue, CollaborationLabel, IssueInput, IssueListOptions, IssueSearchResult, IssueTimelineEvent, IssueUser } from '@/services/collaboration/issueTypes';
import {
  CollaborationCheckRun,
  CollaborationJob,
  CollaborationPullRequest,
  CollaborationRepoDetails,
  CollaborationUser,
  CollaborationWorkflow,
  CollaborationWorkflowRun,
  JobLogsData,
  WorkflowDispatchParams,
  WorkflowYamlContent,
} from '@/services/collaboration/types';

import { ProviderApiError } from '@/services/collaboration/client';

/** 上限保护：巨型仓库的列表接口不能无限翻页拖垮 UI */
const DEFAULT_MAX_PAGES = 10;

import type { CreateReviewParams, CollaborationPullRequestFile, CollaborationPullRequestFilesResult, CollaborationPullRequestReview, CollaborationReviewComment, CollaborationIssueComment } from '@/services/collaboration/reviewTypes';
export const PR_FILES_SOFT_LIMIT=300;
function normalizePull(raw: any): CollaborationPullRequest {
  return { ...raw, merged_at: raw.merged_at ?? (raw.merged ? raw.updated_at : null), draft: raw.draft ?? /^(WIP|Draft):/i.test(raw.title ?? '') };
}
function normalizeReview(raw: any): CollaborationPullRequestReview {
  return { ...raw, state: raw.dismissed ? 'DISMISSED' : raw.state === 'REQUEST_CHANGES' ? 'CHANGES_REQUESTED' : raw.state === 'COMMENT' ? 'COMMENTED' : raw.state === 'REQUEST_REVIEW' ? 'PENDING' : raw.state };
}
function diffPatches(raw: string): Map<string, string> {
  const patches = new Map<string, string>();
  for (const block of raw.split(/(?=^diff --git )/m)) {
    const lines = block.split('\n'), start = lines.findIndex(line => line.startsWith('@@'));
    if (start < 0) continue;
    for (const prefix of ['--- ', '+++ ']) {
      const header = lines.find(line => line.startsWith(prefix));
      if (!header) continue;
      const path = unquoteGitPath(header.slice(4).replace(/\r$/, '')).replace(/^[ab]\//, '');
      if (path !== '/dev/null') patches.set(path, lines.slice(start).join('\n'));
    }
  }
  return patches;
}
export class GiteaClient {
  constructor(private server: string, private token: string | null = null) { this.server = normalizeServerUrl(server); }

  private async fetch(url: string, init: RequestInit = {}): Promise<Response> {
    init.signal?.throwIfAborted();
    const response = await providerHttpRequest(init.method || 'GET', url, Object.fromEntries(new Headers(init.headers).entries()), typeof init.body === 'string' ? init.body : undefined, { signal: init.signal ?? undefined });
    init.signal?.throwIfAborted();
    return new Response(response.status === 204 ? null : response.body, { status: response.status, headers: response.headers });
  }

  setToken(token: string | null) {
    this.token = token;
  }

  private async issueRequest<T>(owner: string, repo: string, suffix: string, method = 'GET', body?: unknown): Promise<T> {
    const res = await this.fetch(`${this.server}/api/v1/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${suffix}`, {
      method, headers: { ...this.getHeaders(), 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      cache: 'no-store', signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new ProviderApiError(res.status, await this.extractError(res));
    return res.json();
  }

  async searchIssues(owner: string, repo: string, options: IssueListOptions): Promise<IssueSearchResult> {
    const params = new URLSearchParams({ type: 'issues', state: options.state, q: options.query, page: String(options.page), limit: '30' });
    if (options.assignee) params.set('assigned_by', options.assignee);
    if (options.label) {
      const labels = await this.getIssueLabels(owner, repo); const label = labels.find(item => item.name === options.label);
      if (label) params.set('labels', String(label.id));
    }
    const response = await this.fetch(`${this.server}/api/v1/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues?${params}`, { headers: this.getHeaders() });
    if (!response.ok) throw new ProviderApiError(response.status, await this.extractError(response));
    const items = await response.json();
    return { items, total_count: Number(response.headers.get('x-total-count') || (options.page - 1) * 30 + items.length + (items.length === 30 ? 1 : 0)), incomplete_results: false };
  }

  async getIssue(owner: string, repo: string, number: number): Promise<CollaborationIssue> {
    const issue = await this.issueRequest<CollaborationIssue>(owner, repo, `issues/${number}`);
    if (issue.pull_request) throw new Error(tNow('issues.notIssue'));
    return issue;
  }
  private async issuePayload(owner: string, repo: string, input: Partial<IssueInput>) {
    const labels = input.labels ? await this.getIssueLabels(owner, repo) : [];
    return { ...input, ...(input.labels ? { labels: input.labels.map(name => { const label = labels.find(item => item.name === name); if (!label) throw new Error(`Label unavailable: ${name}`); return label.id; }) } : {}) };
  }
  async createIssue(owner: string, repo: string, input: IssueInput): Promise<CollaborationIssue> {
    return this.issueRequest(owner, repo, 'issues', 'POST', await this.issuePayload(owner, repo, input));
  }
  async updateIssue(owner: string, repo: string, number: number, input: Partial<IssueInput> & { state?: 'open' | 'closed' }): Promise<CollaborationIssue> {
    return this.issueRequest(owner, repo, `issues/${number}`, 'PATCH', await this.issuePayload(owner, repo, input));
  }
  getIssueComments(owner: string, repo: string, number: number): Promise<CollaborationIssueComment[]> {
    return this.pages(`${this.server}/api/v1/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${number}/comments?limit=100`, undefined, 'no-store');
  }
  createIssueComment(owner: string, repo: string, number: number, body: string): Promise<CollaborationIssueComment> {
    return this.issueRequest(owner, repo, `issues/${number}/comments`, 'POST', { body });
  }
  async getIssueTimeline(owner: string, repo: string, number: number): Promise<IssueTimelineEvent[]> {
    const events = await this.pages<any>(`${this.server}/api/v1/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${number}/timeline?limit=100`, undefined, 'no-store');
    return events.filter(event => event.ref_issue?.pull_request).map(event => ({ event: 'cross-referenced', source: { issue: event.ref_issue } }));
  }
  getIssueLabels(owner: string, repo: string): Promise<CollaborationLabel[]> {
    return this.pages(`${this.server}/api/v1/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/labels?limit=100`, undefined, 'no-store');
  }
  getIssueAssignees(owner: string, repo: string): Promise<IssueUser[]> {
    return this.pages(`${this.server}/api/v1/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/assignees?limit=100`, undefined, 'no-store');
  }
  async getPullRequest(owner: string, repo: string, number: number): Promise<CollaborationPullRequest> {
    return normalizePull(await this.issueRequest(owner, repo, `pulls/${number}`));
  }
  async getWorkflowCheckRuns(owner: string, repo: string, sha: string) {
    const check_runs = await this.getCommitChecks(owner, repo, sha); return { total_count: check_runs.length, check_runs };
  }
  async getWorkflowCommitStatuses(owner: string, repo: string, sha: string): Promise<{total_count:number;statuses:CollaborationCommitStatus[]}> {
    const result = await this.issueRequest<{total_count:number;statuses:CollaborationCommitStatus[]}>(owner, repo, `commits/${encodeURIComponent(sha)}/status`);
    return { total_count: result.total_count ?? result.statuses?.length ?? 0, statuses: result.statuses ?? [] };
  }
  private getHeaders(): HeadersInit {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      
    };
    if (this.token) {
      headers.Authorization = `token ${this.token}`;
    }
    return headers;
  }

  async verifyToken(token: string): Promise<CollaborationUser> {
    const res = await this.fetch(`${this.server}/api/v1/user`, {
      headers: {
        Accept: 'application/json',
        Authorization: `token ${token}`,
      },
      signal: AbortSignal.timeout(20_000),
    });

    if (!res.ok) {
      if (res.status === 401) {
        throw new ProviderApiError(401, tNow('err.ghBadCredentials'));
      }
      throw new Error(tNow('err.ghAuthFailed').replace('{s}', String(res.status)));
    }

    const raw = await res.json();
    return { ...raw, name: raw.full_name || raw.login, bio: raw.description ?? null, public_repos: raw.public_repos ?? 0 };
  }

  private async pages<T>(url: string, key?: string, cache?: RequestCache, maxPages: number = DEFAULT_MAX_PAGES): Promise<T[]> {
    const result: T[] = [];
    const visited = new Set<string>();
    let fetchedPages = 0;
    while (url && !visited.has(url)) {
      if (fetchedPages >= maxPages) break;
      if (new URL(url).origin !== new URL(this.server).origin) throw new Error('Invalid pagination URL');
      visited.add(url);
      const res = await this.fetch(url, { headers: this.getHeaders(), cache, signal: AbortSignal.timeout(20_000) });
      if (!res.ok) throw new ProviderApiError(res.status, await this.extractError(res));
      const data = await res.json();
      result.push(...(key ? data[key] || [] : data));
      url = res.headers.get('link')?.match(/<([^>]+)>;\s*rel="next"/)?.[1] || '';
      fetchedPages++;
    }
    return result;
  }

  async getRepository(owner: string, repo: string): Promise<CollaborationRepoDetails> {
    const res = await this.fetch(`${this.server}/api/v1/repos/${owner}/${repo}`, {
      headers: this.getHeaders(),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(tNow('err.ghRepoInfo').replace('{s}', String(res.status)));
    return res.json();
  }

  async getWorkflows(owner: string, repo: string): Promise<CollaborationWorkflow[]> {
    return this.pages(`${this.server}/api/v1/repos/${owner}/${repo}/actions/workflows?limit=100`, 'workflows', 'no-store');
  }

  async getWorkflowRuns(
    owner: string,
    repo: string,
    workflowId?: number | string,
    branch?: string
  ): Promise<CollaborationWorkflowRun[]> {
    const url = `${this.server}/api/v1/repos/${owner}/${repo}/actions/runs?limit=100${branch ? `&branch=${encodeURIComponent(branch)}` : ''}`;
    let runs = await this.pages<any>(url, 'workflow_runs', 'no-store');
    if (workflowId !== undefined) {
      const workflow = (await this.getWorkflows(owner, repo)).find(item => String(item.id) === String(workflowId));
      const file = workflow?.path.split('/').pop();
      runs = runs.filter(run => file && run.path?.split('@')[0].split('/').pop() === file);
    }
    return runs.map(run => ({ ...run, name: run.name || run.display_title || run.path, head_commit: run.head_commit ?? { id: run.head_sha, message: run.display_title ?? '', author: { name: '', email: '' } } }));
  }

  async getRunJobs(owner: string, repo: string, runId: number): Promise<CollaborationJob[]> {
    return this.pages(`${this.server}/api/v1/repos/${owner}/${repo}/actions/runs/${runId}/jobs?limit=100`, 'jobs', 'no-store');
  }

  async getWorkflowRun(owner: string, repo: string, runId: number): Promise<CollaborationWorkflowRun> {
    const res = await this.fetch(`${this.server}/api/v1/repos/${owner}/${repo}/actions/runs/${runId}`, {
      headers: this.getHeaders(), cache: 'no-store', signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new ProviderApiError(res.status, await this.extractError(res));
    return res.json();
  }

  async getJob(owner: string, repo: string, jobId: number): Promise<CollaborationJob> {
    const res = await this.fetch(`${this.server}/api/v1/repos/${owner}/${repo}/actions/jobs/${jobId}`, {
      headers: this.getHeaders(), signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new ProviderApiError(res.status, await this.extractError(res));
    return res.json();
  }

  async getCommitChecks(owner: string, repo: string, sha: string): Promise<CollaborationCheckRun[]> {
    const combined = await this.getWorkflowCommitStatuses(owner, repo, sha);
    return combined.statuses.map(raw => ({ id: raw.id, name: raw.context, head_sha: sha,
      status: raw.state === 'pending' ? 'queued' : 'completed',
      // Gitea 的 warning（有告警但非失败）按中立结果展示，不能渲染为失败。
      conclusion: raw.state === 'success' ? 'success' : raw.state === 'pending' ? null : raw.state === 'warning' ? 'neutral' : 'failure',
      started_at: '', completed_at: null, html_url: raw.target_url ?? '' }));
  }

  async dispatchWorkflow(
    owner: string,
    repo: string,
    workflowId: number | string,
    params: WorkflowDispatchParams
  ): Promise<void> {
    const res = await this.fetch(
      `${this.server}/api/v1/repos/${owner}/${repo}/actions/workflows/${workflowId}/dispatches`,
      {
        method: 'POST',
        headers: { ...this.getHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ref: params.ref,
          inputs: params.inputs || {},
        }),
        signal: AbortSignal.timeout(20_000),
      }
    );
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(tNow('err.ghDispatch').replace('{s}', String(res.status)).replace('{m}', errText));
    }
  }

  async rerunWorkflow(
    owner: string,
    repo: string,
    runId: number,
    failedOnly: boolean = false
  ): Promise<void> {
    const endpoint = failedOnly ? 'rerun-failed-jobs' : 'rerun';
    const res = await this.fetch(
      `${this.server}/api/v1/repos/${owner}/${repo}/actions/runs/${runId}/${endpoint}`,
      {
        method: 'POST',
        headers: this.getHeaders(),
        signal: AbortSignal.timeout(20_000),
      }
    );
    if (!res.ok) {
      throw new Error(tNow('err.ghRerun').replace('{s}', String(res.status)));
    }
  }

  async cancelWorkflowRun(): Promise<void> {
    throw new Error('Cancelling runs is unavailable through the Gitea REST API');
  }

  async getJobLogs(
    owner: string,
    repo: string,
    jobId: number
  ): Promise<JobLogsData> {
    const res = await this.fetch(
      `${this.server}/api/v1/repos/${owner}/${repo}/actions/jobs/${jobId}/logs`,
      { headers: this.getHeaders(), signal: AbortSignal.timeout(20_000) }
    );
    if (!res.ok) {
      throw new Error(tNow('err.ghLogs').replace('{s}', String(res.status)));
    }
    const rawLogs = await res.text();
    return {
      jobId,
      jobName: `Job #${jobId}`,
      rawLogs,
    };
  }

  async getWorkflowYaml(
    owner: string,
    repo: string,
    path: string,
    ref?: string,
    signal?: AbortSignal,
  ): Promise<WorkflowYamlContent> {
    const filePath = path.split('/').map(encodeURIComponent).join('/');
    const res = await this.fetch(
      `${this.server}/api/v1/repos/${owner}/${repo}/contents/${filePath}${ref ? `?ref=${encodeURIComponent(ref)}` : ''}`,
      { headers: this.getHeaders(), signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(20_000)]) : AbortSignal.timeout(20_000), cache: 'no-store' }
    );
    if (!res.ok) {
      throw new Error(tNow('err.ghYaml').replace('{s}', String(res.status)));
    }
    const data = await res.json();
    let content = '';
    if (data.encoding !== 'base64' || typeof data.content !== 'string') throw new Error(tNow('dispatch.invalidDefinition'));
    if (data.content) {
      // Decode base64 to binary string, then convert to UTF-8
      const binaryStr = atob(data.content.replace(/\s/g, ''));
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
      content = new TextDecoder('utf-8').decode(bytes);
    }
    return { path, content };
  }

  async getPullRequests(
    owner: string,
    repo: string,
    state: 'open' | 'closed' | 'all' = 'all',
    maxPages?: number
  ): Promise<CollaborationPullRequest[]> {
    return (await this.pages<CollaborationPullRequest>(
      `${this.server}/api/v1/repos/${owner}/${repo}/pulls?state=${state}&limit=100`,
      undefined,
      undefined,
      maxPages
    )).map(normalizePull);
  }

  async getPullRequestReviews(
    owner: string,
    repo: string,
    pullNumber: number
  ): Promise<CollaborationPullRequestReview[]> {
    return (await this.pages<any>(`${this.server}/api/v1/repos/${owner}/${repo}/pulls/${pullNumber}/reviews?limit=100`)).map(normalizeReview);
  }

  /** PR 变更文件列表：分页聚合（cap 10 页），>300 文件时置 truncated 标记 */
  async getPullRequestFiles(
    owner: string,
    repo: string,
    pullNumber: number,
    maxPages: number = DEFAULT_MAX_PAGES
  ): Promise<CollaborationPullRequestFilesResult> {
    const files = await this.pages<CollaborationPullRequestFile>(
      `${this.server}/api/v1/repos/${owner}/${repo}/pulls/${pullNumber}/files?limit=100`,
      undefined,
      'no-store',
      maxPages
    );
    const response = await this.fetch(`${this.server}/api/v1/repos/${owner}/${repo}/pulls/${pullNumber}.diff`, { headers: this.getHeaders(), cache: 'no-store' });
    if (!response.ok) throw new ProviderApiError(response.status, await this.extractError(response));
    const patches = diffPatches(await response.text());
    return { files: files.map(file => ({ ...file, status: (file.status as string) === 'deleted' ? 'removed' : file.status, patch: patches.get(file.filename) })), truncated: files.length >= maxPages * 100 || files.length > PR_FILES_SOFT_LIMIT };
  }

  /** 行内评审评论（锚定在 diff 行上的那些） */
  async getPullRequestReviewComments(owner: string, repo: string, number: number): Promise<CollaborationReviewComment[]> {
    const reviews = await this.getPullRequestReviews(owner, repo, number);
    const comments = await Promise.all(reviews.map(review => this.pages<any>(`${this.server}/api/v1/repos/${owner}/${repo}/pulls/${number}/reviews/${review.id}/comments?limit=100`)));
    return comments.flat().map(raw => ({ ...raw, path: raw.path, side: raw.position ? 'RIGHT' : 'LEFT', line: raw.position || null, original_line: raw.original_position || null }));
  }

  /** PR 对话区评论（issue comments，不含 review 与行内评论） */
  async getPullRequestIssueComments(
    owner: string,
    repo: string,
    pullNumber: number
  ): Promise<CollaborationIssueComment[]> {
    return this.pages<CollaborationIssueComment>(`${this.server}/api/v1/repos/${owner}/${repo}/issues/${pullNumber}/comments?limit=100`, undefined, 'no-store');
  }

  /**
   * 提交评审：APPROVE / REQUEST_CHANGES / COMMENT + 总评 body + 行内评论数组。
   * event 必须是枚举值；REQUEST_CHANGES 缺 body 的前端校验在 prReviewLogic.validateReviewSubmission（不发请求）。
   */
  async createPullRequestReview(owner: string, repo: string, number: number, params: CreateReviewParams): Promise<CollaborationPullRequestReview> {
    const raw = await this.issueRequest<any>(owner, repo, `pulls/${number}/reviews`, 'POST', {
      event: params.event === 'APPROVE' ? 'APPROVED' : params.event, body: params.body || '',
      comments: params.comments?.map(comment => ({ path: comment.path, body: comment.body, new_position: comment.side === 'RIGHT' ? comment.line : 0, old_position: comment.side === 'LEFT' ? comment.line : 0 })),
    });
    return normalizeReview(raw);
  }

  /** 从平台错误响应中提取 message 字段，便于 toast 展示 */
  private async extractError(res: Response): Promise<string> {
    try {
      const data = await res.json();
      return data?.message || `HTTP ${res.status}`;
    } catch {
      return `HTTP ${res.status}`;
    }
  }

  async createPullRequest(
    owner: string,
    repo: string,
    params: { title: string; head: string; headRepo?: string; base: string; body?: string; draft?: boolean }
  ): Promise<CollaborationPullRequest> {
    const res = await this.fetch(`${this.server}/api/v1/repos/${owner}/${repo}/pulls`, {
      method: 'POST',
      headers: {
        ...this.getHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: params.title,
        head: params.head,
        ...(params.headRepo ? { head_repo: params.headRepo } : {}),
        base: params.base,
        body: params.body || '',
        draft: params.draft ?? false,
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      throw new Error(await this.extractError(res));
    }
    return normalizePull(await res.json());
  }

  async mergePullRequest(owner: string, repo: string, number: number, options?: {mergeMethod?:'merge'|'squash'|'rebase';expectedHeadSha?:string;commitTitle?:string;commitMessage?:string}) {
    const response = await this.fetch(`${this.server}/api/v1/repos/${owner}/${repo}/pulls/${number}/merge`, { method: 'POST',
      headers: { ...this.getHeaders(), 'Content-Type':'application/json' }, body: JSON.stringify({ Do: options?.mergeMethod ?? 'merge', head_commit_id: options?.expectedHeadSha, MergeTitleField: options?.commitTitle, MergeMessageField: options?.commitMessage }) });
    if (!response.ok) throw new ProviderApiError(response.status, await this.extractError(response));
    return { merged: response.status !== 202, message: response.status === 202 ? 'Merge scheduled' : 'Merged' };
  }

  async updatePullRequestState(
    owner: string,
    repo: string,
    pullNumber: number,
    state: 'closed' | 'open'
  ): Promise<CollaborationPullRequest> {
    const res = await this.fetch(
      `${this.server}/api/v1/repos/${owner}/${repo}/pulls/${pullNumber}`,
      {
        method: 'PATCH',
        headers: {
          ...this.getHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ state }),
        signal: AbortSignal.timeout(20_000),
      }
    );
    if (!res.ok) {
      throw new Error(await this.extractError(res));
    }
    return normalizePull(await res.json());
  }

  async getRepositoryDefaultBranch(owner: string, repo: string): Promise<string> {
    const details = await this.getRepository(owner, repo);
    return details.default_branch || 'main';
  }

}



