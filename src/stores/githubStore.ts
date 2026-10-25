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
// 浏览器开发模式的内存 token，按 Profile 隔离（桌面端走 keyring，无需内存缓存）
const browserTokens = new Map<string, string>();
let credentialWrites: Promise<void> = Promise.resolve();
// 旧版本 demo 模式的遗留键，initAuth 时统一清理
const LEGACY_DEMO_KEY = 'auu_github_demo_mode';

// ===== 多账号 Profile =====
// Profile = 一个独立的 GitHub 凭据槽位。token 在 keyring 中按 profileId 隔离
// （默认账号沿用旧条目实现无缝迁移），Profile 列表与活跃项持久化到 localStorage。
export const DEFAULT_PROFILE_ID = 'default';
const PROFILES_KEY = 'auu_git_profiles';

export interface GitHubProfile {
  id: string;
  label: string;
}

/** 生成去连字符 UUID（32 位 hex），供新 Profile 的 id 使用 */
function newProfileId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID().replace(/-/g, '');
  }
  let hex = '';
  for (let i = 0; i < 32; i++) hex += Math.floor(Math.random() * 16).toString(16);
  return hex;
}

/** 恢复 localStorage 中的 Profile 数据；形状非法时整体回退到空态，避免脏数据污染会话 */
export function parseStoredProfiles(raw: string | null): { profiles: GitHubProfile[]; activeProfileId: string | null } {
  if (!raw) return { profiles: [], activeProfileId: null };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { profiles: [], activeProfileId: null };
    const { profiles: rawProfiles, activeProfileId: rawActiveId } = parsed as Record<string, unknown>;
    if (!Array.isArray(rawProfiles)) return { profiles: [], activeProfileId: null };
    const cleaned: GitHubProfile[] = [];
    for (const item of rawProfiles) {
      if (!item || typeof item !== 'object') continue;
      const { id, label } = item as Record<string, unknown>;
      if (typeof id !== 'string' || !id.trim()) continue;
      cleaned.push({ id, label: typeof label === 'string' && label.trim() ? label : id });
    }
    const activeProfileId = typeof rawActiveId === 'string' && cleaned.some((p) => p.id === rawActiveId)
      ? rawActiveId
      : (cleaned[0]?.id ?? null);
    return { profiles: cleaned, activeProfileId };
  } catch {
    return { profiles: [], activeProfileId: null };
  }
}

function saveProfiles(profiles: GitHubProfile[], activeProfileId: string | null): void {
  try {
    localStorage.setItem(PROFILES_KEY, JSON.stringify({ version: 1, profiles, activeProfileId }));
  } catch { /* 隐私模式/配额失败不阻断登录流程 */ }
}

/** 确保某 Profile 存在并以刚验证过的 GitHub login 命名（登录/恢复会话后调用） */
function withProfileLabel(profiles: GitHubProfile[], id: string, label: string): GitHubProfile[] {
  const existing = profiles.find((p) => p.id === id);
  if (!existing) return [...profiles, { id, label }];
  if (existing.label === label) return profiles;
  return profiles.map((p) => (p.id === id ? { ...p, label } : p));
}

const storedProfiles = typeof localStorage !== 'undefined'
  ? parseStoredProfiles(localStorage.getItem(PROFILES_KEY))
  : { profiles: [] as GitHubProfile[], activeProfileId: null };

// ===== Token 持久化：桌面端走系统凭据管理器（keyring），浏览器开发模式仅在内存保留凭据 =====
const isTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

const profileKey = (profileId: string | null | undefined) => profileId || DEFAULT_PROFILE_ID;

async function invokeKeyring<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(command, args);
}

async function persistToken(token: string, profileId: string | null): Promise<void> {
  if (isTauri()) {
    credentialWrites = credentialWrites.catch(() => {}).then(async () => {
      await invokeKeyring('store_github_token', { token, profileId });
    });
    await credentialWrites;
  } else { browserTokens.set(profileKey(profileId), token); }
  localStorage.removeItem(GITHUB_TOKEN_KEY);
}

