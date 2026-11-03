/**
 * 独立任务系统的第二条客户端绑定通道。CollaborationService 是单槽位、按 Git remote
 * 绑定托管插件的，Linear 这类 task 插件不能进那个槽（会顶掉 PR/CI 能力）——这里
 * 仿其双检网关（方法存在 + manifest 声明能力）另起一槽，由 taskStore 的活跃连接驱动。
 * 议题组件经 issueClientFor(providerId) 在两条通道间路由。
 */
import { useTaskStore } from '@/stores/taskStore';
import { getTaskPlugin, subscribePlugins } from './plugins';
import { OPERATION_CAPABILITIES, OPERATION_DOMAINS } from '@/services/collaboration/domainRouting';
import { ProviderApiError, type CollaborationClient, type ProviderClient } from '@/services/collaboration/client';
import { collaborationService } from '@/services/collaboration/CollaborationService';
import { LocalizedError } from '@/i18n';
import type { ProviderManifest } from './registry';

let activeClient: ProviderClient | null = null;
let activeConnectionId: string | null = null;
let activeManifest: ProviderManifest | undefined;

type TaskOperation = keyof typeof OPERATION_DOMAINS;

function permitted(manifest: ProviderManifest | undefined, name: TaskOperation) {
  const capability = OPERATION_CAPABILITIES[name as keyof typeof OPERATION_CAPABILITIES];
  return !manifest || !capability || manifest.domains.some(item => (item.capabilities as readonly string[]).includes(capability));
}

export function bindTaskClient(client: ProviderClient | null, connectionId: string | null, manifest?: ProviderManifest): void {
  // 与 bindCollaborationClient 同款自动包裹：客户端把域方法直接实现在实例上
  // （LinearClient 即如此）时，挂上 taskTracking 指向自身；已带域分组的不动。
  if (client && !Object.keys(client).some(key => ['repository', 'taskTracking', 'codeHosting', 'ciCd'].includes(key))
    && Object.keys(OPERATION_DOMAINS).some(key => OPERATION_DOMAINS[key as TaskOperation] === 'taskTracking' && key in client)) {
    Object.assign(client, { taskTracking: client });
  }
  activeClient = client;
  activeConnectionId = connectionId;
  activeManifest = manifest;
}

function operation(name: TaskOperation, args: unknown[]) {
  const client = activeClient;
  const connectionId = activeConnectionId;
  const manifest = activeManifest;
  if (!client || !connectionId) throw new LocalizedError('connections.errors.noTaskConnected');
  const domain = OPERATION_DOMAINS[name];
  const target = domain === 'auth' ? client : client[domain];
  const method = target && Reflect.get(target, name);
  if (typeof method !== 'function' || !permitted(manifest, name)) {
    throw new LocalizedError('connections.errors.capabilityUnavailable', { op: String(name) });
  }
  const run = () => method.apply(target, args);
  // OAuth 令牌轮转：401 时刷新一次并同步到已绑定客户端（客户端是连接建立时创建的，
  // 不刷新其内部令牌，重试会带着旧 token 再撞一次 401），然后重试。
  return run().catch(async (error: unknown) => {
    if (!(error instanceof ProviderApiError) || error.status !== 401) throw error;
    const token = await useTaskStore.getState().ensureFreshToken(connectionId);
    if (!token) throw error;
    if (typeof client.setToken === 'function') client.setToken(token);
    const refreshed = Reflect.get(target!, name);
    return refreshed.apply(target, args);
  });
}

/** 与 collaborationService 同形的任务域代理：仅暴露任务域操作。 */
export const taskService = new Proxy({} as Record<string, unknown>, {
  get(_target, name: string) {
    if (!(name in OPERATION_DOMAINS) || OPERATION_DOMAINS[name as TaskOperation] !== 'taskTracking') return undefined;
    return (...args: unknown[]) => operation(name as TaskOperation, args);
  },
});

/** 任务引用路由：providerId 命中 task 插件 → task 通道；否则走托管协作通道。 */
export function usesTaskProvider(providerId: string | null | undefined): boolean {
  return !!providerId && !!getTaskPlugin(providerId);
}

/** 议题组件可用的任务域方法面（两条通道同形）。 */
export type TaskClientChannel = Pick<CollaborationClient,
  'searchIssues' | 'getIssue' | 'createIssue' | 'updateIssue' | 'getIssueComments'
  | 'createIssueComment' | 'getIssueTimeline' | 'getIssueLabels' | 'getIssueAssignees'>;

/** 按引用/作用域的平台 id 取议题客户端：任务插件 → taskService，否则托管 collaborationService。 */
export function issueClientFor(providerId: string | null | undefined): TaskClientChannel {
  return usesTaskProvider(providerId) ? (taskService as unknown as TaskClientChannel) : collaborationService;
}

/** taskStore 变化时重绑活跃连接；未恢复或无连接时解绑。 */
let unsubscribe: (() => void) | null = null;
export function startTaskService(): () => void {
  const rebind = () => {
    const connection = useTaskStore.getState().activeConnection();
    if (!connection) {
      bindTaskClient(null, null);
      return;
    }
    // 同一连接已绑定即跳过：rebind 会被自己的 ensureFreshToken→setConnectionHealth
    // 间接触发（zustand 订阅不按切片过滤），没有这道护栏就是无限自旋。
    if (activeConnectionId === connection.id && activeClient) return;
    const plugin = getTaskPlugin(connection.providerId);
    if (!plugin) {
      bindTaskClient(null, null);
      return;
    }
    void useTaskStore.getState().ensureFreshToken(connection.id)
      .then(token => {
        // 恢复期间连接可能已被删/切换：以最新活跃连接为准重读一次。
        const current = useTaskStore.getState().activeConnection();
        if (!current || current.id !== connection.id) return;
        bindTaskClient(token ? plugin.createClient({ token }) : null, connection.id, plugin.manifest);
      })
      .catch(() => bindTaskClient(null, null));
  };
  rebind();
  const unsubscribers = [useTaskStore.subscribe(rebind), subscribePlugins(rebind)];
  unsubscribe = () => unsubscribers.forEach(unsubscribe => unsubscribe());
  return unsubscribe;
}

export function stopTaskService(): void {
  unsubscribe?.();
  unsubscribe = null;
  bindTaskClient(null, null);
}
