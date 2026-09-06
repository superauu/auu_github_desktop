import { create } from 'zustand';
import {
  GitHubCheckRun,
  GitHubJob,
  GitHubRepoDetails,
  GitHubUser,
  GitHubWorkflow,
  GitHubWorkflowRun,
} from '@/services/github/types';
import { githubService } from '@/services/github/GitHubService';

const GITHUB_TOKEN_KEY = 'auu_github_token';
const GITHUB_DEMO_KEY = 'auu_github_demo_mode';

interface GitHubState {
  token: string | null;
  user: GitHubUser | null;
  isAuthenticated: boolean;
  isDemoMode: boolean;
  repoDetails: GitHubRepoDetails | null;
  workflows: GitHubWorkflow[];
  selectedWorkflow: GitHubWorkflow | null;
  workflowRuns: GitHubWorkflowRun[];
  selectedRun: GitHubWorkflowRun | null;
  selectedRunJobs: GitHubJob[];
  commitChecks: Record<string, GitHubCheckRun[]>;
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
    });
  },

  enableDemoMode: () => {
    localStorage.setItem(GITHUB_DEMO_KEY, 'true');
    const workflows = githubService.getDemoWorkflows();
    const runs = githubService.getDemoWorkflowRuns();
    const selectedRun = runs[0] || null;
    const selectedRunJobs = selectedRun ? githubService.getDemoJobs(selectedRun.id) : [];

    set({
      isDemoMode: true,
      workflows,
      selectedWorkflow: null,
      workflowRuns: runs,
      selectedRun,
      selectedRunJobs,
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
    });
  },

  loadRepoData: async (owner: string, repo: string) => {
    if (get().isDemoMode) {
      get().enableDemoMode();
      return;
    }

    set({ isLoading: true, error: null });
    try {
      const [repoDetails, workflows, runs] = await Promise.all([
        githubService.getRepository(owner, repo),
        githubService.getWorkflows(owner, repo),
        githubService.getWorkflowRuns(owner, repo),
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

    try {
      // If connected to real repo
      // const jobs = await githubService.getRunJobs(owner, repo, run.id);
      // set({ selectedRunJobs: jobs });
    } catch (err: any) {
      console.warn('获取 Jobs 详情失败:', err);
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
}));
