/** 宿主只装配插件契约，不包含任何平台的状态或账号分支。 */
import { useRepoStore, getRepositorySelectionRevision } from '@/stores/repoStore';
import { useCollaborationStore } from '@/stores/collaborationStore';
import { useIntegrationStore } from '@/stores/integrationStore';
import { bindCollaborationClient } from '@/services/collaboration/CollaborationService';
import { getHostingPlugin, subscribePlugins } from './plugins';
import { repositoryRemote, resolveHostingBinding, matchesHostingRemote, type HostingConnection } from './repositoryBinding';
import { onPushedCommit } from './pushEvents';

export function hostingConnections(): HostingConnection[] {
  const { profiles, activeProfileId } = useCollaborationStore.getState();
  return [...profiles].sort((a, b) => Number(b.id === activeProfileId) - Number(a.id === activeProfileId)).flatMap(profile => {
    const plugin = getHostingPlugin(profile.providerId ?? '');
    return plugin && profile.server ? [{ id: profile.id, providerId: plugin.manifest.id, server: profile.server, enabled: true }] : [];
  });
}
export function startIntegrationRuntime(): () => void {
  let disposed = false, lastKey = '', switching = false, authInvalidatedByPlugin = false;
  const synchronize = () => {
    if (disposed) return;
    const repo = useRepoStore.getState().currentRepo;
    const state = useCollaborationStore.getState();
    const binding = resolveHostingBinding(repo ? repositoryRemote(repo) : undefined, hostingConnections());
    const key = JSON.stringify([getRepositorySelectionRevision(), repo?.path, binding, state.activeProfileId, state.providerId, state.server, state.token, state.isAuthenticated, state.isConnecting]);
    if (key === lastKey) return;
    lastKey = key;
    if (binding && !switching && !state.isConnecting && !state.isAddingProfile) {
      const profile = state.profiles.find(item => item.id === state.activeProfileId && item.providerId === binding.providerId && item.server === binding.server)
        ?? state.profiles.find(item => item.providerId === binding.providerId && item.server === binding.server);
      if (profile && profile.id !== state.activeProfileId) {
        switching = true;
        void state.switchProfile(profile.id).finally(() => { switching = false; synchronize(); });
        return;
      }
      if (!profile && (state.providerId !== binding.providerId || state.server !== binding.server)) {
        switching = true; state.selectProvider(binding.providerId, binding.server); state.finishConnection(); switching = false;
        return;
      }
    }
    state.clearRepo();
    bindCollaborationClient(null);
    useIntegrationStore.getState().setContext(repo?.path ?? null, binding);
    if (!repo || !binding) return;
    const plugin = getHostingPlugin(binding.providerId);
    if (!plugin) return;
    const authenticated = state.providerId === binding.providerId && state.server === binding.server && state.isAuthenticated;
    bindCollaborationClient(plugin.createClient(binding.server, authenticated ? state.token : null), plugin.manifest);
    void state.syncRepo(binding.ownerPath, binding.repo);
  };
  const unsubscribers = [useRepoStore.subscribe(synchronize), useCollaborationStore.subscribe(synchronize), subscribePlugins(() => {
    lastKey = '';
    const state = useCollaborationStore.getState();
    if (state.providerId && !getHostingPlugin(state.providerId)) {
      // 走 resetAuthState 而不是手动 setState：authGeneration 递增才能作废在途的 initAuth/login，
      // 否则禁用插件后迟到的认证响应会复活已禁用插件的会话。
      authInvalidatedByPlugin = true;
      state.resetAuthState();
    } else if (authInvalidatedByPlugin && state.providerId && getHostingPlugin(state.providerId)
      && !state.isAuthenticated && state.activeProfileId) {
      // 重新启用插件后自动恢复会话（凭证仍保留在系统凭据管理器中，未删除）
      authInvalidatedByPlugin = false;
      void state.initAuth();
    }
    synchronize();
  }), onPushedCommit(event => {
    const { repoPath, binding } = useIntegrationStore.getState();
    if (event.isCurrent() && event.repoPath === repoPath && binding && getHostingPlugin(binding.providerId)
      && event.destinationUrls.some(url => matchesHostingRemote(url, binding))) useCollaborationStore.getState().watchPushChecks(event.sha);
  })];
  synchronize(); void useCollaborationStore.getState().initAuth();
  return () => {
    disposed = true; unsubscribers.forEach(unsubscribe => unsubscribe());
    useCollaborationStore.getState().clearRepo(); bindCollaborationClient(null);
    useIntegrationStore.getState().setContext(null, null);
  };
}
