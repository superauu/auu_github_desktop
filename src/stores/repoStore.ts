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
import { useGitHubStore } from '@/stores/githubStore';

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
  removeRecentRepo: (path: string) => void;

  // Async Git Operations
  refreshAll: () => Promise<void>;
  fetchRemote: () => Promise<void>;
  pull: () => Promise<void>;
  push: () => Promise<void>;
  loadFileDiff: (file: GitFileChange) => Promise<void>;
  stageFile: (filePath: string) => Promise<void>;
  unstageFile: (filePath: string) => Promise<void>;
  stageAll: () => Promise<void>;
  unstageAll: () => Promise<void>;
  discardChanges: (filePath: string) => Promise<void>;
  commit: (message: string, amend?: boolean) => Promise<void>;
  createBranch: (name: string, startPoint?: string, checkout?: boolean) => Promise<void>;
  deleteBranch: (name: string, force?: boolean) => Promise<void>;
  checkoutBranch: (name: string) => Promise<void>;
  createTag: (name: string, commitHash?: string, message?: string) => Promise<void>;
  deleteTag: (name: string) => Promise<void>;
  pushTag: (name: string) => Promise<void>;
  pushAllTags: () => Promise<void>;
  deleteRemoteTag: (name: string) => Promise<void>;
  mergeBranch: (branch: string, options?: { noFf?: boolean; message?: string }) => Promise<string>;
  abortMerge: () => Promise<void>;
  rebaseBranch: (upstream: string) => Promise<string>;
  rebaseContinue: () => Promise<void>;
  rebaseAbort: () => Promise<void>;

  // Stash & Revert
  stashPush: (message?: string, includeUntracked?: boolean) => Promise<void>;
  stashPop: (index?: number) => Promise<void>;
  stashApply: (index?: number) => Promise<void>;
  stashDrop: (index?: number) => Promise<void>;
  revertCommit: (hash: string) => Promise<void>;
  softResetCommit: (hash: string) => Promise<void>;
  undoLastCommit: () => Promise<void>;
  openTerminal: () => Promise<void>;
  openTabs: RepositoryInfo[];
  closeTab: (path: string) => void;
  switchTab: (path: string) => void;
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
    openTabs: initialRecent.slice(0, 4),

    setCurrentRepo: (repo) => {
      set((state) => {
        let newTabs = state.openTabs;
        if (repo && !newTabs.some((t) => t.path === repo.path)) {
          newTabs = [...newTabs, repo];
        }
        return {
          currentRepo: repo,
          selectedFile: null,
          selectedCommit: null,
          fileDiffLines: [],
          openTabs: newTabs,
        };
      });
      if (repo) {
        try {
          localStorage.setItem('auu_git_last_active_repo', JSON.stringify(repo));
        } catch {}
        get().refreshAll();
      } else {
        localStorage.removeItem('auu_git_last_active_repo');
      }
    },

    closeTab: (path: string) => {
      set((state) => {
        const remaining = state.openTabs.filter((t) => t.path !== path);
        let nextCurrent = state.currentRepo;
        if (state.currentRepo?.path === path) {
          nextCurrent = remaining.length > 0 ? remaining[0] : null;
        }
        return { openTabs: remaining, currentRepo: nextCurrent };
      });
      const current = get().currentRepo;
      if (current) {
        get().refreshAll();
      }
    },

    switchTab: (path: string) => {
      const tab = get().openTabs.find((t) => t.path === path);
      if (tab) {
        get().setCurrentRepo(tab);
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

    removeRecentRepo: (path: string) =>
      set((state) => {
        const updated = state.recentRepos.filter((r) => r.path !== path);
        try {
          localStorage.setItem(RECENT_REPOS_KEY, JSON.stringify(updated));
        } catch {}
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

        // Auto-detect GitHub remote & sync with GitHub Store
        let activeRepo = currentRepo;
        if (!activeRepo.remoteUrl || !activeRepo.gitHubOwner) {
          try {
            const detected = await gitService.openRepository(activeRepo.path);
            if (detected.remoteUrl) {
              activeRepo = {
                ...activeRepo,
                remoteUrl: detected.remoteUrl,
                isGitHubRepo: detected.isGitHubRepo,
                gitHubOwner: detected.gitHubOwner,
                gitHubRepo: detected.gitHubRepo,
              };
              set({ currentRepo: activeRepo });
            }
          } catch {}
        }

        if (activeRepo.gitHubOwner && activeRepo.gitHubRepo) {
          useGitHubStore.getState().syncRepo(activeRepo.gitHubOwner, activeRepo.gitHubRepo);
        }
      } catch (err: any) {
        set({ errorMessage: err.message, isLoading: false });
      }
    },

    fetchRemote: async () => {
      const { currentRepo } = get();
      if (!currentRepo) return;
      set({ isLoading: true, errorMessage: null });
      try {
        await gitService.fetch(currentRepo.path);
        await get().refreshAll();
      } catch (err: any) {
        set({ errorMessage: err.message, isLoading: false });
        throw err;
      }
    },

    pull: async () => {
      const { currentRepo } = get();
      if (!currentRepo) return;
      set({ isLoading: true, errorMessage: null });
      try {
        await gitService.pull(currentRepo.path);
        await get().refreshAll();
      } catch (err: any) {
        set({ errorMessage: err.message, isLoading: false });
        throw err;
      }
    },

    push: async () => {
      const { currentRepo } = get();
      if (!currentRepo) return;
      set({ isLoading: true, errorMessage: null });
      try {
        await gitService.push(currentRepo.path);
        await get().refreshAll();
      } catch (err: any) {
        set({ errorMessage: err.message, isLoading: false });
        throw err;
      }
    },

    loadFileDiff: async (file: GitFileChange) => {
      const { currentRepo } = get();
      if (!currentRepo) return;

      try {
        const diffLines = await gitService.getFileDiff(
          currentRepo.path,
          file.path,
          file.staged,
          file.status === 'untracked'
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

    createBranch: async (name: string, startPoint?: string, checkout?: boolean) => {
      const { currentRepo } = get();
      if (!currentRepo) return;
      try {
        await gitService.createBranch(currentRepo.path, name, startPoint);
        if (checkout) {
          await gitService.checkoutBranch(currentRepo.path, name);
        }
        await get().refreshAll();
      } catch (err: any) {
        set({ errorMessage: err.message });
        throw err;
      }
    },

    deleteBranch: async (name: string, force?: boolean) => {
      const { currentRepo } = get();
      if (!currentRepo) return;
      try {
        await gitService.deleteBranch(currentRepo.path, name, force);
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

    pushTag: async (name: string) => {
      const { currentRepo } = get();
      if (!currentRepo) return;
      try {
        await gitService.pushTag(currentRepo.path, name);
        await get().refreshAll();
      } catch (err: any) {
        set({ errorMessage: err.message });
        throw err;
      }
    },

    pushAllTags: async () => {
      const { currentRepo } = get();
      if (!currentRepo) return;
      try {
        await gitService.pushAllTags(currentRepo.path);
        await get().refreshAll();
      } catch (err: any) {
        set({ errorMessage: err.message });
        throw err;
      }
    },

    deleteRemoteTag: async (name: string) => {
      const { currentRepo } = get();
      if (!currentRepo) return;
      try {
        await gitService.deleteRemoteTag(currentRepo.path, name);
        await get().refreshAll();
      } catch (err: any) {
        set({ errorMessage: err.message });
        throw err;
      }
    },

    mergeBranch: async (branch: string, options?: { noFf?: boolean; message?: string }) => {
      const { currentRepo } = get();
      if (!currentRepo) return '';
      try {
        const out = await gitService.merge(currentRepo.path, branch, options);
        await get().refreshAll();
        return out;
      } catch (err: any) {
        set({ errorMessage: err.message });
        await get().refreshAll();
        throw err;
      }
    },

    abortMerge: async () => {
      const { currentRepo } = get();
      if (!currentRepo) return;
      try {
        await gitService.abortMerge(currentRepo.path);
        await get().refreshAll();
      } catch (err: any) {
        set({ errorMessage: err.message });
        throw err;
      }
    },

    rebaseBranch: async (upstream: string) => {
      const { currentRepo } = get();
      if (!currentRepo) return '';
      try {
        const out = await gitService.rebase(currentRepo.path, upstream);
        await get().refreshAll();
        return out;
      } catch (err: any) {
        set({ errorMessage: err.message });
        await get().refreshAll();
        throw err;
      }
    },

    rebaseContinue: async () => {
      const { currentRepo } = get();
      if (!currentRepo) return;
      try {
        await gitService.rebaseContinue(currentRepo.path);
        await get().refreshAll();
      } catch (err: any) {
        set({ errorMessage: err.message });
        throw err;
      }
    },

    rebaseAbort: async () => {
      const { currentRepo } = get();
      if (!currentRepo) return;
      try {
        await gitService.rebaseAbort(currentRepo.path);
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

    undoLastCommit: async () => {
      const { currentRepo } = get();
      if (!currentRepo) return;
      try {
        await gitService.undoLastCommit(currentRepo.path);
        await get().refreshAll();
      } catch (err: any) {
        set({ errorMessage: err.message });
        throw err;
      }
    },

    openTerminal: async () => {
      const { currentRepo } = get();
      if (!currentRepo) return;
      try {
        await gitService.openTerminal(currentRepo.path);
      } catch (err: any) {
        set({ errorMessage: err.message });
        throw err;
      }
    },
  };
});
