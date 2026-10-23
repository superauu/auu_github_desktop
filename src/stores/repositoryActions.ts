import { hasConflictMarkers } from '@/services/git/ConflictParser';
import type { StoreApi } from 'zustand';
import type { RepoState } from './repoStore';
import { gitService } from '@/services/git/GitService';

type Actions = Pick<RepoState, 'createTag' | 'deleteTag' | 'pushTag' | 'pushAllTags' | 'deleteRemoteTag' | 'mergeBranch' | 'abortMerge' | 'rebaseBranch' | 'rebaseContinue' | 'rebaseAbort' | 'stashPush' | 'stashPop' | 'stashApply' | 'stashDrop' | 'revertCommit' | 'softResetCommit' | 'cherryPickCommit' | 'hardResetCommit'>;

/** Keep repository-scoped publication guards when moving actions out of the store. */
export function createRepositoryActions(get: () => RepoState, scopedSet: () => StoreApi<RepoState>['setState']): Actions {
  return {
    createTag: async (name: string, commitHash?: string, message?: string) => {
      const set = scopedSet();
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
      const set = scopedSet();
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
      const set = scopedSet();
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
      const set = scopedSet();
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
      const set = scopedSet();
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
      const set = scopedSet();
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
      const set = scopedSet();
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
      const set = scopedSet();
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
      const set = scopedSet();
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
      const set = scopedSet();
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
      const set = scopedSet();
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
      const set = scopedSet();
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
      const set = scopedSet();
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
      const set = scopedSet();
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
      const set = scopedSet();
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
      const set = scopedSet();
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

    cherryPickCommit: async (hash: string) => {
      const set = scopedSet();
      const { currentRepo } = get();
      if (!currentRepo) return;
      try {
        await gitService.cherryPickCommit(currentRepo.path, hash);
        await get().refreshAll();
      } catch (err: any) {
        set({ errorMessage: err.message });
        throw err;
      }
    },

    hardResetCommit: async (hash: string) => {
      const set = scopedSet();
      const { currentRepo } = get();
      if (!currentRepo) return;
      try {
        await gitService.hardResetCommit(currentRepo.path, hash);
        set({ redoStack: [] });
        await get().refreshAll();
      } catch (err: any) {
        set({ errorMessage: err.message });
        throw err;
      }
    },

  };
}

type ConflictActions = Pick<RepoState, 'resolveFileOurs' | 'resolveFileTheirs' | 'resetFileConflictMarkers' | 'readWorkingFile' | 'saveAndStageConflictFile' | 'abortCurrentOperation' | 'completeCurrentOperation'>;

export function createConflictActions(get: () => RepoState, scopedSet: () => StoreApi<RepoState>['setState']): ConflictActions {
  return {
    resolveFileOurs: async (filePath: string) => {
      const set = scopedSet();
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
      const set = scopedSet();
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
      const set = scopedSet();
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

    saveAndStageConflictFile: async (filePath: string, content: string, expectedContent?: string) => {
      const set = scopedSet();
      const { currentRepo } = get();
      if (!currentRepo) return;
      try {
        if (hasConflictMarkers(content)) throw new Error('Resolve all conflict markers before staging');
        await gitService.writeWorkingFile(currentRepo.path, filePath, content, expectedContent);
        await gitService.stageFile(currentRepo.path, filePath);
        await get().refreshAll();
      } catch (err: any) {
        set({ errorMessage: err.message });
        throw err;
      }
    },

    abortCurrentOperation: async () => {
      const set = scopedSet();
      const { currentRepo, operationState } = get();
      if (!currentRepo) return;
      try {
        if (operationState.type === 'rebase') {
          await gitService.rebaseAbort(currentRepo.path);
        } else if (operationState.type === 'cherry-pick') {
          await gitService.cherryPickAbort(currentRepo.path);
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
      const set = scopedSet();
      const { currentRepo, operationState } = get();
      if (!currentRepo) return;
      try {
        if (operationState.type === 'rebase') {
          await gitService.rebaseContinue(currentRepo.path);
        } else if (operationState.type === 'cherry-pick') {
          await gitService.cherryPickContinue(currentRepo.path);
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
}
