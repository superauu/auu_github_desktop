import { createCiSlice } from './collaboration/ciSlice';
import { createCodeHostingSlice } from './collaboration/codeHostingSlice';
import { normalizeServerUrl } from '@/services/integrations/serverUrl';
import { create } from 'zustand';
import {
  CollaborationCheckRun,
  CollaborationJob,
  CollaborationPullRequest,
  CollaborationRepoDetails,
  CollaborationUser,
  CollaborationWorkflow,
  CollaborationWorkflowRun,
  JobLogsData,
  WorkflowYamlContent,
} from '@/services/collaboration/types';
import { ProviderApiError as CollaborationApiError } from '@/services/collaboration/client';
import { collaborationService, bindCollaborationClient, hasCollaborationDomain } from '@/services/collaboration/CollaborationService';
import { enabledHostingPlugins, getHostingPlugin, installedHostingPlugins } from '@/services/integrations/plugins';
import { toast } from '@/stores/toastStore';
import { tNow, LocalizedError } from '@/i18n';

// ===== 多账号 Profile =====
// Profile = 一个独立的 Collaboration 凭据槽位。token 在 keyring 中按 profileId 隔离
// （默认账号沿用旧条目实现无缝迁移），Profile 列表与活跃项持久化到 localStorage。
export const DEFAULT_PROFILE_ID = 'default';
const PROFILES_KEY = 'auu_git_connections';

export interface CollaborationProfileUser {
  login: string;
  name: string | null;
  avatarUrl: string;
}

export interface CollaborationProfile {
  providerId?: string;
  server?: string;
  id: string;
  label: string;
  /** 上次验证成功时登记的账号摘要；头像地址由插件返回。 */
  user?: CollaborationProfileUser;
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
export function parseStoredProfiles(raw: string | null): { profiles: CollaborationProfile[]; activeProfileId: string | null } {
  if (!raw) return { profiles: [], activeProfileId: null };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { profiles: [], activeProfileId: null };
    const { profiles: rawProfiles, activeProfileId: rawActiveId } = parsed as Record<string, unknown>;
    if (!Array.isArray(rawProfiles)) return { profiles: [], activeProfileId: null };
    const cleaned: CollaborationProfile[] = [];
    for (const item of rawProfiles) {
      if (!item || typeof item !== 'object') continue;
      const { id, label, user, providerId, server } = item as Record<string, unknown>;
      if (typeof id !== 'string' || !id.trim()) continue;
      const profile: CollaborationProfile = { id, label: typeof label === 'string' && label.trim() ? label : id, ...(typeof providerId === 'string' ? { providerId } : {}), ...(typeof server === 'string' ? { server } : {}) };
      if (user && typeof user === 'object' && !Array.isArray(user)) {
        const { login, name, avatarUrl } = user as Record<string, unknown>;
        if (typeof login === 'string' && login.trim() && typeof avatarUrl === 'string' && avatarUrl.trim()) {
          profile.user = {
            login: login.trim(),
            name: typeof name === 'string' && name.trim() ? name : null,
            avatarUrl,
          };
        }
      }
      cleaned.push(profile);
    }
    const activeProfileId = typeof rawActiveId === 'string' && cleaned.some((p) => p.id === rawActiveId)
      ? rawActiveId
      : (cleaned[0]?.id ?? null);
    return { profiles: cleaned, activeProfileId };
  } catch {
    return { profiles: [], activeProfileId: null };
  }
}

function saveProfiles(profiles: CollaborationProfile[], activeProfileId: string | null): void {
  try {
    localStorage.setItem(PROFILES_KEY, JSON.stringify({ version: 2, profiles, activeProfileId }));
  } catch { /* 隐私模式/配额失败不阻断登录流程 */ }
}

/** 确保某 Profile 存在并登记刚验证过的 Collaboration 账号摘要（label 即 login，登录/恢复会话后调用）。
 *  摘要登记门槛与 parseStoredProfiles 的读取门槛一致：login 与 avatarUrl 均非空才落盘，
 *  避免"存得进、下次加载被剥掉"的往返不一致；拿不到有效摘要时仅更新 label、保留旧摘要。 */
function withProfileIdentity(profiles: CollaborationProfile[], id: string, verified: CollaborationUser): CollaborationProfile[] {
  const login = (verified.login ?? '').trim();
  const avatarUrl = (verified.avatar_url ?? '').trim();
  const summary: CollaborationProfileUser | null = login && avatarUrl
    ? { login, name: verified.name?.trim() || null, avatarUrl }
    : null;
  const sameSummary = (existing?: CollaborationProfileUser) =>
    (summary === null && existing === undefined)
    || (summary !== null && existing !== undefined
      && existing.login === summary.login
      && existing.name === summary.name
      && existing.avatarUrl === summary.avatarUrl);
  const existing = profiles.find((p) => p.id === id);
  if (!existing) return [...profiles, { id, label: login || id, ...(summary ? { user: summary } : {}) }];
  if (existing.label === login && (summary === null ? existing.user === undefined : sameSummary(existing.user))) return profiles;
  return profiles.map((p) => (p.id === id ? { ...p, label: login, ...(summary ? { user: summary } : {}) } : p));
}

