import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useGitHubStore } from '@/stores/githubStore';

/** A repository/account switch invalidates both read replies and write completions. */
export function useGitHubScope() {
  const { currentOwner: owner, currentRepoName: repo, activeProfileId: profile, token, isAuthenticated } = useGitHubStore(useShallow(state => ({
    currentOwner: state.currentOwner, currentRepoName: state.currentRepoName, activeProfileId: state.activeProfileId, token: state.token, isAuthenticated: state.isAuthenticated,
  })));
  return useMemo(() => ({ owner, repo, isAuthenticated, key: JSON.stringify([owner, repo, profile, isAuthenticated]), isCurrent: () => {
    const state = useGitHubStore.getState();
    return state.currentOwner === owner && state.currentRepoName === repo && state.activeProfileId === profile && state.token === token && state.isAuthenticated === isAuthenticated;
  } }), [owner, repo, profile, token, isAuthenticated]);
}
