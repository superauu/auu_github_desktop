import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useTaskStore, type TaskConnection } from '@/stores/taskStore';
import { useCollaborationScope } from './useCollaborationScope';

/**
 * 议题来源模型：来源是**过滤维度**而不是互斥视图——仓库（托管平台，仓库作用域）
 * 与任务系统（工作区作用域）的 issue 合并进同一个列表，由来源过滤器收窄。
 * 新增任务系统时只需扩 sources，工具栏不会随来源数量横向膨胀。
 */
export type IssueSourceKind = 'repo' | 'task';
export type IssueSourceFilter = 'all' | IssueSourceKind;

export interface IssueSourceScope {
  source: IssueSourceKind;
  owner: string;
  repo: string;
  providerId: string;
  server: string;
  /** 列表/选择器里的来源标签（仓库为 owner/repo，任务系统为连接显示名）。 */
  label: string;
  isAuthenticated: boolean;
  key: string;
  isCurrent(): boolean;
}

export function useActiveTaskConnection(): TaskConnection | null {
  const connections = useTaskStore(useShallow(state => state.connections));
  const enabled = connections.filter(connection => connection.enabled && connection.domains.includes('task-tracking'));
  return enabled[0] ?? null;
}

const TASK_SERVER = 'https://linear.app';
/** 创建目标的「上次选择」：跨会话记忆，默认放在 localStorage（非敏感）。 */
const LAST_CREATE_KEY = 'auugit_issue_create_source';

export function readLastCreateSource(): IssueSourceKind | null {
  try {
    const value = localStorage.getItem(LAST_CREATE_KEY);
    return value === 'repo' || value === 'task' ? value : null;
  } catch { return null; }
}

export function rememberCreateSource(source: IssueSourceKind): void {
  try { localStorage.setItem(LAST_CREATE_KEY, source); } catch { /* storage unavailable */ }
}

/** 当前可用的来源作用域；仓库来源需已认证且已绑定远程，任务来源需有启用连接。 */
export function useIssueSources(): { repo: IssueSourceScope | null; task: IssueSourceScope | null } {
  const repoScope = useCollaborationScope();
  const taskConnection = useActiveTaskConnection();
  // taskStore 的连接变化（启用/删除/恢复）驱动重建：key 混入指纹保证订阅生效。
  const taskFingerprint = useTaskStore(useShallow(state => `${state.restored ? 'r' : ''}|${state.connections.map(connection => `${connection.id}:${connection.enabled}`).join(',')}`));
  void taskFingerprint;
  return useMemo(() => ({
    repo: repoScope.isAuthenticated && repoScope.owner && repoScope.repo ? {
      source: 'repo', owner: repoScope.owner, repo: repoScope.repo,
      providerId: repoScope.providerId ?? '', server: repoScope.server ?? '',
      label: `${repoScope.owner}/${repoScope.repo}`, isAuthenticated: true,
      key: repoScope.key, isCurrent: repoScope.isCurrent,
    } : null,
    task: taskConnection ? {
      source: 'task', owner: 'all', repo: 'linear',
      providerId: taskConnection.providerId, server: TASK_SERVER,
      label: taskConnection.displayName, isAuthenticated: true,
      key: `task:${taskConnection.id}:${taskConnection.providerId}`,
      isCurrent: () => useTaskStore.getState().activeConnection()?.id === taskConnection.id,
    } : null,
  }), [repoScope, taskConnection]);
}

/** 独立挂载（测试/详情）时的回退作用域：无可用来源时给空仓库作用域，与旧行为一致。 */
export function useFallbackIssueScope(): IssueSourceScope {
  const repoScope = useCollaborationScope();
  return useMemo(() => ({
    source: 'repo', owner: repoScope.owner ?? '', repo: repoScope.repo ?? '',
    providerId: repoScope.providerId ?? '', server: repoScope.server ?? '',
    label: `${repoScope.owner ?? ''}/${repoScope.repo ?? ''}`, isAuthenticated: repoScope.isAuthenticated,
    key: repoScope.key, isCurrent: repoScope.isCurrent,
  }), [repoScope]);
}
