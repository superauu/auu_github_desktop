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
        throw new Error('GitHub 凭证无效或已过期 (Bad credentials)');
      }
      throw new Error(`GitHub 认证失败: HTTP ${res.status}`);
    }

    return res.json();
  }

  async getRepository(owner: string, repo: string): Promise<GitHubRepoDetails> {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers: this.getHeaders(),
    });
    if (!res.ok) throw new Error(`获取仓库信息失败: HTTP ${res.status}`);
    return res.json();
  }

  async getWorkflows(owner: string, repo: string): Promise<GitHubWorkflow[]> {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/actions/workflows`, {
      headers: this.getHeaders(),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.workflows || [];
  }

  async getWorkflowRuns(
    owner: string,
    repo: string,
    workflowId?: number
  ): Promise<GitHubWorkflowRun[]> {
    const url = workflowId
      ? `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflowId}/runs?per_page=20`
      : `https://api.github.com/repos/${owner}/${repo}/actions/runs?per_page=20`;

    const res = await fetch(url, { headers: this.getHeaders() });
    if (!res.ok) return [];
    const data = await res.json();
    return data.workflow_runs || [];
  }

  async getRunJobs(owner: string, repo: string, runId: number): Promise<GitHubJob[]> {
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/actions/runs/${runId}/jobs`,
      { headers: this.getHeaders() }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return data.jobs || [];
  }

  async getCommitChecks(
    owner: string,
    repo: string,
    sha: string
  ): Promise<GitHubCheckRun[]> {
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/commits/${sha}/check-runs`,
      { headers: this.getHeaders() }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return data.check_runs || [];
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
        headers: this.getHeaders(),
        body: JSON.stringify({
          ref: params.ref,
          inputs: params.inputs || {},
        }),
      }
    );
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`触发工作流调度失败 (HTTP ${res.status}): ${errText}`);
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
      throw new Error(`重新运行工作流失败 (HTTP ${res.status})`);
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
      throw new Error(`取消工作流运行失败 (HTTP ${res.status})`);
    }
  }

  async getJobLogs(
    owner: string,
    repo: string,
    jobId: number
  ): Promise<JobLogsData> {
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/actions/jobs/${jobId}/logs`,
      { headers: this.getHeaders() }
    );
    if (!res.ok) {
      throw new Error(`获取构建日志失败 (HTTP ${res.status})`);
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
    path: string
  ): Promise<WorkflowYamlContent> {
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
      { headers: this.getHeaders() }
    );
    if (!res.ok) {
      throw new Error(`获取工作流配置文件失败 (HTTP ${res.status})`);
    }
    const data = await res.json();
    const content = data.content ? atob(data.content.replace(/\s/g, '')) : '';
    return { path, content };
  }

  async getPullRequests(
    owner: string,
    repo: string,
    state: 'open' | 'closed' | 'all' = 'all'
  ): Promise<GitHubPullRequest[]> {
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/pulls?state=${state}&per_page=30`,
      { headers: this.getHeaders() }
    );
    if (!res.ok) return [];
    return res.json();
  }

  async getPullRequestReviews(
    owner: string,
    repo: string,
    pullNumber: number
  ): Promise<GitHubReview[]> {
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/pulls/${pullNumber}/reviews`,
      { headers: this.getHeaders() }
    );
    if (!res.ok) return [];
    return res.json();
  }

}

export const githubService = new GitHubService();

