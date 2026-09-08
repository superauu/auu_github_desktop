import { create } from 'zustand';
import {
  GitHubCheckRun,
  GitHubJob,
  GitHubPullRequest,
  GitHubRepoDetails,
  GitHubUser,
  GitHubWorkflow,
  GitHubWorkflowRun,
  JobLogsData,
  WorkflowYamlContent,
} from '@/services/github/types';
import { githubService } from '@/services/github/GitHubService';
import { toast } from '@/stores/toastStore';

const GITHUB_TOKEN_KEY = 'auu_github_token';
// 旧版本 demo 模式的遗留键，initAuth 时统一清理
const LEGACY_DEMO_KEY = 'auu_github_demo_mode';

interface GitHubState {
  token: string | null;
  user: GitHubUser | null;
  isAuthenticated: boolean;
  repoDetails: GitHubRepoDetails | null;

  // Active Bound Repo
  currentOwner: string | null;
  currentRepoName: string | null;

  // Workflows & Runs
  workflows: GitHubWorkflow[];
  selectedWorkflow: GitHubWorkflow | null;
  workflowRuns: GitHubWorkflowRun[];
  selectedRun: GitHubWorkflowRun | null;
  selectedRunJobs: GitHubJob[];
  commitChecks: Record<string, GitHubCheckRun[]>;

  // Pull Requests
  pullRequests: GitHubPullRequest[];
  selectedPR: GitHubPullRequest | null;
  prFilterState: 'open' | 'closed' | 'all';

  // Deep Actions Modals & State
  activeJobLogs: JobLogsData | null;
  activeWorkflowYaml: WorkflowYamlContent | null;
  isLogsModalOpen: boolean;
  isYamlModalOpen: boolean;
  isDispatchModalOpen: boolean;
  dispatchTargetWorkflow: GitHubWorkflow | null;

  isLoading: boolean;
  error: string | null;

  // Actions
  initAuth: () => Promise<void>;
  login: (token: string) => Promise<void>;
  logout: () => void;
  syncRepo: (owner: string, repo: string) => Promise<void>;
  loadRepoData: (owner: string, repo: string) => Promise<void>;
  selectWorkflow: (workflow: GitHubWorkflow | null) => void;
  selectRun: (run: GitHubWorkflowRun | null) => Promise<void>;
  fetchCommitChecks: (sha: string) => Promise<GitHubCheckRun[]>;
  refreshActions: () => Promise<void>;

  // Deep Actions Controls
  openJobLogs: (jobId: number, jobName?: string) => Promise<void>;
  closeJobLogs: () => void;
  openWorkflowYaml: (workflow: GitHubWorkflow) => Promise<void>;
  closeWorkflowYaml: () => void;
  openDispatchModal: (workflow: GitHubWorkflow) => void;
  closeDispatchModal: () => void;
  dispatchWorkflow: (ref: string, inputs?: Record<string, string>) => Promise<void>;
  rerunWorkflowRun: (runId: number, failedOnly?: boolean) => Promise<void>;
  cancelWorkflowRun: (runId: number) => Promise<void>;

  // Pull Requests Controls
  loadPullRequests: () => Promise<void>;
  selectPR: (pr: GitHubPullRequest | null) => void;
  setPRFilterState: (filter: 'open' | 'closed' | 'all') => void;
}

