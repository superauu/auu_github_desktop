import { create } from 'zustand';
import { getTaskPlugin, subscribePlugins } from '@/services/integrations/plugins';
import { deleteIntegrationToken, getIntegrationToken, storeIntegrationToken } from '@/services/errors/credentials';
import type { AuxTokenSet } from '@/services/integrations/plugin';
import type { ConnectionHealth, DomainId, ProviderConnection } from '@/services/integrations/registry';

/**
 * 独立任务系统连接状态（Linear 起步）。与 errorsStore 的连接切片同构——那是
 * Sentry 定型的先例；此处刻意独立成店而不是抽公共工厂：errors 侧与 issues/mappings/
 * polling 深度耦合，抽切片的收益要等 ci 档接入后再评估（去重候选项）。
 * - 持久化（localStorage `auu_git_task_connections`）只含非敏感配置；令牌在 keyring
 *   （integration_token:<connectionId>，与 errors 通道共用命令、JSON blob 存整套
 *   OAuth 令牌），绝不入本文件序列化结果。
 * - `domains` 仍按「上次验证成功时的快照」维护；健康态仅内存。
 * - OAuth 令牌是轮转的：刷新产生的新 refresh token 必须先落 keyring 再继续，
 *   漏存会在下次刷新时 invalid_grant（Linear 30 分钟宽限是最后防线）。
 */
const STORAGE_KEY = 'auu_git_task_connections';
const STALE_BEFORE_MS = 60_000;

export type TaskConnection = Pick<
  ProviderConnection,
  'id' | 'providerId' | 'displayName' | 'enabled' | 'baseUrl' | 'orgId' | 'domains'
>;

export interface TaskConnectionRuntime {
  health: ConnectionHealth;
  statusMessage: string;
}

interface TaskStoreState {
  connections: TaskConnection[];
  runtime: Record<string, TaskConnectionRuntime>;
  restored: boolean;

  restoreConnections(): Promise<void>;
  addConnection(input: Pick<TaskConnection, 'providerId' | 'displayName' | 'orgId'>): TaskConnection;
  updateConnection(id: string, patch: Partial<Omit<TaskConnection, 'id'>>): void;
  removeConnection(id: string): Promise<void>;
  /** PAT 路径：验证令牌（verifyToken 走 viewer 查询）后建立连接。 */
  connectWithToken(input: { providerId: string; displayName: string; token: string }): Promise<TaskConnection>;
  /** OAuth 路径：令牌已由浏览器授权取得，这里只负责落连接与凭证。 */
  connectWithOAuth(input: { providerId: string; displayName: string; tokenSet: AuxTokenSet }): Promise<TaskConnection>;
  /** 同账号去重的连接落库入口：orgId 存账号标识（viewer id），重复连接更新既有令牌。 */
  upsertConnection(input: { providerId: string; displayName: string; tokenJson: string; accountId: string }): Promise<TaskConnection>;
  /** 令牌过期（或即将过期）时刷新并原子回写 keyring；PAT 连接（无 oauthRefresh）原样返回。 */
  ensureFreshToken(id: string): Promise<string | null>;
  /** 重新验证：成功更新域快照与健康态；失败只改健康态、保留旧快照。 */
  retestConnection(id: string): Promise<void>;
  setConnectionHealth(id: string, health: ConnectionHealth, statusMessage?: string): void;
  setConnectionDomains(id: string, domains: DomainId[]): void;
  getRuntime(id: string): TaskConnectionRuntime;
  /** 已启用且声明该域的连接（导航门控与能力并轨的数据源）。 */
  domainConnections(domain: DomainId): Pick<ProviderConnection, 'enabled' | 'domains'>[];
  /** 当前活跃的任务连接：首个 enabled 且插件仍装配的连接。 */
  activeConnection(): TaskConnection | null;
}

