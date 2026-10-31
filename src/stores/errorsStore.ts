import { create } from 'zustand';
import { deleteIntegrationToken, getIntegrationToken, storeIntegrationToken } from '@/services/errors/credentials';
import { createProviderClient, ProviderRequestError, type ExternalOrg } from '@/services/errors/providerService';
import { getProviderManifest } from '@/services/errors/types';
import type { ConnectionHealth, DomainId, ProviderConnection } from '@/services/errors/types';

/**
 * Errors 集成连接状态（PRD §6）：
 * - 持久化（localStorage `auu_git_error_connections`）只含非敏感配置；token 在 keyring
 *   （credentials.ts），绝不入本文件序列化结果。
 * - `domains` 持久化为"上次权限检查成功时的快照"——重启后菜单立即可判（§4.4 存在性规则），
 *   但只允许在权限检查成功时更新（setConnectionDomains），网络失败保留旧值。
 * - 健康态（connected/error/unverified）是运行时结论，仅存内存，不落盘。
 */
const STORAGE_KEY = 'auu_git_error_connections';

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

export const useErrorsStore = create<ErrorsStoreState>((set, get) => ({
  connections: [],
  runtime: {},
  restored: false,

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