const storedProfiles = (() => {
  if (typeof localStorage === 'undefined') return { profiles: [] as CollaborationProfile[], activeProfileId: null };
  const stored = localStorage.getItem(PROFILES_KEY);
  if (stored) return parseStoredProfiles(stored);
  const profiles = installedHostingPlugins().flatMap(plugin => (plugin.migrateAccounts?.() ?? []).map(profile => ({ ...profile, providerId: plugin.manifest.id })));
  let activeProfileId: string | null = profiles[0]?.id ?? null;
  // 迁移由各插件贡献，宿主只保存统一连接元数据。
  for (const plugin of installedHostingPlugins()) {
    const preferred = plugin.preferredProfileId?.();
    if (preferred && profiles.some(profile => profile.id === preferred)) { activeProfileId = preferred; break; }
  }
  return { profiles, activeProfileId };
})();
const profilePlugin = (profile: CollaborationProfile | undefined, selected?: string) => {
  const plugin = getHostingPlugin(profile?.providerId ?? selected ?? '') ?? (!profile && !selected ? enabledHostingPlugins()[0] : null);
  if (!plugin) throw new LocalizedError('connections.errors.selectPlugin');
  return plugin;
};
async function persistToken(token: string, profileId: string | null, providerId: string) {
  const plugin = getHostingPlugin(providerId);
  if (!plugin) throw new LocalizedError('connections.errors.pluginDisabled');
  await plugin.credentials.write(token, profileId);
}
async function loadToken(profileId: string | null, providerId: string) {
  return await getHostingPlugin(providerId)?.credentials.read(profileId) ?? null;
}
async function clearToken(profileId: string | null, providerId: string) {
  await installedHostingPlugins().find(plugin => plugin.manifest.id === providerId)?.credentials.remove(profileId);
}

export interface CollaborationState {
  isConnecting: boolean;
  finishConnection(): void;
  providerId: string | null;
  server: string;
  selectProvider(providerId: string, server?: string): void;
  token: string | null;
  user: CollaborationUser | null;
  isAuthenticated: boolean;
  repoDetails: CollaborationRepoDetails | null;

  // Multi-Account Profiles（按 Profile 隔离 token）
  profiles: CollaborationProfile[];
  activeProfileId: string | null;
  // “添加账号”进行中标记；addProfileReturnId 记录取消时要回退到的 Profile
  isAddingProfile: boolean;
  addProfileReturnId: string | null;

  // Active Bound Repo
  currentOwner: string | null;
  currentRepoName: string | null;

  // Workflows & Runs
  workflows: CollaborationWorkflow[];
  selectedWorkflow: CollaborationWorkflow | null;
  workflowRuns: CollaborationWorkflowRun[];
  selectedRun: CollaborationWorkflowRun | null;
  selectedRunJobs: CollaborationJob[];
  commitChecks: Record<string, CollaborationCheckRun[]>;
  commitCheckErrors: Record<string, string>;

  // Pull Requests
  pullRequests: CollaborationPullRequest[];
  selectedPR: CollaborationPullRequest | null;
  prFilterState: 'open' | 'closed' | 'all';

  // Deep Actions Modals & State
  activeJobLogs: JobLogsData | null;
  activeWorkflowYaml: WorkflowYamlContent | null;
  isLogsModalOpen: boolean;
  isYamlModalOpen: boolean;
  isDispatchModalOpen: boolean;
  dispatchTargetWorkflow: CollaborationWorkflow | null;

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
  /** 退出当前账号态（不动 Profile 列表）；插件禁用联动复用，会作废在途认证 */
  resetAuthState: () => void;
  clearRepo: () => void;
  syncRepo: (owner: string, repo: string) => Promise<void>;
  loadRepoData: (owner: string, repo: string) => Promise<void>;
  selectWorkflow: (workflow: CollaborationWorkflow | null) => void;
  selectRun: (run: CollaborationWorkflowRun | null) => Promise<void>;
  fetchCommitChecks: (sha: string) => Promise<CollaborationCheckRun[]>;
  refreshActions: () => Promise<void>;

  // Profile Controls
  addProfile: (providerId?: string, server?: string) => void;
  cancelAddProfile: () => void;
  switchProfile: (id: string) => Promise<void>;
  removeProfile: (id: string) => Promise<void>;