const newConnectionId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `task-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

function readPersisted(): TaskConnection[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is TaskConnection =>
        typeof item?.id === 'string' && typeof item?.providerId === 'string' &&
        typeof item?.displayName === 'string' && typeof item?.enabled === 'boolean' && Array.isArray(item?.domains),
    );
  } catch {
    return [];
  }
}

function persist(connections: TaskConnection[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(connections));
  } catch {
    /* 存储不可用时静默：令牌仍在 keyring，重连即可 */
  }
}

interface StoredTokenSet { accessToken: string; refreshToken?: string; expiresAt?: number }

function parseTokenSet(raw: string | null): StoredTokenSet | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed?.accessToken === 'string' ? parsed as StoredTokenSet : null;
  } catch {
    return null;
  }
}

const manifestDomains = (providerId: string): DomainId[] =>
  getTaskPlugin(providerId)?.manifest.domains.map((contribution) => contribution.domain) ?? [];

export const useTaskStore = create<TaskStoreState>((set, get) => ({
  connections: [],
  runtime: {},
  restored: false,

  async restoreConnections() {
    const connections = readPersisted();
    // 旧版本连接没有 orgId（账号标识）：验证令牌回填身份，随后按 (providerId, orgId)
    // 去重——同账号多连接是「卡片未连接」误导下反复连接的产物，保留最后一条（令牌最新）。
    const verified = await Promise.all(connections.map(async (connection) => {
      if (connection.orgId || !connection.enabled) return connection;
      const plugin = getTaskPlugin(connection.providerId);
      const stored = parseTokenSet(await getIntegrationToken(connection.id));
      if (!plugin || !stored) return connection;
      try {
        const user = await plugin.createClient({ token: stored.accessToken }).verifyToken(stored.accessToken);
        return { ...connection, orgId: String(user.id) };
      } catch {
        return connection;
      }
    }));
    const deduplicated = new Map<string, TaskConnection>();
    for (const connection of verified) {
      deduplicated.set(connection.orgId ? `${connection.providerId}:${connection.orgId}` : `${connection.providerId}:unverified:${connection.id}`, connection);
    }
    const deduped = [...deduplicated.values()];
    const dropped = connections.filter((connection) => !deduped.some((item) => item.id === connection.id));
    for (const connection of dropped) await deleteIntegrationToken(connection.id).catch(() => {});
    if (dropped.length) persist(deduped);
    set({ connections: deduped, restored: true });
    // 恢复即预热：过期令牌顺手刷新，首个 Issues 请求不至于先吃一次 401。
    await Promise.allSettled(deduped.filter((connection) => connection.enabled).map((connection) => get().ensureFreshToken(connection.id)));
  },

  addConnection(input) {
    const connection: TaskConnection = {
      id: newConnectionId(), providerId: input.providerId,
      displayName: input.displayName.trim() || input.providerId, enabled: true,
      baseUrl: undefined, orgId: input.orgId, domains: [],
    };
    set({ connections: [...get().connections, connection] });
    persist(get().connections);
    return connection;
  },

  updateConnection(id, patch) {
    set({ connections: get().connections.map((connection) => (connection.id === id ? { ...connection, ...patch } : connection)) });
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

  /**
   * 连接落库的统一入口：先验证身份（verifyToken）再做**同账号去重**——
   * orgId 存账号标识（viewer id），同一平台同一账号重复连接时更新既有连接
   * 的令牌与显示名，而不是堆出第二条（用户会被「卡片未连接」误导连 N 次）。
   * keyring 先写再改状态：写失败时既有令牌/状态原样保留。
   */
  async upsertConnection(input: { providerId: string; displayName: string; tokenJson: string; accountId: string }): Promise<TaskConnection> {
    const existing = get().connections.find((connection) => connection.providerId === input.providerId && connection.orgId === input.accountId);
    if (existing) {
      await storeIntegrationToken(existing.id, input.tokenJson);
      const domains = manifestDomains(input.providerId);
      get().updateConnection(existing.id, { displayName: input.displayName, enabled: true });
      get().setConnectionDomains(existing.id, domains);
      get().setConnectionHealth(existing.id, 'connected');
      return { ...get().connections.find((connection) => connection.id === existing.id)!, domains };
    }
    const connection = get().addConnection({ providerId: input.providerId, displayName: input.displayName, orgId: input.accountId });
    try {
      await storeIntegrationToken(connection.id, input.tokenJson);
    } catch (cause) {
      await get().removeConnection(connection.id);
      throw cause;
    }
    const domains = manifestDomains(input.providerId);
    get().setConnectionDomains(connection.id, domains);
    get().setConnectionHealth(connection.id, 'connected');
    return { ...connection, domains };
  },

  async connectWithToken({ providerId, displayName, token }) {
    const plugin = getTaskPlugin(providerId);
    if (!plugin) throw new Error(`Unknown task plugin: ${providerId}`);
    const user = await plugin.createClient({ token }).verifyToken(token.trim());
    return get().upsertConnection({
      providerId, displayName: displayName.trim() || user.login || providerId,
      tokenJson: JSON.stringify({ accessToken: token.trim(), expiresAt: Number.MAX_SAFE_INTEGER }),
      accountId: String(user.id),
    });
  },

  async connectWithOAuth({ providerId, displayName, tokenSet }) {
    const plugin = getTaskPlugin(providerId);
    if (!plugin) throw new Error(`Unknown task plugin: ${providerId}`);
    const user = await plugin.createClient({ token: tokenSet.accessToken }).verifyToken(tokenSet.accessToken);
    return get().upsertConnection({
      providerId, displayName: displayName.trim() || user.login || providerId,
      tokenJson: JSON.stringify(tokenSet), accountId: String(user.id),
    });
  },

  async ensureFreshToken(id) {
    const connection = get().connections.find((item) => item.id === id);
    if (!connection) return null;
    const stored = parseTokenSet(await getIntegrationToken(id));
    if (!stored) {
      get().setConnectionHealth(id, 'error', 'credential missing');
      return null;
    }
    const plugin = getTaskPlugin(connection.providerId);
    const expired = stored.expiresAt !== undefined && stored.expiresAt <= Date.now();
    const stale = stored.expiresAt !== undefined && stored.expiresAt - Date.now() <= STALE_BEFORE_MS;
    const fresh = stale && plugin?.oauthRefresh && stored.refreshToken ? await plugin.oauthRefresh(stored.refreshToken).catch(() => null) : null;
    if (fresh) {
      // 先落 keyring 再继续：轮转令牌漏存即 invalid_grant。
      await storeIntegrationToken(id, JSON.stringify(fresh));
      get().setConnectionHealth(id, 'connected');
      return fresh.accessToken;
    }
    if (expired) {
      // 过期且无法刷新：PAT 不会走到这（MAX_SAFE_INTEGER），OAuth 刷新失败保持 error。
      get().setConnectionHealth(id, 'error', 'token expired');
      return null;
    }
    get().setConnectionHealth(id, 'connected');
    return stored.accessToken;
  },

  async retestConnection(id) {
    const connection = get().connections.find((item) => item.id === id);
    if (!connection) return;
    const stored = parseTokenSet(await getIntegrationToken(id));
    if (!stored) {
      set({ runtime: { ...get().runtime, [id]: { health: 'error' as const, statusMessage: 'credential missing' } } });
      return;
    }
    const plugin = getTaskPlugin(connection.providerId);
    if (!plugin) {
      set({ runtime: { ...get().runtime, [id]: { health: 'error' as const, statusMessage: 'plugin missing' } } });
      return;
    }
    try {
      await plugin.createClient({ token: stored.accessToken }).verifyToken(stored.accessToken);
      get().setConnectionDomains(id, manifestDomains(connection.providerId));
      get().setConnectionHealth(id, 'connected');
    } catch (error) {
      // 失败只改健康态；域快照保留——网络失败不是「权限为空」
      get().setConnectionHealth(id, 'error', String(error instanceof Error ? error.message : error));
    }
  },

  setConnectionHealth(id, health, statusMessage) {
    // 健康态未变化时不得写入：runtime 对象每次都是新引用，无条件 set 会让
    // 订阅者（startTaskService 的 rebind）被自己触发的更新再次唤起，自旋不止。
    const current = get().runtime[id];
    if (current?.health === health && current?.statusMessage === (statusMessage ?? '')) return;
    set({ runtime: { ...get().runtime, [id]: { health, statusMessage: statusMessage ?? '' } } });
  },

  setConnectionDomains(id, domains) {
    set({ connections: get().connections.map((connection) => (connection.id === id ? { ...connection, domains } : connection)) });
    persist(get().connections);
  },

  getRuntime(id) {
    return get().runtime[id] ?? { health: 'unverified' as const, statusMessage: '' };
  },

  domainConnections(domain) {
    return get().connections.map(({ enabled, domains }) => ({ enabled, domains })).filter((connection) => connection.enabled && connection.domains.includes(domain));
  },

  activeConnection() {
    return get().connections.find((connection) => connection.enabled && !!getTaskPlugin(connection.providerId)) ?? null;
  },
}));

// 插件被构建裁剪/故障注入停用时，连接即失去能力来源：域快照清空（导航门控立即收敛），
// 恢复装配后由 retest/restore 重新验证——与 errorsStore 的订阅口径一致。
subscribePlugins(() => {
  const { connections, setConnectionDomains } = useTaskStore.getState();
  for (const connection of connections) {
    if (!connection.enabled) continue;
    const domains = manifestDomains(connection.providerId);
    if (domains.length !== connection.domains.length || domains.some((domain, index) => domain !== connection.domains[index])) {
      setConnectionDomains(connection.id, domains);
      if (!domains.length) useTaskStore.getState().setConnectionHealth(connection.id, 'error', 'plugin disabled');
    }
  }
});
