import { useMemo, useSyncExternalStore } from 'react';
import { useCollaborationStore } from '@/stores/collaborationStore';
import { useTaskStore } from '@/stores/taskStore';
import { enabledHostingPlugins, getHostingPlugin, getPluginRevision, getTaskPlugin, subscribePlugins } from '@/services/integrations/plugins';
import { providerSupports, type DeclarableCapability, type DomainId } from '@/services/integrations/registry';

export function useCollaborationCapabilities() {
  const providerId = useCollaborationStore(state => state.providerId);
  const profiles = useCollaborationStore(state => state.profiles);
  const taskConnections = useTaskStore(state => state.connections);
  const revision = useSyncExternalStore(subscribePlugins, getPluginRevision, getPluginRevision);
  return useMemo(() => {
    // 「连接账号即启用」：只按有账号连接的平台计算能力，未连接的平台不贡献导航入口
    // 与按钮能力（连接入口仍在设置页的卡片列表里保留）。当前平台需同时有账号连接，
    // 否则断开全部账号后残留的 providerId 会让入口错误保留。
    // 用 enabledHostingPlugins 而不是 installedHostingPlugins：能力与 getHostingPlugin
    // 保持同一口径，故障注入禁用插件后不再有账号「贡献」可用能力。
    const connectedIds = new Set(profiles.map(profile => profile.providerId ?? ''));
    const connectedPlugins = enabledHostingPlugins().filter(plugin => connectedIds.has(plugin.manifest.id));
    const selected = providerId && connectedIds.has(providerId) ? getHostingPlugin(providerId) : null;
    const candidates = selected ? [selected] : connectedPlugins;
    // 独立任务连接（Linear 等 task 装配档）并轨任务域能力：任务能力 = 托管 ∪ 任务连接，
    // 其余域仍只看托管（任务连接不贡献 PR/CI）。域快照必须与插件装配同时成立。
    const activeTask = taskConnections.filter(connection => connection.enabled && connection.domains.includes('task-tracking'))
      .map(connection => getTaskPlugin(connection.providerId)).filter(plugin => !!plugin);
    const can = (capability: DeclarableCapability) =>
      candidates.some(plugin => providerSupports(plugin.manifest, capability))
      || (capability.startsWith('task-tracking:') && activeTask.some(plugin => providerSupports(plugin.manifest, capability)));
    const domain = (id: DomainId) => candidates.some(plugin => plugin.manifest.domains.some(item => item.domain === id))
      || (id === 'task-tracking' && activeTask.length > 0);
    return { can, revision, connected: connectedPlugins.length > 0, taskTracking: domain('task-tracking'), codeHosting: domain('code-hosting'), ciCd: domain('ci-cd') };
  }, [providerId, profiles, taskConnections, revision]);
}

/**
 * 按议题来源收敛的能力判定：任务引用只看该任务连接的 manifest（不能借托管平台
 * 的能力亮按钮），托管引用维持既有的「已连接托管平台并集」口径。
 */
export function useIssueCapabilities(providerId: string | null | undefined) {
  const capabilities = useCollaborationCapabilities();
  const taskConnections = useTaskStore(state => state.connections);
  return useMemo(() => {
    if (providerId && getTaskPlugin(providerId)) {
      const connection = taskConnections.find(item => item.providerId === providerId && item.enabled);
      const manifest = getTaskPlugin(providerId)?.manifest;
      return {
        can: (capability: DeclarableCapability) => !!connection && !!manifest
          && connection.domains.includes('task-tracking') && providerSupports(manifest, capability),
      };
    }
    return { can: capabilities.can };
  }, [providerId, capabilities, taskConnections]);
}
