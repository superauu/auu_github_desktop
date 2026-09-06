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
const GITHUB_DEMO_KEY = 'auu_github_demo_mode';

interface GitHubState {
  token: string | null;
  user: GitHubUser | null;
  isAuthenticated: boolean;
  isDemoMode: boolean;
  repoDetails: GitHubRepoDetails | null;

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
  enableDemoMode: () => void;
  disableDemoMode: () => void;
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
  isDemoMode: true, // Default enable demo mode so users can immediately experience the UI!
  repoDetails: null,

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
    const savedToken = localStorage.getItem(GITHUB_TOKEN_KEY);
    const savedDemo = localStorage.getItem(GITHUB_DEMO_KEY);

    if (savedToken) {
      try {
        githubService.setToken(savedToken);
        const user = await githubService.verifyToken(savedToken);
        set({
          token: savedToken,
          user,
          isAuthenticated: true,
          isDemoMode: false,
        });
        return;
      } catch (err: any) {
        console.warn('保存的 GitHub Token 已失效:', err);
        localStorage.removeItem(GITHUB_TOKEN_KEY);
      }
    }

    // Default to demo mode for initial experience
    const useDemo = savedDemo !== 'false';
    if (useDemo) {
      get().enableDemoMode();
    }
  },

  login: async (token: string) => {
    set({ isLoading: true, error: null });
    try {
      const user = await githubService.verifyToken(token);
      localStorage.setItem(GITHUB_TOKEN_KEY, token);
      localStorage.setItem(GITHUB_DEMO_KEY, 'false');
      githubService.setToken(token);
      set({
        token,
        user,
        isAuthenticated: true,
        isDemoMode: false,
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
      isDemoMode: false,
      workflows: [],
      workflowRuns: [],
      selectedWorkflow: null,
      selectedRun: null,
      selectedRunJobs: [],
      pullRequests: [],
      selectedPR: null,
    });
  },

  enableDemoMode: () => {
    localStorage.setItem(GITHUB_DEMO_KEY, 'true');
    const workflows = githubService.getDemoWorkflows();
    const runs = githubService.getDemoWorkflowRuns();
    const prs = githubService.getDemoPullRequests();
    const selectedRun = runs[0] || null;
    const selectedRunJobs = selectedRun ? githubService.getDemoJobs(selectedRun.id) : [];

    set({
      isDemoMode: true,
      workflows,
      selectedWorkflow: null,
      workflowRuns: runs,
      selectedRun,
      selectedRunJobs,
      pullRequests: prs,
      selectedPR: prs[0] || null,
      error: null,
    });
  },

  disableDemoMode: () => {
    localStorage.setItem(GITHUB_DEMO_KEY, 'false');
    set({
      isDemoMode: false,
      workflows: [],
      workflowRuns: [],
      selectedWorkflow: null,
      selectedRun: null,
      selectedRunJobs: [],
      pullRequests: [],
      selectedPR: null,
    });
  },

  loadRepoData: async (owner: string, repo: string) => {
    if (get().isDemoMode) {
      get().enableDemoMode();
      return;
    }

    set({ isLoading: true, error: null });
    try {
      const [repoDetails, workflows, runs, prs] = await Promise.all([
        githubService.getRepository(owner, repo),
        githubService.getWorkflows(owner, repo),
        githubService.getWorkflowRuns(owner, repo),
        githubService.getPullRequests(owner, repo),
      ]);

      const selectedRun = runs[0] || null;
      let selectedRunJobs: GitHubJob[] = [];
      if (selectedRun) {
        selectedRunJobs = await githubService.getRunJobs(owner, repo, selectedRun.id);
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
      set({ error: err.message, isLoading: false });
    }
  },

  selectWorkflow: (workflow: GitHubWorkflow | null) => {
    set({ selectedWorkflow: workflow });
    const { isDemoMode } = get();
    if (isDemoMode) {
      const runs = githubService.getDemoWorkflowRuns(workflow?.id);
      const selectedRun = runs[0] || null;
      const selectedRunJobs = selectedRun ? githubService.getDemoJobs(selectedRun.id) : [];
      set({ workflowRuns: runs, selectedRun, selectedRunJobs });
    }
  },

  selectRun: async (run: GitHubWorkflowRun | null) => {
    set({ selectedRun: run });
    if (!run) {
      set({ selectedRunJobs: [] });
      return;
    }

    const { isDemoMode } = get();
    if (isDemoMode) {
      const jobs = githubService.getDemoJobs(run.id);
      set({ selectedRunJobs: jobs });
      return;
    }
  },

  fetchCommitChecks: async (sha: string) => {
    const { commitChecks, isDemoMode } = get();
    if (commitChecks[sha]) {
      return commitChecks[sha];
    }

    if (isDemoMode) {
      const demoChecks = githubService.getDemoCommitChecks(sha);
      set((state) => ({
        commitChecks: { ...state.commitChecks, [sha]: demoChecks },
      }));
      return demoChecks;
    }

    return [];
  },

  refreshActions: async () => {
    const { isDemoMode } = get();
    if (isDemoMode) {
      get().enableDemoMode();
    }
  },

  // Deep Actions Controls
  openJobLogs: async (jobId: number, jobName?: string) => {
    const { isDemoMode } = get();
    if (isDemoMode) {
      const demoLogs = githubService.getDemoJobLogs(jobId);
      if (jobName) demoLogs.jobName = jobName;
      set({ activeJobLogs: demoLogs, isLogsModalOpen: true });
      return;
    }
    set({ isLogsModalOpen: true, activeJobLogs: { jobId, jobName: jobName || `Job #${jobId}`, rawLogs: '正在获取构建日志...' } });
  },

  closeJobLogs: () => {
    set({ isLogsModalOpen: false, activeJobLogs: null });
  },

  openWorkflowYaml: async (workflow: GitHubWorkflow) => {
    const { isDemoMode } = get();
    if (isDemoMode) {
      const yaml = githubService.getDemoWorkflowYaml(workflow.id);
      set({ activeWorkflowYaml: yaml, isYamlModalOpen: true });
      return;
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
    const { dispatchTargetWorkflow, isDemoMode, workflowRuns } = get();
    if (!dispatchTargetWorkflow) return;

    if (isDemoMode) {
      // Create a mock new run in in_progress state
      const newRun: GitHubWorkflowRun = {
        id: Date.now(),
        name: dispatchTargetWorkflow.name,
        head_branch: ref,
        head_sha: '4abef50',
        event: 'workflow_dispatch',
        status: 'in_progress',
        conclusion: null,
        html_url: '#',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        run_number: workflowRuns.length + 50,
        run_attempt: 1,
        duration_ms: 15000,
        actor: {
          login: 'superauu',
          avatar_url: 'https://avatars.githubusercontent.com/u/9919?v=4',
        },
        head_commit: {
          id: '4abef50',
          message: `手动调度运行: ${dispatchTargetWorkflow.name}${inputs && Object.keys(inputs).length > 0 ? ` [${JSON.stringify(inputs)}]` : ''}`,
          author: { name: 'superauu', email: 'yibo.li@gmail.com' },
        },
      };

      set({
        workflowRuns: [newRun, ...workflowRuns],
        selectedRun: newRun,
        selectedRunJobs: githubService.getDemoJobs(newRun.id),
        isDispatchModalOpen: false,
      });
      toast.success('工作流调度成功', `${dispatchTargetWorkflow.name} 已触发运行`);

      // Mock completion after 8s
      setTimeout(() => {
        set((state) => ({
          workflowRuns: state.workflowRuns.map((r) =>
            r.id === newRun.id ? { ...r, status: 'completed', conclusion: 'success' } : r
          ),
        }));
        toast.success(`CI 构建完成`, `${dispatchTargetWorkflow.name} #${newRun.run_number} 执行成功`);
      }, 8000);
      return;
    }
  },

  rerunWorkflowRun: async (runId: number, failedOnly = false) => {
    const { isDemoMode, workflowRuns } = get();
    if (isDemoMode) {
      set({
        workflowRuns: workflowRuns.map((r) =>
          r.id === runId
            ? { ...r, status: 'in_progress', conclusion: null, updated_at: new Date().toISOString() }
            : r
        ),
      });
      toast.info(failedOnly ? '正在重跑失败的 Jobs...' : '正在重新运行整个工作流...');

      setTimeout(() => {
        set((state) => ({
          workflowRuns: state.workflowRuns.map((r) =>
            r.id === runId ? { ...r, status: 'completed', conclusion: 'success' } : r
          ),
        }));
        toast.success('工作流重跑完成', '所有阶段均已顺利通过');
      }, 5000);
      return;
    }
  },

  cancelWorkflowRun: async (runId: number) => {
    const { isDemoMode, workflowRuns } = get();
    if (isDemoMode) {
      set({
        workflowRuns: workflowRuns.map((r) =>
          r.id === runId
            ? { ...r, status: 'completed', conclusion: 'cancelled', updated_at: new Date().toISOString() }
            : r
        ),
      });
      toast.warning('工作流已取消', `Run #${runId} 已停止运行`);
      return;
    }
  },

  // Pull Requests Controls
  loadPullRequests: async () => {
    const { isDemoMode } = get();
    if (isDemoMode) {
      const prs = githubService.getDemoPullRequests();
      set({ pullRequests: prs, selectedPR: prs[0] || null });
      return;
    }
  },

  selectPR: (pr: GitHubPullRequest | null) => {
    set({ selectedPR: pr });
  },

  setPRFilterState: (filter: 'open' | 'closed' | 'all') => {
    set({ prFilterState: filter });
  },
}));
