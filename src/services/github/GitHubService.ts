import { tNow } from '@/i18n';
import {
  GitHubCheckRun,
  GitHubJob,
  GitHubPullRequest,
  GitHubRepoDetails,
  GitHubUser,
  GitHubWorkflow,
  GitHubWorkflowRun,
  JobLogsData,
  WorkflowDispatchParams,
  WorkflowYamlContent,
} from './types';

export class GitHubApiError extends Error {
  constructor(public status: number, message: string) { super(message); this.name = 'GitHubApiError'; }
}

/** 上限保护：巨型仓库的列表接口不能无限翻页拖垮 UI */
const DEFAULT_MAX_PAGES = 10;

/** PR 评审事件枚举（create review 的 event 字段） */
export type ReviewEvent = 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT';
const REVIEW_EVENTS: readonly ReviewEvent[] = ['APPROVE', 'REQUEST_CHANGES', 'COMMENT'];

/** createPullRequestReview 的单条行内评论输入；对 diff 可见行评论（v1 不支持跨行区间） */
export interface ReviewCommentInput {
  path: string;
  /** 评论锚定的行号（RIGHT=新文件行号，LEFT=旧文件行号），由调用方传入 */
  line?: number;
  side?: 'LEFT' | 'RIGHT';
  body: string;
}

export interface CreateReviewParams {
  event: ReviewEvent;
  body?: string;
  comments?: ReviewCommentInput[];
}

/** GET /pulls/{n}/files 的单个文件（patch 为 unified diff 文本，二进制/超大文件为 undefined） */
export interface GitHubPullRequestFile {
  sha: string;
  filename: string;
  previous_filename?: string;
  status: 'added' | 'removed' | 'modified' | 'renamed' | 'changed' | 'copied' | 'unchanged';
  additions: number;
  deletions: number;
  changes: number;
  blob_url?: string;
  raw_url?: string;
  patch?: string;
}

export interface GitHubPullRequestFilesResult {
  files: GitHubPullRequestFile[];
  /** 文件数超过软上限（>300）时为 true，UI 据此显示截断提示 */
  truncated: boolean;
}

/** 评审时间线条目（含 body 的完整 review；PENDING 无 submitted_at） */
export interface GitHubPullRequestReview {
  id: number;
  user: { login: string; avatar_url?: string };
  state: 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED' | 'DISMISSED' | 'PENDING';
  body: string;
  submitted_at: string | null;
  commit_id?: string | null;
  html_url?: string;
}

/** 行内评审评论（GET /pulls/{n}/comments）；LEFT 侧评论 line 为 null，行号在 original_line */
export interface GitHubReviewComment {
  id: number;
  path: string;
  side?: 'LEFT' | 'RIGHT';
  line?: number | null;
  original_line?: number | null;
  in_reply_to_id?: number | null;
  body: string;
  user: { login: string; avatar_url?: string };
  diff_hunk?: string;
  created_at: string;
  updated_at: string;
  html_url?: string;
}

/** PR 对话区评论（GET issues/{n}/comments） */
export interface GitHubIssueComment {
  id: number;
  user: { login: string; avatar_url?: string };
  body: string;
  created_at: string;
  updated_at: string;
  html_url?: string;
}

/** 文件列表的展示软上限：超过即标记截断（UI 只渲染前 300 个文件） */
export const PR_FILES_SOFT_LIMIT = 300;

export class GitHubService {
  private token: string | null = null;

  setToken(token: string | null) {
    this.token = token;
  }

