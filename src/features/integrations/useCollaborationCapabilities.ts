import { useMemo, useSyncExternalStore } from 'react';
import { useCollaborationStore } from '@/stores/collaborationStore';
import { getHostingPlugin, getPluginRevision, installedHostingPlugins, subscribePlugins } from '@/services/integrations/plugins';
import { providerSupports, type DeclarableCapability, type DomainId } from '@/services/integrations/registry';

export function useCollaborationCapabilities() {
  const providerId = useCollaborationStore(state => state.providerId);
  const profiles = useCollaborationStore(state => state.profiles);
  const revision = useSyncExternalStore(subscribePlugins, getPluginRevision, getPluginRevision);
  return useMemo(() => {
    // 「连接账号即启用」：只按有账号连接的平台计算能力，未连接的平台不贡献导航入口
    // 与按钮能力（连接入口仍在设置页的卡片列表里保留）。当前平台需同时有账号连接，
    // 否则断开全部账号后残留的 providerId 会让入口错误保留。
    const connectedIds = new Set(profiles.map(profile => profile.providerId ?? ''));
    const selected = providerId && connectedIds.has(providerId) ? getHostingPlugin(providerId) : null;
    const candidates = selected ? [selected] : installedHostingPlugins().filter(plugin => connectedIds.has(plugin.manifest.id));
    const can = (capability: DeclarableCapability) => candidates.some(plugin => providerSupports(plugin.manifest, capability));
    const domain = (id: DomainId) => candidates.some(plugin => plugin.manifest.domains.some(item => item.domain === id));
    return { can, revision, taskTracking: domain('task-tracking'), codeHosting: domain('code-hosting'), ciCd: domain('ci-cd') };
  }, [providerId, profiles, revision]);
}