  // Deep Actions Controls
  openJobLogs: (jobId: number, jobName?: string) => Promise<void>;
  closeJobLogs: () => void;
  openWorkflowYaml: (workflow: CollaborationWorkflow) => Promise<void>;
  closeWorkflowYaml: () => void;
  openDispatchModal: (workflow: CollaborationWorkflow) => void;
  closeDispatchModal: () => void;
  dispatchWorkflow: (ref: string, inputs?: Record<string, string>) => Promise<void>;
  rerunWorkflowRun: (runId: number, failedOnly?: boolean) => Promise<void>;
  cancelWorkflowRun: (runId: number) => Promise<void>;

  // Pull Requests Controls
  loadPullRequests: () => Promise<void>;
  selectPR: (pr: CollaborationPullRequest | null) => void;
  openPullRequest: (pr: CollaborationPullRequest) => void;
  setPRFilterState: (filter: 'open' | 'closed' | 'all') => void;

  // Push CI Watcher
  watchPushChecks: (sha: string) => void;
}

const emptyRepo = {
  currentOwner: null, currentRepoName: null, repoDetails: null,
  workflows: [], selectedWorkflow: null, workflowRuns: [], selectedRun: null, selectedRunJobs: [],
  commitChecks: {}, commitCheckErrors: {}, pullRequests: [], selectedPR: null,
  activeJobLogs: null, activeWorkflowYaml: null, isLogsModalOpen: false, isYamlModalOpen: false,
  isDispatchModalOpen: false, dispatchTargetWorkflow: null, isLoading: false, isRefreshingActions: false, error: null,
  isLoadingPullRequests: false, pullRequestsError: null, isLoadingRuns: false, isLoadingJobs: false,
};

