import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { commentStatus, type ReviewApproval, type ReviewComment, type ReviewFileEvidence, type ReviewCommentStatus } from '@/features/review/reviewLogic';
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

/** 保存失败不影响内存中的审查进度,也不能阻断差异查看。 */
export const useReviewStorageStatus = create<{ unavailable: boolean }>(() => ({ unavailable: false }));
const storageUnavailable = (unavailable: boolean) => {
  if (useReviewStorageStatus.getState().unavailable !== unavailable) useReviewStorageStatus.setState({ unavailable });
};
const STORAGE_KEY = 'auu-git-review-progress';
const reviewStorage = {
  getItem: (key: string) => {
    try { return localStorage.getItem(key); }
    catch { storageUnavailable(true); return null; }
  },
  setItem: (key: string, value: string) => {
    try { localStorage.setItem(key, value); storageUnavailable(false); }
    catch { storageUnavailable(true); }
  },
  removeItem: (key: string) => {
    try { localStorage.removeItem(key); }
    catch { storageUnavailable(true); }
  },
};

export interface ReviewIssueRef { target: string; id: string }
export interface ReviewStatusChange extends ReviewIssueRef { before: ReviewCommentStatus; after: ReviewCommentStatus }

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
  const latestFindings = new Map<string, { range: string; unresolved: boolean }>();
  for (const [key, progress] of Object.entries(entries)) {
    const parts = keyParts(key);
    const range = JSON.stringify(parts.slice(0, 4));
    const keys = [...(ranges.get(range) ?? []), key];
    ranges.delete(range);
    ranges.set(range, keys);
    for (const comment of progress.comments) {
      const identity = JSON.stringify([parts[0], parts[1], parts[4] ?? null, comment.id]);
      latestFindings.set(identity, { range, unresolved: commentStatus(comment) !== 'resolved' });
    }
  }
  // 同一意见跨版本只保护最新副本,已解决的历史副本可以正常清理。
  const protectedRanges = new Set([...latestFindings.values()].filter((finding) => finding.unresolved).map((finding) => finding.range));
  // 当前刚写入的范围即使没有意见,也不能被旧意见挤掉。
  const newestRange = [...ranges.keys()].at(-1);
  if (newestRange) protectedRanges.add(newestRange);
  let excess = Math.max(0, ranges.size - PROGRESS_LIMIT);
  for (const [range, keys] of ranges) {
    if (excess === 0) break;
    if (protectedRanges.has(range)) continue;
    for (const key of keys) delete entries[key];
    excess--;
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
  retrySave: () => boolean;
  setCommentStatuses: (repoPath: string, branch: string, range: Omit<ReviewScope, 'target'>, issues: ReviewIssueRef[], status: ReviewCommentStatus) => ReviewStatusChange[];
  restoreCommentStatuses: (repoPath: string, branch: string, range: Omit<ReviewScope, 'target'>, changes: ReviewStatusChange[]) => void;
}

export const useReviewProgressStore = create<ReviewProgressState>()(
  persist(
    (set, get) => ({
      entries: {},
      retrySave: () => {
        try { reviewStorage.setItem(STORAGE_KEY, JSON.stringify({ state: { entries: get().entries }, version: 1 })); }
        catch { storageUnavailable(true); }
        return !useReviewStorageStatus.getState().unavailable;
      },
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
      setCommentStatuses: (repoPath, branch, range, issues, status) => {
        const changes: ReviewStatusChange[] = [];
        const targets = new Map<string, Set<string>>();
        for (const { target, id } of issues) {
          if (!targets.has(target)) targets.set(target, new Set());
          targets.get(target)!.add(id);
        }
        set((state) => {
          const entries = { ...state.entries };
          for (const [target, ids] of targets) {
            const key = progressKey(repoPath, branch, { ...range, target });
            const progress = entries[key];
            if (!progress) continue;
            const comments = progress.comments.map((comment) => {
              const before = commentStatus(comment);
              if (!ids.has(comment.id) || before === status) return comment;
              changes.push({ target, id: comment.id, before, after: status });
              return { ...comment, status };
            });
            delete entries[key];
            entries[key] = { ...progress, comments };
          }
          return { entries: limitEntries(entries) };
        });
        return changes;
      },
      restoreCommentStatuses: (repoPath, branch, range, changes) => {
        set((state) => {
          const entries = { ...state.entries };
          const targets = new Map<string, Map<string, ReviewStatusChange>>();
          for (const change of changes) {
            if (!targets.has(change.target)) targets.set(change.target, new Map());
            targets.get(change.target)!.set(change.id, change);
          }
          for (const [target, byId] of targets) {
            const key = progressKey(repoPath, branch, { ...range, target });
            const progress = entries[key];
            if (!progress) continue;
            const comments = progress.comments.map((comment) => {
              const change = byId.get(comment.id);
              return change && commentStatus(comment) === change.after ? { ...comment, status: change.before } : comment;
            });
            delete entries[key];
            entries[key] = { ...progress, comments };
          }
          return { entries: limitEntries(entries) };
        });
      },
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => reviewStorage),
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
