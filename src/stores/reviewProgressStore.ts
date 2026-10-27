import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { ReviewApproval, ReviewComment } from '@/features/review/reviewLogic';

/**
 * 分级审查进度:代码块/文件通过状态与注释,按 [仓库路径, 分支] 持久化。
 * 检查点推进(标记已审查)后由调用方清空;变基换基准时旧进度按分支自然隔离。
 */
export interface ReviewProgress {
  approval: ReviewApproval;
  comments: ReviewComment[];
}

const emptyProgress = (): ReviewProgress => ({ approval: { approvedFiles: [], approvedHunks: {} }, comments: [] });

/** 上限:防止长期残留条目无限增长(每仓一条,与 workspaceSession 同量级)。 */
const PROGRESS_LIMIT = 50;
export const progressKey = (repoPath: string, branch: string) => JSON.stringify([repoPath, branch]);

interface ReviewProgressState {
  entries: Record<string, ReviewProgress>;
  getProgress: (repoPath: string, branch: string) => ReviewProgress;
  setProgress: (repoPath: string, branch: string, progress: ReviewProgress) => void;
  clearProgress: (repoPath: string, branch: string) => void;
}

export const useReviewProgressStore = create<ReviewProgressState>()(
  persist(
    (set, get) => ({
      entries: {},
      getProgress: (repoPath, branch) => get().entries[progressKey(repoPath, branch)] ?? emptyProgress(),
      setProgress: (repoPath, branch, progress) => set((state) => {
        const entries = { ...state.entries, [progressKey(repoPath, branch)]: progress };
        const keys = Object.keys(entries);
        if (keys.length > PROGRESS_LIMIT) for (const key of keys.slice(0, keys.length - PROGRESS_LIMIT)) delete entries[key];
        return { entries };
      }),
      clearProgress: (repoPath, branch) => set((state) => {
        const key = progressKey(repoPath, branch);
        if (!(key in state.entries)) return state;
        const entries = { ...state.entries };
        delete entries[key];
        return { entries };
      }),
    }),
    {
      name: 'auu-git-review-progress',
      storage: createJSONStorage(() => localStorage),
      version: 1,
      partialize: (state) => ({ entries: state.entries }),
      migrate: (persisted) => {
        const entries = (persisted as { entries?: unknown })?.entries;
        if (!entries || typeof entries !== 'object') return { entries: {} };
        const valid: Record<string, ReviewProgress> = {};
        for (const [key, value] of Object.entries(entries as Record<string, unknown>)) {
          const progress = value as ReviewProgress | null;
          if (!progress || typeof progress !== 'object' || !progress.approval || !Array.isArray(progress.comments)) continue;
          valid[key] = {
            approval: {
              approvedFiles: Array.isArray(progress.approval.approvedFiles) ? progress.approval.approvedFiles.filter((v) => typeof v === 'string') : [],
              approvedHunks: progress.approval.approvedHunks && typeof progress.approval.approvedHunks === 'object'
                ? Object.fromEntries(Object.entries(progress.approval.approvedHunks).filter(([, v]) => Array.isArray(v)).map(([k, v]) => [k, (v as unknown[]).filter((n): n is number => typeof n === 'number')]))
                : {},
            },
            comments: progress.comments.filter((comment) => comment && typeof comment.id === 'string' && typeof comment.path === 'string' && typeof comment.text === 'string'),
          };
        }
        return { entries: valid };
      },
    },
  ),
);