async function loadToken(profileId: string | null): Promise<string | null> {
  await credentialWrites.catch(() => {});
  const isDefaultProfile = profileKey(profileId) === DEFAULT_PROFILE_ID;
  if (isTauri()) {
    try {
      const stored = await invokeKeyring<string | null>('get_github_token', { profileId });
      if (stored) return stored;
      // 迁移：把旧版本明文 localStorage token 搬进凭据管理器（仅默认账号，避免复制进其他 Profile）
      const legacy = isDefaultProfile ? localStorage.getItem(GITHUB_TOKEN_KEY) : null;
      if (legacy) {
        await invokeKeyring('store_github_token', { token: legacy, profileId });
        localStorage.removeItem(GITHUB_TOKEN_KEY);
        return legacy;
      }
      return null;
    } catch (err) {
      throw new Error(tNow('err.keyringReadFailed').replace('{m}', String(err)));
    }
  }
  const legacy = isDefaultProfile ? localStorage.getItem(GITHUB_TOKEN_KEY) : null;
  localStorage.removeItem(GITHUB_TOKEN_KEY);
  const key = profileKey(profileId);
  if (legacy && !browserTokens.has(key)) browserTokens.set(key, legacy);
  return browserTokens.get(key) ?? null;
}

async function clearToken(profileId: string | null): Promise<void> {
  browserTokens.delete(profileKey(profileId));
  localStorage.removeItem(GITHUB_TOKEN_KEY);
  if (isTauri()) {
    credentialWrites = credentialWrites.catch(() => {}).then(() => invokeKeyring<void>('delete_github_token', { profileId }));
    await credentialWrites;
  }
}

interface GitHubState {
  token: string | null;
  user: GitHubUser | null;
  isAuthenticated: boolean;
  repoDetails: GitHubRepoDetails | null;

  // Multi-Account Profiles（按 Profile 隔离 token）
  profiles: GitHubProfile[];
  activeProfileId: string | null;
  // “添加账号”进行中标记；addProfileReturnId 记录取消时要回退到的 Profile
  isAddingProfile: boolean;
  addProfileReturnId: string | null;

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
  isRefreshingActions: boolean;
  isLoadingPullRequests: boolean;
  pullRequestsError: string | null;
  isLoadingRuns: boolean;
  isLoadingJobs: boolean;
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

