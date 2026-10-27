import { create } from 'zustand';
import { gitService } from '@/services/git/GitService';
import { reviewCheckpointService, type ReviewCheckpoint } from '@/services/git/ReviewCheckpointService';
import type { GitCommit, GitFileChange } from '@/services/git/types';
import type { ParsedDiffLine } from '@/services/git/PorcelainParser';
import { computeRiskFindings, detectAiAuthorship, type ReviewRiskFinding } from '@/features/review/reviewLogic';
import { summarizeReviewRange, type AiReviewSummary } from '@/services/ai/AiReviewSummaryService';
import { useSettingsStore } from '@/stores/settingsStore';
import { toast, useToastStore } from '@/stores/toastStore';
import { tNow } from '@/i18n';

/** 审查范围 patch 的两档用途:风险扫描取全量(1MB 封顶),AI 上下文另行截断到 16k。 */
const RISK_PATCH_CAP = 1_000_000;
const AI_PATCH_CAP = 16_000;

export type ReviewTarget = { kind: 'net' } | { kind: 'commit'; hash: string };

export interface ReviewState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  errorMessage: string | null;
  branch: string;
  headHash: string;
  /** 导航徽标:检查点之后的待审提交数;null = 无检查点/检查点失效/未知。 */
  badgeCount: number | null;
  checkpoint: ReviewCheckpoint | null;
  /** 检查点已不在当前分支历史(变基/强制推送后),需重建基准。 */
  stale: boolean;
  commits: GitCommit[];
  linear: boolean;
  truncated: boolean;
  rangeFiles: GitFileChange[];
  insertions: number;
  deletions: number;
  riskFindings: ReviewRiskFinding[];
  rangePatch: string;
  target: ReviewTarget;
  targetFiles: GitFileChange[];
  selectedFile: string | null;
  diffLines: ParsedDiffLine[];
  diffLoading: boolean;
  diffError: string | null;
  diffMode: 'unified' | 'split';
  aiSummary: AiReviewSummary | null;
  aiBusy: boolean;
  aiError: string | null;
  markBusy: boolean;

  load: (repoPath: string, branch: string, headHash: string) => Promise<void>;
  reset: () => void;
  refreshBadge: (repoPath: string, branch: string, headHash: string) => Promise<void>;
  setTarget: (repoPath: string, target: ReviewTarget) => Promise<void>;
  selectFile: (repoPath: string, path: string) => Promise<void>;
  setDiffMode: (mode: 'unified' | 'split') => void;
  markReviewed: (repoPath: string, branch: string) => Promise<void>;
  undoMarkReviewed: (repoPath: string, branch: string) => Promise<void>;
  setCheckpoint: (repoPath: string, branch: string, hash: string) => Promise<void>;
  requestAiSummary: () => Promise<void>;
  dismissAiError: () => void;
}

let loadEpoch = 0;
let diffEpoch = 0;
let badgeEpoch = 0;
let aiController: AbortController | null = null;
/** 「标记已审查」前的检查点,供撤销恢复。 */
let checkpointBeforeMark: ReviewCheckpoint | null = null;

const initialData = {
  checkpoint: null,
  stale: false,
  badgeCount: null as number | null,
  commits: [] as GitCommit[],
  linear: true,
  truncated: false,
  rangeFiles: [] as GitFileChange[],
  insertions: 0,
  deletions: 0,
  riskFindings: [] as ReviewRiskFinding[],
  rangePatch: '',
  target: { kind: 'net' } as ReviewTarget,
  targetFiles: [] as GitFileChange[],
  selectedFile: null,
  diffLines: [] as ParsedDiffLine[],
  diffLoading: false,
  diffError: null,
  aiSummary: null,
  aiError: null,
};

