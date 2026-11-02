import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useCollaborationStore } from '@/stores/collaborationStore';

/** A repository/account switch invalidates both read replies and write completions. */
export function useCollaborationScope() {
  const { currentOwner: owner, currentRepoName: repo, activeProfileId: profile, providerId, server, token, isAuthenticated } = useCollaborationStore(useShallow(state => ({
    providerId: state.providerId, server: state.server, currentOwner: state.currentOwner, currentRepoName: state.currentRepoName, activeProfileId: state.activeProfileId, token: state.token, isAuthenticated: state.isAuthenticated,
  })));
  return useMemo(() => ({ owner, repo, isAuthenticated, providerId, server, key: JSON.stringify([providerId, server, owner, repo, profile, isAuthenticated]), isCurrent: () => {
    const state = useCollaborationStore.getState();
    return state.providerId === providerId && state.server === server && state.currentOwner === owner && state.currentRepoName === repo && state.activeProfileId === profile && state.token === token && state.isAuthenticated === isAuthenticated;
  } }), [providerId, server, owner, repo, profile, token, isAuthenticated]);
}
