import { create } from 'zustand';
import {
  GitBranch,
  GitCommit,
  GitFileChange,
  GitStatusResult,
  GitStash,
  GitTag,
  RepositoryInfo,
} from '@/services/git/types';
import { gitService } from '@/services/git/GitService';
import { ParsedDiffLine } from '@/services/git/PorcelainParser';

export type MainNavTab = 'changes' | 'history' | 'branches' | 'tags' | 'actions' | 'pullRequests';

interface RepoState {
  currentRepo: RepositoryInfo | null;
  recentRepos: RepositoryInfo[];
  activeTab: MainNavTab;
  status: GitStatusResult | null;
  selectedFile: GitFileChange | null;
  selectedCommit: GitCommit | null;
  fileDiffLines: ParsedDiffLine[];
  commits: GitCommit[];
  branches: GitBranch[];
  tags: GitTag[];
  stashes: GitStash[];
  isLoading: boolean;
  isLeftSidebarCollapsed: boolean;
  isRightPaneCollapsed: boolean;
  errorMessage: string | null;

  // Actions
  setCurrentRepo: (repo: RepositoryInfo | null) => void;
  setActiveTab: (tab: MainNavTab) => void;
  setStatus: (status: GitStatusResult | null) => void;
  setSelectedFile: (file: GitFileChange | null) => void;
  setSelectedCommit: (commit: GitCommit | null) => void;
  setBranches: (branches: GitBranch[]) => void;
  setTags: (tags: GitTag[]) => void;
  setStashes: (stashes: GitStash[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (msg: string | null) => void;
  toggleLeftSidebar: () => void;
  toggleRightPane: () => void;
  addRecentRepo: (repo: RepositoryInfo) => void;

  // Async Git Operations
  refreshAll: () => Promise<void>;
  loadFileDiff: (file: GitFileChange) => Promise<void>;
  stageFile: (filePath: string) => Promise<void>;
  unstageFile: (filePath: string) => Promise<void>;
  stageAll: () => Promise<void>;
  unstageAll: () => Promise<void>;
  discardChanges: (filePath: string) => Promise<void>;
  commit: (message: string, amend?: boolean) => Promise<void>;
  createBranch: (name: string) => Promise<void>;
  checkoutBranch: (name: string) => Promise<void>;
  createTag: (name: string, commitHash?: string, message?: string) => Promise<void>;
  deleteTag: (name: string) => Promise<void>;

  // Stash & Revert
  stashPush: (message?: string, includeUntracked?: boolean) => Promise<void>;
  stashPop: (index?: number) => Promise<void>;
  stashApply: (index?: number) => Promise<void>;
  stashDrop: (index?: number) => Promise<void>;
  revertCommit: (hash: string) => Promise<void>;
  softResetCommit: (hash: string) => Promise<void>;
}

const RECENT_REPOS_KEY = 'auu_git_recent_repos';

export const useRepoStore = create<RepoState>((set, get) => {
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
    fileDiffLines: [],
    commits: [],
    branches: [],
    tags: [],
    stashes: [],
    isLoading: false,
    isLeftSidebarCollapsed: false,
    isRightPaneCollapsed: false,
    errorMessage: null,

    setCurrentRepo: (repo) => {
      set({ currentRepo: repo, selectedFile: null, selectedCommit: null, fileDiffLines: [] });
      if (repo) {
        get().refreshAll();
      }
    },
    setActiveTab: (activeTab) => set({ activeTab }),
    setStatus: (status) => set({ status }),
    setSelectedFile: (selectedFile) => {
      set({ selectedFile });
      if (selectedFile) {
        get().loadFileDiff(selectedFile);
      } else {
        set({ fileDiffLines: [] });
      }
    },
    setSelectedCommit: (selectedCommit) => set({ selectedCommit }),
    setBranches: (branches) => set({ branches }),
    setTags: (tags) => set({ tags }),
    setStashes: (stashes) => set({ stashes }),
    setLoading: (isLoading) => set({ isLoading }),
    setError: (errorMessage) => set({ errorMessage }),
    toggleLeftSidebar: () =>
      set((state) => ({ isLeftSidebarCollapsed: !state.isLeftSidebarCollapsed })),
    toggleRightPane: () =>
      set((state) => ({ isRightPaneCollapsed: !state.isRightPaneCollapsed })),

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

    refreshAll: async () => {
      const { currentRepo } = get();
      if (!currentRepo) return;

      set({ isLoading: true, errorMessage: null });
      try {
        const [status, commits, branches, tags, stashes] = await Promise.all([
          gitService.getStatus(currentRepo.path),
          gitService.getCommits(currentRepo.path, 50),
          gitService.getBranches(currentRepo.path),
          gitService.getTags(currentRepo.path),
          gitService.getStashes(currentRepo.path),
        ]);

        // If currentBranch in repo metadata changed, update it
        if (status.currentBranch && status.currentBranch !== currentRepo.currentBranch) {
          set((state) => ({
            currentRepo: state.currentRepo
              ? { ...state.currentRepo, currentBranch: status.currentBranch }
              : null,
          }));
        }

        set({
          status,
          commits,
          branches,
          tags,
          stashes,
          isLoading: false,
        });

        // If no file is selected, select the first available changed file
        const allChanges = [...status.staged, ...status.unstaged, ...status.untracked];
        const currentSelected = get().selectedFile;
        if (!currentSelected && allChanges.length > 0) {
          get().setSelectedFile(allChanges[0]);
        } else if (currentSelected) {
          // Refresh current file diff
          get().loadFileDiff(currentSelected);
        }

        // If no commit selected, select the first commit
        if (!get().selectedCommit && commits.length > 0) {
          set({ selectedCommit: commits[0] });
        }
      } catch (err: any) {
        set({ errorMessage: err.message, isLoading: false });
      }
    },

    loadFileDiff: async (file: GitFileChange) => {
      const { currentRepo } = get();
      if (!currentRepo) return;

      try {
        const diffLines = await gitService.getFileDiff(
          currentRepo.path,
          file.path,
          file.staged
        );
        set({ fileDiffLines: diffLines });
      } catch (err: any) {
        console.warn('获取 Diff 失败:', err);
        set({ fileDiffLines: [] });
      }
    },

    stageFile: async (filePath: string) => {
      const { currentRepo } = get();
      if (!currentRepo) return;
      try {
        await gitService.stageFile(currentRepo.path, filePath);
        await get().refreshAll();
      } catch (err: any) {
        set({ errorMessage: err.message });
      }
    },

    unstageFile: async (filePath: string) => {
      const { currentRepo } = get();
      if (!currentRepo) return;
      try {
        await gitService.unstageFile(currentRepo.path, filePath);
        await get().refreshAll();
      } catch (err: any) {
        set({ errorMessage: err.message });
      }
    },

    stageAll: async () => {
      const { currentRepo } = get();
      if (!currentRepo) return;
      try {
        await gitService.stageAll(currentRepo.path);
        await get().refreshAll();
      } catch (err: any) {
        set({ errorMessage: err.message });
      }
    },

    unstageAll: async () => {
      const { currentRepo } = get();
      if (!currentRepo) return;
      try {
        await gitService.unstageAll(currentRepo.path);
        await get().refreshAll();
      } catch (err: any) {
        set({ errorMessage: err.message });
      }
    },

    discardChanges: async (filePath: string) => {
      const { currentRepo } = get();
      if (!currentRepo) return;
      try {
        await gitService.discardChanges(currentRepo.path, filePath);
        await get().refreshAll();
      } catch (err: any) {
        set({ errorMessage: err.message });
      }
    },

    commit: async (message: string, amend?: boolean) => {
      const { currentRepo } = get();
      if (!currentRepo) return;
      try {
        await gitService.commit(currentRepo.path, message, amend);
        await get().refreshAll();
      } catch (err: any) {
        set({ errorMessage: err.message });
        throw err;
      }
    },

    createBranch: async (name: string) => {
      const { currentRepo } = get();
      if (!currentRepo) return;
      try {
        await gitService.createBranch(currentRepo.path, name);
        await get().refreshAll();
      } catch (err: any) {
        set({ errorMessage: err.message });
        throw err;
      }
    },

    checkoutBranch: async (name: string) => {
      const { currentRepo } = get();
      if (!currentRepo) return;
      try {
        await gitService.checkoutBranch(currentRepo.path, name);
        await get().refreshAll();
      } catch (err: any) {
        set({ errorMessage: err.message });
        throw err;
      }
    },

    createTag: async (name: string, commitHash?: string, message?: string) => {
      const { currentRepo } = get();
      if (!currentRepo) return;
      try {
        await gitService.createTag(currentRepo.path, name, commitHash, message);
        await get().refreshAll();
      } catch (err: any) {
        set({ errorMessage: err.message });
        throw err;
      }
    },

    deleteTag: async (name: string) => {
      const { currentRepo } = get();
      if (!currentRepo) return;
      try {
        await gitService.deleteTag(currentRepo.path, name);
        await get().refreshAll();
      } catch (err: any) {
        set({ errorMessage: err.message });
        throw err;
      }
    },

    stashPush: async (message?: string, includeUntracked: boolean = true) => {
      const { currentRepo } = get();
      if (!currentRepo) return;
      try {
        await gitService.stashPush(currentRepo.path, message, includeUntracked);
        await get().refreshAll();
      } catch (err: any) {
        set({ errorMessage: err.message });
        throw err;
      }
    },

    stashPop: async (index: number = 0) => {
      const { currentRepo } = get();
      if (!currentRepo) return;
      try {
        await gitService.stashPop(currentRepo.path, index);
        await get().refreshAll();
      } catch (err: any) {
        set({ errorMessage: err.message });
        throw err;
      }
    },

    stashApply: async (index: number = 0) => {
      const { currentRepo } = get();
      if (!currentRepo) return;
      try {
        await gitService.stashApply(currentRepo.path, index);
        await get().refreshAll();
      } catch (err: any) {
        set({ errorMessage: err.message });
        throw err;
      }
    },

    stashDrop: async (index: number = 0) => {
      const { currentRepo } = get();
      if (!currentRepo) return;
      try {
        await gitService.stashDrop(currentRepo.path, index);
        await get().refreshAll();
      } catch (err: any) {
        set({ errorMessage: err.message });
        throw err;
      }
    },

    revertCommit: async (hash: string) => {
      const { currentRepo } = get();
      if (!currentRepo) return;
      try {
        await gitService.revertCommit(currentRepo.path, hash);
        await get().refreshAll();
      } catch (err: any) {
        set({ errorMessage: err.message });
        throw err;
      }
    },

    softResetCommit: async (hash: string) => {
      const { currentRepo } = get();
      if (!currentRepo) return;
      try {
        await gitService.softResetCommit(currentRepo.path, hash);
        await get().refreshAll();
      } catch (err: any) {
        set({ errorMessage: err.message });
        throw err;
      }
    },
  };
});
