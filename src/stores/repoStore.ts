import { create } from 'zustand';
import {
  GitBranch,
  GitCommit,
  GitFileChange,
  GitStatusResult,
  GitStash,
  GitTag,
  RepositoryInfo,
  RepoHealthDiagnosis,
  RepoOperationState,
} from '@/services/git/types';
import { gitService } from '@/services/git/GitService';
import { ParsedDiffLine } from '@/services/git/PorcelainParser';
import { useGitHubStore } from '@/stores/githubStore';

export type MainNavTab = 'changes' | 'history' | 'branches' | 'tags' | 'actions' | 'pullRequests';

export interface RedoItem {
  branch: string;
  commitHash: string;
  commitSubject: string;
  timestamp: number;
}

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
  redoStack: RedoItem[];
  isLoading: boolean;
  isLeftSidebarCollapsed: boolean;
  isRightPaneCollapsed: boolean;
  errorMessage: string | null;
  selectedBranch: string | null;
  scrollToCommitHash: string | null;

  // Actions
  setCurrentRepo: (repo: RepositoryInfo | null) => void;
  setActiveTab: (tab: MainNavTab) => void;
  setStatus: (status: GitStatusResult | null) => void;
  setSelectedFile: (file: GitFileChange | null) => void;
  setSelectedCommit: (commit: GitCommit | null) => void;
  setSelectedBranch: (branch: string | null) => void;
  setScrollToCommitHash: (hash: string | null) => void;
  selectAndLocateBranch: (branchName: string) => Promise<void>;
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
  push: (remote?: string, branch?: string) => Promise<void>;
  loadFileDiff: (file: GitFileChange, commitHash?: string) => Promise<void>;
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
  redoLastCommit: () => Promise<void>;
  openTerminal: () => Promise<void>;
  fetchAndCheckoutPR: (prNumber: number, customBranchName?: string) => Promise<string>;
  diagnoseRepository: () => Promise<RepoHealthDiagnosis>;
  openTabs: RepositoryInfo[];
  closeTab: (path: string) => void;
  switchTab: (path: string) => void;

  // Conflict & In-Progress Operation Management
  operationState: RepoOperationState;
  resolveFileOurs: (filePath: string) => Promise<void>;
  resolveFileTheirs: (filePath: string) => Promise<void>;
  resetFileConflictMarkers: (filePath: string) => Promise<void>;
  readWorkingFile: (filePath: string) => Promise<string>;
  saveAndStageConflictFile: (filePath: string, content: string) => Promise<void>;
  abortCurrentOperation: () => Promise<void>;
  completeCurrentOperation: (commitMessage?: string) => Promise<void>;
}