export const useGitHubStore = create<GitHubState>((set, get) => ({
  token: null,
  user: null,
  isAuthenticated: false,
  repoDetails: null,
  currentOwner: null,
  currentRepoName: null,

  workflows: [],
  selectedWorkflow: null,
  workflowRuns: [],
  selectedRun: null,
  selectedRunJobs: [],
  commitChecks: {},

  pullRequests: [],
  selectedPR: null,
  prFilterState: 'open',

  activeJobLogs: null,
  activeWorkflowYaml: null,
  isLogsModalOpen: false,
  isYamlModalOpen: false,
  isDispatchModalOpen: false,
  dispatchTargetWorkflow: null,

  isLoading: false,
  error: null,

  initAuth: async () => {
    // 清理旧版本 demo 模式的遗留标记
    localStorage.removeItem(LEGACY_DEMO_KEY);

    const savedToken = localStorage.getItem(GITHUB_TOKEN_KEY);

    if (savedToken) {
      try {
        githubService.setToken(savedToken);
        const user = await githubService.verifyToken(savedToken);
        set({
          token: savedToken,
          user,
          isAuthenticated: true,
        });
      } catch (err: any) {
        console.warn('保存的 GitHub Token 已失效:', err);
        localStorage.removeItem(GITHUB_TOKEN_KEY);
      }
    }
  },

  login: async (token: string) => {
    set({ isLoading: true, error: null });
    try {
      const user = await githubService.verifyToken(token);
      localStorage.setItem(GITHUB_TOKEN_KEY, token);
      githubService.setToken(token);
      set({
        token,
        user,
        isAuthenticated: true,
        isLoading: false,
      });
      get().refreshActions();
      get().loadPullRequests();
    } catch (err: any) {
      set({ error: err.message, isLoading: false });
      throw err;
    }
  },

  logout: () => {
    localStorage.removeItem(GITHUB_TOKEN_KEY);
    githubService.setToken(null);
    set({
      token: null,
      user: null,
      isAuthenticated: false,
      workflows: [],
      workflowRuns: [],
      selectedWorkflow: null,
      selectedRun: null,
      selectedRunJobs: [],
      pullRequests: [],
      selectedPR: null,
    });
  },

  syncRepo: async (owner: string, repo: string) => {
    set({ currentOwner: owner, currentRepoName: repo });
    await get().loadRepoData(owner, repo);
  },

  loadRepoData: async (owner: string, repo: string) => {
    set({ isLoading: true, error: null, currentOwner: owner, currentRepoName: repo });
    try {
      const [repoDetails, workflows, runs, prs] = await Promise.all([
        githubService.getRepository(owner, repo).catch(() => null),
        githubService.getWorkflows(owner, repo).catch(() => []),
        githubService.getWorkflowRuns(owner, repo).catch(() => []),
        githubService.getPullRequests(owner, repo).catch(() => []),
      ]);

      const selectedRun = runs[0] || null;
      let selectedRunJobs: GitHubJob[] = [];
      if (selectedRun) {
        selectedRunJobs = await githubService.getRunJobs(owner, repo, selectedRun.id).catch(() => []);
      }

      set({
        repoDetails,
        workflows,
        workflowRuns: runs,
        selectedRun,
        selectedRunJobs,
        pullRequests: prs,
        selectedPR: prs[0] || null,
        isLoading: false,
      });
    } catch (err: any) {
      console.warn('加载真实 GitHub 数据失败，已准备回退:', err);
      set({ error: err.message, isLoading: false });
    }
  },

  selectWorkflow: async (workflow: GitHubWorkflow | null) => {
    set({ selectedWorkflow: workflow });
    const { currentOwner, currentRepoName } = get();
    if (!currentOwner || !currentRepoName) return;

    try {
      const runs = await githubService.getWorkflowRuns(currentOwner, currentRepoName, workflow?.id);
      const selectedRun = runs[0] || null;
      let selectedRunJobs: GitHubJob[] = [];
      if (selectedRun) {
        selectedRunJobs = await githubService.getRunJobs(currentOwner, currentRepoName, selectedRun.id);
      }
      set({ workflowRuns: runs, selectedRun, selectedRunJobs });
    } catch (err: any) {
      console.warn('获取工作流运行记录失败:', err);
    }
  },

  selectRun: async (run: GitHubWorkflowRun | null) => {
    set({ selectedRun: run });
    if (!run) {
      set({ selectedRunJobs: [] });
      return;
    }

    const { currentOwner, currentRepoName } = get();
    if (!currentOwner || !currentRepoName) return;

    try {
      const jobs = await githubService.getRunJobs(currentOwner, currentRepoName, run.id);
      set({ selectedRunJobs: jobs });
    } catch (err: any) {
      console.warn('获取 Job 状态失败:', err);
    }
  },

  fetchCommitChecks: async (sha: string) => {
    const { commitChecks, currentOwner, currentRepoName } = get();
    if (commitChecks[sha]) {
      return commitChecks[sha];
    }

    if (!currentOwner || !currentRepoName) return [];

    try {
      const checks = await githubService.getCommitChecks(currentOwner, currentRepoName, sha);
      set((state) => ({
        commitChecks: { ...state.commitChecks, [sha]: checks },
      }));
      return checks;
    } catch {
      return [];
    }
  },

  refreshActions: async () => {
    const { currentOwner, currentRepoName } = get();
    if (currentOwner && currentRepoName) {
      await get().loadRepoData(currentOwner, currentRepoName);
    }
  },

  // Deep Actions Controls
  openJobLogs: async (jobId: number, jobName?: string) => {
    const { currentOwner, currentRepoName } = get();
    if (!currentOwner || !currentRepoName) return;

    set({
      isLogsModalOpen: true,
      activeJobLogs: {
        jobId,
        jobName: jobName || `Job #${jobId}`,
        rawLogs: '正在从 GitHub API 实时拉取 Job 构建日志...',
      },
    });

    try {
      const logs = await githubService.getJobLogs(currentOwner, currentRepoName, jobId);
      if (jobName) logs.jobName = jobName;
      set({ activeJobLogs: logs });
    } catch (err: any) {
      set({
        activeJobLogs: {
          jobId,
          jobName: jobName || `Job #${jobId}`,
          rawLogs: `无法加载构建日志 (HTTP 错误或日志已过期归档):\n${err.message}`,
        },
      });
    }
  },

  closeJobLogs: () => {
    set({ isLogsModalOpen: false, activeJobLogs: null });
  },

  openWorkflowYaml: async (workflow: GitHubWorkflow) => {
    const { currentOwner, currentRepoName } = get();

    set({
      isYamlModalOpen: true,
      activeWorkflowYaml: {
        path: workflow.path,
        content: '# 正在从 GitHub 仓库获取工作流配置文件...',
      },
    });

    if (!currentOwner || !currentRepoName) {
      set({
        activeWorkflowYaml: {
          path: workflow.path,
          content: `# 未绑定 GitHub 仓库，无法读取工作流配置\n# 路径: ${workflow.path}`,
        },
      });
      return;
    }

    try {
      const yaml = await githubService.getWorkflowYaml(currentOwner, currentRepoName, workflow.path);
      set({ activeWorkflowYaml: yaml });
    } catch (err: any) {
      set({
        activeWorkflowYaml: {
          path: workflow.path,
          content: `# 读取工作流配置文件失败: ${err.message}\n# 路径: ${workflow.path}`,
        },
      });
    }
  },

  closeWorkflowYaml: () => {
    set({ isYamlModalOpen: false, activeWorkflowYaml: null });
  },

  openDispatchModal: (workflow: GitHubWorkflow) => {
    set({ isDispatchModalOpen: true, dispatchTargetWorkflow: workflow });
  },

  closeDispatchModal: () => {
    set({ isDispatchModalOpen: false, dispatchTargetWorkflow: null });
  },

  dispatchWorkflow: async (ref: string, inputs?: Record<string, string>) => {
    const { dispatchTargetWorkflow, currentOwner, currentRepoName } = get();
    if (!dispatchTargetWorkflow) return;
    if (!currentOwner || !currentRepoName) {
      toast.warning('未绑定 GitHub 仓库', '请先打开一个 GitHub 远程仓库');
      return;
    }

    try {
      await githubService.dispatchWorkflow(currentOwner, currentRepoName, dispatchTargetWorkflow.id, {
        ref,
        inputs,
      });
      toast.success('调度请求已提交至 GitHub', `${dispatchTargetWorkflow.name} 正在排队执行`);
      set({ isDispatchModalOpen: false });
      setTimeout(() => {
        get().refreshActions();
      }, 1500);
    } catch (err: any) {
      toast.error('触发工作流失败', err.message);
    }
  },

  rerunWorkflowRun: async (runId: number, failedOnly = false) => {
    const { currentOwner, currentRepoName } = get();
    if (!currentOwner || !currentRepoName) return;

    try {
      await githubService.rerunWorkflow(currentOwner, currentRepoName, runId, failedOnly);
      toast.success('重跑请求已成功发送至 GitHub');
      get().refreshActions();
    } catch (err: any) {
      toast.error('重新运行失败', err.message);
    }
  },

  cancelWorkflowRun: async (runId: number) => {
    const { currentOwner, currentRepoName } = get();
    if (!currentOwner || !currentRepoName) return;

    try {
      await githubService.cancelWorkflowRun(currentOwner, currentRepoName, runId);
      toast.info('已向 GitHub 发送取消请求');
      get().refreshActions();
    } catch (err: any) {
      toast.error('取消工作流失败', err.message);
    }
  },

  // Pull Requests Controls
  loadPullRequests: async () => {
    const { currentOwner, currentRepoName } = get();
    if (!currentOwner || !currentRepoName) return;

    try {
      const prs = await githubService.getPullRequests(currentOwner, currentRepoName);
      set({ pullRequests: prs, selectedPR: prs[0] || null });
    } catch (err: any) {
      console.warn('加载 PR 失败:', err);
    }
  },

  selectPR: (pr: GitHubPullRequest | null) => {
    set({ selectedPR: pr });
  },

  setPRFilterState: (filter: 'open' | 'closed' | 'all') => {
    set({ prFilterState: filter });
  },
}));
