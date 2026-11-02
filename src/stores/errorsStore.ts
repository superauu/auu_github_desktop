import { create } from 'zustand';
import { getErrorPlugin, subscribePlugins } from '@/services/integrations/plugins';
import { deleteIntegrationToken, getIntegrationToken, storeIntegrationToken } from '@/services/errors/credentials';
import { createProviderClient, ProviderRequestError, type ExternalOrg, type ExternalProject } from '@/services/errors/providerService';
import { computeRepoKey } from '@/services/errors/repoIdentity';
import { buildCommitTrailer } from '@/services/errors/fixFlow';
import { getProviderManifest } from '@/services/integrations/registry';
import type { ConnectionHealth, DomainId, ProviderConnection } from '@/services/integrations/registry';
import type { IssueGitLink, IssuePullRequestRef, ProjectMapping, UnifiedErrorIssue } from '@/services/errors/types';
import type { ErrorsScope } from '@/services/errors/issueQuery';

/**
 * Errors 集成连接状态（PRD §6）：
 * - 持久化（localStorage `auu_git_error_connections`）只含非敏感配置；token 在 keyring
 *   （credentials.ts），绝不入本文件序列化结果。
 * - `domains` 持久化为"上次权限检查成功时的快照"——重启后菜单立即可判（§4.4 存在性规则），
 *   但只允许在权限检查成功时更新（setConnectionDomains），网络失败保留旧值。
 * - 健康态（connected/error/unverified）是运行时结论，仅存内存，不落盘。
 */
const STORAGE_KEY = 'auu_git_error_connections';
const MAPPINGS_KEY = 'auu_git_error_mappings';
const LINKS_KEY = 'auu_git_error_links';

// 轮询句柄（PRD §9）：仅内存，页面隐藏时 tick 直接跳过
let pollTimer: ReturnType<typeof setInterval> | null = null;

export type PersistedConnection = Pick<
  ProviderConnection,
  'id' | 'providerId' | 'displayName' | 'enabled' | 'baseUrl' | 'orgId' | 'domains'
>;

export interface ConnectionRuntime {
  health: ConnectionHealth;
  statusMessage: string;
}

interface AddConnectionInput
  extends Pick<ProviderConnection, 'providerId' | 'displayName'>,
    Partial<Pick<ProviderConnection, 'enabled' | 'baseUrl' | 'orgId'>> {}

interface ErrorsStoreState {
  connections: PersistedConnection[];
  runtime: Record<string, ConnectionRuntime>;
  restored: boolean;
  /** 仓库级项目映射（PRD §6.1/§6.2）：repoKey → 映射；持久化 MAPPINGS_KEY，惰性加载。 */
  mappingsByRepo: Record<string, ProjectMapping[]>;
  /** Issue ↔ Git 关联（§5.3）：repoKey → 链接；持久化 LINKS_KEY，惰性加载。 */
  linksByRepo: Record<string, IssueGitLink[]>;
  /** 当前仓库键（loadRepoContext 时计算）；null = 无仓库上下文。 */
  activeRepoKey: string | null;
  /** 当前仓库路径（与 activeRepoKey 同步），供按路径的命令式查询校验（提交注入 trailer 用）。 */
  activeRepoPath: string | null;
  /** 列表作用域（§7.2）：本仓库 / 全部；同时决定徽标口径。 */
  scope: ErrorsScope;
  /** 合并 issue 缓存——仅内存，不持久化（§6.2 隐私最小化）。 */
  issues: UnifiedErrorIssue[];
  /** 每条连接的下一页游标（§7.2 多源增量合并）。 */
  nextCursors: Record<string, string | null>;
  syncing: boolean;
  lastSyncedAt: number | null;
  /** 按连接降级的同步错误（§7.3.2）：失败的连接保留旧数据 + 横幅。 */
  syncErrors: Record<string, string>;

