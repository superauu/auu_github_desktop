import { tNow } from '@/i18n';
import {
  GitHubCheckRun,
  GitHubJob,
  GitHubPullRequest,
  GitHubRepoDetails,
  GitHubUser,
  GitHubWorkflow,
  GitHubWorkflowRun,
  GitHubReview,
  JobLogsData,
  WorkflowDispatchParams,
  WorkflowYamlContent,
} from './types';

export class GitHubApiError extends Error {
  constructor(public status: number, message: string) { super(message); this.name = 'GitHubApiError'; }
}

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
    });

    if (!res.ok) {
      if (res.status === 401) {
        throw new GitHubApiError(401, tNow('err.ghBadCredentials'));
      }
      throw new Error(tNow('err.ghAuthFailed').replace('{s}', String(res.status)));
    }

    return res.json();
  }

  private async pages<T>(url: string, key?: string, cache?: RequestCache): Promise<T[]> {
    const result: T[] = [];
    const visited = new Set<string>();
    while (url && !visited.has(url)) {
      if (new URL(url).origin !== 'https://api.github.com') throw new Error('Invalid pagination URL');
      visited.add(url);
      const res = await fetch(url, { headers: this.getHeaders(), cache, signal: AbortSignal.timeout(20_000) });
      if (!res.ok) throw new GitHubApiError(res.status, await this.extractGitHubError(res));
      const data = await res.json();
      result.push(...(key ? data[key] || [] : data));
      url = res.headers.get('link')?.match(/<([^>]+)>;\s*rel="next"/)?.[1] || '';
    }
    return result;
  }

  async getRepository(owner: string, repo: string): Promise<GitHubRepoDetails> {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers: this.getHeaders(),
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
      { headers: this.getHeaders() }
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
    state: 'open' | 'closed' | 'all' = 'all'
  ): Promise<GitHubPullRequest[]> {
    return this.pages<GitHubPullRequest>(
      `https://api.github.com/repos/${owner}/${repo}/pulls?state=${state}&per_page=100`
    );
  }

  async getPullRequestReviews(
    owner: string,
    repo: string,
    pullNumber: number
  ): Promise<GitHubReview[]> {
    return this.pages<GitHubReview>(`https://api.github.com/repos/${owner}/${repo}/pulls/${pullNumber}/reviews?per_page=100`);
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