const RECENT_REPOS_KEY = 'auu_git_recent_repos';
const OPEN_TABS_KEY = 'auu_git_open_tabs';

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

  // Load initial open tabs
  let initialTabs: RepositoryInfo[] = [];
  try {
    const savedTabs = localStorage.getItem(OPEN_TABS_KEY);
    if (savedTabs) {
      initialTabs = JSON.parse(savedTabs);
    }
  } catch {
    initialTabs = [];
  }
  if (!initialTabs || initialTabs.length === 0) {
    initialTabs = initialRecent.slice(0, 4);
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
    redoStack: [],
    isLoading: false,
    isLeftSidebarCollapsed: false,
    isRightPaneCollapsed: false,
    errorMessage: null,
    openTabs: initialTabs,
    selectedBranch: null,
    scrollToCommitHash: null,
    operationState: {
      type: 'none',
      inConflict: false,
      conflictedFiles: [],
      isAllResolved: false,
    },

    setCurrentRepo: (repo) => {
      set((state) => {
        let newTabs = state.openTabs;
        if (repo && !newTabs.some((t) => t.path === repo.path)) {
          newTabs = [...newTabs, repo];
        }
        try {
          localStorage.setItem(OPEN_TABS_KEY, JSON.stringify(newTabs));
        } catch {}
        return {
          currentRepo: repo,
          selectedFile: null,
          selectedCommit: null,
          fileDiffLines: [],
          redoStack: [],
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
        try {
          localStorage.setItem(OPEN_TABS_KEY, JSON.stringify(remaining));
        } catch {}
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
    setSelectedBranch: (selectedBranch) => set({ selectedBranch }),
    setScrollToCommitHash: (scrollToCommitHash) => set({ scrollToCommitHash }),

    selectAndLocateBranch: async (branchName: string) => {
      const { currentRepo, commits, branches } = get();
      if (!currentRepo) return;

      set({ selectedBranch: branchName, activeTab: 'history' });

      // 1. Try to find the target commit hash from branches or git rev-parse
      let targetHash: string | null = null;
      const branchObj = branches.find((b) => b.name === branchName);
      if (branchObj?.lastCommit?.hash) {
        targetHash = branchObj.lastCommit.hash;
      }

      if (!targetHash) {
        try {
          targetHash = await gitService.getBranchCommitHash(currentRepo.path, branchName);
        } catch {}
      }

      // 2. Find in existing commits list
      let targetCommit: GitCommit | undefined = undefined;
      if (targetHash) {
        targetCommit = commits.find((c) => c.hash === targetHash || c.shortHash === targetHash);
      }

      // If still not found by hash, try finding by ref name in commit.refs
      if (!targetCommit) {
        targetCommit = commits.find((c) =>
          c.refs?.some((r) => {
            const clean = r.replace(/^HEAD -> /, '').replace(/^tag: /, '');
            return clean === branchName || clean.endsWith('/' + branchName);
          })
        );
      }

      // 3. If not found in the current commit list, load more commits including this branch
      if (!targetCommit && targetHash) {
        try {
          const extraCommits = await gitService.getCommitsForBranch(currentRepo.path, branchName, 100);
          if (extraCommits.length > 0) {
            const seen = new Set<string>();
            const combined: GitCommit[] = [];
            for (const c of [...commits, ...extraCommits]) {
              if (!seen.has(c.hash)) {
                seen.add(c.hash);
                combined.push(c);
              }
            }
            set({ commits: combined });
            targetCommit = combined.find((c) => c.hash === targetHash || c.shortHash === targetHash);
          }
        } catch {}
      }

      // 4. If commit is found, select it and set scrollToCommitHash to trigger smooth centering scroll
      if (targetCommit) {
        set({ selectedCommit: targetCommit, scrollToCommitHash: targetCommit.hash });
      }
    },
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
        const [status, commits, branches, tags, stashes, operationState] = await Promise.all([
          gitService.getStatus(currentRepo.path),
          gitService.getCommits(currentRepo.path, 50),
          gitService.getBranches(currentRepo.path),
          gitService.getTags(currentRepo.path),
          gitService.getStashes(currentRepo.path),
          gitService.getRepoOperationState(currentRepo.path),
        ]);

        // Compute authoritative active branch
        const detectedBranch =
          branches.find((b) => b.isCurrent)?.name ||
          status.currentBranch ||
          currentRepo.currentBranch;

        let activeRepo: RepositoryInfo = {
          ...currentRepo,
          currentBranch: detectedBranch || currentRepo.currentBranch || 'main',
        };

        // Auto-detect GitHub remote & sync with GitHub Store
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
                currentBranch: detected.currentBranch || activeRepo.currentBranch,
              };
            }
          } catch {}
        }

        // Persist updated repo to localStorage
        try {
          localStorage.setItem('auu_git_last_active_repo', JSON.stringify(activeRepo));
        } catch {}

        set((state) => {
          const updatedTabs = state.openTabs.map((t) =>
            t.path === activeRepo.path ? { ...t, currentBranch: activeRepo.currentBranch } : t
          );
          const updatedRecent = state.recentRepos.map((r) =>
            r.path === activeRepo.path ? { ...r, currentBranch: activeRepo.currentBranch } : r
          );
          try {
            localStorage.setItem(RECENT_REPOS_KEY, JSON.stringify(updatedRecent));
          } catch {}

          return {
            currentRepo: activeRepo,
            openTabs: updatedTabs,
            recentRepos: updatedRecent,
            status,
            commits,
            branches,
            tags,
            stashes,
            operationState,
            isLoading: false,
          };
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

    push: async (remote?: string, branch?: string) => {
      const { currentRepo } = get();
      if (!currentRepo) return;
      set({ isLoading: true, errorMessage: null });
      try {
        await gitService.push(currentRepo.path, remote, branch);
        await get().refreshAll();
      } catch (err: any) {
        set({ errorMessage: err.message, isLoading: false });
        throw err;
      }
    },

    loadFileDiff: async (file: GitFileChange, commitHash?: string) => {
      const { currentRepo, selectedCommit, activeTab } = get();
      if (!currentRepo) return;

      try {
        const targetCommit =
          commitHash || (activeTab === 'history' && selectedCommit ? selectedCommit.hash : undefined);

        let diffLines: ParsedDiffLine[] = [];
        if (targetCommit) {
          diffLines = await gitService.getCommitFileDiff(currentRepo.path, targetCommit, file.path);
        } else {
          diffLines = await gitService.getFileDiff(
            currentRepo.path,
            file.path,
            file.staged,
            file.status === 'untracked'
          );
        }
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
        set({ redoStack: [] });
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
          set({ redoStack: [] });
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
        const updatedRepo = { ...currentRepo, currentBranch: name };
        try {
          localStorage.setItem('auu_git_last_active_repo', JSON.stringify(updatedRepo));
        } catch {}

        set((state) => {
          const updatedTabs = state.openTabs.map((t) =>
            t.path === updatedRepo.path ? { ...t, currentBranch: name } : t
          );
          const updatedRecent = state.recentRepos.map((r) =>
            r.path === updatedRepo.path ? { ...r, currentBranch: name } : r
          );
          try {
            localStorage.setItem(RECENT_REPOS_KEY, JSON.stringify(updatedRecent));
          } catch {}

          const updatedBranches = state.branches.map((b) => ({
            ...b,
            isCurrent: b.name === name,
          }));

          return {
            currentRepo: updatedRepo,
            openTabs: updatedTabs,
            recentRepos: updatedRecent,
            branches: updatedBranches,
            redoStack: [],
          };
        });

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
      const { currentRepo, commits } = get();
      if (!currentRepo) return;
      try {
        // 必须先记录真正的 HEAD 提交：commits 列表来自 `git log --all`，
        // commits[0] 可能是其他分支上更新的提交，用它做 redo 会把当前分支
        // 硬重置到不相关提交，造成数据丢失。
        const headHash = await gitService.getBranchCommitHash(currentRepo.path, 'HEAD');
        if (!headHash) {
          throw new Error('无法获取当前 HEAD 提交，仓库可能还没有任何提交');
        }

        await gitService.undoLastCommit(currentRepo.path);

        const headCommit = commits.find((c) => c.hash === headHash);
        set((state) => ({
          redoStack: [
            {
              branch: currentRepo.currentBranch,
              commitHash: headHash,
              commitSubject:
                headCommit?.subject || headCommit?.shortHash || headHash.slice(0, 7),
              timestamp: Date.now(),
            },
            ...state.redoStack,
          ],
        }));

        await get().refreshAll();
      } catch (err: any) {
        set({ errorMessage: err.message });
        throw err;
      }
    },

    redoLastCommit: async () => {
      const { currentRepo, redoStack } = get();
      if (!currentRepo || redoStack.length === 0) return;

      const item = redoStack[0];
      if (item.branch !== currentRepo.currentBranch) {
        throw new Error(`无法在当前分支重做，该提交属于分支: ${item.branch}`);
      }

      try {
        await gitService.redoCommit(currentRepo.path, item.commitHash);
        set((state) => ({
          redoStack: state.redoStack.slice(1),
        }));
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

    fetchAndCheckoutPR: async (prNumber: number, customBranchName?: string) => {
      const { currentRepo } = get();
      if (!currentRepo) throw new Error('未打开任何 Git 仓库');
      set({ isLoading: true, errorMessage: null });
      try {
        const branch = await gitService.fetchAndCheckoutPR(currentRepo.path, prNumber, customBranchName);
        await get().refreshAll();
        return branch;
      } catch (err: any) {
        set({ errorMessage: err.message, isLoading: false });
        throw err;
      }
    },

    diagnoseRepository: async () => {
      const { currentRepo } = get();
      if (!currentRepo) {
        throw new Error('未打开任何 Git 仓库');
      }
      return await gitService.diagnoseRepository(currentRepo.path);
    },

    resolveFileOurs: async (filePath: string) => {
      const { currentRepo } = get();
      if (!currentRepo) return;
      try {
        await gitService.resolveConflictWithOurs(currentRepo.path, filePath);
        await get().refreshAll();
      } catch (err: any) {
        set({ errorMessage: err.message });
        throw err;
      }
    },

    resolveFileTheirs: async (filePath: string) => {
      const { currentRepo } = get();
      if (!currentRepo) return;
      try {
        await gitService.resolveConflictWithTheirs(currentRepo.path, filePath);
        await get().refreshAll();
      } catch (err: any) {
        set({ errorMessage: err.message });
        throw err;
      }
    },

    resetFileConflictMarkers: async (filePath: string) => {
      const { currentRepo } = get();
      if (!currentRepo) return;
      try {
        await gitService.resetConflictMarkers(currentRepo.path, filePath);
        await get().refreshAll();
      } catch (err: any) {
        set({ errorMessage: err.message });
        throw err;
      }
    },

    readWorkingFile: async (filePath: string) => {
      const { currentRepo } = get();
      if (!currentRepo) return '';
      return await gitService.readWorkingFile(currentRepo.path, filePath);
    },

    saveAndStageConflictFile: async (filePath: string, content: string) => {
      const { currentRepo } = get();
      if (!currentRepo) return;
      try {
        await gitService.writeWorkingFile(currentRepo.path, filePath, content);
        await gitService.stageFile(currentRepo.path, filePath);
        await get().refreshAll();
      } catch (err: any) {
        set({ errorMessage: err.message });
        throw err;
      }
    },

    abortCurrentOperation: async () => {
      const { currentRepo, operationState } = get();
      if (!currentRepo) return;
      try {
        if (operationState.type === 'rebase') {
          await gitService.rebaseAbort(currentRepo.path);
        } else {
          await gitService.abortMerge(currentRepo.path);
        }
        await get().refreshAll();
      } catch (err: any) {
        set({ errorMessage: err.message });
        throw err;
      }
    },

    completeCurrentOperation: async (commitMessage?: string) => {
      const { currentRepo, operationState } = get();
      if (!currentRepo) return;
      try {
        if (operationState.type === 'rebase') {
          await gitService.rebaseContinue(currentRepo.path);
        } else {
          await gitService.commit(
            currentRepo.path,
            commitMessage?.trim() || 'Merge branch with resolved conflicts'
          );
        }
        await get().refreshAll();
      } catch (err: any) {
        set({ errorMessage: err.message });
        throw err;
      }
    },
  };
});