  restoreConnections(): void;
  addConnection(input: AddConnectionInput): PersistedConnection;
  updateConnection(id: string, patch: Partial<Omit<PersistedConnection, 'id'>>): void;
  /** 删除连接并同时清除 keyring 凭证（凭证清理失败不阻塞连接移除，M2 起有测试覆盖）。 */
  removeConnection(id: string): Promise<void>;
  /** 连接第一步：验证凭证并列出组织（不落任何状态）。 */
  verifyConnection(input: { providerId: string; baseUrl?: string; token: string }): Promise<ExternalOrg[]>;
  /** 连接第二步：校验组织后写入凭证与连接（token 入 keyring，域快照仅在此次成功后写入）。 */
  completeConnection(input: {
    providerId: string;
    displayName: string;
    baseUrl?: string;
    token: string;
    orgId: string;
  }): Promise<PersistedConnection>;
  /** 重新测试：成功才更新域快照与健康态；失败只改健康态、保留旧快照（§4.4）。 */
  retestConnection(id: string): Promise<void>;
  /** 仓库上下文进入/切换时调用：计算 repoKey 并挂载该仓库的映射。 */
  loadRepoContext(originUrl: string | null | undefined, workspacePath: string): void;
  setScope(scope: ErrorsScope): void;
  addMapping(connectionId: string, project: Pick<ExternalProject, 'id' | 'name'>): void;
  removeMapping(connectionId: string, externalProjectId: string): void;
  /** 更新映射的堆栈路径前缀规则（§8.4 高置信档的数据源）；空规则清除。 */
  updateMappingPrefixRules(connectionId: string, externalProjectId: string, rules: { from: string; to: string }[]): void;
  /** 同步：逐连接拉取未解决 issue 首页并合并；单连接失败不影响其他来源（§7.3.2）。 */
  sync(): Promise<void>;
  /** 加载更多：对各连接的下一页游标增量拉取（§7.2 分页）。 */
  loadMore(): Promise<void>;
  /** 轮询（§9）：interval 来自 settingsStore.errorsPollingIntervalSec；重复调用先清理旧定时器。 */
  startPolling(intervalSec: number): void;
  stopPolling(): void;
  /** 记录修复分支（§8.1）：find-or-create 链接并追加分支名（§5.3 持久化，重启可恢复）。 */
  recordFixBranch(issue: { connectionId: string; providerId: string; externalProjectId: string; issueId: string; shortId?: string; externalUrl?: string }, branchName: string): IssueGitLink;
  /** 成功提交后记录 sha：仅当该分支已被链接（幂等）。 */
  recordFixCommit(path: string, branch: string, sha: string): void;
  /** PR 创建成功后记录（幂等）。 */
  recordFixPullRequest(path: string, branch: string, pr: IssuePullRequestRef): void;
  linkForIssue(connectionId: string, issueId: string): IssueGitLink | null;
  /** 按分支反查链接（提交/PR 注入点用）；path 与当前仓库不符时返回 null。 */
  linkForBranch(path: string, branch: string): IssueGitLink | null;
  /** 提交注入点（§8.2）：当前仓库 + 分支已被链接时返回中性 trailer，否则 null。 */
  trailerForBranch(path: string, branch: string): string | null;
  /** 状态回写（§8.3）：成功即时更新列表；失败向上抛（操作级错误，不改健康态）。 */
  updateIssueStatus(connectionId: string, issueId: string, action: 'resolve' | 'resolveInNextRelease' | 'ignore' | 'unresolve'): Promise<void>;
  setConnectionHealth(id: string, health: ConnectionHealth, statusMessage?: string): void;
  /** 仅在权限检查成功后调用——网络失败不得调用本方法（§4.4）。 */
  setConnectionDomains(id: string, domains: DomainId[]): void;
  getRuntime(id: string): ConnectionRuntime;
  /** shouldShowDomain 的数据源：按域给出存在性判断输入。 */
  domainConnections(domain: DomainId): Pick<ProviderConnection, 'enabled' | 'domains'>[];
}

const newConnectionId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `conn-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

function readPersisted(): PersistedConnection[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is PersistedConnection =>
        typeof item?.id === 'string' &&
        typeof item?.providerId === 'string' &&
        typeof item?.displayName === 'string' &&
        typeof item?.enabled === 'boolean' &&
        Array.isArray(item?.domains),
    );
  } catch {
    return [];
  }
}

function persist(connections: PersistedConnection[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(connections));
  } catch {
    /* 存储不可用时静默：token 仍在 keyring，重连即可 */
  }
}

function readMappings(): Record<string, ProjectMapping[]> {
  try {
    const raw = localStorage.getItem(MAPPINGS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed as Record<string, ProjectMapping[]>;
  } catch {
    return {};
  }
}

function persistMappings(mappingsByRepo: Record<string, ProjectMapping[]>): void {
  try {
    localStorage.setItem(MAPPINGS_KEY, JSON.stringify(mappingsByRepo));
  } catch {
    /* 存储不可用时静默：映射可在设置中重建 */
  }
}

function readLinks(): Record<string, IssueGitLink[]> {
  try {
    const raw = localStorage.getItem(LINKS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed as Record<string, IssueGitLink[]>;
  } catch {
    return {};
  }
}

function persistLinks(linksByRepo: Record<string, IssueGitLink[]>): void {
  try {
    localStorage.setItem(LINKS_KEY, JSON.stringify(linksByRepo));
  } catch {
    /* 存储不可用时静默：关联可在详情页重建 */
  }
}

const newLinkId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `link-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

