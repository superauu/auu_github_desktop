import { create } from 'zustand';
import { GitBranch, GitCommit, GitFileChange, GitStatusResult, GitTag, RepositoryInfo } from '@/services/git/types';

export type MainNavTab = 'changes' | 'history' | 'branches' | 'tags' | 'actions';

interface RepoState {
  currentRepo: RepositoryInfo | null;
  recentRepos: RepositoryInfo[];
  activeTab: MainNavTab;
  status: GitStatusResult | null;
  selectedFile: GitFileChange | null;
  selectedCommit: GitCommit | null;
  branches: GitBranch[];
  tags: GitTag[];
  isLoading: boolean;
  isLeftSidebarCollapsed: boolean;
  isRightPaneCollapsed: boolean;

  // Actions
  setCurrentRepo: (repo: RepositoryInfo | null) => void;
  setActiveTab: (tab: MainNavTab) => void;
  setStatus: (status: GitStatusResult | null) => void;
  setSelectedFile: (file: GitFileChange | null) => void;
  setSelectedCommit: (commit: GitCommit | null) => void;
  setBranches: (branches: GitBranch[]) => void;
  setTags: (tags: GitTag[]) => void;
  setLoading: (loading: boolean) => void;
  toggleLeftSidebar: () => void;
  toggleRightPane: () => void;
  addRecentRepo: (repo: RepositoryInfo) => void;
}

const RECENT_REPOS_KEY = 'auu_git_recent_repos';

export const useRepoStore = create<RepoState>((set) => {
  // Load initial recent repos
  let initialRecent: RepositoryInfo[] = [];
  try {
    const saved = localStorage.getItem(RECENT_REPOS_KEY);
    if (saved) {
      initialRecent = JSON.parse(saved);
    }
  } catch {
    initialRecent = [];
  }

  return {
    currentRepo: null,
    recentRepos: initialRecent,
    activeTab: 'changes',
    status: null,
    selectedFile: null,
    selectedCommit: null,
    branches: [],
    tags: [],
    isLoading: false,
    isLeftSidebarCollapsed: false,
    isRightPaneCollapsed: false,

    setCurrentRepo: (repo) => set({ currentRepo: repo }),
    setActiveTab: (activeTab) => set({ activeTab }),
    setStatus: (status) => set({ status }),
    setSelectedFile: (selectedFile) => set({ selectedFile }),
    setSelectedCommit: (selectedCommit) => set({ selectedCommit }),
    setBranches: (branches) => set({ branches }),
    setTags: (tags) => set({ tags }),
    setLoading: (isLoading) => set({ isLoading }),
    toggleLeftSidebar: () => set((state) => ({ isLeftSidebarCollapsed: !state.isLeftSidebarCollapsed })),
    toggleRightPane: () => set((state) => ({ isRightPaneCollapsed: !state.isRightPaneCollapsed })),

    addRecentRepo: (repo) =>
      set((state) => {
        const filtered = state.recentRepos.filter((r) => r.path !== repo.path);
        const updated = [repo, ...filtered].slice(0, 10);
        try {
          localStorage.setItem(RECENT_REPOS_KEY, JSON.stringify(updated));
        } catch {
          // ignore
        }
        return { recentRepos: updated };
      }),
  };
});
