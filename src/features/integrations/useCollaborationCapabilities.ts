import { useMemo, useSyncExternalStore } from 'react';
import { useCollaborationStore } from '@/stores/collaborationStore';
import { enabledHostingPlugins, getHostingPlugin, getPluginRevision, subscribePlugins } from '@/services/integrations/plugins';
import { providerSupports, type DeclarableCapability, type DomainId } from '@/services/integrations/registry';

export function useCollaborationCapabilities() {
  const providerId = useCollaborationStore(state => state.providerId);
  const revision = useSyncExternalStore(subscribePlugins, getPluginRevision, getPluginRevision);
  return useMemo(() => {
    const selected = providerId ? getHostingPlugin(providerId) : null;
    const candidates = providerId ? (selected ? [selected] : []) : enabledHostingPlugins();
    const can = (capability: DeclarableCapability) => candidates.some(plugin => providerSupports(plugin.manifest, capability));
    const domain = (id: DomainId) => candidates.some(plugin => plugin.manifest.domains.some(item => item.domain === id));
    return { can, revision, taskTracking: domain('task-tracking'), codeHosting: domain('code-hosting'), ciCd: domain('ci-cd') };
  }, [providerId, revision]);
}