  // Profile Controls
  addProfile: () => void;
  cancelAddProfile: () => void;
  switchProfile: (id: string) => Promise<void>;
  removeProfile: (id: string) => Promise<void>;

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
  isDispatchModalOpen: false, dispatchTargetWorkflow: null, isLoading: false, isRefreshingActions: false, error: null,
  isLoadingPullRequests: false, pullRequestsError: null, isLoadingRuns: false, isLoadingJobs: false,
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
  const persistProfiles = () => saveProfiles(get().profiles, get().activeProfileId);
  /** 退出当前账号态（不动 Profile 列表），供切换/登出/取消添加复用 */
  const resetAuthState = () => {
    get().clearRepo();
    authGeneration++;
    githubService.setToken(null);
    set({ token: null, user: null, isAuthenticated: false });
  };
  return {
    ...emptyRepo, token: null, user: null, isAuthenticated: false, prFilterState: 'open',
    profiles: storedProfiles.profiles,
    activeProfileId: storedProfiles.activeProfileId,
    isAddingProfile: false,
    addProfileReturnId: null,
    clearRepo: () => {
      generation++; requests.clear(); stopWatch();
      set({ ...emptyRepo });
    },
    initAuth: async () => {
      const attempt = ++authGeneration;
      localStorage.removeItem(LEGACY_DEMO_KEY);
      try {
        const token = await loadToken(get().activeProfileId);
        if (!token || attempt !== authGeneration) return;
        const user = await githubService.verifyToken(token);
        if (attempt !== authGeneration) return;
        githubService.setToken(token);
        // 首次成功认证会把默认 Profile（沿用旧 keyring 条目）登记进列表，完成旧用户迁移
        const profileId = get().activeProfileId ?? DEFAULT_PROFILE_ID;
        const profiles = withProfileLabel(get().profiles, profileId, user.login);
        set({ token, user, isAuthenticated: true, profiles, activeProfileId: profileId });
        persistProfiles();
        const { currentOwner, currentRepoName } = get();
        if (currentOwner && currentRepoName) await get().loadRepoData(currentOwner, currentRepoName);
      } catch (error) {
        if (attempt !== authGeneration) return;
        if (error instanceof GitHubApiError && error.status === 401) {
          await clearToken(get().activeProfileId); githubService.setToken(null);
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
        const profileId = get().activeProfileId ?? DEFAULT_PROFILE_ID;
        await persistToken(token, profileId);
        if (attempt !== authGeneration) return;
        githubService.setToken(token);
        const profiles = withProfileLabel(get().profiles, profileId, user.login);
        set({
          token, user, isAuthenticated: true, isLoading: false, profiles, activeProfileId: profileId,
          isAddingProfile: false, addProfileReturnId: null,
        });
        persistProfiles();
        const { currentOwner, currentRepoName } = get();
        if (currentOwner && currentRepoName) await get().loadRepoData(currentOwner, currentRepoName);
      } catch (error: any) {
        if (attempt === authGeneration) set({ error: error.message, isLoading: false });
        throw error;
      }
    },
    logout: () => {
      const { activeProfileId, profiles } = get();
      const profileId = activeProfileId ?? DEFAULT_PROFILE_ID;
      if (profiles.some((p) => p.id === profileId)) {
        // 与 removeProfile 同路径：删除凭据 + 移除槽位 + 自动切到剩余第一个 Profile
        void get().removeProfile(profileId);
        return;
      }
      // 列表中没有对应槽位（异常态兜底）：仅清除当前凭据与登录态
      resetAuthState();
      void clearToken(profileId).catch((error) => toast.error(tNow('err.credentialCleanupFailed'), String(error)));
    },
    addProfile: () => {
      const { profiles, activeProfileId, isAddingProfile } = get();
      if (isAddingProfile) return;
      const id = newProfileId();
      const label = tNow('profiles.defaultLabel').replace('{n}', String(profiles.length + 1));
      resetAuthState();
      set({
        profiles: [...profiles, { id, label }],
        activeProfileId: id,
        isAddingProfile: true,
        addProfileReturnId: activeProfileId ?? DEFAULT_PROFILE_ID,
        error: null, isLoading: false,
      });
      persistProfiles();
    },
    cancelAddProfile: () => {
      const { isAddingProfile, activeProfileId, profiles, addProfileReturnId } = get();
      if (!isAddingProfile) return;
      const remaining = profiles.filter((p) => p.id !== activeProfileId);
      const nextActive = remaining.some((p) => p.id === addProfileReturnId)
        ? addProfileReturnId
        : (remaining[0]?.id ?? null);
      resetAuthState();
      set({
        profiles: remaining,
        activeProfileId: nextActive,
        isAddingProfile: false,
        addProfileReturnId: null,
        error: null, isLoading: false,
      });
      persistProfiles();
      toast.info(tNow('profiles.addCancelled'));
      if (nextActive) void get().initAuth();
    },
    switchProfile: async (id) => {
      const { activeProfileId, profiles } = get();
      if (id === activeProfileId) return;
      if (id !== DEFAULT_PROFILE_ID && !profiles.some((p) => p.id === id)) return;
      const target = profiles.find((p) => p.id === id);
      resetAuthState();
      set({ activeProfileId: id, isAddingProfile: false, addProfileReturnId: null });
      persistProfiles();
      await get().initAuth();
      if (get().isAuthenticated) toast.success(tNow('profiles.switchedTo').replace('{label}', target?.label || id));
    },
    removeProfile: async (id) => {
      const { profiles, activeProfileId } = get();
      if (!profiles.some((p) => p.id === id)) return;
      void clearToken(id).catch((error) => toast.error(tNow('err.credentialCleanupFailed'), String(error)));
      const remaining = profiles.filter((p) => p.id !== id);
      if (activeProfileId !== id) {
        set({ profiles: remaining });
        persistProfiles();
        return;
      }
      // 移除的是活跃 Profile：切到剩余第一个或登出态，并尝试恢复该 Profile 的登录
      const nextActive = remaining[0]?.id ?? null;
      resetAuthState();
      set({ profiles: remaining, activeProfileId: nextActive, isAddingProfile: false, addProfileReturnId: null, error: null, isLoading: false });
      persistProfiles();
      if (nextActive) await get().initAuth();
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
      set({ isLoading: true, error: null });
      await Promise.all([
        get().refreshActions(),
        get().loadPullRequests(),
        (async () => {
          try {
            const details = await githubService.getRepository(owner, repo);
            if (valid()) set({ repoDetails: details });
          } catch (error: any) { if (valid()) set({ error: String(error?.message || error) }); }
          finally { if (valid()) set({ isLoading: false }); }
        })(),
      ]);
    },
    refreshActions: async () => {
      const { currentOwner: owner, currentRepoName: repo, selectedWorkflow } = get();
      if (!owner || !repo) return;
      const valid = ticket('runs');
      const jobsValid = ticket('jobs');
      set({ isRefreshingActions: true, error: null });
      try {
        // A workflow-definition failure must not discard fresh runs or job progress.
        const workflowsRequest = githubService.getWorkflows(owner, repo).then(
          (workflows) => { if (valid()) set({ workflows }); },
          (error) => { if (valid()) set({ error: String(error?.message || error) }); },
        );
        const runs = await githubService.getWorkflowRuns(owner, repo, selectedWorkflow?.id);
        if (!valid()) return;
        set({ workflowRuns: runs, isLoadingRuns: false });
        if (jobsValid()) {
          const previous = get().selectedRun;
          const selectedRun = runs.find((run) => run.id === previous?.id)
            || (previous ? await githubService.getWorkflowRun(owner, repo, previous.id) : runs[0] || null);
          if (!valid() || !jobsValid()) return;
          set({ selectedRun, selectedRunJobs: [], isLoadingJobs: !!selectedRun });
          const jobs = selectedRun ? await githubService.getRunJobs(owner, repo, selectedRun.id) : [];
          if (valid() && jobsValid()) set({ selectedRunJobs: jobs });
        }
        await workflowsRequest;
      } catch (error: any) { if (valid()) set({ error: String(error?.message || error) }); }
      finally { if (valid()) set({ isRefreshingActions: false }); if (jobsValid()) set({ isLoadingJobs: false }); }
    },
    selectWorkflow: async (workflow) => {
      const valid = ticket('runs'); ticket('jobs'); ticket('repo');
      set({ isLoading: false, isRefreshingActions: false, isLoadingRuns: false, isLoadingJobs: false, error: null, selectedWorkflow: workflow, workflowRuns: [], selectedRun: null, selectedRunJobs: [] });
      const { currentOwner: owner, currentRepoName: repo } = get();
      if (!owner || !repo) return;
      set({ isLoadingRuns: true });
      try {
        const runs = await githubService.getWorkflowRuns(owner, repo, workflow?.id);
        if (!valid()) return;
        set({ workflowRuns: runs, isLoadingRuns: false });
        await get().selectRun(runs[0] || null);
      } catch (error: any) { if (valid()) set({ error: error.message }); }
      finally { if (valid()) set({ isLoadingRuns: false }); }
    },
    selectRun: async (run) => {
      const valid = ticket('jobs'); ticket('repo');
      set({ isLoading: false, isLoadingJobs: false, selectedRun: run, selectedRunJobs: [] });
      const { currentOwner: owner, currentRepoName: repo } = get();
      if (!run || !owner || !repo) return;
      set({ isLoadingJobs: true });
      try {
        const jobs = await githubService.getRunJobs(owner, repo, run.id);
        if (valid()) set({ selectedRunJobs: jobs });
      } catch (error: any) { if (valid()) set({ error: error.message }); }
      finally { if (valid()) set({ isLoadingJobs: false }); }
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
      const name = jobName || tNow('ci.jobFallback').replace('{id}', String(jobId));
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
    openDispatchModal: (workflow) => { ticket('dispatch'); set({ isDispatchModalOpen: true, dispatchTargetWorkflow: workflow }); },
    closeDispatchModal: () => { ticket('dispatch'); set({ isDispatchModalOpen: false, dispatchTargetWorkflow: null }); },
    dispatchWorkflow: async (ref, inputs) => {
      const { currentOwner: owner, currentRepoName: repo, dispatchTargetWorkflow: workflow } = get();
      if (!owner || !repo || !workflow) return;
      const valid = ticket('dispatch');
      try {
        await githubService.dispatchWorkflow(owner, repo, workflow.id, { ref, inputs });
        if (!valid()) return;
        toast.success(tNow('ci.dispatchSubmitted')); get().closeDispatchModal();
        await get().refreshActions();
      } catch (error: any) { if (valid()) throw error; }
    },
    rerunWorkflowRun: async (runId, failedOnly = false) => {
      const { currentOwner: owner, currentRepoName: repo } = get();
      if (!owner || !repo) return;
      const valid = ticket('rerun');
      try {
        await githubService.rerunWorkflow(owner, repo, runId, failedOnly);
        if (valid()) { toast.success(tNow('ci.rerunRequested')); await get().refreshActions(); }
      } catch (error: any) { if (valid()) toast.error(tNow('ci.rerunFailed'), error.message); }
    },
    cancelWorkflowRun: async (runId) => {
      const { currentOwner: owner, currentRepoName: repo } = get();
      if (!owner || !repo) return;
      const valid = ticket('cancel');
      try {
        await githubService.cancelWorkflowRun(owner, repo, runId);
        if (valid()) { toast.info(tNow('ci.cancelRequested')); await get().refreshActions(); }
      } catch (error: any) { if (valid()) toast.error(tNow('ci.cancelFailed'), error.message); }
    },
    loadPullRequests: async () => {
      const valid = ticket('prs');
      const { currentOwner: owner, currentRepoName: repo, prFilterState } = get();
      if (!owner || !repo) return;
      set({ isLoadingPullRequests: true, pullRequestsError: null });
      try {
        const prs = await githubService.getPullRequests(owner, repo, prFilterState);
        if (valid()) set({ pullRequests: prs, selectedPR: prs.find((pr) => pr.id === get().selectedPR?.id) || prs[0] || null });
      } catch (error: any) { if (valid()) set({ pullRequestsError: String(error?.message || error) }); }
      finally { if (valid()) set({ isLoadingPullRequests: false }); }
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
          // 写入 commitChecks：NotificationService 经外部订阅观察 running→completed
          // 迁移来弹系统通知（推送后失焦场景），也与 fetchCommitChecks 的缓存形状一致。
          set((state) => ({ commitChecks: { ...state.commitChecks, [sha]: checks } }));
          if (checks.length && checks.every((check) => check.status === 'completed')) {
            const passed = checks.filter((check) => check.conclusion === 'success').length;
            if (passed === checks.length) toast.success(tNow('ci.passed'), `${passed}/${checks.length}`);
            else toast.warning(tNow('ci.failed'), checks.map((check) => `${check.name}: ${check.conclusion}`).join(', '));
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
