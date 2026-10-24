import { createRepositoryActions, createConflictActions } from './repositoryActions';
import { toast } from '@/stores/toastStore';
import type { PushOptions } from '@/services/git/types';
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
import { watchPushedCommit } from '@/services/git/PushChecks';
import { sameWorktreePath } from '@/services/git/worktrees';
import { tNow } from '@/i18n';
import { ParsedDiffLine } from '@/services/git/PorcelainParser';
import { useGitHubStore } from '@/stores/githubStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useWorkspaceSessionStore } from '@/stores/workspaceSessionStore';
import { LAST_ACTIVE_REPO_KEY, OPEN_TABS_KEY, RECENT_REPOS_KEY, loadRepositoryList, saveRepositoryState } from './repositoryStorage';
import { authorizeRepository, isRepositoryAccessCancelled, RepositoryAccessCancelledError } from '@/services/fs/RepositoryAccess';

export type MainNavTab = 'changes' | 'history' | 'branches' | 'tags' | 'actions' | 'pullRequests';

export interface RedoItem {
  branch: string;
  commitHash: string;
  commitSubject: string;
  timestamp: number;
}

export interface RepoState {
  currentRepo: RepositoryInfo | null;
  openingRepoPath: string | null;
  recentRepos: RepositoryInfo[];
  activeTab: MainNavTab;
  status: GitStatusResult | null;
  selectedFile: GitFileChange | null;
  selectedCommit: GitCommit | null;
  fileDiffLines: ParsedDiffLine[];
  fileDiffLoading: boolean;
  fileDiffError: string | null;
  commits: GitCommit[];
  commitsLimit: number;
  commitsLoadedAll: boolean;
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
  setCurrentRepo: (repo: RepositoryInfo | null) => Promise<boolean>;
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
  refreshStatus: () => Promise<void>;
  checkExternalChanges: () => Promise<void>;
  loadMoreCommits: () => Promise<void>;
  fetchRemote: () => Promise<void>;
  pull: (rebase?: boolean) => Promise<void>;
  push: (remote?: string, branch?: string, options?: PushOptions) => Promise<void>;
  loadFileDiff: (file: GitFileChange, commitHash?: string, background?: boolean) => Promise<void>;
  stageFile: (filePath: string) => Promise<void>;
  unstageFile: (filePath: string) => Promise<void>;
  stageHunk: (filePath: string, hunk: ParsedDiffLine[], isUntracked?: boolean) => Promise<void>;
  unstageHunk: (filePath: string, hunk: ParsedDiffLine[]) => Promise<void>;
  discardHunk: (filePath: string, hunk: ParsedDiffLine[]) => Promise<void>;
  stageAll: () => Promise<void>;
  unstageAll: () => Promise<void>;
  discardChanges: (filePath: string) => Promise<void>;
  commit: (message: string, amend?: boolean) => Promise<void>;
  createBranch: (name: string, startPoint?: string, checkout?: boolean) => Promise<void>;
  deleteBranch: (name: string, force?: boolean) => Promise<void>;
  checkoutBranch: (name: string, options?: { openWorktree?: boolean }) => Promise<void>;
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
  cherryPickCommit: (hash: string) => Promise<void>;
  hardResetCommit: (hash: string) => Promise<void>;
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
  saveAndStageConflictFile: (filePath: string, content: string, expectedContent?: string) => Promise<void>;
  abortCurrentOperation: () => Promise<void>;
  completeCurrentOperation: (commitMessage?: string) => Promise<void>;
}


let repoOpenId = 0;
export const getRepositorySelectionRevision = () => repoOpenId;

