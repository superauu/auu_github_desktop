import {
  GitHubCheckRun,
  GitHubJob,
  GitHubRepoDetails,
  GitHubUser,
  GitHubWorkflow,
  GitHubWorkflowRun,
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

  // High-fidelity fallback / demo fixtures (PRD Section 21 ~ 25)
  getDemoWorkflows(): GitHubWorkflow[] {
    return [
      {
        id: 101,
        name: 'CI & Automated Tests',
        path: '.github/workflows/ci.yml',
        state: 'active',
        html_url: '#',
        badge_url: '#',
      },
      {
        id: 102,
        name: 'Tauri Desktop Build & Packaging',
        path: '.github/workflows/tauri-build.yml',
        state: 'active',
        html_url: '#',
        badge_url: '#',
      },
      {
        id: 103,
        name: 'Docker Production Release',
        path: '.github/workflows/docker.yml',
        state: 'active',
        html_url: '#',
        badge_url: '#',
      },
      {
        id: 104,
        name: 'Documentation Deploy',
        path: '.github/workflows/docs.yml',
        state: 'active',
        html_url: '#',
        badge_url: '#',
      },
    ];
  }

  getDemoWorkflowRuns(workflowId?: number): GitHubWorkflowRun[] {
    const allRuns: GitHubWorkflowRun[] = [
      {
        id: 501,
        name: 'CI & Automated Tests',
        head_branch: 'master',
        head_sha: 'd59dded',
        event: 'push',
        status: 'completed',
        conclusion: 'success',
        html_url: '#',
        created_at: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
        updated_at: new Date(Date.now() - 1000 * 60 * 10).toISOString(),
        run_number: 48,
        run_attempt: 1,
        duration_ms: 124000,
        actor: {
          login: 'superauu',
          avatar_url: 'https://avatars.githubusercontent.com/u/9919?v=4',
        },
        head_commit: {
          id: 'd59dded',
          message: 'feat: 完成 Phase 2 Git Core (TASK-005 ~ TASK-013)',
          author: { name: 'superauu', email: 'yibo.li@gmail.com' },
        },
      },
      {
        id: 502,
        name: 'Tauri Desktop Build & Packaging',
        head_branch: 'master',
        head_sha: 'd59dded',
        event: 'push',
        status: 'completed',
        conclusion: 'success',
        html_url: '#',
        created_at: new Date(Date.now() - 1000 * 60 * 25).toISOString(),
        updated_at: new Date(Date.now() - 1000 * 60 * 21).toISOString(),
        run_number: 14,
        run_attempt: 1,
        duration_ms: 245000,
        actor: {
          login: 'superauu',
          avatar_url: 'https://avatars.githubusercontent.com/u/9919?v=4',
        },
        head_commit: {
          id: 'd59dded',
          message: 'feat: 完成 Phase 2 Git Core (TASK-005 ~ TASK-013)',
          author: { name: 'superauu', email: 'yibo.li@gmail.com' },
        },
      },
      {
        id: 503,
        name: 'CI & Automated Tests',
        head_branch: 'feature/phase2-git-core',
        head_sha: 'bd8a8bd',
        event: 'pull_request',
        status: 'completed',
        conclusion: 'success',
        html_url: '#',
        created_at: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
        updated_at: new Date(Date.now() - 1000 * 60 * 60 * 2 + 95000).toISOString(),
        run_number: 47,
        run_attempt: 1,
        duration_ms: 95000,
        actor: {
          login: 'superauu',
          avatar_url: 'https://avatars.githubusercontent.com/u/9919?v=4',
        },
        head_commit: {
          id: 'bd8a8bd',
          message: 'feat: 完成 Phase 1 基础架构 (TASK-001 ~ TASK-004)',
          author: { name: 'superauu', email: 'yibo.li@gmail.com' },
        },
      },
      {
        id: 504,
        name: 'Docker Production Release',
        head_branch: 'master',
        head_sha: 'a109283',
        event: 'workflow_dispatch',
        status: 'completed',
        conclusion: 'failure',
        html_url: '#',
        created_at: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
        updated_at: new Date(Date.now() - 1000 * 60 * 60 * 24 + 180000).toISOString(),
        run_number: 12,
        run_attempt: 1,
        duration_ms: 180000,
        actor: {
          login: 'alex-dev',
          avatar_url: 'https://avatars.githubusercontent.com/u/9920?v=4',
        },
        head_commit: {
          id: 'a109283',
          message: 'chore: 初始化 Tauri 2 + React + TypeScript 骨架',
          author: { name: 'Alex Developer', email: 'alex@example.com' },
        },
      },
    ];

    if (workflowId === 101) return allRuns.filter((r) => r.id === 501 || r.id === 503);
    if (workflowId === 102) return allRuns.filter((r) => r.id === 502);
    if (workflowId === 103) return allRuns.filter((r) => r.id === 504);
    return allRuns;
  }

  getDemoJobs(runId: number): GitHubJob[] {
    if (runId === 504) {
      return [
        {
          id: 901,
          run_id: 504,
          name: 'Setup Docker Buildx',
          status: 'completed',
          conclusion: 'success',
          started_at: '2026-09-05T14:00:00Z',
          completed_at: '2026-09-05T14:00:15Z',
          html_url: '#',
          steps: [
            { name: 'Set up QEMU', status: 'completed', conclusion: 'success', number: 1 },
            { name: 'Set up Docker Buildx', status: 'completed', conclusion: 'success', number: 2 },
          ],
        },
        {
          id: 902,
          run_id: 504,
          name: 'Build and push container image',
          status: 'completed',
          conclusion: 'failure',
          started_at: '2026-09-05T14:00:16Z',
          completed_at: '2026-09-05T14:02:40Z',
          html_url: '#',
          steps: [
            { name: 'Log in to Container Registry', status: 'completed', conclusion: 'success', number: 1 },
            { name: 'Build and push image', status: 'completed', conclusion: 'failure', number: 2 },
          ],
        },
      ];
    }

    return [
      {
        id: 801,
        run_id: runId,
        name: 'Typecheck & Linting',
        status: 'completed',
        conclusion: 'success',
        started_at: '2026-09-06T14:30:00Z',
        completed_at: '2026-09-06T14:30:35Z',
        html_url: '#',
        steps: [
          { name: 'Checkout repository', status: 'completed', conclusion: 'success', number: 1 },
          { name: 'Setup Node.js 20.x', status: 'completed', conclusion: 'success', number: 2 },
          { name: 'Install dependencies', status: 'completed', conclusion: 'success', number: 3 },
          { name: 'Run tsc --noEmit', status: 'completed', conclusion: 'success', number: 4 },
        ],
      },
      {
        id: 802,
        run_id: runId,
        name: 'Unit Tests & Coverage',
        status: 'completed',
        conclusion: 'success',
        started_at: '2026-09-06T14:30:36Z',
        completed_at: '2026-09-06T14:31:45Z',
        html_url: '#',
        steps: [
          { name: 'Checkout repository', status: 'completed', conclusion: 'success', number: 1 },
          { name: 'Run vitest run', status: 'completed', conclusion: 'success', number: 2 },
          { name: 'Upload coverage artifact', status: 'completed', conclusion: 'success', number: 3 },
        ],
      },
      {
        id: 803,
        run_id: runId,
        name: 'Bundle Verification',
        status: 'completed',
        conclusion: 'success',
        started_at: '2026-09-06T14:31:46Z',
        completed_at: '2026-09-06T14:32:04Z',
        html_url: '#',
        steps: [
          { name: 'Run vite build', status: 'completed', conclusion: 'success', number: 1 },
          { name: 'Verify bundle size < 500KB', status: 'completed', conclusion: 'success', number: 2 },
        ],
      },
    ];
  }

  getDemoCommitChecks(sha: string): GitHubCheckRun[] {
    return [
      {
        id: 1,
        name: 'Typecheck & Linting',
        head_sha: sha,
        status: 'completed',
        conclusion: 'success',
        started_at: '2026-09-06T17:30:00Z',
        completed_at: '2026-09-06T17:30:45Z',
        html_url: '#',
      },
      {
        id: 2,
        name: 'Vitest Unit Tests',
        head_sha: sha,
        status: 'completed',
        conclusion: 'success',
        started_at: '2026-09-06T17:30:46Z',
        completed_at: '2026-09-06T17:31:35Z',
        html_url: '#',
      },
      {
        id: 3,
        name: 'Vite Production Bundle Verification',
        head_sha: sha,
        status: 'completed',
        conclusion: 'success',
        started_at: '2026-09-06T17:31:36Z',
        completed_at: '2026-09-06T17:31:55Z',
        html_url: '#',
      },
      {
        id: 4,
        name: 'Tauri 2 Cross-Platform Check',
        head_sha: sha,
        status: 'completed',
        conclusion: 'success',
        started_at: '2026-09-06T17:31:56Z',
        completed_at: '2026-09-06T17:32:40Z',
        html_url: '#',
      },
    ];
  }
}

export const githubService = new GitHubService();
