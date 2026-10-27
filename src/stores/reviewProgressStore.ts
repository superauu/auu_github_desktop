import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { ReviewApproval, ReviewComment, ReviewFileEvidence } from '@/features/review/reviewLogic';
import { carryReviewProgress, reconcileReviewFile } from '@/features/review/reviewIncremental';

/**
 * 通过状态和行号只对特定基准、HEAD 和差异目标有效。
 * 旧版无范围的记录保留在原键下,但不能作为新版差异的有效进度。
 */
export interface ReviewProgress {
  approval: ReviewApproval;
  comments: ReviewComment[];
  evidence?: Record<string, ReviewFileEvidence>;
  pending?: Record<string, { evidence: ReviewFileEvidence; approvedHunks: number[]; fileApproved: boolean }>;
}

const emptyProgress = (): ReviewProgress => ({ approval: { approvedFiles: [], approvedHunks: {} }, comments: [] });

export interface ReviewScope {
  baseHash: string;
  headHash: string;
  /** net 或完整提交哈希。 */
  target: string;
}

/** 按版本范围裁剪;同一范围所有提交的意见必须一同保留。 */
const PROGRESS_LIMIT = 50;
export const progressKey = (repoPath: string, branch: string, scope?: ReviewScope) => JSON.stringify(
  scope ? [repoPath, branch, scope.baseHash, scope.headHash, scope.target] : [repoPath, branch],
);

function keyParts(key: string): unknown[] {
  try { const parts: unknown = JSON.parse(key); return Array.isArray(parts) ? parts : []; }
  catch { return []; }
}

const belongsToBranch = (key: string, repoPath: string, branch: string) => {
  const parts = keyParts(key);
  return parts[0] === repoPath && parts[1] === branch;
};

function limitEntries(entries: Record<string, ReviewProgress>) {
  const ranges = new Map<string, string[]>();
  for (const key of Object.keys(entries)) {
    const range = JSON.stringify(keyParts(key).slice(0, 4));
    const keys = [...(ranges.get(range) ?? []), key];
    ranges.delete(range);
    ranges.set(range, keys);
  }
  for (const keys of [...ranges.values()].slice(0, Math.max(0, ranges.size - PROGRESS_LIMIT))) {
    for (const key of keys) delete entries[key];
  }
  return entries;
}

/** 报告汇总当前版本所有目标的意见,保留来源,包括净差异中已不存在的文件。 */
export function getRangeProgress(entries: Record<string, ReviewProgress>, repoPath: string, branch: string, baseHash: string, headHash: string) {
  return Object.entries(entries).flatMap(([key, progress]) => {
    const parts = keyParts(key);
    return parts.length === 5 && parts[0] === repoPath && parts[1] === branch
      && parts[2] === baseHash && parts[3] === headHash && typeof parts[4] === 'string'
      ? [{ target: parts[4], progress }] : [];
  });
}

export function previousReviewHeads(entries: Record<string, ReviewProgress>, repoPath: string, branch: string, baseHash: string, headHash: string) {
  return [...new Set(Object.keys(entries).reverse().flatMap((key) => {
    const parts = keyParts(key);
    return parts.length === 5 && parts[0] === repoPath && parts[1] === branch && parts[2] === baseHash
      && typeof parts[3] === 'string' && parts[3] !== headHash ? [parts[3]] : [];
  }))];
}

interface ReviewProgressState {
  entries: Record<string, ReviewProgress>;
  getProgress: (repoPath: string, branch: string, scope?: ReviewScope) => ReviewProgress;
  setProgress: (repoPath: string, branch: string, progress: ReviewProgress, scope?: ReviewScope) => void;
  snapshotProgress: (repoPath: string, branch: string) => Record<string, ReviewProgress>;
  restoreProgress: (repoPath: string, branch: string, snapshot: Record<string, ReviewProgress>) => void;
  clearProgress: (repoPath: string, branch: string) => void;
  carryProgress: (repoPath: string, branch: string, baseHash: string, previousHead: string, headHash: string, versions: Record<string, string>, commits: string[]) => number;
  reconcileFile: (repoPath: string, branch: string, scope: ReviewScope, path: string, evidence: ReviewFileEvidence) => void;
}

export const useReviewProgressStore = create<ReviewProgressState>()(
  persist(
    (set, get) => ({
      entries: {},
      getProgress: (repoPath, branch, scope) => get().entries[progressKey(repoPath, branch, scope)] ?? emptyProgress(),
      setProgress: (repoPath, branch, progress, scope) => set((state) => {
        const key = progressKey(repoPath, branch, scope);
        const entries = { ...state.entries };
        delete entries[key];
        entries[key] = progress;
        return { entries: limitEntries(entries) };
      }),
      snapshotProgress: (repoPath, branch) => structuredClone(Object.fromEntries(
        Object.entries(get().entries).filter(([key]) => belongsToBranch(key, repoPath, branch)),
      )),
      restoreProgress: (repoPath, branch, snapshot) => set((state) => ({
        entries: limitEntries({
          ...structuredClone(Object.fromEntries(Object.entries(snapshot).filter(([key]) => belongsToBranch(key, repoPath, branch)))),
          // 标记之后新写的意见优先保留,撤销不能删除后续工作。
          ...state.entries,
        }),
      })),
      clearProgress: (repoPath, branch) => set((state) => {
        const entries = Object.fromEntries(Object.entries(state.entries).filter(([key]) => !belongsToBranch(key, repoPath, branch)));
        return { entries };
      }),
      carryProgress: (repoPath, branch, baseHash, previousHead, headHash, versions, commits) => {
        let retained = 0;
        set((state) => {
          const entries = { ...state.entries };
          for (const { target, progress } of getRangeProgress(entries, repoPath, branch, baseHash, previousHead)) {
            const key = progressKey(repoPath, branch, { baseHash, headHash, target });
            if (entries[key] || (target !== 'net' && !commits.includes(target))) continue;
            const next = target === 'net' ? carryReviewProgress(progress, versions, previousHead) : structuredClone(progress);
            entries[key] = next;
            if (target === 'net') retained = next.approval.approvedFiles.length;
          }
          return { entries: limitEntries(entries) };
        });
        return retained;
      },
      reconcileFile: (repoPath, branch, scope, path, evidence) => {
        const progress = get().getProgress(repoPath, branch, scope);
        get().setProgress(repoPath, branch, reconcileReviewFile(progress, path, evidence), scope);
      },
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
