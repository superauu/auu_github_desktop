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
import { GitHubApiError, githubService } from '@/services/github/GitHubService';
import { toast } from '@/stores/toastStore';
import { tNow } from '@/i18n';

const GITHUB_TOKEN_KEY = 'auu_github_token';
let browserToken: string | null = null;
let credentialWrites: Promise<void> = Promise.resolve();
// 旧版本 demo 模式的遗留键，initAuth 时统一清理
const LEGACY_DEMO_KEY = 'auu_github_demo_mode';

// ===== Token 持久化：桌面端走系统凭据管理器（keyring），浏览器开发模式仅在内存保留凭据 =====
const isTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

async function invokeKeyring<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(command, args);
}

async function persistToken(token: string): Promise<void> {
  if (isTauri()) {
    credentialWrites = credentialWrites.catch(() => {}).then(async () => {
      await invokeKeyring('store_github_token', { token });
    });
    await credentialWrites;
  } else { browserToken = token; }
  localStorage.removeItem(GITHUB_TOKEN_KEY);
}

async function loadToken(): Promise<string | null> {
  await credentialWrites.catch(() => {});
  if (isTauri()) {
    try {
      const stored = await invokeKeyring<string | null>('get_github_token');
      if (stored) return stored;
      // 迁移：把旧版本明文 localStorage token 搬进凭据管理器
      const legacy = localStorage.getItem(GITHUB_TOKEN_KEY);
      if (legacy) {
        await invokeKeyring('store_github_token', { token: legacy });
        localStorage.removeItem(GITHUB_TOKEN_KEY);
        return legacy;
      }
      return null;
    } catch (err) {
      throw new Error(`无法读取系统凭据: ${String(err)}`);
    }
  }
  const legacy = localStorage.getItem(GITHUB_TOKEN_KEY);
  localStorage.removeItem(GITHUB_TOKEN_KEY);
  browserToken = browserToken || legacy;
  return browserToken;
}

async function clearToken(): Promise<void> {
  browserToken = null;
  localStorage.removeItem(GITHUB_TOKEN_KEY);
  if (isTauri()) {
    credentialWrites = credentialWrites.catch(() => {}).then(() => invokeKeyring<void>('delete_github_token'));
    await credentialWrites;
  }
}

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
  clearRepo: () => void;
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

  // Push CI Watcher
  watchPushChecks: (sha: string) => void;
}

/** 推送后 CI 监听定时器（同 SHA 去重，新推送替换旧监听） */
let pushWatchTimer: ReturnType<typeof setTimeout> | null = null;
let pushWatchedSha: string | null = null;

const emptyRepo = {
  currentOwner: null, currentRepoName: null, repoDetails: null,
  workflows: [], selectedWorkflow: null, workflowRuns: [], selectedRun: null, selectedRunJobs: [],
  commitChecks: {}, pullRequests: [], selectedPR: null,
  activeJobLogs: null, activeWorkflowYaml: null, isLogsModalOpen: false, isYamlModalOpen: false,
  isDispatchModalOpen: false, dispatchTargetWorkflow: null, isLoading: false, error: null,
};