export const useReviewStore = create<ReviewState>()((set, get) => ({
  status: 'idle',
  errorMessage: null,
  branch: '',
  headHash: '',
  ...initialData,
  diffMode: 'unified',
  aiBusy: false,
  markBusy: false,

  reset: () => {
    loadEpoch++; diffEpoch++; badgeEpoch++;
    aiController?.abort(); aiController = null;
    checkpointBeforeMark = null;
    set({ status: 'idle', errorMessage: null, branch: '', headHash: '', ...initialData, aiBusy: false, markBusy: false });
  },

  /** 导航徽标专用轻量刷新:只查检查点与计数,不加载差异细节(refreshAll 高频调用)。 */
  refreshBadge: async (repoPath, branch, headHash) => {
    if (!repoPath || !branch || !/^[0-9a-f]{40,64}$/.test(headHash)) return;
    const epoch = ++badgeEpoch;
    try {
      const checkpoint = await reviewCheckpointService.get(repoPath, branch);
      if (epoch !== badgeEpoch) return;
      if (!checkpoint || checkpoint.hash === headHash) { set({ badgeCount: checkpoint ? 0 : null }); return; }
      const stale = !(await gitService.isAncestor(repoPath, checkpoint.hash, headHash));
      if (epoch !== badgeEpoch) return;
      if (stale) { set({ badgeCount: null }); return; }
      const count = await gitService.getRangeCommitCount(repoPath, checkpoint.hash, headHash);
      if (epoch === badgeEpoch) set({ badgeCount: count });
    } catch {
      if (epoch === badgeEpoch) set({ badgeCount: null });
    }
  },

  load: async (repoPath, branch, headHash) => {
    const epoch = ++loadEpoch;
    aiController?.abort(); aiController = null;
    set({ status: 'loading', errorMessage: null, branch, headHash, ...initialData, aiBusy: false, markBusy: false });
    try {
      const checkpoint = await reviewCheckpointService.get(repoPath, branch);
      if (epoch !== loadEpoch) return;
      if (!checkpoint) { set({ status: 'ready' }); return; }
      const stale = !(await gitService.isAncestor(repoPath, checkpoint.hash, headHash));
      if (epoch !== loadEpoch) return;
      if (stale) { set({ status: 'ready', checkpoint, stale: true }); return; }
      if (checkpoint.hash === headHash) { set({ status: 'ready', checkpoint, stale: false, badgeCount: 0 }); return; }
      const [range, patch] = await Promise.all([
        gitService.getCommitsInRange(repoPath, checkpoint.hash, headHash),
        gitService.getRangePatch(repoPath, checkpoint.hash, headHash, RISK_PATCH_CAP),
      ]);
      if (epoch !== loadEpoch) return;
      const summary = await gitService.getRangeDiffSummary(repoPath, checkpoint.hash, headHash);
      if (epoch !== loadEpoch) return;
      set({
        status: 'ready',
        checkpoint,
        stale: false,
        badgeCount: range.commits.length,
        commits: range.commits,
        linear: range.linear,
        truncated: range.truncated,
        rangeFiles: summary.files,
        insertions: summary.insertions,
        deletions: summary.deletions,
        riskFindings: computeRiskFindings(summary.files, patch),
        rangePatch: patch,
        target: { kind: 'net' },
        targetFiles: summary.files,
      });
    } catch (error: any) {
      if (epoch === loadEpoch) set({ status: 'error', errorMessage: error?.message ?? String(error) });
    }
  },

  setTarget: async (repoPath, target) => {
    const epoch = ++diffEpoch;
    // 净变更模式的文件清单就是范围摘要;单提交模式加载该提交的文件
    set({ target, targetFiles: target.kind === 'commit' ? [] : get().rangeFiles, selectedFile: null, diffLines: [], diffError: null, diffLoading: target.kind === 'commit' });
    if (target.kind === 'commit') {
      try {
        const files = await gitService.getCommitFiles(repoPath, target.hash);
        if (epoch === diffEpoch) set({ targetFiles: files, diffLoading: false });
      } catch (error: any) {
        if (epoch === diffEpoch) set({ targetFiles: [], diffLoading: false, diffError: error?.message ?? String(error) });
      }
    }
  },

  selectFile: async (repoPath, path) => {
    const { checkpoint, headHash, target, selectedFile } = get();
    if (!checkpoint || selectedFile === path) return;
    const epoch = ++diffEpoch;
    set({ selectedFile: path, diffLoading: true, diffError: null });
    try {
      const lines = target.kind === 'commit'
        ? await gitService.getCommitFileDiff(repoPath, target.hash, path)
        : await gitService.getRangeFileDiff(repoPath, checkpoint.hash, headHash, path);
      if (epoch === diffEpoch) set({ diffLines: lines, diffLoading: false });
    } catch (error: any) {
      if (epoch === diffEpoch) set({ diffLoading: false, diffError: error?.message ?? String(error) });
    }
  },

  setDiffMode: (mode) => set({ diffMode: mode }),

  markReviewed: async (repoPath, branch) => {
    const { checkpoint, headHash, markBusy } = get();
    if (markBusy) return;
    set({ markBusy: true });
    try {
      await reviewCheckpointService.set(repoPath, branch, headHash, checkpoint?.hash ?? null);
      checkpointBeforeMark = checkpoint;
      useToastStore.getState().addToast({
        type: 'success',
        title: tNow('review.markReviewedDone'),
        description: tNow('review.markReviewedDoneDesc'),
        action: { label: tNow('review.markUndo'), onClick: () => void get().undoMarkReviewed(repoPath, branch) },
      });
      await get().load(repoPath, branch, headHash);
    } catch (error: any) {
      toast.error(tNow('review.markFailed'), error?.message ?? String(error));
    } finally {
      set({ markBusy: false });
    }
  },

  undoMarkReviewed: async (repoPath, branch) => {
    const { headHash } = get();
    const previous = checkpointBeforeMark;
    if (!previous) return;
    try {
      await reviewCheckpointService.set(repoPath, branch, previous.hash, headHash);
      checkpointBeforeMark = null;
      toast.info(tNow('review.markUndone'));
      await get().load(repoPath, branch, headHash);
    } catch (error: any) {
      toast.error(tNow('review.markFailed'), error?.message ?? String(error));
    }
  },

  setCheckpoint: async (repoPath, branch, hash) => {
    const { checkpoint, headHash } = get();
    try {
      await reviewCheckpointService.set(repoPath, branch, hash, checkpoint?.hash ?? null);
      await get().load(repoPath, branch, headHash);
    } catch (error: any) {
      toast.error(tNow('review.baseFailed'), error?.message ?? String(error));
    }
  },

  requestAiSummary: async () => {
    const { commits, rangeFiles, rangePatch, truncated, aiBusy } = get();
    if (aiBusy) return;
    const { aiConfig, language } = useSettingsStore.getState();
    const controller = new AbortController();
    aiController = controller;
    set({ aiBusy: true, aiError: null });
    try {
      const summary = await summarizeReviewRange({
        commits: commits.map((commit) => ({ hash: commit.hash, subject: commit.subject, body: commit.body, authorName: commit.author.name })),
        files: rangeFiles,
        patch: rangePatch.slice(0, AI_PATCH_CAP),
        truncated,
      }, aiConfig, language, controller.signal);
      set({ aiSummary: summary, aiBusy: false });
    } catch (error: any) {
      if (controller.signal.aborted) { set({ aiBusy: false }); return; }
      set({ aiError: error?.message ?? String(error), aiBusy: false });
    }
  },

  dismissAiError: () => set({ aiError: null }),
}));

/** 提交行的 AI 参与判定(徽标展示用) */
export const isAiInvolved = (commit: GitCommit) => detectAiAuthorship(commit.body, commit.author.email);
