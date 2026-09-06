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

  getDemoJobLogs(jobId: number): JobLogsData {
    return {
      jobId,
      jobName: `Job #${jobId} (CI & Automated Tests)`,
      rawLogs: `2026-09-06T14:30:12.3920110Z ##[group]Operating System
2026-09-06T14:30:12.3920720Z Ubuntu
2026-09-06T14:30:12.3920950Z 24.04.1 LTS
2026-09-06T14:30:12.3921200Z ##[endgroup]
2026-09-06T14:30:13.1042300Z ##[group]Run actions/checkout@v4
2026-09-06T14:30:13.1043200Z Syncing repository: superauu/auu_github_desktop
2026-09-06T14:30:13.4891100Z Getting Git version info...
2026-09-06T14:30:13.5123000Z git version 2.46.0
2026-09-06T14:30:13.5184000Z Initializing repository
2026-09-06T14:30:13.8211000Z Fetching the repository (ref: refs/heads/master)
2026-09-06T14:30:14.2104000Z Checking out d59dded...
2026-09-06T14:30:14.2401000Z ##[endgroup]
2026-09-06T14:30:15.0112000Z ##[group]Setup Node.js environment
2026-09-06T14:30:15.0113000Z Resolved node v20.17.0 from cache
2026-09-06T14:30:15.4201000Z npm cache hit (key: npm-linux-x64-39829f01)
2026-09-06T14:30:15.9123000Z ##[endgroup]
2026-09-06T14:30:16.1023000Z ##[group]Run npx tsc --noEmit
2026-09-06T14:30:17.8421000Z \x1b[32m✔ TypeScript typecheck passed without errors (0 issues found)\x1b[0m
2026-09-06T14:30:17.8431000Z ##[endgroup]
2026-09-06T14:30:18.0123000Z ##[group]Run npm run test:unit
2026-09-06T14:30:19.4921000Z  \x1b[32m✓\x1b[0m src/services/git/PorcelainParser.test.ts (14 tests passed)
2026-09-06T14:30:20.1021000Z  \x1b[32m✓\x1b[0m src/stores/repoStore.test.ts (8 tests passed)
2026-09-06T14:30:20.6121000Z  \x1b[32m✓\x1b[0m src/features/graph/GitGraphRenderer.test.ts (6 tests passed)
2026-09-06T14:30:21.0121000Z 
2026-09-06T14:30:21.0123000Z  \x1b[1mTest Files\x1b[0m  \x1b[32m3 passed\x1b[0m (3)
2026-09-06T14:30:21.0125000Z       \x1b[1mTests\x1b[0m  \x1b[32m28 passed\x1b[0m (28)
2026-09-06T14:30:21.0127000Z    \x1b[1mDuration\x1b[0m  3.17s
2026-09-06T14:30:21.0130000Z ##[endgroup]
2026-09-06T14:30:22.1021000Z ##[group]Run npm run build
2026-09-06T14:30:24.4921000Z ✓ 1693 modules transformed.
2026-09-06T14:30:25.1021000Z dist/index.html                   0.96 kB │ gzip:   0.53 kB
2026-09-06T14:30:25.1023000Z dist/assets/index-DqjOwbXk.css   33.34 kB │ gzip:   6.49 kB
2026-09-06T14:30:25.1025000Z dist/assets/index-ebTGMBfF.js   392.92 kB │ gzip: 118.49 kB
2026-09-06T14:30:25.1027000Z \x1b[32m✓ built in 5.38s\x1b[0m
2026-09-06T14:30:25.1030000Z ##[endgroup]
2026-09-06T14:30:26.0121000Z Post job cleanup completed successfully.`,
    };
  }

  getDemoWorkflowYaml(workflowId: number): WorkflowYamlContent {
    if (workflowId === 102) {
      return {
        path: '.github/workflows/tauri-build.yml',
        content: `name: 'Tauri Desktop Build & Packaging'

on:
  push:
    branches:
      - master
      - 'release/**'
  workflow_dispatch:
    inputs:
      release_tag:
        description: 'Target Release Tag (e.g. v1.0.0)'
        required: false
        default: 'v1.0.0'
      channel:
        description: 'Release Channel'
        required: true
        default: 'stable'
        type: choice
        options:
          - stable
          - beta
          - nightly

jobs:
  build-tauri:
    strategy:
      fail-fast: false
      matrix:
        include:
          - platform: 'macos-latest'
            args: '--target universal-apple-darwin'
          - platform: 'ubuntu-22.04'
            args: ''
          - platform: 'windows-latest'
            args: ''

    runs-on: \${{ matrix.platform }}
    steps:
      - uses: actions/checkout@v4
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'
      - name: Install Rust Stable
        uses: dtolnay/rust-toolchain@stable
      - name: Install Dependencies
        run: npm ci
      - name: Build Tauri Desktop App
        uses: tauri-apps/tauri-action@v0
        env:
          GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}`,
      };
    }

    return {
      path: '.github/workflows/ci.yml',
      content: `name: 'CI & Automated Tests'

on:
  push:
    branches: [ master, main, 'feature/**' ]
  pull_request:
    branches: [ master, main ]
  workflow_dispatch:
    inputs:
      test_suite:
        description: 'Specific Test Suite to Run'
        required: false
        default: 'all'

jobs:
  lint-and-typecheck:
    name: 'Typecheck & Linting'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npx tsc --noEmit

  unit-tests:
    name: 'Vitest Unit Tests'
    needs: lint-and-typecheck
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npm run test:unit`,
    };
  }

  getDemoPullRequests(): GitHubPullRequest[] {
    return [
      {
        id: 201,
        number: 42,
        title: 'feat: 深度 GitHub Actions 调度、日志终端与 PR 审查系统',
        state: 'open',
        merged_at: null,
        created_at: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(),
        updated_at: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
        body: `### 变更概述
1. **GitHub Actions 深度集成**：支持直接在客户端调度运行 (workflow_dispatch)、重新运行与取消任务。
2. **ANSI 日志终端**：支持查看 Job 与步骤的实时构建日志，带 ANSI 彩色高亮。
3. **Pull Requests 模块**：支持 PR 列表查看、评审状态过滤与一键检出到本地工作区！
4. **Stash 贮藏系统**：支持一键暂存与堆栈可视化。

### 关联 Issues
Closes #18, Closes #19`,
        html_url: 'https://github.com/superauu/auu_github_desktop/pull/42',
        user: {
          login: 'superauu',
          avatar_url: 'https://avatars.githubusercontent.com/u/9919?v=4',
        },
        head: {
          ref: 'feature/phase6-deep-actions-and-pr',
          sha: '4abef50',
          label: 'superauu:feature/phase6-deep-actions-and-pr',
        },
        base: {
          ref: 'master',
          sha: 'd59dded',
        },
        labels: [
          { id: 1, name: 'enhancement', color: 'a2eeef', description: '新功能与特性增强' },
          { id: 2, name: 'ui/ux', color: 'd4c5f9', description: '高保真 UI 与交互打磨' },
        ],
        review_status: 'APPROVED',
        checks_summary: {
          total: 4,
          success: 4,
          failure: 0,
        },
        additions: 1420,
        deletions: 118,
        changed_files: 9,
      },
      {
        id: 202,
        number: 41,
        title: 'feat: Phase 5 黑曜石暗黑设计系统与 SVG 贝塞尔多分支 Git Graph',
        state: 'closed',
        merged_at: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
        created_at: new Date(Date.now() - 1000 * 60 * 60 * 8).toISOString(),
        updated_at: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
        body: `重构界面设计系统为 Obsidian Dark，新增基于贝塞尔曲线的 SVG Git Graph 渲染器，支持行对齐与动态光晕。`,
        html_url: 'https://github.com/superauu/auu_github_desktop/pull/41',
        user: {
          login: 'superauu',
          avatar_url: 'https://avatars.githubusercontent.com/u/9919?v=4',
        },
        head: {
          ref: 'feature/phase5-ui-polish',
          sha: '4abef50',
          label: 'superauu:feature/phase5-ui-polish',
        },
        base: {
          ref: 'master',
          sha: 'c492d3b',
        },
        labels: [
          { id: 2, name: 'ui/ux', color: 'd4c5f9', description: 'UI 质感升级' },
        ],
        review_status: 'APPROVED',
        checks_summary: {
          total: 3,
          success: 3,
          failure: 0,
        },
        additions: 1008,
        deletions: 302,
        changed_files: 11,
      },
      {
        id: 203,
        number: 40,
        title: 'perf: 优化 Porcelain v2 解析性能与三栏卡顿',
        state: 'closed',
        merged_at: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
        created_at: new Date(Date.now() - 1000 * 60 * 60 * 30).toISOString(),
        updated_at: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
        body: `将单次 git status 从 120ms 降至 18ms，提高大数据量下的响应流畅度。`,
        html_url: 'https://github.com/superauu/auu_github_desktop/pull/40',
        user: {
          login: 'alex-dev',
          avatar_url: 'https://avatars.githubusercontent.com/u/9920?v=4',
        },
        head: {
          ref: 'perf/porcelain-parser',
          sha: 'c492d3b',
          label: 'alex-dev:perf/porcelain-parser',
        },
        base: {
          ref: 'master',
          sha: 'bd8a8bd',
        },
        labels: [
          { id: 3, name: 'performance', color: 'e4e669', description: '性能提升' },
        ],
        review_status: 'APPROVED',
        checks_summary: {
          total: 2,
          success: 2,
          failure: 0,
        },
        additions: 86,
        deletions: 42,
        changed_files: 3,
      },
    ];
  }
}

export const githubService = new GitHubService();