export const useCollaborationStore = create<CollaborationState>((set, get) => {
  let generation = 0;
  let authGeneration = 0;
  const requests = new Map<string, number>();
  const ticket = (channel: string) => {
    const epoch = generation;
    const id = (requests.get(channel) || 0) + 1;
    requests.set(channel, id);
    return () => generation === epoch && requests.get(channel) === id;
  };
  const ci = createCiSlice({ get, set, ticket, generation: () => generation });
  const persistProfiles = () => saveProfiles(get().profiles, get().activeProfileId);
  /** 退出当前账号态（不动 Profile 列表），供切换/登出/取消添加复用 */
  const resetAuthState = () => {
    get().clearRepo();
    authGeneration++;
    bindCollaborationClient(null);
    set({ token: null, user: null, isAuthenticated: false });
  };
  return {
    ...ci.actions, ...createCodeHostingSlice({ get, set, ticket, generation: () => generation }),
    ...emptyRepo, token: null, user: null, isAuthenticated: false, prFilterState: 'open',
    isConnecting: false,
    finishConnection() { set({ isConnecting: false }); },
    providerId: storedProfiles.profiles.find(profile => profile.id === storedProfiles.activeProfileId)?.providerId ?? null,
    server: storedProfiles.profiles.find(profile => profile.id === storedProfiles.activeProfileId)?.server ?? '',
    selectProvider(providerId, server) {
      const plugin = getHostingPlugin(providerId);
      if (!plugin) throw new LocalizedError('connections.errors.pluginDisabled');
      set({ isConnecting: true });
      resetAuthState();
      const state = get();
      const pending = state.isAddingProfile ? state.activeProfileId : null;
      const profile = state.profiles.find(item => item.providerId === providerId && (!server || item.server === server));
      const rawAddress = server ?? profile?.server ?? plugin.defaultServer;
      const address = rawAddress ? normalizeServerUrl(rawAddress) : rawAddress;
      set({ providerId, server: address, activeProfileId: pending ?? profile?.id ?? null,
        ...(pending ? { profiles: state.profiles.map(item => item.id === pending ? { ...item, providerId, server: address } : item) } : {}),
      });
    },
    profiles: storedProfiles.profiles,
    activeProfileId: storedProfiles.activeProfileId,
    isAddingProfile: false,
    addProfileReturnId: null,
    clearRepo: () => {
      generation++; requests.clear(); ci.stopWatch();
      set({ ...emptyRepo });
    },
    resetAuthState,
    initAuth: async () => {
      const attempt = ++authGeneration;
      if (!enabledHostingPlugins().length) return;

      try {
        const profile = get().profiles.find(item => item.id === get().activeProfileId);
        const plugin = profilePlugin(profile, get().providerId ?? undefined);
        const server = normalizeServerUrl(profile?.server || (get().providerId === plugin.manifest.id ? get().server : '') || plugin.defaultServer);
        const token = await loadToken(get().activeProfileId, plugin.manifest.id);
        const client = plugin.createClient(server, token);
        if (!token || attempt !== authGeneration) return;
        const user = await client.verifyToken(token);
        if (attempt !== authGeneration) return;
        client.setToken(token); bindCollaborationClient(client, plugin.manifest);
        // 首次成功认证会把默认 Profile（沿用旧 keyring 条目）登记进列表，完成旧用户迁移
        const profileId = get().activeProfileId ?? (get().profiles.some(item => item.id === plugin.defaultProfileId) ? newProfileId() : plugin.defaultProfileId);
        const profiles = withProfileIdentity(get().profiles, profileId, user).map(item => item.id === profileId ? { ...item, providerId: plugin.manifest.id, server } : item);
        set({ token, user, isAuthenticated: true, profiles, activeProfileId: profileId, providerId: plugin.manifest.id, server });
        persistProfiles();
        const { currentOwner, currentRepoName } = get();
        if (currentOwner && currentRepoName) await get().loadRepoData(currentOwner, currentRepoName);
      } catch (error) {
        if (attempt !== authGeneration) return;
        if (error instanceof CollaborationApiError && error.status === 401) {
          await clearToken(get().activeProfileId, get().providerId ?? ''); bindCollaborationClient(null);
        }
        // Network, rate-limit and server errors must not delete saved credentials.
        set({ error: String(error) });
      }
    },
    login: async (token: string) => {
      const attempt = ++authGeneration;
      set({ isLoading: true, error: null });
      try {
        const plugin = profilePlugin(get().profiles.find(item => item.id === get().activeProfileId), get().providerId ?? undefined);
        const server = normalizeServerUrl(get().server || plugin.defaultServer);
        const client = plugin.createClient(server, null);
        const user = await client.verifyToken(token);
        if (attempt !== authGeneration) return;
        const profileId = get().activeProfileId ?? (get().profiles.some(item => item.id === plugin.defaultProfileId) ? newProfileId() : plugin.defaultProfileId);
        await persistToken(token, profileId, plugin.manifest.id);
        if (attempt !== authGeneration) return;
        client.setToken(token); bindCollaborationClient(client, plugin.manifest);
        const profiles = withProfileIdentity(get().profiles, profileId, user).map(item => item.id === profileId ? { ...item, providerId: plugin.manifest.id, server } : item);
        set({
          token, user, isAuthenticated: true, isConnecting: false, isLoading: false, profiles, activeProfileId: profileId, providerId: plugin.manifest.id, server,
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
      void clearToken(profileId, get().providerId ?? '').catch((error) => toast.error(tNow('err.credentialCleanupFailed'), String(error)));
    },
    addProfile: (providerId, server) => {
      const plugin = profilePlugin(undefined, providerId ?? get().providerId ?? undefined);
      const { profiles, activeProfileId, isAddingProfile } = get();
      if (isAddingProfile) return;
      const id = newProfileId();
      const label = tNow('profiles.defaultLabel').replace('{n}', String(profiles.length + 1));
      resetAuthState();
      set({
        profiles: [...profiles, { id, label, providerId: plugin.manifest.id, server: server || (get().providerId === plugin.manifest.id ? get().server : '') || plugin.defaultServer }],
        providerId: plugin.manifest.id, server: server || (get().providerId === plugin.manifest.id ? get().server : '') || plugin.defaultServer,
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
      if (!target || !getHostingPlugin(target.providerId ?? get().providerId ?? '')) return;
      resetAuthState();
      set({ activeProfileId: id, providerId: target.providerId ?? null, server: target.server ?? '', isAddingProfile: false, addProfileReturnId: null });
      persistProfiles();
      await get().initAuth();
      if (get().isAuthenticated) toast.success(tNow('profiles.switchedTo').replace('{label}', target?.label || id));
    },
    removeProfile: async (id) => {
      const { profiles, activeProfileId } = get();
      if (!profiles.some((p) => p.id === id)) return;
      void clearToken(id, profiles.find(item => item.id === id)?.providerId ?? get().providerId ?? '').catch((error) => toast.error(tNow('err.credentialCleanupFailed'), String(error)));
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
        hasCollaborationDomain('ciCd') ? get().refreshActions() : Promise.resolve(),
        hasCollaborationDomain('codeHosting') ? get().loadPullRequests() : Promise.resolve(),
        (async () => {
          try {
            if (!hasCollaborationDomain('repository')) return;
            const details = await collaborationService.getRepository(owner, repo);
            if (valid()) set({ repoDetails: details });
          } catch (error: any) { if (valid()) set({ error: String(error?.message || error) }); }
          finally { if (valid()) set({ isLoading: false }); }
        })(),
      ]);
    },
  };
});
