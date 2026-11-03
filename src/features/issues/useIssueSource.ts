import { useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useTaskStore, type TaskConnection } from '@/stores/taskStore';
import { useCollaborationScope } from './useCollaborationScope';

/**
 * 议题来源的统一作用域：'repo'（托管平台，仓库作用域）与 'task'（独立任务系统，
 * 工作区作用域）共用一套 owner/repo/providerId/server/isCurrent 形状，让 Issues
 * 视图与详情组件在两个来源间切换而不感知差异。Linear 无自建实例，server 固定官网；
 * 工作区作用域的 owner 用 'all' 占位（LinearClient 只把它当「不按团队收窄」的信号）。
 */
export type IssueSourceKind = 'repo' | 'task';

export interface IssueSourceScope {
  source: IssueSourceKind;
  owner: string;
  repo: string;
  providerId: string;
  server: string;
  /** 工具栏显示的工作区标签（任务来源为连接显示名）。 */
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

export function useIssueSource(): {
  source: IssueSourceKind;
  setSource: (source: IssueSourceKind) => void;
  taskAvailable: boolean;
  repoAvailable: boolean;
  scope: IssueSourceScope;
} {
  const repoScope = useCollaborationScope();
  const taskConnection = useActiveTaskConnection();
  const taskFingerprint = useTaskStore(useShallow(state => `${state.restored ? 'r' : ''}|${state.connections.map(connection => `${connection.id}:${connection.enabled}`).join(',')}`));
  const [preferred, setPreferred] = useState<IssueSourceKind | null>(null);
  const repoAvailable = !!(repoScope.isAuthenticated && repoScope.owner && repoScope.repo);
  const taskAvailable = !!taskConnection;
  // 双来源可用时尊重用户选择（默认仓库来源）；单一来源自动锁定，来源消失时回落。
  const source: IssueSourceKind = !taskAvailable ? 'repo' : !repoAvailable ? 'task' : preferred === 'task' ? 'task' : 'repo';
  void taskFingerprint;
  const scope = useMemo<IssueSourceScope>(() => {
    if (source === 'task' && taskConnection) {
      return {
        source, owner: 'all', repo: 'linear', providerId: taskConnection.providerId, server: TASK_SERVER,
        label: taskConnection.displayName, isAuthenticated: true, key: `task:${taskConnection.id}:${taskConnection.providerId}`,
        isCurrent: () => useTaskStore.getState().activeConnection()?.id === taskConnection.id,
      };
    }
    return {
      source: 'repo', owner: repoScope.owner ?? '', repo: repoScope.repo ?? '',
      providerId: repoScope.providerId ?? '', server: repoScope.server ?? '',
      label: `${repoScope.owner ?? ''}/${repoScope.repo ?? ''}`, isAuthenticated: repoScope.isAuthenticated,
      key: repoScope.key, isCurrent: repoScope.isCurrent,
    };
  }, [source, taskConnection, repoScope]);
  return { source, setSource: setPreferred, taskAvailable, repoAvailable, scope };
}