export const useErrorsStore = create<ErrorsStoreState>((set, get) => ({
  connections: [],
  runtime: {},
  restored: false,
  mappingsByRepo: {},
  linksByRepo: {},
  activeRepoKey: null,
  activeRepoPath: null,
  scope: 'repo',
  issues: [],
  nextCursors: {},
  syncing: false,
  lastSyncedAt: null,
  syncErrors: {},

  restoreConnections() {
    const connections = readPersisted();
    // 历史版本删除连接未联动清理映射：恢复时从存储读出并按现存连接清一次（幂等）。
    // 必须读存储而非内存——此时 loadRepoContext 尚未把映射挂进内存，内存态是空/陈旧的。
    const known = new Set(connections.map((connection) => connection.id));
    const mappingsByRepo = Object.fromEntries(
      Object.entries(readMappings())
        .map(([repoKey, mappings]) => [repoKey, mappings.filter((mapping) => known.has(mapping.connectionId))])
        .filter(([, mappings]) => mappings.length > 0),
    );
    persistMappings(mappingsByRepo);
    set({ connections, restored: true, mappingsByRepo });
  },

  addConnection(input) {
    const connection: PersistedConnection = {
      id: newConnectionId(),
      providerId: input.providerId,
      displayName: input.displayName.trim() || input.providerId,
      enabled: input.enabled ?? true,
      baseUrl: input.baseUrl,
      orgId: input.orgId,
      domains: [],
    };
    set({ connections: [...get().connections, connection] });
    persist(get().connections);
    return connection;
  },

  updateConnection(id, patch) {
    set({
      connections: get().connections.map((connection) => (connection.id === id ? { ...connection, ...patch } : connection)),
    });
    persist(get().connections);
  },

  async removeConnection(id) {
    await deleteIntegrationToken(id).catch(() => {});
    // 联动清理该连接的全部数据（列表 / 游标 / 同步错误 / 项目映射）——
    // 残留 issue 会对已删除的凭证与组织发起请求（credential missing / missing organization），
    // 且引用旧连接的映射会静默过滤掉新连接的同步结果。
    const mappingsByRepo = Object.fromEntries(
      Object.entries(get().mappingsByRepo)
        .map(([repoKey, mappings]) => [repoKey, mappings.filter((mapping) => mapping.connectionId !== id)])
        .filter(([, mappings]) => mappings.length > 0),
    );
    persistMappings(mappingsByRepo);
    set({
      connections: get().connections.filter((connection) => connection.id !== id),
      runtime: Object.fromEntries(Object.entries(get().runtime).filter(([key]) => key !== id)),
      issues: get().issues.filter((issue) => issue.connectionId !== id),
      nextCursors: Object.fromEntries(Object.entries(get().nextCursors).filter(([key]) => key !== id)),
      syncErrors: Object.fromEntries(Object.entries(get().syncErrors).filter(([key]) => key !== id)),
      mappingsByRepo,
    });
    persist(get().connections);
  },

  async verifyConnection(input) {
    const client = createProviderClient(input.providerId, { token: input.token.trim(), baseUrl: input.baseUrl });
    return client.listOrganizations();
  },

  async completeConnection(input) {
    const client = createProviderClient(input.providerId, { token: input.token.trim(), baseUrl: input.baseUrl });
    // 一次网络调用同时校验 token 与 orgId；组织列表可达 = 凭证与读取权限已验证
    const orgs = await client.listOrganizations();
    if (!orgs.some((org) => org.id === input.orgId || org.slug === input.orgId)) {
      throw new ProviderRequestError('notFound', `Organization not found: ${input.orgId}`);
    }
    const connection = get().addConnection({
      providerId: input.providerId,
      displayName: input.displayName,
      baseUrl: input.baseUrl,
      orgId: input.orgId,
    });
    try {
      await storeIntegrationToken(connection.id, input.token.trim());
    } catch (cause) {
      // 凭证写入失败：回滚连接，避免留下无凭证的死连接
      await get().removeConnection(connection.id);
      throw cause;
    }
    // 权限检查成功 → 域快照与 connected 健康态（§4.4）
    const domains = getProviderManifest(input.providerId)?.domains.map((contribution) => contribution.domain) ?? [];
    get().setConnectionDomains(connection.id, domains);
    get().setConnectionHealth(connection.id, 'connected');
    return { ...connection, domains };
  },

  async retestConnection(id) {
    const connection = get().connections.find((item) => item.id === id);
    if (!connection) return;
    const token = await getIntegrationToken(id);
    if (!token) {
      set({ runtime: { ...get().runtime, [id]: { health: 'error' as const, statusMessage: 'credential missing' } } });
      return;
    }
    try {
      const client = createProviderClient(connection.providerId, { token, baseUrl: connection.baseUrl });
      await client.verify();
      const domains = getProviderManifest(connection.providerId)?.domains.map((contribution) => contribution.domain) ?? [];
      get().setConnectionDomains(id, domains);
      get().setConnectionHealth(id, 'connected');
    } catch (error) {
      // 失败只改健康态；域快照保留——网络失败不是"权限为空"（§4.4）
      get().setConnectionHealth(id, 'error', String(error instanceof Error ? error.message : error));
    }
  },

  loadRepoContext(originUrl, workspacePath) {
    const mappingsByRepo = readMappings();
    const linksByRepo = readLinks();
    set({ mappingsByRepo, linksByRepo, activeRepoKey: computeRepoKey(originUrl, workspacePath), activeRepoPath: workspacePath });
  },

  setScope(scope) {
    set({ scope });
  },

  addMapping(connectionId, project) {
    const repoKey = get().activeRepoKey;
    if (!repoKey) return;
    const bucket = get().mappingsByRepo[repoKey] ?? [];
    if (bucket.some((mapping) => mapping.connectionId === connectionId && mapping.externalProjectId === project.id)) return;
    const mapping: ProjectMapping = { connectionId, externalProjectId: project.id, externalProjectName: project.name };
    const mappingsByRepo = { ...get().mappingsByRepo, [repoKey]: [...bucket, mapping] };
    set({ mappingsByRepo });
    persistMappings(mappingsByRepo);
  },

  removeMapping(connectionId, externalProjectId) {
    const repoKey = get().activeRepoKey;
    if (!repoKey) return;
    const bucket = (get().mappingsByRepo[repoKey] ?? []).filter(
      (mapping) => !(mapping.connectionId === connectionId && mapping.externalProjectId === externalProjectId),
    );
    const mappingsByRepo = { ...get().mappingsByRepo, [repoKey]: bucket };
    set({ mappingsByRepo });
    persistMappings(mappingsByRepo);
  },

  updateMappingPrefixRules(connectionId, externalProjectId, rules) {
    const repoKey = get().activeRepoKey;
    if (!repoKey) return;
    const bucket = get().mappingsByRepo[repoKey] ?? [];
    const nextBucket = bucket.map((mapping) =>
      mapping.connectionId === connectionId && mapping.externalProjectId === externalProjectId
        ? { ...mapping, sourcePathPrefixMap: rules.length ? rules : undefined }
        : mapping,
    );
    const mappingsByRepo = { ...get().mappingsByRepo, [repoKey]: nextBucket };
    set({ mappingsByRepo });
    persistMappings(mappingsByRepo);
  },

  async sync() {
    if (get().syncing) return;
    set({ syncing: true });
    const collected: UnifiedErrorIssue[] = [];
    const cursors: Record<string, string | null> = {};
    const syncErrors: Record<string, string> = {};
    await Promise.all(
      get()
        .connections.filter((connection) => connection.enabled && getErrorPlugin(connection.providerId))
        .map(async (connection) => {
          try {
            // 该连接在所有仓库的映射项目并集：一次拉取，作用域在查询层过滤（§7.2）
            const projectIds = [
              ...new Set(
                Object.values(get().mappingsByRepo)
                  .flat()
                  .filter((mapping) => mapping.connectionId === connection.id)
                  .map((mapping) => mapping.externalProjectId),
              ),
            ];
            if (!projectIds.length) return;
            if (!connection.orgId) throw new ProviderRequestError('unknown', 'missing organization');
            const token = await getIntegrationToken(connection.id);
            if (!token) throw new ProviderRequestError('auth', 'credential missing');
            const client = createProviderClient(connection.providerId, { token, baseUrl: connection.baseUrl });
            const page = await client.listIssues({ orgId: connection.orgId, projectIds });
            collected.push(...page.issues.map((issue) => ({ ...issue, connectionId: connection.id })));
            cursors[connection.id] = page.nextCursor;
          } catch (error) {
            syncErrors[connection.id] = String(error instanceof Error ? error.message : error);
          }
        }),
    );
    set((state) => ({
      syncing: false,
      lastSyncedAt: Date.now(),
      // 成功的连接整体替换；失败的连接保留旧数据（横幅提示"数据可能过期"）
      issues: [...state.issues.filter((issue) => !(issue.connectionId in cursors)), ...collected],
      nextCursors: { ...state.nextCursors, ...cursors },
      syncErrors,
    }));
  },

  async loadMore() {
    if (get().syncing) return;
    const pending = get().connections.filter((connection) => connection.enabled && getErrorPlugin(connection.providerId) && get().nextCursors[connection.id]);
    if (!pending.length) return;
    set({ syncing: true });
    const collected: UnifiedErrorIssue[] = [];
    const cursors: Record<string, string | null> = {};
    const syncErrors: Record<string, string> = {};
    await Promise.all(
      pending.map(async (connection) => {
        try {
          const cursor = get().nextCursors[connection.id];
          const projectIds = [
            ...new Set(
              Object.values(get().mappingsByRepo)
                .flat()
                .filter((mapping) => mapping.connectionId === connection.id)
                .map((mapping) => mapping.externalProjectId),
            ),
          ];
          if (!connection.orgId) throw new ProviderRequestError('unknown', 'missing organization');
          const token = await getIntegrationToken(connection.id);
          if (!token) throw new ProviderRequestError('auth', 'credential missing');
          const client = createProviderClient(connection.providerId, { token, baseUrl: connection.baseUrl });
          const page = await client.listIssues({ orgId: connection.orgId, projectIds, cursor });
          const existing = new Set(get().issues.filter((issue) => issue.connectionId === connection.id).map((issue) => issue.issueId));
          collected.push(
            ...page.issues
              .map((issue) => ({ ...issue, connectionId: connection.id }))
              .filter((issue) => !existing.has(issue.issueId)),
          );
          cursors[connection.id] = page.nextCursor;
        } catch (error) {
          syncErrors[connection.id] = String(error instanceof Error ? error.message : error);
        }
      }),
    );
    set((state) => ({
      syncing: false,
      issues: [...state.issues, ...collected],
      nextCursors: { ...state.nextCursors, ...cursors },
      syncErrors: { ...state.syncErrors, ...syncErrors },
    }));
  },

  startPolling(intervalSec) {
    useErrorsStore.getState().stopPolling();
    const interval = Math.max(30, intervalSec) * 1000;
    pollTimer = setInterval(() => {
      // 页面不可见时暂停轮询（§9）
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      void useErrorsStore.getState().sync();
    }, interval);
  },

  stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  },

  recordFixBranch(issue, branchName) {
    const repoKey = get().activeRepoKey;
    if (!repoKey) throw new Error('No repository context');
    const bucket = get().linksByRepo[repoKey] ?? [];
    const existingIndex = bucket.findIndex(
      (item) => item.connectionId === issue.connectionId && item.issueId === issue.issueId,
    );
    const now = new Date().toISOString();
    let link: IssueGitLink;
    let nextBucket: IssueGitLink[];
    if (existingIndex >= 0) {
      const existing = bucket[existingIndex];
      link = {
        ...existing,
        shortId: issue.shortId ?? existing.shortId,
        externalUrl: issue.externalUrl ?? existing.externalUrl,
        branchNames: existing.branchNames.includes(branchName) ? existing.branchNames : [...existing.branchNames, branchName],
        updatedAt: now,
      };
      nextBucket = [...bucket];
      nextBucket[existingIndex] = link;
    } else {
      link = {
        id: newLinkId(),
        connectionId: issue.connectionId,
        providerId: issue.providerId,
        externalProjectId: issue.externalProjectId,
        issueId: issue.issueId,
        shortId: issue.shortId,
        externalUrl: issue.externalUrl,
        repoKey,
        branchNames: [branchName],
        commitShas: [],
        pullRequests: [],
        createdAt: now,
        updatedAt: now,
      };
      nextBucket = [...bucket, link];
    }
    const linksByRepo = { ...get().linksByRepo, [repoKey]: nextBucket };
    set({ linksByRepo });
    persistLinks(linksByRepo);
    return link;
  },

  recordFixCommit(path, branch, sha) {
    const { activeRepoPath, activeRepoKey, linksByRepo } = get();
    if (!activeRepoKey || activeRepoPath !== path) return;
    const bucket = linksByRepo[activeRepoKey] ?? [];
    let changed = false;
    const nextBucket = bucket.map((link) => {
      if (!link.branchNames.includes(branch) || link.commitShas.includes(sha)) return link;
      changed = true;
      return { ...link, commitShas: [...link.commitShas, sha], updatedAt: new Date().toISOString() };
    });
    if (!changed) return;
    const next = { ...linksByRepo, [activeRepoKey]: nextBucket };
    set({ linksByRepo: next });
    persistLinks(next);
  },

  recordFixPullRequest(path, branch, pr) {
    const { activeRepoPath, activeRepoKey, linksByRepo } = get();
    if (!activeRepoKey || activeRepoPath !== path) return;
    const bucket = linksByRepo[activeRepoKey] ?? [];
    let changed = false;
    const nextBucket = bucket.map((link) => {
      if (!link.branchNames.includes(branch) || link.pullRequests.some((item) => item.url === pr.url)) return link;
      changed = true;
      return { ...link, pullRequests: [...link.pullRequests, pr], updatedAt: new Date().toISOString() };
    });
    if (!changed) return;
    const next = { ...linksByRepo, [activeRepoKey]: nextBucket };
    set({ linksByRepo: next });
    persistLinks(next);
  },

  linkForIssue(connectionId, issueId) {
    const { activeRepoKey, linksByRepo } = get();
    if (!activeRepoKey) return null;
    return (linksByRepo[activeRepoKey] ?? []).find((item) => item.connectionId === connectionId && item.issueId === issueId) ?? null;
  },

  linkForBranch(path, branch) {
    const { activeRepoPath, activeRepoKey, linksByRepo } = get();
    if (!activeRepoKey || activeRepoPath !== path) return null;
    return (linksByRepo[activeRepoKey] ?? []).find((item) => item.branchNames.includes(branch)) ?? null;
  },

  trailerForBranch(path, branch) {
    const { activeRepoPath, activeRepoKey, linksByRepo } = get();
    if (!activeRepoKey || activeRepoPath !== path) return null;
    const link = (linksByRepo[activeRepoKey] ?? []).find((item) => item.branchNames.includes(branch));
    if (!link) return null;
    return buildCommitTrailer(link.providerId, link.shortId || link.issueId);
  },

  async updateIssueStatus(connectionId, issueId, action: 'resolve' | 'resolveInNextRelease' | 'ignore' | 'unresolve') {
    const connection = get().connections.find((item) => item.id === connectionId);
    if (!connection?.orgId) throw new Error('missing organization');
    const token = await getIntegrationToken(connectionId);
    if (!token) throw new ProviderRequestError('auth', 'credential missing');
    const client = createProviderClient(connection.providerId, { token, baseUrl: connection.baseUrl });
    // 失败向上抛给 UI（操作级错误：toast 提示，不改健康态、不触发降级横幅，§8.3）
    const updated = await client.updateStatus(issueId, action);
    set((state) => ({
      issues: state.issues.map((issue) =>
        issue.connectionId === connectionId && issue.issueId === issueId
          ? { ...issue, severity: updated.severity, status: updated.status, rawStatus: updated.rawStatus, rawData: updated.rawData ?? issue.rawData }
          : issue,
      ),
    }));
  },

  setConnectionHealth(id, health, statusMessage = '') {
    set({ runtime: { ...get().runtime, [id]: { health, statusMessage } } });
  },

  setConnectionDomains(id, domains) {
    const connections = get().connections.map((connection) => (connection.id === id ? { ...connection, domains } : connection));
    set({ connections });
    persist(connections);
  },

  getRuntime(id) {
    return get().runtime[id] ?? { health: 'unverified' as const, statusMessage: '' };
  },

  domainConnections(domain) {
    return get().connections.map(({ enabled, domains, providerId }) => ({ enabled: enabled && !!getErrorPlugin(providerId), domains })).filter(({ domains }) => domains.includes(domain));
  },
}));

subscribePlugins(() => {
  useErrorsStore.setState(state => ({ connections: [...state.connections] }));
});