  private getHeaders(): HeadersInit {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    };
    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }
    return headers;
  }

  async verifyToken(token: string): Promise<GitHubUser> {
    const res = await fetch('https://api.github.com/user', {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
      },
      signal: AbortSignal.timeout(20_000),
    });

    if (!res.ok) {
      if (res.status === 401) {
        throw new GitHubApiError(401, tNow('err.ghBadCredentials'));
      }
      throw new Error(tNow('err.ghAuthFailed').replace('{s}', String(res.status)));
    }

    return res.json();
  }

  private async pages<T>(url: string, key?: string, cache?: RequestCache, maxPages: number = DEFAULT_MAX_PAGES): Promise<T[]> {
    const result: T[] = [];
    const visited = new Set<string>();
    let fetchedPages = 0;
    while (url && !visited.has(url)) {
      if (fetchedPages >= maxPages) break;
      if (new URL(url).origin !== 'https://api.github.com') throw new Error('Invalid pagination URL');
      visited.add(url);
      const res = await fetch(url, { headers: this.getHeaders(), cache, signal: AbortSignal.timeout(20_000) });
      if (!res.ok) throw new GitHubApiError(res.status, await this.extractGitHubError(res));
      const data = await res.json();
      result.push(...(key ? data[key] || [] : data));
      url = res.headers.get('link')?.match(/<([^>]+)>;\s*rel="next"/)?.[1] || '';
      fetchedPages++;
    }
    return result;
  }

  async getRepository(owner: string, repo: string): Promise<GitHubRepoDetails> {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers: this.getHeaders(),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(tNow('err.ghRepoInfo').replace('{s}', String(res.status)));
    return res.json();
  }

  async getWorkflows(owner: string, repo: string): Promise<GitHubWorkflow[]> {
    return this.pages(`https://api.github.com/repos/${owner}/${repo}/actions/workflows?per_page=100`, 'workflows', 'no-store');
  }

  async getWorkflowRuns(
    owner: string,
    repo: string,
    workflowId?: number
  ): Promise<GitHubWorkflowRun[]> {
    const url = workflowId
      ? `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflowId}/runs?per_page=20`
      : `https://api.github.com/repos/${owner}/${repo}/actions/runs?per_page=20`;

    const res = await fetch(url, { headers: this.getHeaders(), cache: 'no-store', signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new Error(await this.extractGitHubError(res));
    const data = await res.json();
    return data.workflow_runs || [];
  }

  async getRunJobs(owner: string, repo: string, runId: number): Promise<GitHubJob[]> {
    return this.pages(`https://api.github.com/repos/${owner}/${repo}/actions/runs/${runId}/jobs?per_page=100`, 'jobs', 'no-store');
  }

  async getWorkflowRun(owner: string, repo: string, runId: number): Promise<GitHubWorkflowRun> {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/actions/runs/${runId}`, {
      headers: this.getHeaders(), cache: 'no-store', signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new GitHubApiError(res.status, await this.extractGitHubError(res));
    return res.json();
  }

  async getJob(owner: string, repo: string, jobId: number): Promise<GitHubJob> {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/actions/jobs/${jobId}`, {
      headers: this.getHeaders(), signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new GitHubApiError(res.status, await this.extractGitHubError(res));
    return res.json();
  }

  async getCommitChecks(
    owner: string,
    repo: string,
    sha: string
  ): Promise<GitHubCheckRun[]> {
    return this.pages(`https://api.github.com/repos/${owner}/${repo}/commits/${sha}/check-runs?per_page=100`, 'check_runs');
  }

  async dispatchWorkflow(
    owner: string,
    repo: string,
    workflowId: number | string,
    params: WorkflowDispatchParams
  ): Promise<void> {
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflowId}/dispatches`,
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
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/actions/runs/${runId}/${endpoint}`,
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

  async cancelWorkflowRun(
    owner: string,
    repo: string,
    runId: number
  ): Promise<void> {
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/actions/runs/${runId}/cancel`,
      {
        method: 'POST',
        headers: this.getHeaders(),
        signal: AbortSignal.timeout(20_000),
      }
    );
    if (!res.ok) {
      throw new Error(tNow('err.ghCancel').replace('{s}', String(res.status)));
    }
  }

  async getJobLogs(
    owner: string,
    repo: string,
    jobId: number
  ): Promise<JobLogsData> {
    if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
      const { invoke } = await import('@tauri-apps/api/core');
      const rawLogs = await invoke<string>('get_github_job_logs', { owner, repo, jobId, token: this.token });
      return { jobId, jobName: `Job #${jobId}`, rawLogs };
    }
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/actions/jobs/${jobId}/logs`,
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
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}${ref ? `?ref=${encodeURIComponent(ref)}` : ''}`,
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
  ): Promise<GitHubPullRequest[]> {
    return this.pages<GitHubPullRequest>(
      `https://api.github.com/repos/${owner}/${repo}/pulls?state=${state}&per_page=100`,
      undefined,
      undefined,
      maxPages
    );
  }

  async getPullRequestReviews(
    owner: string,
    repo: string,
    pullNumber: number
  ): Promise<GitHubPullRequestReview[]> {
    return this.pages<GitHubPullRequestReview>(`https://api.github.com/repos/${owner}/${repo}/pulls/${pullNumber}/reviews?per_page=100`);
  }

  /** PR 变更文件列表：分页聚合（cap 10 页），>300 文件时置 truncated 标记 */
  async getPullRequestFiles(
    owner: string,
    repo: string,
    pullNumber: number,
    maxPages: number = DEFAULT_MAX_PAGES
  ): Promise<GitHubPullRequestFilesResult> {
    const files = await this.pages<GitHubPullRequestFile>(
      `https://api.github.com/repos/${owner}/${repo}/pulls/${pullNumber}/files?per_page=100`,
      undefined,
      'no-store',
      maxPages
    );
    return { files, truncated: files.length > PR_FILES_SOFT_LIMIT };
  }

  /** 行内评审评论（锚定在 diff 行上的那些） */
  async getPullRequestReviewComments(
    owner: string,
    repo: string,
    pullNumber: number
  ): Promise<GitHubReviewComment[]> {
    return this.pages<GitHubReviewComment>(`https://api.github.com/repos/${owner}/${repo}/pulls/${pullNumber}/comments?per_page=100`, undefined, 'no-store');
  }

  /** PR 对话区评论（issue comments，不含 review 与行内评论） */
  async getPullRequestIssueComments(
    owner: string,
    repo: string,
    pullNumber: number
  ): Promise<GitHubIssueComment[]> {
    return this.pages<GitHubIssueComment>(`https://api.github.com/repos/${owner}/${repo}/issues/${pullNumber}/comments?per_page=100`, undefined, 'no-store');
  }

  /**
   * 提交评审：APPROVE / REQUEST_CHANGES / COMMENT + 总评 body + 行内评论数组。
   * event 必须是枚举值；REQUEST_CHANGES 缺 body 的前端校验在 prReviewLogic.validateReviewSubmission（不发请求）。
   */
  async createPullRequestReview(
    owner: string,
    repo: string,
    pullNumber: number,
    params: CreateReviewParams
  ): Promise<GitHubPullRequestReview> {
    if (!REVIEW_EVENTS.includes(params.event)) {
      throw new GitHubApiError(400, tNow('prReview.invalidEvent'));
    }
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls/${pullNumber}/reviews`, {
      method: 'POST',
      headers: {
        ...this.getHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        event: params.event,
        body: params.body || '',
        comments: (params.comments || []).map(comment => ({
          path: comment.path,
          body: comment.body,
          ...(typeof comment.line === 'number' ? { line: comment.line } : {}),
          ...(comment.side ? { side: comment.side } : {}),
        })),
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      throw new GitHubApiError(res.status, await this.extractGitHubError(res));
    }
    return res.json();
  }

  /** 从错误响应中提取 GitHub 返回的 message 字段，便于 toast 展示 */
  private async extractGitHubError(res: Response): Promise<string> {
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
  ): Promise<GitHubPullRequest> {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls`, {
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
      throw new Error(await this.extractGitHubError(res));
    }
    return res.json();
  }

  async mergePullRequest(
    owner: string,
    repo: string,
    pullNumber: number,
    options?: { mergeMethod?: 'merge' | 'squash' | 'rebase'; commitTitle?: string; commitMessage?: string }
  ): Promise<{ merged: boolean; message: string }> {
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/pulls/${pullNumber}/merge`,
      {
        method: 'PUT',
        headers: {
          ...this.getHeaders(),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          merge_method: options?.mergeMethod || 'merge',
          commit_title: options?.commitTitle,
          commit_message: options?.commitMessage,
        }),
        signal: AbortSignal.timeout(20_000),
      }
    );
    if (!res.ok) {
      throw new Error(await this.extractGitHubError(res));
    }
    return res.json();
  }

  async updatePullRequestState(
    owner: string,
    repo: string,
    pullNumber: number,
    state: 'closed' | 'open'
  ): Promise<GitHubPullRequest> {
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/pulls/${pullNumber}`,
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
      throw new Error(await this.extractGitHubError(res));
    }
    return res.json();
  }

  async getRepositoryDefaultBranch(owner: string, repo: string): Promise<string> {
    const details = await this.getRepository(owner, repo);
    return details.default_branch || 'main';
  }

}

export const githubService = new GitHubService();

