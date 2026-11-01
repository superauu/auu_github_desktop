import { create } from 'zustand';
import { deleteIntegrationToken, getIntegrationToken, storeIntegrationToken } from '@/services/errors/credentials';
import { createProviderClient, ProviderRequestError, type ExternalOrg, type ExternalProject } from '@/services/errors/providerService';
import { computeRepoKey } from '@/services/errors/repoIdentity';
import { getProviderManifest } from '@/services/errors/types';
import type { ConnectionHealth, DomainId, ProjectMapping, ProviderConnection, UnifiedErrorIssue } from '@/services/errors/types';
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
  /** 当前仓库键（loadRepoContext 时计算）；null = 无仓库上下文。 */
  activeRepoKey: string | null;
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
  /** 同步：逐连接拉取未解决 issue 首页并合并；单连接失败不影响其他来源（§7.3.2）。 */
  sync(): Promise<void>;
  /** 加载更多：对各连接的下一页游标增量拉取（§7.2 分页）。 */
  loadMore(): Promise<void>;
  /** 轮询（§9）：interval 来自 settingsStore.errorsPollingIntervalSec；重复调用先清理旧定时器。 */
  startPolling(intervalSec: number): void;
  stopPolling(): void;
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

export const useErrorsStore = create<ErrorsStoreState>((set, get) => ({
  connections: [],
  runtime: {},
  restored: false,
  mappingsByRepo: {},
  activeRepoKey: null,
  scope: 'repo',
  issues: [],
  nextCursors: {},
  syncing: false,
  lastSyncedAt: null,
  syncErrors: {},

  restoreConnections() {
    set({ connections: readPersisted(), restored: true });
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
    set({
      connections: get().connections.filter((connection) => connection.id !== id),
      runtime: Object.fromEntries(Object.entries(get().runtime).filter(([key]) => key !== id)),
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
    set({ mappingsByRepo, activeRepoKey: computeRepoKey(originUrl, workspacePath) });
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

  async sync() {
    if (get().syncing) return;
    set({ syncing: true });
    const collected: UnifiedErrorIssue[] = [];
    const cursors: Record<string, string | null> = {};
    const syncErrors: Record<string, string> = {};
    await Promise.all(
      get()
        .connections.filter((connection) => connection.enabled)
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
    const pending = get().connections.filter((connection) => connection.enabled && get().nextCursors[connection.id]);
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
    return get().connections.map(({ enabled, domains }) => ({ enabled, domains })).filter(({ domains }) => domains.includes(domain));
  },
}));
