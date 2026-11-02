import { useMemo, useSyncExternalStore } from 'react';
import { useCollaborationStore } from '@/stores/collaborationStore';
import { enabledHostingPlugins, getHostingPlugin, getPluginRevision, subscribePlugins } from '@/services/integrations/plugins';
import { providerSupports, type DeclarableCapability, type DomainId } from '@/services/integrations/registry';

export function useCollaborationCapabilities() {
  const providerId = useCollaborationStore(state => state.providerId);
  const revision = useSyncExternalStore(subscribePlugins, getPluginRevision, getPluginRevision);
  return useMemo(() => {
    const selected = providerId ? getHostingPlugin(providerId) : null;
    // 当前平台可用则只看它；未选择或指向已禁用插件时回落到全部启用插件的能力并集，
    // 避免「导航全消失但连接入口还能选其他平台」的死态。
    const candidates = selected ? [selected] : enabledHostingPlugins();
    const can = (capability: DeclarableCapability) => candidates.some(plugin => providerSupports(plugin.manifest, capability));
    const domain = (id: DomainId) => candidates.some(plugin => plugin.manifest.domains.some(item => item.domain === id));
    return { can, revision, taskTracking: domain('task-tracking'), codeHosting: domain('code-hosting'), ciCd: domain('ci-cd') };
  }, [providerId, revision]);
}