export const useGitHubStore = create<GitHubState>((set, get) => {
  let generation = 0;
  let authGeneration = 0;
  const requests = new Map<string, number>();
  const ticket = (channel: string) => {
    const epoch = generation;
    const id = (requests.get(channel) || 0) + 1;
    requests.set(channel, id);
    return () => generation === epoch && requests.get(channel) === id;
  };
  const stopWatch = () => {
    if (pushWatchTimer) clearTimeout(pushWatchTimer);
    pushWatchTimer = null; pushWatchedSha = null;
  };
  return {
    ...emptyRepo, token: null, user: null, isAuthenticated: false, prFilterState: 'open',
    clearRepo: () => {
      generation++; requests.clear(); stopWatch();
      set({ ...emptyRepo });
    },
    initAuth: async () => {
      const attempt = ++authGeneration;
      localStorage.removeItem(LEGACY_DEMO_KEY);
      try {
        const token = await loadToken();
        if (!token || attempt !== authGeneration) return;
        const user = await githubService.verifyToken(token);
        if (attempt !== authGeneration) return;
        githubService.setToken(token);
        set({ token, user, isAuthenticated: true });
        await get().refreshActions();
      } catch (error) {
        if (attempt !== authGeneration) return;
        if (error instanceof GitHubApiError && error.status === 401) {
          await clearToken(); githubService.setToken(null);
        }
        // Network, rate-limit and server errors must not delete saved credentials.
        set({ error: String(error) });
      }
    },
    login: async (token: string) => {
      const attempt = ++authGeneration;
      set({ isLoading: true, error: null });
      try {
        const user = await githubService.verifyToken(token);
        if (attempt !== authGeneration) return;
        await persistToken(token);
        if (attempt !== authGeneration) return;
        githubService.setToken(token);
        set({ token, user, isAuthenticated: true, isLoading: false });
        await get().refreshActions();
      } catch (error: any) {
        if (attempt === authGeneration) set({ error: error.message, isLoading: false });
        throw error;
      }
    },
    logout: () => {
      authGeneration++; get().clearRepo();
      void clearToken().catch((error) => toast.error('无法清理凭据', String(error)));
      githubService.setToken(null);
      set({ token: null, user: null, isAuthenticated: false });
    },
    syncRepo: async (owner, repo) => {
      if (get().currentOwner === owner && get().currentRepoName === repo) return;
      get().clearRepo();
      set({ currentOwner: owner, currentRepoName: repo });
      await get().loadRepoData(owner, repo);
    },
    loadRepoData: async (owner, repo) => {
      if (get().currentOwner !== owner || get().currentRepoName !== repo) {
        get().clearRepo(); set({ currentOwner: owner, currentRepoName: repo });
      }
      const valid = ticket('repo');
      const prsValid = ticket('prs');
      ticket('runs'); ticket('jobs');
      set({ isLoading: true, error: null });
      try {
        const [repoDetails, workflows, runs, prs] = await Promise.all([
          githubService.getRepository(owner, repo), githubService.getWorkflows(owner, repo),
          githubService.getWorkflowRuns(owner, repo, get().selectedWorkflow?.id), githubService.getPullRequests(owner, repo, get().prFilterState),
        ]);
        if (!valid()) return;
        const selectedRun = runs.find((run) => run.id === get().selectedRun?.id) || runs[0] || null;
        const jobs = selectedRun ? await githubService.getRunJobs(owner, repo, selectedRun.id) : [];
        if (!valid()) return;
        set({ repoDetails, workflows, workflowRuns: runs, selectedRun, selectedRunJobs: jobs,
          ...(prsValid() ? { pullRequests: prs, selectedPR: prs.find((pr) => pr.id === get().selectedPR?.id) || prs[0] || null } : {}), isLoading: false });
      } catch (error: any) { if (valid()) set({ error: error.message, isLoading: false }); }
    },
    refreshActions: async () => {
      const { currentOwner, currentRepoName } = get();
      if (currentOwner && currentRepoName) await get().loadRepoData(currentOwner, currentRepoName);
    },
    selectWorkflow: async (workflow) => {
      const valid = ticket('runs'); ticket('jobs'); ticket('repo');
      set({ isLoading: false, selectedWorkflow: workflow, workflowRuns: [], selectedRun: null, selectedRunJobs: [] });
      const { currentOwner: owner, currentRepoName: repo } = get();
      if (!owner || !repo) return;
      try {
        const runs = await githubService.getWorkflowRuns(owner, repo, workflow?.id);
        if (!valid()) return;
        set({ workflowRuns: runs });
        await get().selectRun(runs[0] || null);
      } catch (error: any) { if (valid()) set({ error: error.message }); }
    },
    selectRun: async (run) => {
      const valid = ticket('jobs'); ticket('repo');
      set({ isLoading: false, selectedRun: run, selectedRunJobs: [] });
      const { currentOwner: owner, currentRepoName: repo } = get();
      if (!run || !owner || !repo) return;
      try {
        const jobs = await githubService.getRunJobs(owner, repo, run.id);
        if (valid()) set({ selectedRunJobs: jobs });
      } catch (error: any) { if (valid()) set({ error: error.message }); }
    },
    fetchCommitChecks: async (sha) => {
      const { currentOwner: owner, currentRepoName: repo } = get();
      if (!owner || !repo) return [];
      const cached = get().commitChecks[sha];
      if (cached?.length && cached.every((check) => check.status === 'completed')) return cached;
      const valid = ticket(`checks:${sha}`);
      try {
        const checks = await githubService.getCommitChecks(owner, repo, sha);
        if (!valid()) return [];
        set((state) => ({ commitChecks: { ...state.commitChecks, [sha]: checks } }));
        return checks;
      } catch { return []; }
    },
    openJobLogs: async (jobId, jobName) => {
      const valid = ticket('logs');
      const { currentOwner: owner, currentRepoName: repo } = get();
      if (!owner || !repo) return;
      const name = jobName || `Job #${jobId}`;
      const knownJob = get().selectedRunJobs.find(job => job.id === jobId);
      let htmlUrl = knownJob?.html_url;
      set({ isLogsModalOpen: true, activeJobLogs: { jobId, jobName: name, rawLogs: '', state: 'loading', htmlUrl } });
      try {
        const job = await githubService.getJob(owner, repo, jobId);
        if (!valid()) return;
        htmlUrl = job.html_url;
        if (job.status !== 'completed') {
          set({ activeJobLogs: { jobId, jobName: name, rawLogs: '', state: 'waiting', htmlUrl } });
          return;
        }
        const logs = await githubService.getJobLogs(owner, repo, jobId);
        if (valid()) set({ activeJobLogs: { ...logs, jobName: jobName || logs.jobName, state: 'ready', htmlUrl } });
      } catch (error: any) {
        if (valid()) set({ activeJobLogs: { jobId, jobName: name, rawLogs: '', state: 'error', error: String(error?.message || error), htmlUrl } });
      }
    },
    closeJobLogs: () => { ticket('logs'); set({ isLogsModalOpen: false, activeJobLogs: null }); },
    openWorkflowYaml: async (workflow) => {
      const valid = ticket('yaml');
      const { currentOwner: owner, currentRepoName: repo } = get();
      if (!owner || !repo) return;
      set({ isYamlModalOpen: true, activeWorkflowYaml: { path: workflow.path, content: 'Loading…' } });
      try {
        const yaml = await githubService.getWorkflowYaml(owner, repo, workflow.path);
        if (valid()) set({ activeWorkflowYaml: yaml });
      } catch (error: any) { if (valid()) set({ activeWorkflowYaml: { path: workflow.path, content: error.message } }); }
    },
    closeWorkflowYaml: () => { ticket('yaml'); set({ isYamlModalOpen: false, activeWorkflowYaml: null }); },
    openDispatchModal: (workflow) => set({ isDispatchModalOpen: true, dispatchTargetWorkflow: workflow }),
    closeDispatchModal: () => set({ isDispatchModalOpen: false, dispatchTargetWorkflow: null }),
    dispatchWorkflow: async (ref, inputs) => {
      const { currentOwner: owner, currentRepoName: repo, dispatchTargetWorkflow: workflow } = get();
      if (!owner || !repo || !workflow) return;
      const valid = ticket('dispatch');
      try {
        await githubService.dispatchWorkflow(owner, repo, workflow.id, { ref, inputs });
        if (!valid()) return;
        toast.success('调度请求已提交至 GitHub'); get().closeDispatchModal();
        await get().refreshActions();
      } catch (error: any) { if (valid()) toast.error('触发工作流失败', error.message); }
    },
    rerunWorkflowRun: async (runId, failedOnly = false) => {
      const { currentOwner: owner, currentRepoName: repo } = get();
      if (!owner || !repo) return;
      const valid = ticket('rerun');
      try {
        await githubService.rerunWorkflow(owner, repo, runId, failedOnly);
        if (valid()) { toast.success('重跑请求已发送'); await get().refreshActions(); }
      } catch (error: any) { if (valid()) toast.error('重新运行失败', error.message); }
    },
    cancelWorkflowRun: async (runId) => {
      const { currentOwner: owner, currentRepoName: repo } = get();
      if (!owner || !repo) return;
      const valid = ticket('cancel');
      try {
        await githubService.cancelWorkflowRun(owner, repo, runId);
        if (valid()) { toast.info('取消请求已发送'); await get().refreshActions(); }
      } catch (error: any) { if (valid()) toast.error('取消工作流失败', error.message); }
    },
    loadPullRequests: async () => {
      const valid = ticket('prs');
      const { currentOwner: owner, currentRepoName: repo, prFilterState } = get();
      if (!owner || !repo) return;
      try {
        const prs = await githubService.getPullRequests(owner, repo, prFilterState);
        if (valid()) set({ pullRequests: prs, selectedPR: prs.find((pr) => pr.id === get().selectedPR?.id) || prs[0] || null });
      } catch (error: any) { if (valid()) set({ error: error.message }); }
    },
    selectPR: (pr) => set({ selectedPR: pr }),
    setPRFilterState: (filter) => {
      ticket('repo'); set({ isLoading: false, prFilterState: filter, pullRequests: [], selectedPR: null });
      void get().loadPullRequests();
    },
    watchPushChecks: (sha) => {
      const { currentOwner: owner, currentRepoName: repo } = get();
      if (!owner || !repo || !sha || (pushWatchedSha === sha && pushWatchTimer)) return;
      stopWatch(); pushWatchedSha = sha;
      const epoch = generation;
      let polls = 0;
      const valid = () => epoch === generation && pushWatchedSha === sha;
      const poll = async () => {
        if (!valid()) return;
        polls++;
        try {
          const checks = await githubService.getCommitChecks(owner, repo, sha);
          if (!valid()) return;
          if (checks.length && checks.every((check) => check.status === 'completed')) {
            const passed = checks.filter((check) => check.conclusion === 'success').length;
            if (passed === checks.length) toast.success(tNow('ci.passed'), `${passed}/${checks.length}`);
            else toast.warning('CI 未全部通过', checks.map((check) => `${check.name}: ${check.conclusion}`).join(', '));
            stopWatch(); return;
          }
        } catch { /* retry transient failures without reporting a successful run */ }
        if (polls < 20) pushWatchTimer = setTimeout(poll, 15_000);
        else { toast.info(tNow('ci.stillRunning')); stopWatch(); }
      };
      toast.info(tNow('ci.watching'), `${owner}/${repo} @ ${sha.slice(0, 7)}`);
      pushWatchTimer = setTimeout(poll, 15_000);
    },
  };
});