export const useRepoStore = create<RepoState>((set, get) => {
  let repoEpoch = 0;
  let refreshId = 0;
  let diffId = 0;
  const checkingExternal = new Set<number>();
  let refsFingerprint: string | null = null;
  let loadingMore = false;
  const publish = set;
  const scopedSet = (): typeof set => {
    const epoch = repoEpoch;
    const path = get().currentRepo?.path;
    return ((partial: any, replace?: any) => {
      if (repoEpoch === epoch && get().currentRepo?.path === path) publish(partial, replace);
    }) as typeof set;
  };
  const isCurrent = (path: string, epoch: number) => get().currentRepo?.path === path && repoEpoch === epoch;
  // Load initial recent repos
  const initialRecent = loadRepositoryList(RECENT_REPOS_KEY);

  // Load initial open tabs
  let initialTabs = loadRepositoryList(OPEN_TABS_KEY);
  if (!initialTabs || initialTabs.length === 0) {
    initialTabs = initialRecent.slice(0, 4);
  }

  return {
    currentRepo: null,
    recentRepos: initialRecent,
    openingRepoPath: null,
    activeTab: 'changes',
    status: null,
    selectedFile: null,
    selectedCommit: null,
    fileDiffLines: [],
    fileDiffLoading: false,
    fileDiffError: null,
    commits: [],
    commitsLimit: 100,
    commitsLoadedAll: false,
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

    setCurrentRepo: async (repo) => {
      const openId = ++repoOpenId;
      if (repo && typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
        set({ openingRepoPath: repo.path });
        try { await authorizeRepository(repo.path); }
        catch (error) {
          if (openId === repoOpenId) {
            set({ openingRepoPath: null });
            if (!isRepositoryAccessCancelled(error)) toast.error(tNow('permissions.failed'), error instanceof Error ? error.message : String(error));
          }
          return false;
        }
      }
      if (openId !== repoOpenId) return false;
      repoEpoch++; refreshId++; diffId++;
      refsFingerprint = null;
      useGitHubStore.getState().clearRepo();
      set((state) => {
        let newTabs = state.openTabs;
        if (repo && !newTabs.some((t) => t.path === repo.path)) {
          newTabs = [...newTabs, repo];
        }
        saveRepositoryState(OPEN_TABS_KEY, newTabs);
        return {
          currentRepo: repo,
          openingRepoPath: null,
          status: null, commits: [], branches: [], tags: [], stashes: [],
          errorMessage: null, isLoading: false,
          selectedBranch: null, scrollToCommitHash: null, commitsLimit: 100, commitsLoadedAll: false,
          operationState: { type: 'none' as const, inConflict: false, conflictedFiles: [], isAllResolved: false },
          selectedFile: null,
          selectedCommit: null,
          fileDiffLines: [],
          fileDiffLoading: false, fileDiffError: null,
          redoStack: [],
          openTabs: newTabs,
        };
      });
      if (repo) {
        saveRepositoryState(LAST_ACTIVE_REPO_KEY, repo);
        void get().refreshAll().catch(() => {});
      } else {
        saveRepositoryState(LAST_ACTIVE_REPO_KEY, null);
      }
      return true;
    },

    closeTab: (path: string) => {
      if (get().openingRepoPath === path) { repoOpenId++; set({ openingRepoPath: null }); }
      const remaining = get().openTabs.filter((tab) => tab.path !== path);
      saveRepositoryState(OPEN_TABS_KEY, remaining);
      const wasActive = get().currentRepo?.path === path;
      set({ openTabs: remaining });
      if (wasActive) {
        void get().setCurrentRepo(null);
        if (remaining[0]) void get().setCurrentRepo(remaining[0]);
      }
    },

    switchTab: (path: string) => {
      const tab = get().openTabs.find((t) => t.path === path);
      if (tab) {
        get().setCurrentRepo(tab);
      }
    },
    setActiveTab: (activeTab) => {
      diffId++; set({ activeTab, fileDiffLoading: false });
      if (activeTab === 'changes' && get().selectedFile) void get().loadFileDiff(get().selectedFile!);
    },
    setStatus: (status) => set({ status }),
    setSelectedFile: (selectedFile) => {
      const previous = get().selectedFile;
      if (previous?.path === selectedFile?.path && previous?.staged === selectedFile?.staged) {
        if (JSON.stringify(previous) !== JSON.stringify(selectedFile)) set({ selectedFile });
        if (selectedFile && get().activeTab === 'changes') void get().loadFileDiff(selectedFile, undefined, true);
        return;
      }
      diffId++;
      set({ selectedFile, fileDiffLines: [], fileDiffError: null, fileDiffLoading: !!selectedFile && get().activeTab === 'changes' });
      if (selectedFile && get().activeTab === 'changes') {
        get().loadFileDiff(selectedFile);
      } else {
        set({ fileDiffLines: [] });
      }
    },
    setSelectedCommit: (selectedCommit) => { diffId++; set({ selectedCommit }); },
    setSelectedBranch: (selectedBranch) => set({ selectedBranch }),
    setScrollToCommitHash: (scrollToCommitHash) => set({ scrollToCommitHash }),

    selectAndLocateBranch: async (branchName: string) => {
      const set = scopedSet();
      const { currentRepo, commits, branches } = get();
      if (!currentRepo) return;

      useWorkspaceSessionStore.getState().updateHistoryView(currentRepo.path, { query: '', scrollTop: 0 });
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
        saveRepositoryState(RECENT_REPOS_KEY, updated);
        return { recentRepos: updated };
      }),

    removeRecentRepo: (path: string) =>
      set((state) => {
        const updated = state.recentRepos.filter((r) => r.path !== path);
        saveRepositoryState(RECENT_REPOS_KEY, updated);
        return { recentRepos: updated };
      }),

    checkExternalChanges: async () => {
      const repo = get().currentRepo;
      const epoch = repoEpoch;
      if (!repo || checkingExternal.has(epoch)) return;
      const refresh = refreshId;
      checkingExternal.add(epoch);
      try {
        const [status, refs, remoteUrl] = await Promise.all([
          gitService.getStatus(repo.path), gitService.getRefsFingerprint(repo.path), gitService.getGitHubBinding(repo.path).then(binding => binding?.fetchUrl),
        ]);
        if (!isCurrent(repo.path, epoch) || refresh !== refreshId) return;
        if (refsFingerprint !== refs || status.headOid !== get().status?.headOid || status.currentBranch !== repo.currentBranch || remoteUrl !== repo.remoteUrl) {
          await get().refreshAll();
          return;
        }
        const operationState = await gitService.getRepoOperationState(repo.path, status);
        if (!isCurrent(repo.path, epoch) || refresh !== refreshId) return;
        const statusChanged = JSON.stringify(status) !== JSON.stringify(get().status);
        if (statusChanged) set({ status });
        if (JSON.stringify(operationState) !== JSON.stringify(get().operationState)) set({ operationState });
        const changes = [...status.staged, ...status.unstaged, ...status.untracked];
        const selected = get().selectedFile;
        const next = changes.find(file => file.path === selected?.path && file.staged === selected.staged) || changes[0] || null;
        // Re-read the visible diff even if status codes did not change; keep old content while loading.
        // The unchanged-status reload is intentional: an externally re-edited file keeps its
        // status code, and the regression suite pins this refresh behavior.
        get().setSelectedFile(next);
      } catch (error: any) {
        if (isCurrent(repo.path, epoch) && refresh === refreshId) set({ errorMessage: error.message });
      } finally { checkingExternal.delete(epoch); }
    },

    loadMoreCommits: async () => {
      const set = scopedSet();
      const { currentRepo, commits, commitsLimit, commitsLoadedAll } = get();
      if (!currentRepo || loadingMore || commitsLoadedAll) return;
      loadingMore = true;
      const epoch = repoEpoch;
      const refresh = refreshId;
      try {
        const next = await gitService.getCommits(currentRepo.path, 100, commitsLimit);
        if (!isCurrent(currentRepo.path, epoch) || refresh !== refreshId) return;
        const seen = new Set(commits.map(commit => commit.hash));
        set({ commits: [...commits, ...next.filter(commit => !seen.has(commit.hash))], commitsLimit: commitsLimit + 100, commitsLoadedAll: next.length < 100 });
      } finally { loadingMore = false; }
    },

    refreshAll: async () => {
      const set = scopedSet();
      const { currentRepo } = get();
      if (!currentRepo) return;
      const epoch = repoEpoch;
      const request = ++refreshId;
      const valid = () => isCurrent(currentRepo.path, epoch) && request === refreshId;

      set({ isLoading: true, errorMessage: null });
      try {
        if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
          await authorizeRepository(currentRepo.path);
          if (!valid()) return;
        }
        const { commitsLimit } = get();
        const statusPromise = gitService.getStatus(currentRepo.path);
        const nextRefs = gitService.getRefsFingerprint(currentRepo.path).catch(() => null);
        const [status, commits, branches, tags, stashes, operationState] = await Promise.all([
          statusPromise,
          gitService.getCommits(currentRepo.path, commitsLimit),
          gitService.getBranches(currentRepo.path),
          gitService.getTags(currentRepo.path),
          gitService.getStashes(currentRepo.path),
          statusPromise.then(status => gitService.getRepoOperationState(currentRepo.path, status)),
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

        // Re-read the collaboration binding so remote edits/removals cannot retain an old repository.
        const detected = await gitService.openRepository(activeRepo.path, status);
        const resolvedRefs = await nextRefs;
        if (!valid()) return;
        refsFingerprint = resolvedRefs;
        activeRepo = { ...activeRepo, remoteUrl: detected.remoteUrl,
          isGitHubRepo: detected.isGitHubRepo, gitHubOwner: detected.gitHubOwner, gitHubRepo: detected.gitHubRepo, gitHubRemote: detected.gitHubRemote };

        // Persist updated repo to localStorage
        saveRepositoryState(LAST_ACTIVE_REPO_KEY, activeRepo);

        set((state) => {
          const updatedTabs = state.openTabs.map((t) =>
            t.path === activeRepo.path ? { ...t, currentBranch: activeRepo.currentBranch } : t
          );
          const updatedRecent = state.recentRepos.map((r) =>
            r.path === activeRepo.path ? { ...r, currentBranch: activeRepo.currentBranch } : r
          );
          saveRepositoryState(RECENT_REPOS_KEY, updatedRecent);

          return {
            currentRepo: activeRepo,
            openTabs: updatedTabs,
            recentRepos: updatedRecent,
            status,
            commits,
            commitsLoadedAll: commits.length < commitsLimit,
            branches,
            tags,
            stashes,
            operationState,
            isLoading: false,
          };
        });

        const allChanges = [...status.staged, ...status.unstaged, ...status.untracked];
        const selected = get().selectedFile;
        const next = allChanges.find((file) => file.path === selected?.path && file.staged === selected.staged) || allChanges[0] || null;
        get().setSelectedFile(next);

        // If no commit selected, select the first commit
        if (!get().selectedCommit && commits.length > 0) {
          set({ selectedCommit: commits[0] });
        }

        if (activeRepo.gitHubOwner && activeRepo.gitHubRepo) {
          void useGitHubStore.getState().syncRepo(activeRepo.gitHubOwner, activeRepo.gitHubRepo);
        } else { useGitHubStore.getState().clearRepo(); }
      } catch (err: any) {
        if (valid()) set({ errorMessage: err.message, isLoading: false });
        throw err;
      }
    },

    refreshStatus: async () => {
      const set = scopedSet();
      const { currentRepo } = get();
      if (!currentRepo) return;
      const epoch = repoEpoch;
      const request = ++refreshId;
      const valid = () => isCurrent(currentRepo.path, epoch) && request === refreshId;

      try {
        const { commitsLimit } = get();
        const status = await gitService.getStatus(currentRepo.path);
        const previous = get().status;
        const commits = status.headOid !== previous?.headOid || status.currentBranch !== previous?.currentBranch
          ? await gitService.getCommits(currentRepo.path, commitsLimit) : get().commits;
        const operationState = await gitService.getRepoOperationState(currentRepo.path, status);

        if (!valid()) return;
        set((state) => {
          const updatedTabs = state.openTabs.map((t) =>
            t.path === currentRepo.path ? { ...t, currentBranch: status.currentBranch } : t
          );
          return {
            isLoading: false,
            currentRepo: { ...currentRepo, currentBranch: status.currentBranch },
            status,
            operationState,
            commits,
            commitsLoadedAll: commits.length < commitsLimit,
            openTabs: updatedTabs,
          };
        });

        const changes = [...status.staged, ...status.unstaged, ...status.untracked];
        const selected = get().selectedFile;
        get().setSelectedFile(changes.find((file) => file.path === selected?.path && file.staged === selected.staged)
          || changes.find((file) => file.path === selected?.path) || changes[0] || null);
      } catch (err: any) {
        console.warn('refreshStatus failed:', err);
      }
    },

    fetchRemote: async () => {
      const set = scopedSet();
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

    pull: async (rebase?: boolean) => {
      const set = scopedSet();
      const { currentRepo } = get();
      if (!currentRepo) return;
      set({ isLoading: true, errorMessage: null });
      try {
        await gitService.pull(currentRepo.path, rebase);
        await get().refreshAll();
      } catch (err: any) {
        set({ errorMessage: err.message, isLoading: false });
        throw err;
      }
    },

    push: async (remote?: string, branch?: string, options?: PushOptions) => {
      const set = scopedSet();
      const { currentRepo } = get();
      if (!currentRepo) return;
      const epoch = repoEpoch;
      set({ isLoading: true, errorMessage: null });
      try {
        // 记录推送前本地 HEAD，成功后交给 GitHub 监听 CI 结果
        let pushedSha: string | null = null;
        try {
          pushedSha = await gitService.getBranchCommitHash(currentRepo.path, branch ? `refs/heads/${branch}` : 'HEAD');
        } catch {
          pushedSha = null;
        }

        const pushed = await gitService.push(currentRepo.path, remote, branch, options);
        if (pushed?.preferenceError) toast.warning(tNow('remote.preferenceNotSaved'), pushed.preferenceError);
        if (!isCurrent(currentRepo.path, epoch)) return;
        await get().refreshAll();
        set({ isLoading: false });
        if (pushedSha) {
          await watchPushedCommit(currentRepo.path, remote, branch, pushedSha, () => isCurrent(currentRepo.path, epoch));
        }
      } catch (err: any) {
        set({ errorMessage: err.message, isLoading: false });
        throw err;
      }
    },

    loadFileDiff: async (file: GitFileChange, commitHash?: string, background = false) => {
      const set = scopedSet();
      const { currentRepo } = get();
      if (!currentRepo) return;
      const epoch = repoEpoch;
      const request = ++diffId;
      const valid = () => isCurrent(currentRepo.path, epoch) && request === diffId;
      if (!background) set({ fileDiffLoading: true, fileDiffError: null });

      try {
        let diffLines: ParsedDiffLine[] = [];
        const ignoreWhitespace = useSettingsStore.getState().diffIgnoreWhitespace;
        if (commitHash) {
          diffLines = await gitService.getCommitFileDiff(currentRepo.path, commitHash, file.path, ignoreWhitespace);
        } else {
          diffLines = await gitService.getFileDiff(
            currentRepo.path,
            file.path,
            file.staged,
            file.status === 'untracked',
            ignoreWhitespace
          );
        }
        if (valid()) {
          const changed = diffLines !== get().fileDiffLines;
          set({ ...(changed ? { fileDiffLines: diffLines } : {}), fileDiffLoading: false, fileDiffError: null });
        }
      } catch (err: any) {
        console.warn('获取 Diff 失败:', err);
        if (valid()) set({ fileDiffLoading: false, fileDiffError: err.message || String(err) });
      }
    },

    stageFile: async (filePath: string) => {
      const set = scopedSet();
      const { currentRepo } = get();
      if (!currentRepo) return;
      try {
        await gitService.stageFile(currentRepo.path, filePath);
        await get().refreshStatus();
      } catch (err: any) {
        set({ errorMessage: err.message });
        throw err;
      }
    },

    unstageFile: async (filePath: string) => {
      const set = scopedSet();
      const { currentRepo } = get();
      if (!currentRepo) return;
      try {
        await gitService.unstageFile(currentRepo.path, filePath);
        await get().refreshStatus();
      } catch (err: any) {
        set({ errorMessage: err.message });
        throw err;
      }
    },

    stageHunk: async (filePath, hunk, isUntracked = false) => {
      const set = scopedSet();
      const { currentRepo } = get();
      if (!currentRepo) return;
      try {
        await gitService.stageHunk(currentRepo.path, filePath, hunk, isUntracked);
        await get().refreshStatus();
      } catch (err: any) {
        set({ errorMessage: err.message });
        throw err;
      }
    },

    unstageHunk: async (filePath, hunk) => {
      const set = scopedSet();
      const { currentRepo } = get();
      if (!currentRepo) return;
      try {
        await gitService.unstageHunk(currentRepo.path, filePath, hunk);
        await get().refreshStatus();
      } catch (err: any) {
        set({ errorMessage: err.message });
        throw err;
      }
    },

    discardHunk: async (filePath, hunk) => {
      const set = scopedSet();
      const { currentRepo } = get();
      if (!currentRepo) return;
      try {
        await gitService.discardHunk(currentRepo.path, filePath, hunk);
        await get().refreshStatus();
      } catch (err: any) {
        set({ errorMessage: err.message });
        throw err;
      }
    },

    stageAll: async () => {
      const set = scopedSet();
      const { currentRepo } = get();
      if (!currentRepo) return;
      try {
        await gitService.stageAll(currentRepo.path);
        await get().refreshStatus();
      } catch (err: any) {
        set({ errorMessage: err.message });
        throw err;
      }
    },

    unstageAll: async () => {
      const set = scopedSet();
      const { currentRepo } = get();
      if (!currentRepo) return;
      try {
        await gitService.unstageAll(currentRepo.path);
        await get().refreshStatus();
      } catch (err: any) {
        set({ errorMessage: err.message });
        throw err;
      }
    },

    discardChanges: async (filePath: string) => {
      const set = scopedSet();
      const { currentRepo } = get();
      if (!currentRepo) return;
      try {
        await gitService.discardChanges(currentRepo.path, filePath);
        await get().refreshStatus();
      } catch (err: any) {
        set({ errorMessage: err.message });
        throw err;
      }
    },

    commit: async (message: string, amend?: boolean) => {
      const set = scopedSet();
      const { currentRepo } = get();
      if (!currentRepo) return;
      try {
        await gitService.commit(currentRepo.path, message, amend);
        set({ redoStack: [] });
        await get().refreshStatus();
      } catch (err: any) {
        set({ errorMessage: err.message });
        throw err;
      }
    },

    createBranch: async (name: string, startPoint?: string, checkout?: boolean) => {
      const set = scopedSet();
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
      const set = scopedSet();
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

    checkoutBranch: async (name: string, options) => {
      const set = scopedSet();
      const { currentRepo } = get();
      if (!currentRepo) return;
      const epoch = repoEpoch;
      try {
        const worktree = await gitService.getBranchWorktree(currentRepo.path, name);
        if (!isCurrent(currentRepo.path, epoch)) return;
        if (worktree && !sameWorktreePath(worktree.path, currentRepo.path)) {
          if (options?.openWorktree === false) throw new Error(tNow('worktree.inUse').replace('{path}', worktree.path));
          const repo = await gitService.openRepository(worktree.path);
          if (!isCurrent(currentRepo.path, epoch)) return;
          get().addRecentRepo(repo);
          if (!await get().setCurrentRepo(repo)) throw new RepositoryAccessCancelledError();
          await get().refreshAll();
          return;
        }
        await gitService.checkoutBranch(currentRepo.path, name);
        if (!isCurrent(currentRepo.path, epoch)) return;
        const updatedRepo = { ...currentRepo, currentBranch: name };
        saveRepositoryState(LAST_ACTIVE_REPO_KEY, updatedRepo);

        set((state) => {
          const updatedTabs = state.openTabs.map((t) =>
            t.path === updatedRepo.path ? { ...t, currentBranch: name } : t
          );
          const updatedRecent = state.recentRepos.map((r) =>
            r.path === updatedRepo.path ? { ...r, currentBranch: name } : r
          );
          saveRepositoryState(RECENT_REPOS_KEY, updatedRecent);

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
        if (!isRepositoryAccessCancelled(err)) set({ errorMessage: err.message });
        throw err;
      }
    },

    ...createRepositoryActions(get, scopedSet),

    undoLastCommit: async () => {
      const set = scopedSet();
      const { currentRepo, commits } = get();
      if (!currentRepo) return;
      try {
        // 必须先记录真正的 HEAD 提交：commits 列表来自 `git log --all`，
        // commits[0] 可能是其他分支上更新的提交，用它做 redo 会把当前分支
        // 硬重置到不相关提交，造成数据丢失。
        const headHash = await gitService.getBranchCommitHash(currentRepo.path, 'HEAD');
        if (!headHash) {
          throw new Error(tNow('err.headUnavailable'));
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
      const set = scopedSet();
      const { currentRepo, redoStack } = get();
      if (!currentRepo || redoStack.length === 0) return;

      const item = redoStack[0];
      if (item.branch !== currentRepo.currentBranch) {
        throw new Error(tNow('err.redoBranchMismatch').replace('{branch}', item.branch));
      }

      try {
        await gitService.redoCommit(currentRepo.path, item.commitHash, item.branch);
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
      const set = scopedSet();
      const { currentRepo } = get();
      if (!currentRepo) return;
      try {
        await gitService.openTerminal(currentRepo.path);
      } catch (err: any) {
        const message = err instanceof Error ? err.message : String(err);
        set({ errorMessage: message });
        toast.error(tNow('terminal.openFailed'), message);
      }
    },

    fetchAndCheckoutPR: async (prNumber: number, customBranchName?: string) => {
      const set = scopedSet();
      const { currentRepo } = get();
      if (!currentRepo) throw new Error(tNow('err.noRepoOpen'));
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
        throw new Error(tNow('err.noRepoOpen'));
      }
      return await gitService.diagnoseRepository(currentRepo.path);
    },

    ...createConflictActions(get, scopedSet),

  };
});
