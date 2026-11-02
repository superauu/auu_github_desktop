import { collaborationService, hasCollaborationOperation } from '@/services/collaboration/CollaborationService';
import type { CollaborationState } from '../collaborationStore';
import type { CollaborationSliceContext } from './sliceContext';
export function createCodeHostingSlice({ get, set, ticket }: CollaborationSliceContext): Pick<CollaborationState, 'loadPullRequests' | 'selectPR' | 'openPullRequest' | 'setPRFilterState'> {
  return {
    loadPullRequests: async () => {
      const valid = ticket('prs');
      const { currentOwner: owner, currentRepoName: repo, prFilterState } = get();
      if (!owner || !repo || !hasCollaborationOperation('getPullRequests')) return;
      set({ isLoadingPullRequests: true, pullRequestsError: null });
      try {
        const prs = await collaborationService.getPullRequests(owner, repo, prFilterState);
        if (valid()) set({ pullRequests: prs, selectedPR: prs.find((pr) => pr.id === get().selectedPR?.id) || prs[0] || null });
      } catch (error: any) { if (valid()) set({ pullRequestsError: String(error?.message || error) }); }
      finally { if (valid()) set({ isLoadingPullRequests: false }); }
    },
    selectPR: (pr) => set({ selectedPR: pr }),
    // Deep links must work for a closed PR or one outside the currently loaded page.
    openPullRequest: (pr) => {
      ticket('prs');
      set(state => ({ selectedPR: pr, prFilterState: pr.state, pullRequests: [pr, ...state.pullRequests.filter(item => item.id !== pr.id)], isLoadingPullRequests: false, pullRequestsError: null }));
    },
    setPRFilterState: (filter) => {
      ticket('repo'); set({ isLoading: false, prFilterState: filter, pullRequests: [], selectedPR: null });
      void get().loadPullRequests();
    },
  };
}
