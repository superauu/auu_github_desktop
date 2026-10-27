import { useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Bot, Check, CheckCheck, ChevronRight, Copy, FileCheck2, FileCode2, GitMerge, Image as ImageIcon, Loader2, MessageSquare, RefreshCw, ScanEye, Sparkles, TriangleAlert, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorNotice } from '@/components/ui/ErrorNotice';
import { ModalSurface } from '@/components/ui/ModalSurface';
import { ScrollArea } from '@/components/ui/scroll-area';
import { VirtualRows } from '@/components/ui/VirtualRows';
import { ResizeHandle } from '@/components/ui/ResizeHandle';
import { DiffTools, highlightDiff } from '@/components/ui/DiffTools';
import { DiffFontControl } from '@/components/ui/DiffFontControl';
import { ImageDiffView } from '@/features/git/ImageDiffView';
import { HistoryEditorDialog } from '@/features/git/HistoryEditorDialog';
import { useI18n } from '@/i18n';
import { cn } from '@/utils/cn';
import { useRepoStore } from '@/stores/repoStore';
import { useReviewStore, isAiInvolved, type ReviewTarget } from '@/stores/reviewStore';
import { useReviewProgressStore, useReviewStorageStatus, progressKey, getRangeProgress } from '@/stores/reviewProgressStore';
import { useLayoutStore } from '@/stores/layoutStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useWorkspaceLayout } from '@/hooks/useWorkspaceLayout';
import { gitService } from '@/services/git/GitService';
import { isImagePath } from '@/services/git/ImageDiffService';
import type { GitCommit, GitFileChange } from '@/services/git/types';
import { computeSplitRows } from '@/utils/diffRows';
import { confirmAction } from '@/stores/confirmStore';
import { toast, useToastStore } from '@/stores/toastStore';
import { ReviewIssuesDialog, REVIEW_STATUS_KEYS, type ReviewIssue } from './ReviewIssuesDialog';
import { ReviewDiffText } from './ReviewDiffText';
import {
  buildReviewReport, commentStatus, isFileApproved, isHunkApproved, parseHunks, toggleFileApproval, toggleHunkApproval,
  type ReportFile, type ReviewApproval, type ReviewComment, type ReviewCommentStatus, type ReviewHunk, type ReviewRiskFinding,
} from './reviewLogic';

const RISK_LABEL: Record<ReviewRiskFinding['kind'], string> = {
  secret: 'review.riskSecret',
  envFile: 'review.riskEnv',
  massDeletion: 'review.riskMassDeletion',
  dependency: 'review.riskDependency',
  ci: 'review.riskCi',
  binary: 'review.riskBinary',
};

function RiskBadges({ findings }: { findings: ReviewRiskFinding[] }) {
  const { t } = useI18n();
  if (!findings.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1 min-w-0">
      {findings.map((finding) => (
        <Badge
          key={finding.kind}
          variant={finding.severity === 'high' ? 'destructive' : 'warning'}
          className="h-4 px-1.5 text-[12px] font-medium gap-1 shrink-0"
          title={finding.files.join('\n')}
        >
          <TriangleAlert className="h-3 w-3" />
          {t(RISK_LABEL[finding.kind])} ({finding.files.length})
        </Badge>
      ))}
    </div>
  );
}

function CommitRow({ commit, selected, aiSummary, onSelect, aiLabel }: {
  commit: GitCommit;
  selected: boolean;
  aiSummary?: string;
  onSelect: () => void;
  aiLabel: string;
}) {
  const ai = isAiInvolved(commit);
  return (
    <button
      data-list-row
      data-testid={`review-commit-${commit.hash}`}
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        'w-full text-left px-2 py-1.5 rounded-md transition-colors group',
        selected ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-accent/40',
      )}
    >
      <div className="flex items-center gap-1.5 min-w-0">
        {ai && <Badge variant="info" className="h-4 px-1 text-[12px] font-mono gap-0.5 shrink-0" title={aiLabel}><Bot className="h-3 w-3" />AI</Badge>}
        <span className="truncate text-xs flex-1">{commit.subject}</span>
      </div>
      <div className="flex items-center gap-1.5 min-w-0 mt-0.5">
        <code className="text-[12px] text-muted-foreground shrink-0">{commit.shortHash}</code>
        <span className="text-[12px] text-muted-foreground shrink-0">{commit.author.relativeDate}</span>
        <span className="text-[12px] text-muted-foreground/80 truncate min-w-0 flex-1">{aiSummary ?? ''}</span>
      </div>
    </button>
  );
}

export function ReviewView() {
  const { t } = useI18n();
  const { currentRepo, status } = useRepoStore(useShallow((state) => ({ currentRepo: state.currentRepo, status: state.status })));
  const review = useReviewStore(useShallow((state) => ({
    status: state.status, errorMessage: state.errorMessage, repoPath: state.repoPath, branch: state.branch, headHash: state.headHash,
    checkpoint: state.checkpoint, stale: state.stale, commits: state.commits, linear: state.linear, truncated: state.truncated,
    rangeFiles: state.rangeFiles, fileVersions: state.fileVersions, fileEvidence: state.fileEvidence, retainedFiles: state.retainedFiles,
    insertions: state.insertions, deletions: state.deletions, riskFindings: state.riskFindings,
    target: state.target, targetFiles: state.targetFiles, selectedFile: state.selectedFile,
    diffLines: state.diffLines, diffLoading: state.diffLoading, diffError: state.diffError, diffMode: state.diffMode,
    aiSummary: state.aiSummary, aiBusy: state.aiBusy, aiError: state.aiError, markBusy: state.markBusy,
  })));
  const { panels } = useWorkspaceLayout();
  const setChangesFileListWidth = useLayoutStore((state) => state.setChangesFileListWidth);
  const reviewFilesWidth = useLayoutStore((state) => state.reviewFilesWidth);
  const setReviewFilesWidth = useLayoutStore((state) => state.setReviewFilesWidth);

  const [tidyOpen, setTidyOpen] = useState(false);
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [commitsExpanded, setCommitsExpanded] = useState(false);
  const commitRecordsId = useId();
  const [diffQuery, setDiffQuery] = useState('');
  const [pickerCommits, setPickerCommits] = useState<GitCommit[]>([]);
  const [recentN, setRecentN] = useState(20);
  const [baseBusy, setBaseBusy] = useState(false);
  /** 变基失效后手动选择「重新选择基准」时,强制回到引导界面。 */
  const [forceBootstrap, setForceBootstrap] = useState(false);
  const diffFontSize = useSettingsStore((state) => state.diffFontSize);

  const repoPath = currentRepo?.path ?? '';
  const branch = status?.currentBranch ?? '';
  const headHash = status?.headOid ?? '';

  // ---- 分级审查:通过进度与注释 ----
  const scope = { baseHash: review.checkpoint?.hash ?? '', headHash: review.headHash, target: review.target.kind === 'net' ? 'net' : review.target.hash };
  const progressEntries = useReviewProgressStore((state) => state.entries);
  const progressEntry = progressEntries[progressKey(repoPath, branch, scope)];
  const rangeProgress = getRangeProgress(progressEntries, repoPath, branch, scope.baseHash, scope.headHash);
  const reportCommentCount = rangeProgress.reduce((sum, entry) => sum + entry.progress.comments.length, 0);
  const setProgress = useReviewProgressStore((state) => state.setProgress);
  const storageFailed = useReviewStorageStatus((state) => state.unavailable);
  const approval = progressEntry?.approval ?? { approvedFiles: [], approvedHunks: {} };
  const comments = progressEntry?.comments ?? [];
  /** 正在编辑的注释目标:path + 行范围(文件级两个值为 null);draft 为输入内容,编辑已有注释时带 id。 */
  const [commentEditor, setCommentEditor] = useState<{ path: string; startLine: number | null; endLine: number | null; draft: string; id?: string } | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [issuesOpen, setIssuesOpen] = useState(false);
  const [includeResolved, setIncludeResolved] = useState(false);
  const issues = rangeProgress.flatMap(({ target, progress }) => progress.comments.map((comment) => ({ target, comment })));
  const activeIssueCount = issues.filter(({ comment }) => commentStatus(comment) !== 'resolved').length;

  const isCurrentScope = () => {
    const state = useReviewStore.getState();
    return state.status === 'ready' && !state.stale && state.repoPath === repoPath && state.branch === branch
      && state.headHash === scope.headHash && state.checkpoint?.hash === scope.baseHash
      && (state.target.kind === 'net' ? 'net' : state.target.hash) === scope.target;
  };

  const progressWithEvidence = (path: string) => ({
    ...progressEntry,
    evidence: {
      ...progressEntry?.evidence,
      [path]: review.selectedFile === path && review.fileEvidence ? review.fileEvidence : progressEntry?.evidence?.[path] ?? {
        version: scope.target === 'net' ? review.fileVersions[path] ?? '' : `commit:${scope.target}:${path}`, hunks: [],
      },
    },
  });

  const selectedPath = review.selectedFile;
  const hunks = useMemo(() => parseHunks(review.diffLines), [review.diffLines]);
  const fileComments = useMemo(() => comments.filter((comment) => comment.path === selectedPath), [comments, selectedPath]);
  const fileApproved = selectedPath ? isFileApproved(approval, selectedPath) : false;
  const netApproval = progressEntries[progressKey(repoPath, branch, { ...scope, target: 'net' })]?.approval;
  const approvedCount = review.rangeFiles.filter((file) => netApproval && isFileApproved(netApproval, file.path)).length;

  const updateApproval = (next: typeof approval, path: string) => {
    if (!repoPath || !branch || !isCurrentScope() || review.diffLoading) return;
    const pending = { ...progressEntry?.pending };
    delete pending[path]; // 显式操作优先于尚未执行的跨版本迁移。
    setProgress(repoPath, branch, { ...progressWithEvidence(path), pending, approval: next, comments }, scope);
  };

  const onToggleHunk = (path: string, hunk: ReviewHunk) => {
    let next = toggleHunkApproval(approval, path, hunk.newStart);
    // 代码块全部通过后自动升级为文件通过
    if (!isFileApproved(next, path) && hunks.length > 0 && hunks.every((h) => isHunkApproved(next, path, h.newStart))) {
      next = { ...next, approvedFiles: [...next.approvedFiles, path] };
    }
    updateApproval(next, path);
  };

  const onToggleFile = (path: string) => {
    setCommentEditor(null);
    const willApprove = !isFileApproved(approval, path);
    let next = toggleFileApproval(approval, path);
    if (willApprove && selectedPath === path && hunks.length > 0) {
      // 把当前 diff 的全部代码块写入记录,保证后续单独取消某个代码块时可精确降级
      const current = next.approvedHunks[path] ?? [];
      next = { ...next, approvedHunks: { ...next.approvedHunks, [path]: [...new Set([...current, ...hunks.map((hunk) => hunk.newStart)])] } };
    } else if (!willApprove) {
      const { [path]: _cleared, ...rest } = next.approvedHunks;
      next = { ...next, approvedHunks: rest };
    }
    updateApproval(next, path);
  };

  /** 打开代码块注释编辑:已有注释则预填,否则新建(一个代码块一条)。 */
  const openHunkComment = (path: string, hunk: ReviewHunk) => {
    const existing = comments.find((comment) => comment.path === path && !comment.anchorStale && comment.startLine === hunk.newStart);
    setCommentEditor({
      path,
      startLine: hunk.newStart,
      endLine: hunk.newStart + Math.max(1, hunk.count) - 1,
      draft: existing?.text ?? '',
      id: existing?.id,
    });
  };

  const openFileComment = async (path: string) => {
    if (review.selectedFile !== path) await useReviewStore.getState().selectFile(repoPath, path);
    if (!isCurrentScope()) return;
    const existing = comments.find((comment) => comment.path === path && comment.startLine === null);
    setCommentEditor({ path, startLine: null, endLine: null, draft: existing?.text ?? '', id: existing?.id });
  };

  const saveComment = () => {
    if (!repoPath || !branch || !commentEditor || !isCurrentScope()) return;
    const text = commentEditor.draft.trim();
    if (!text) return;
    const id = commentEditor.id ?? crypto.randomUUID();
    const existing = comments.find((comment) => comment.id === id);
    const evidence = review.fileEvidence?.hunks.find((hunk) => hunk.startLine === commentEditor.startLine);
    const comment: ReviewComment = {
      ...existing, id, path: commentEditor.path, startLine: commentEditor.startLine, endLine: commentEditor.endLine, text, status: 'open',
      origin: existing?.origin ?? {
        headHash: scope.target === 'net' ? scope.headHash : scope.target,
        startLine: commentEditor.startLine, endLine: commentEditor.endLine,
        context: evidence?.context ?? review.diffLines.map((line) => line.content).join('\n').slice(0, 8000),
        fingerprint: evidence?.fingerprint,
      },
    };
    const next = comments.filter((item) => item.id !== id).concat(comment).sort((a, b) => a.path.localeCompare(b.path) || (a.startLine ?? 0) - (b.startLine ?? 0));
    setProgress(repoPath, branch, { ...progressWithEvidence(commentEditor.path), approval, comments: next }, scope);
    setCommentEditor(null);
  };

  const deleteComment = (id: string) => {
    if (!repoPath || !branch) return;
    setProgress(repoPath, branch, { ...progressEntry, approval, comments: comments.filter((item) => item.id !== id) }, scope);
  };

  const updateIssue = (issue: ReviewIssue, patch: Partial<Pick<ReviewComment, 'status' | 'text'>>) => {
    if (!isCurrentScope()) return;
    const issueScope = { ...scope, target: issue.target };
    const store = useReviewProgressStore.getState();
    const progress = store.getProgress(repoPath, branch, issueScope);
    store.setProgress(repoPath, branch, { ...progress, comments: progress.comments.map((comment) => comment.id === issue.comment.id ? { ...comment, ...patch } : comment) }, issueScope);
  };

  const bulkStatus = (selected: ReviewIssue[], status: ReviewCommentStatus) => {
    if (!isCurrentScope()) return;
    const range = { baseHash: scope.baseHash, headHash: scope.headHash };
    const changes = useReviewProgressStore.getState().setCommentStatuses(repoPath, branch, range,
      selected.map(({ target, comment }) => ({ target, id: comment.id })), status);
    if (!changes.length) return;
    useToastStore.getState().addToast({
      type: 'success', title: t('review.bulkDone').replace('{n}', String(changes.length)),
      action: { label: t('review.markUndo'), onClick: () => {
        const current = useReviewStore.getState();
        if (current.repoPath !== repoPath || current.branch !== branch || current.headHash !== range.headHash || current.checkpoint?.hash !== range.baseHash) {
          toast.warning(t('review.rangeChanged')); return;
        }
        useReviewProgressStore.getState().restoreCommentStatuses(repoPath, branch, range, changes);
      } },
    });
  };

  const openIssueDiff = async ({ target, comment }: ReviewIssue) => {
    const store = useReviewStore.getState();
    await store.setTarget(repoPath, target === 'net' ? { kind: 'net' } : { kind: 'commit', hash: target });
    const current = useReviewStore.getState();
    if (current.repoPath !== repoPath || current.branch !== branch || current.headHash !== scope.headHash
      || current.checkpoint?.hash !== scope.baseHash || (current.target.kind === 'net' ? 'net' : current.target.hash) !== target) return;
    if (!current.targetFiles.some((file) => file.path === comment.path)) {
      toast.info(t('review.issueFileGone'));
      return;
    }
    await useReviewStore.getState().selectFile(repoPath, comment.path);
    setIssuesOpen(false);
  };

  const buildReportText = () => {
    const files = new Map<string, ReportFile>();
    for (const entry of rangeProgress) {
      const source = entry.target === 'net' ? t('review.netChanges') : t('review.reportCommit').replace('{hash}', entry.target);
      for (const comment of entry.progress.comments) {
        if (!includeResolved && commentStatus(comment) === 'resolved') continue;
        const file = files.get(comment.path) ?? { path: comment.path, lines: [] };
        const location = comment.startLine === null
          ? t('review.reportWholeFile')
          : t('review.reportLines').replace('{a}', String(comment.startLine)).replace('{b}', String(comment.endLine ?? comment.startLine));
        const original = comment.origin;
        const provenance = original ? `${t('review.issueOriginal').replace('{hash}', original.headHash.slice(0, 10))} · ${original.startLine === null ? t('review.reportWholeFile') : t('review.reportLines').replace('{a}', String(original.startLine)).replace('{b}', String(original.endLine ?? original.startLine))}` : location;
        const movedOrigin = original && (original.headHash !== (entry.target === 'net' ? scope.headHash : entry.target) || original.startLine !== comment.startLine);
        const position = comment.anchorStale ? provenance : `${location}${movedOrigin ? ` · ${provenance}` : ''}`;
        file.lines.push({ location: `${source} · ${position} · ${t(REVIEW_STATUS_KEYS[commentStatus(comment)])}`, text: comment.text, context: original?.context });
        files.set(comment.path, file);
      }
    }
    const reportFiles = [...files.values()].sort((a, b) => a.path.localeCompare(b.path));
    return buildReviewReport([
      t('review.reportTitle'),
      t('review.reportIntro')
        .replace('{base}', review.checkpoint?.hash.slice(0, 10) ?? '')
        .replace('{head}', review.headHash.slice(0, 10))
        .replace('{n}', String(reportFiles.reduce((sum, file) => sum + file.lines.length, 0))),
      t('review.reportContextHint'),
    ], reportFiles);
  };

  const copyReport = async () => {
    const text = buildReportText();
    if (!text) { toast.warning(t('review.reportEmpty')); return; }
    try { await navigator.clipboard.writeText(text); toast.success(t('review.reportCopied')); }
    catch (error: any) { toast.error(t('review.reportCopyFailed'), error?.message ?? String(error)); }
  };

  const handleMarkReviewed = async () => {
    if (!repoPath || !branch) return;
    const total = review.rangeFiles.length;
    if (activeIssueCount > 0 || (approvedCount > 0 && approvedCount < total)) {
      const ok = await confirmAction({
        title: t('review.markReviewed'),
        description: activeIssueCount > 0 ? t('review.markWithIssues').replace('{n}', String(activeIssueCount)) : t('review.markPartial').replace('{a}', String(approvedCount)).replace('{b}', String(total)),
      });
      if (!ok) return;
    }
    const latest = useReviewStore.getState();
    if (latest.repoPath !== repoPath || latest.branch !== branch || latest.headHash !== scope.headHash || latest.checkpoint?.hash !== scope.baseHash) {
      toast.warning(t('review.rangeChanged'));
      return;
    }
    await useReviewStore.getState().markReviewed(repoPath, branch);
    setCommentEditor(null);
    setReportOpen(false);
  };

  const selectTargetSafe = (target: ReviewTarget) => {
    setCommentEditor(null);
    if (repoPath) void useReviewStore.getState().setTarget(repoPath, target);
  };

  const selectFileSafe = (path: string) => {
    setCommentEditor(null);
    if (repoPath) void useReviewStore.getState().selectFile(repoPath, path);
  };

  useEffect(() => {
    if (!repoPath || !branch || !headHash) return;
    const state = useReviewStore.getState();
    if (state.status === 'ready' && state.repoPath === repoPath && state.branch === branch && state.headHash === headHash) return;
    void state.load(repoPath, branch, headHash);
  }, [repoPath, branch, headHash]);

  // 版本或仓库变化时不能把旧行号的草稿写入新范围。
  useEffect(() => { setCommentEditor(null); }, [repoPath, branch, scope.baseHash, scope.headHash, scope.target]);
  // 从意见跳转到单提交时,同步展开其辅助导航。
  useEffect(() => { if (scope.target !== 'net') setCommitsExpanded(true); }, [scope.target]);

  // 无检查点时加载基准选择用的提交清单
  useEffect(() => {
    if (!repoPath || review.status !== 'ready' || review.checkpoint) return;
    let active = true;
    gitService.getCommits(repoPath, 50).then((commits) => { if (active) setPickerCommits(commits); }).catch(() => {});
    return () => { active = false; };
  }, [repoPath, review.status, review.checkpoint]);

  // AI 摘要生成成功后自动展开
  useEffect(() => { if (review.aiSummary) setAiPanelOpen(true); }, [review.aiSummary]);

  // 基准建立成功后退出引导界面
  useEffect(() => { if (review.checkpoint) setForceBootstrap(false); }, [review.checkpoint]);

  const aiByHash = useMemo(() => new Map((review.aiSummary?.commits ?? []).map((entry) => [entry.hash, entry.summary])), [review.aiSummary]);
  const target = review.target;
  const selectedCommit = target.kind === 'commit' ? review.commits.find((commit) => commit.hash === target.hash) ?? null : null;
  const selectedFileRecord = review.targetFiles.find((file) => file.path === review.selectedFile) ?? null;
  const splitRows = useMemo(() => computeSplitRows(review.diffLines), [review.diffLines]);
  const targetTitle = review.target.kind === 'net'
    ? t('review.netChanges')
    : selectedCommit?.subject ?? review.target.hash.slice(0, 8);

  const applyBaseline = async (hash: string) => {
    if (!repoPath || !branch || baseBusy) return;
    setBaseBusy(true);
    try { await useReviewStore.getState().setCheckpoint(repoPath, branch, hash); }
    finally { setBaseBusy(false); }
  };

  const applyUpstreamBaseline = async () => {
    if (!repoPath || !status?.trackingBranch) return;
    setBaseBusy(true);
    try {
      const hash = await gitService.getBranchCommitHash(repoPath, status.trackingBranch);
      if (hash) await useReviewStore.getState().setCheckpoint(repoPath, branch, hash);
    } finally { setBaseBusy(false); }
  };

  const applyRecentBaseline = async () => {
    if (!repoPath) return;
    setBaseBusy(true);
    try {
      const hash = await gitService.getBranchCommitHash(repoPath, `HEAD~${recentN}`);
      if (hash) await useReviewStore.getState().setCheckpoint(repoPath, branch, hash);
    } catch { /* 提交数不足时保持当前状态 */ }
    finally { setBaseBusy(false); }
  };

  const renderDiffBody = () => {
    if (review.selectedFile && selectedFileRecord && isImagePath(review.selectedFile)) {
      const isNet = review.target.kind === 'net';
      const before = selectedFileRecord.status === 'added' ? 'EMPTY' : isNet ? review.checkpoint!.hash : selectedCommit?.parents[0] ?? 'EMPTY';
      const after = selectedFileRecord.status === 'deleted' ? 'EMPTY' : isNet ? review.headHash : review.target.kind === 'commit' ? review.target.hash : review.headHash;
      return <ImageDiffView key={`${review.selectedFile}-${before}-${after}`} repoPath={repoPath} path={review.selectedFile} beforePath={selectedFileRecord.oldPath} before={before} after={after} />;
    }
    if (review.diffLoading) return <p role="status" className="p-6 text-muted-foreground animate-pulse">{t('common.loading')}</p>;
    if (review.diffError) return (
      <div role="alert" className="p-6 space-y-3">
        <ErrorNotice error={review.diffError} />
        <Button variant="outline" size="sm" data-testid="review-diff-retry" onClick={() => {
          if (review.selectedFile) void useReviewStore.getState().selectFile(repoPath, review.selectedFile);
          else void useReviewStore.getState().setTarget(repoPath, review.target);
        }}><RefreshCw className="h-3.5 w-3.5" />{t('composer.retry')}</Button>
      </div>
    );
    if (!review.selectedFile) return (
      <div className="py-24 text-center space-y-2 text-muted-foreground select-none">
        <ScanEye className="h-8 w-8 mx-auto text-muted-foreground/30" />
        <div className="text-xs">{t('review.pickFile')}</div>
      </div>
    );
    if (review.diffLines.length === 0) return (
      <div className="py-24 text-center space-y-2 text-muted-foreground select-none">
        <div className="text-xs">{t('review.emptyDiff')}</div>
      </div>
    );
    return review.diffMode === 'split' ? (
      <VirtualRows items={splitRows} rowHeight={24} renderRow={(row, idx) => row.isHeader ? (() => {
        const hunk = hunks.find((item) => item.index === row.sourceIndex) ?? null;
        const hunkComments = hunk && selectedPath ? comments.filter((comment) => comment.path === selectedPath && !comment.anchorStale && comment.startLine === hunk.newStart) : [];
        return (
          <div key={idx} className="diff-line-header px-4 py-1 font-semibold select-none font-mono text-[12px] w-full flex items-center justify-between gap-2">
            <span className="truncate">{row.headerContent}</span>
            {hunk && selectedPath && (
              <HunkActions
                path={selectedPath}
                hunk={hunk}
                approved={isHunkApproved(approval, selectedPath, hunk.newStart)}
                commentCount={hunkComments.length}
                onToggle={onToggleHunk}
                onComment={openHunkComment}
                approveTitle={t(review.target.kind === 'net' ? 'review.approveHunk' : 'review.commitViewHunk')}
                commentTitle={t('review.commentHunk')}
              />
            )}
          </div>
        );
      })() : (
        <div key={idx} className="grid grid-cols-2 divide-x divide-border/60 hover:bg-accent/40 dark:hover:bg-white/3 transition-colors">
          {([row.left, row.right] as const).map((side, columnIndex) => {
            const isDel = side?.type === 'delete';
            const isAdd = side?.type === 'add';
            return (
              <div key={columnIndex} className={cn(
                'flex items-stretch overflow-hidden min-w-0 border-l-2',
                isDel || isAdd ? (isDel ? 'diff-line-del font-medium dark:font-normal' : 'diff-line-add font-medium dark:font-normal') : side ? 'border-transparent text-foreground/85' : 'border-transparent bg-muted/15 opacity-40 select-none',
              )}>
                <div className="w-10 px-2 text-right text-muted-foreground select-none shrink-0 font-mono text-[12px] bg-muted/40 dark:bg-background/20 border-r border-border/40">{side?.lineNo ?? ''}</div>
                <div data-diff-content className="px-2.5 whitespace-pre font-mono flex-1 overflow-x-auto">{highlightDiff(side?.content || '', diffQuery)}</div>
              </div>
            );
          })}
        </div>
      )} />
    ) : (
      <VirtualRows items={review.diffLines} contentWidth rowHeight={24} renderRow={(line, idx) => {
        const hunk = line.type === 'header' ? hunks.find((item) => item.index === idx) ?? null : null;
        const hunkComments = hunk && selectedPath ? comments.filter((comment) => comment.path === selectedPath && !comment.anchorStale && comment.startLine === hunk.newStart) : [];
        return (
        <div key={idx} className={cn(
          'flex items-stretch hover:bg-accent/40 dark:hover:bg-white/3 transition-colors border-l-2',
          line.type === 'add' ? 'diff-line-add font-medium dark:font-normal' : line.type === 'delete' ? 'diff-line-del font-medium dark:font-normal' : line.type === 'header' ? 'diff-line-header px-4 py-1 font-semibold select-none font-mono text-[12px]' : 'border-transparent text-foreground/85',
        )}>
          {line.type !== 'header' && (<>
            <div className="w-10 px-2 text-right text-muted-foreground select-none shrink-0 font-mono text-[12px] bg-muted/40 dark:bg-background/20">{line.oldNo ?? ''}</div>
            <div className="w-10 px-2 text-right text-muted-foreground select-none shrink-0 font-mono text-[12px] border-r border-border/60 dark:border-border/20 bg-muted/40 dark:bg-background/20">{line.newNo ?? ''}</div>
            <div data-diff-content className="px-3 whitespace-pre font-mono flex-1">{highlightDiff(line.content, diffQuery)}</div>
          </>)}
          {line.type === 'header' && (
            <>
              <span className="truncate flex-1">{line.content}</span>
              {hunk && selectedPath && (
                <HunkActions
                  path={selectedPath}
                  hunk={hunk}
                  approved={isHunkApproved(approval, selectedPath, hunk.newStart)}
                  commentCount={hunkComments.length}
                  onToggle={onToggleHunk}
                  onComment={openHunkComment}
                  approveTitle={t(review.target.kind === 'net' ? 'review.approveHunk' : 'review.commitViewHunk')}
                  commentTitle={t('review.commentHunk')}
                />
              )}
            </>
          )}
        </div>
        );
      }} />
    );
  };

  // ---------- 引导:尚未建立检查点(或失效后手动重选) ----------
  if (review.status === 'ready' && (!review.checkpoint || forceBootstrap)) {
    return (
      <div className="flex-1 h-full flex flex-col overflow-hidden select-none bg-transparent">
        <ReviewHeader />
        <div className="flex-1 min-h-0 flex items-center justify-center p-6">
          <div className="max-w-md w-full space-y-4 text-center">
            <ScanEye className="h-10 w-10 mx-auto text-primary/60" />
            <div>
              <h2 className="font-semibold">{t('review.bootstrapTitle')}</h2>
              <p className="text-sm text-muted-foreground mt-1">{t('review.bootstrapDesc')}</p>
            </div>
            <div className="space-y-2 text-left">
              <button
                disabled={!status?.trackingBranch || baseBusy}
                onClick={() => void applyUpstreamBaseline()}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm hover:bg-accent/40 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <span className="block font-medium">{t('review.baseUpstream')}</span>
                <span className="block text-[12px] text-muted-foreground truncate">{status?.trackingBranch ? `${status.trackingBranch}` : t('review.baseUpstreamNone')}</span>
              </button>
              <div className="rounded-lg border border-border px-3 py-2 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{t('review.baseRecent')}</span>
                  <select value={recentN} onChange={(event) => setRecentN(Number(event.target.value))} className="border border-input bg-background rounded p-1 text-[12px]" aria-label={t('review.baseRecent')}>
                    {[10, 20, 50].map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
                <Button size="xs" variant="outline" className="mt-2 w-full" disabled={baseBusy} onClick={() => void applyRecentBaseline()}>{t('review.bootstrapApply')}</Button>
              </div>
              <div className="rounded-lg border border-border px-3 py-2 text-sm">
                <span className="block font-medium mb-2">{t('review.basePick')}</span>
                <select
                  value=""
                  disabled={baseBusy || pickerCommits.length === 0}
                  onChange={(event) => { if (event.target.value) void applyBaseline(event.target.value); }}
                  className="w-full border border-input bg-background rounded p-2 text-[12px]"
                  aria-label={t('review.basePick')}
                >
                  <option value="">{pickerCommits.length ? t('review.basePickPlaceholder') : t('common.loading')}</option>
                  {pickerCommits.map((commit) => <option key={commit.hash} value={commit.hash}>{commit.shortHash} {commit.subject}</option>)}
                </select>
              </div>
            </div>
            {baseBusy && <p role="status" className="flex items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />{t('common.loading')}</p>}
          </div>
        </div>
      </div>
    );
  }

  // ---------- 主视图 ----------
  return (
    <div className="flex-1 h-full flex flex-col overflow-hidden select-none bg-transparent">
      <ReviewHeader>
        {review.checkpoint && !review.stale && (
          <>
            <Badge variant="outline" className="h-5 px-1.5 text-[12px] font-mono shrink-0" title={t('review.baseCurrent').replace('{hash}', review.checkpoint.hash)}>
              {t('review.since').replace('{hash}', review.checkpoint.hash.slice(0, 8))}
            </Badge>
            <span className="text-[12px] text-muted-foreground shrink-0">{t('review.pendingCount').replace('{n}', String(review.commits.length))}</span>
            <span className="text-[12px] font-mono text-muted-foreground shrink-0"><span className="text-git-added">+{review.insertions}</span> <span className="text-git-deleted">-{review.deletions}</span></span>
            <RiskBadges findings={review.riskFindings} />
          </>
        )}
        <div className="ml-auto flex items-center gap-1.5 shrink-0">
          <Button
            variant="ghost"
            size="xs"
            disabled={review.aiBusy}
            onClick={() => {
              if (review.aiSummary) { setAiPanelOpen((open) => !open); return; }
              if (repoPath) void useReviewStore.getState().requestAiSummary();
            }}
            className="gap-1.5"
            title={t('review.aiSummary')}
          >
            {review.aiBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 text-primary" />}
            <span>{review.aiBusy ? t('common.loading') : t('review.aiSummary')}</span>
          </Button>
          <Button
            variant="ghost"
            size="xs"
            disabled={!review.checkpoint || review.stale || !review.linear || review.commits.length === 0}
            onClick={() => setTidyOpen(true)}
            className="gap-1.5"
            title={!review.linear ? t('review.linearWarn') : t('review.tidy')}
          >
            <GitMerge className={cn('h-3.5 w-3.5', !review.linear && 'text-amber-500')} />
            <span>{t('review.tidy')}</span>
          </Button>
          <Button
            variant="ghost"
            size="xs"
            data-testid="review-issues-open"
            disabled={reportCommentCount === 0 || review.status !== 'ready' || review.stale}
            onClick={() => setIssuesOpen(true)}
            className="gap-1.5"
          >
            <MessageSquare className="h-3.5 w-3.5" />
            <span>{t('review.issuesButton').replace('{n}', String(activeIssueCount))}</span>
          </Button>
          <Button
            variant="ghost"
            size="xs"
            disabled={!review.checkpoint || review.stale || reportCommentCount === 0}
            onClick={() => setReportOpen(true)}
            className="gap-1.5"
            title={t('review.reportTitle')}
          >
            <MessageSquare className="h-3.5 w-3.5" />
            <span>{t('review.reportButton').replace('{n}', String(reportCommentCount))}</span>
          </Button>
          <Button
            variant="default"
            size="xs"
            data-testid="review-complete-round"
            disabled={!review.checkpoint || review.stale || review.commits.length === 0 || review.markBusy}
            onClick={() => void handleMarkReviewed()}
            className="gap-1.5"
            title={t('review.completeHint')}
          >
            {review.markBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCheck className="h-3.5 w-3.5" />}
            <span>{t('review.markReviewed')}</span>
          </Button>
        </div>
      </ReviewHeader>

      {review.status === 'ready' && review.checkpoint && !review.stale && review.commits.length > 0 && (
        <div className="px-3 py-2 border-b border-border bg-primary/5 flex flex-wrap items-center gap-x-3 gap-y-1 shrink-0">
          <p data-testid="review-round-progress" className="text-xs font-medium" title={t('review.progressTitle')}>
            {t('review.progress').replace('{a}', String(approvedCount)).replace('{b}', String(review.rangeFiles.length))}
          </p>
          <p className="text-xs text-muted-foreground flex-1 min-w-48">{t('review.roundHint')}</p>
          {review.target.kind === 'commit' && <Button size="xs" variant="outline" data-testid="review-return-final" onClick={() => selectTargetSafe({ kind: 'net' })}>{t('review.returnFinal')}</Button>}
        </div>
      )}
      {storageFailed && (
        <div role="status" className="mx-3 mt-2 p-3 rounded-lg border border-amber-500/40 bg-amber-500/10 flex items-center gap-3 shrink-0 text-xs">
          <p className="flex-1 min-w-0">{t('review.progressNotSaved')}</p>
          <Button variant="outline" size="xs" data-testid="review-progress-retry-save" onClick={() => {
            if (useReviewProgressStore.getState().retrySave()) toast.success(t('review.progressSaved'));
            else toast.warning(t('review.progressNotSaved'));
          }}>{t('review.retrySave')}</Button>
        </div>
      )}
      {review.status === 'loading' && <div className="flex-1 flex items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>}
      {review.status === 'ready' && review.retainedFiles > 0 && <p role="status" className="px-3 py-1.5 text-xs text-emerald-600 dark:text-emerald-300 border-b border-border">{t('review.incrementalKept').replace('{n}', String(review.retainedFiles))}</p>}
      {review.status === 'error' && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6">
          <ErrorNotice error={review.errorMessage ?? ''} />
          <Button variant="outline" size="sm" onClick={() => repoPath && void useReviewStore.getState().load(repoPath, branch, headHash)}><RefreshCw className="h-3.5 w-3.5" />{t('composer.retry')}</Button>
        </div>
      )}

      {review.checkpoint && review.stale && review.status === 'ready' && (
        <div role="status" className="mx-3 mt-2 rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-300 p-3 text-sm space-y-2 shrink-0">
          <p className="font-medium">{t('review.staleTitle')}</p>
          <p className="text-[12px] opacity-90">{t('review.staleDesc')}</p>
          <div className="flex gap-2">
            <Button size="xs" variant="outline" disabled={baseBusy} onClick={() => void applyBaseline(review.headHash)}>{t('review.staleRebuild')}</Button>
            <Button size="xs" variant="ghost" disabled={baseBusy} onClick={() => setForceBootstrap(true)}>{t('review.stalePick')}</Button>
          </div>
        </div>
      )}

      {review.checkpoint && !review.stale && review.status === 'ready' && (
        review.commits.length === 0 ? (
          <div className="flex-1 min-h-0">
            <EmptyState variant="check" title={t('review.emptyTitle')} desc={t('review.emptyDesc')} className="py-20" />
          </div>
        ) : (
          <div className="flex-1 min-h-0 flex overflow-hidden">
            {/* 最终改动为主入口,提交记录是可折叠的辅助导航。 */}
            <div style={{ width: panels.files }} className="glass-file-list border-r border-border flex flex-col shrink-0 h-full overflow-hidden">
              <div className="p-2 shrink-0">
                  <button
                    data-testid="review-final-changes"
                    aria-pressed={review.target.kind === 'net'}
                    onClick={() => selectTargetSafe({ kind: 'net' })}
                    className={cn(
                      'w-full text-left px-2 py-2 rounded-md border transition-colors',
                      review.target.kind === 'net' ? 'border-primary/40 bg-primary/10 text-foreground' : 'border-border text-muted-foreground hover:text-foreground hover:bg-accent/40',
                    )}
                  >
                    <div className="text-xs font-semibold flex items-center gap-1.5"><ScanEye className="h-3.5 w-3.5 text-primary shrink-0" />{t('review.netChanges')}</div>
                    <p className="text-xs text-muted-foreground mt-1">{t('review.finalChangesHint').replace('{n}', String(review.commits.length))}</p>
                    <div className="text-[12px] font-mono text-muted-foreground mt-0.5">
                      <span className="text-git-added">+{review.insertions}</span> <span className="text-git-deleted">-{review.deletions}</span> · {t('review.statsFiles').replace('{n}', String(review.rangeFiles.length))}
                    </div>
                  </button>
              </div>
              <button type="button" data-testid="review-commits-toggle" aria-expanded={commitsExpanded} aria-controls={commitRecordsId} onClick={() => setCommitsExpanded((open) => !open)} className="px-3 py-2 border-y border-border flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground shrink-0">
                <ChevronRight className={cn('h-3 w-3 transition-transform', commitsExpanded && 'rotate-90')} aria-hidden="true" />
                <span className="font-medium">{t('review.pendingTitle')} ({review.commits.length})</span>
                <span className="ml-auto text-[12px]">{t('review.commitsOptional')}</span>
                {!review.linear && <Badge variant="warning" className="h-4 px-1 text-[12px] shrink-0" title={t('review.linearWarn')}><GitMerge className="h-3 w-3" /></Badge>}
              </button>
              {review.truncated && <p role="status" className="px-3 py-1 text-[12px] text-amber-600 dark:text-amber-300 border-b border-border">{t('review.truncatedWarn').replace('{n}', String(review.commits.length))}</p>}
              <div id={commitRecordsId} hidden={!commitsExpanded} className={cn('flex-1 min-h-0', commitsExpanded ? 'flex flex-col' : 'hidden')}>
                {commitsExpanded && <>
                <p className="px-3 py-2 text-xs text-muted-foreground shrink-0">{t('review.commitRecordsHint')}</p>
                <ScrollArea className="flex-1 min-h-0 p-2 pt-0">
                <div role="list" aria-label={t('review.pendingTitle')} className="space-y-1">
                  <VirtualRows
                    items={review.commits}
                    rowHeight={44}
                    renderRow={(commit) => (
                      <CommitRow
                        commit={commit}
                        selected={review.target.kind === 'commit' && review.target.hash === commit.hash}
                        aiSummary={aiByHash.get(commit.hash)}
                        aiLabel={t('review.aiBadge')}
                        onSelect={() => selectTargetSafe({ kind: 'commit', hash: commit.hash })}
                      />
                    )}
                  />
                </div>
                </ScrollArea>
                </>}
              </div>
            </div>
            <ResizeHandle
              currentSize={panels.files}
              onSizeChange={setChangesFileListWidth}
              minSize={200}
              maxSize={460}
              defaultSize={useLayoutStore.getState().changesFileListWidth}
            />

            {/* 差异主区:文件面板(待审/已通过分组)+ diff 区 */}
            <div className="flex-1 min-w-0 flex overflow-hidden">
              <div style={{ width: reviewFilesWidth }} className="glass-file-list border-r border-border flex flex-col shrink-0 h-full overflow-hidden">
                <ReviewFilePanel
                  commitView={review.target.kind === 'commit'}
                  files={review.targetFiles}
                  approval={approval}
                  comments={comments}
                  selectedFile={review.selectedFile}
                  onOpenFile={selectFileSafe}
                  onToggleFile={onToggleFile}
                  onFileComment={openFileComment}
                />
              </div>
              <ResizeHandle
                currentSize={reviewFilesWidth}
                onSizeChange={setReviewFilesWidth}
                minSize={170}
                maxSize={420}
                defaultSize={useLayoutStore.getState().reviewFilesWidth}
              />
              <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
              <div className="h-9 px-3 border-b border-border flex items-center gap-2 shrink-0 overflow-x-clip">
                <span className="text-xs font-medium truncate" title={targetTitle}>{targetTitle}</span>
                {review.selectedFile && <span className="text-[12px] text-muted-foreground truncate" title={review.selectedFile}>{review.selectedFile}</span>}
                <div className="ml-auto flex items-center gap-1 shrink-0">
                  {review.selectedFile && !isImagePath(review.selectedFile) && (
                    <>
                      <Button
                        variant="ghost"
                        size="xs"
                        data-testid="review-file-approve-current"
                        aria-pressed={fileApproved}
                        onClick={() => onToggleFile(review.selectedFile!)}
                        className={cn('gap-1', fileApproved && 'text-emerald-600 dark:text-emerald-300')}
                        title={review.target.kind === 'commit' ? t(fileApproved ? 'review.commitUnviewFile' : 'review.commitViewFile') : t(fileApproved ? 'review.unapproveFile' : 'review.approveFile')}
                      >
                        <FileCheck2 className="h-3.5 w-3.5" />
                        <span>{review.target.kind === 'commit' ? t(fileApproved ? 'review.commitFileViewed' : 'review.commitViewFile') : t(fileApproved ? 'review.fileApproved' : 'review.approveFile')}</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={() => openFileComment(review.selectedFile!)}
                        className="gap-1"
                        title={t('review.commentFile')}
                      >
                        <MessageSquare className="h-3.5 w-3.5" />
                        <span>{t('review.commentFile')}</span>
                      </Button>
                    </>
                  )}
                  <div className="glass-segmented flex items-center">
                    <button
                      aria-pressed={review.diffMode === 'unified'}
                      onClick={() => useReviewStore.getState().setDiffMode('unified')}
                      className={cn(
                        'px-2 py-0.5 rounded text-[12px] font-medium transition-colors',
                        review.diffMode === 'unified' ? 'bg-accent text-accent-foreground shadow-2xs font-semibold' : 'text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {t('diff.unified')}
                    </button>
                    <button
                      aria-pressed={review.diffMode === 'split'}
                      onClick={() => useReviewStore.getState().setDiffMode('split')}
                      className={cn(
                        'px-2 py-0.5 rounded text-[12px] font-medium transition-colors',
                        review.diffMode === 'split' ? 'bg-accent text-accent-foreground shadow-2xs font-semibold' : 'text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {t('diff.split')}
                    </button>
                  </div>
                  <DiffFontControl />
                </div>
              </div>
              {review.target.kind === 'commit' && <p data-testid="review-commit-view-hint" className="px-3 py-2 text-xs text-muted-foreground border-b border-border shrink-0">{t('review.commitViewHint')}</p>}
              <DiffTools query={diffQuery} onQueryChange={setDiffQuery} contents={review.diffLines.map((line) => line.content)} targetId="review-diff" />
              {commentEditor && (
                <div className="px-3 py-2 border-b border-border space-y-1.5 shrink-0" role="form" aria-label={t('review.commentEditor')}>
                  <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
                    <MessageSquare className="h-3 w-3 text-primary shrink-0" />
                    <span className="truncate" title={commentEditor.path}>
                      {commentEditor.path}
                      {' · '}
                      {commentEditor.startLine === null
                        ? t('review.reportWholeFile')
                        : t('review.reportLines').replace('{a}', String(commentEditor.startLine)).replace('{b}', String(commentEditor.endLine ?? commentEditor.startLine))}
                    </span>
                    <Button variant="ghost" size="icon" className="ml-auto h-5 w-5" aria-label={t('common.close')} onClick={() => setCommentEditor(null)}><X className="h-3 w-3" /></Button>
                  </div>
                  <textarea
                    rows={3}
                    value={commentEditor.draft}
                    onChange={(event) => setCommentEditor({ ...commentEditor, draft: event.target.value })}
                    placeholder={t('review.commentPlaceholder')}
                    aria-label={t('review.commentPlaceholder')}
                    className="w-full rounded-md border border-input bg-background p-2 text-[13px] leading-relaxed font-sans"
                  />
                  <div className="flex justify-end gap-1.5">
                    <Button variant="outline" size="xs" onClick={() => setCommentEditor(null)}>{t('common.cancel')}</Button>
                    <Button size="xs" disabled={!commentEditor.draft.trim()} onClick={saveComment} data-testid="review-comment-save">{commentEditor.id ? t('review.commentUpdate') : t('review.commentSave')}</Button>
                  </div>
                </div>
              )}
              {!commentEditor && selectedPath && fileComments.length > 0 && (
                <div className="px-3 py-1.5 border-b border-border flex items-center gap-1.5 shrink-0 overflow-x-auto" role="list" aria-label={t('review.fileComments')}>
                  <MessageSquare className="h-3 w-3 text-primary shrink-0" />
                  {fileComments.map((comment) => (
                    <span key={comment.id} className="flex items-center gap-1 h-5 px-1.5 rounded border border-primary/40 bg-primary/10 text-[12px] shrink-0 max-w-64" role="listitem">
                      <button type="button" className="truncate text-left" title={comment.text} onClick={() => setIssuesOpen(true)}>
                        {t(REVIEW_STATUS_KEYS[commentStatus(comment)])}{' · '}
                        {comment.startLine === null ? t('review.reportWholeFile') : t('review.reportLines').replace('{a}', String(comment.startLine)).replace('{b}', String(comment.endLine ?? comment.startLine))}
                        {' · '}
                        {comment.text}
                      </button>
                      <button type="button" aria-label={t('review.commentDelete')} onClick={() => deleteComment(comment.id)} className="text-muted-foreground hover:text-destructive shrink-0"><X className="h-3 w-3" /></button>
                    </span>
                  ))}
                </div>
              )}
              {review.aiSummary && aiPanelOpen && (
                <div className="px-3 py-2 border-b border-border text-sm space-y-1 shrink-0" role="region" aria-label={t('review.aiSummary')}>
                  <div className="flex items-center gap-1.5 font-medium"><Sparkles className="h-3.5 w-3.5 text-primary" />{t('review.aiOverview')}</div>
                  <p className="text-[13px] text-muted-foreground whitespace-pre-wrap leading-relaxed">{review.aiSummary.overview}</p>
                </div>
              )}
              {review.aiError && (
                <div role="alert" className="px-3 py-1.5 border-b border-border flex items-center gap-2 text-[12px] text-destructive shrink-0">
                  <span className="flex-1">{review.aiError}</span>
                  <Button variant="ghost" size="xs" onClick={() => repoPath && void useReviewStore.getState().requestAiSummary()}>{t('composer.retry')}</Button>
                </div>
              )}
              <div id="review-diff" data-text-context style={{ fontSize: diffFontSize }} className="glass-editor flex-1 overflow-auto font-mono leading-relaxed text-foreground select-text">
                {renderDiffBody()}
              </div>
              </div>
            </div>
          </div>
        )
      )}

      {reportOpen && (
        <ModalSurface label={t('review.reportTitle')} onDismiss={() => setReportOpen(false)} className="fixed inset-0 z-50 bg-background/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-2xl max-h-[85dvh] min-h-0 flex flex-col gap-3 overflow-hidden bg-card border border-border rounded-xl shadow-2xl p-5">
            <header className="flex items-center justify-between shrink-0">
              <h2 className="font-semibold flex items-center gap-2"><MessageSquare className="h-4 w-4 text-primary" />{t('review.reportTitle')}</h2>
              <Button variant="ghost" size="icon" aria-label={t('common.close')} onClick={() => setReportOpen(false)}><X className="w-4 h-4" /></Button>
            </header>
            <p className="text-sm text-muted-foreground shrink-0">{t('review.reportHint')}</p>
            <label className="flex items-center gap-2 text-xs text-muted-foreground shrink-0"><input type="checkbox" checked={includeResolved} onChange={(event) => setIncludeResolved(event.target.checked)} />{t('review.reportIncludeResolved')}</label>
            {(() => {
              const text = buildReportText();
              if (!text) return <div className="flex-1 min-h-0"><EmptyState variant="check" title={t(reportCommentCount > 0 ? 'review.reportNoOpen' : 'review.reportEmpty')} desc={t(reportCommentCount > 0 ? 'review.reportNoOpenDesc' : 'review.reportEmptyDesc')} /></div>;
              return (
                <>
                  <div role="region" aria-label={t('review.reportTitle')} tabIndex={0} data-testid="review-report-scroll" className="flex-1 min-h-0 overflow-y-auto overscroll-contain border border-border rounded-lg">
                    <pre data-testid="review-report-text" className="py-3 text-[12px] leading-relaxed font-mono whitespace-pre-wrap break-words select-text"><ReviewDiffText text={text} report /></pre>
                  </div>
                  <footer className="flex justify-end gap-2 shrink-0">
                    <Button variant="outline" onClick={() => setReportOpen(false)}>{t('common.close')}</Button>
                    <Button data-testid="review-report-copy" onClick={() => void copyReport()} className="gap-1.5"><Copy className="h-3.5 w-3.5" />{t('review.reportCopy')}</Button>
                  </footer>
                </>
              );
            })()}
          </div>
        </ModalSurface>
      )}
      {issuesOpen && <ReviewIssuesDialog key={JSON.stringify([repoPath, branch, scope.baseHash, scope.headHash])} issues={issues} onClose={() => setIssuesOpen(false)} onStatus={(issue, status) => updateIssue(issue, { status })} onBulkStatus={bulkStatus} onText={(issue, text) => updateIssue(issue, { text, status: 'open' })} onOpen={(issue) => void openIssueDiff(issue)} />}
      {tidyOpen && review.checkpoint && repoPath && (
        <HistoryEditorDialog repoPath={repoPath} baseHash={review.checkpoint.hash} onClose={() => setTidyOpen(false)} />
      )}
    </div>
  );
}

/** 代码块头行右侧的通过/注释动作(hunk 级审查入口)。 */
function HunkActions({ path, hunk, approved, commentCount, onToggle, onComment, approveTitle, commentTitle }: {
  path: string;
  hunk: ReviewHunk;
  approved: boolean;
  commentCount: number;
  onToggle: (path: string, hunk: ReviewHunk) => void;
  onComment: (path: string, hunk: ReviewHunk) => void;
  approveTitle: string;
  commentTitle: string;
}) {
  return (
    <div className="flex items-center gap-1 shrink-0 ml-2">
      <button
        type="button"
        data-testid={`review-hunk-approve-${path}-${hunk.newStart}`}
        aria-pressed={approved}
        title={approveTitle}
        onClick={(event) => { event.stopPropagation(); onToggle(path, hunk); }}
        className={cn(
          'flex items-center gap-0.5 h-5 px-1.5 rounded text-[12px] border transition-colors',
          approved ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-600 dark:text-emerald-300' : 'border-border text-muted-foreground hover:text-foreground hover:bg-accent/40',
        )}
      >
        <Check className="h-3 w-3" />
      </button>
      <button
        type="button"
        data-testid={`review-hunk-comment-${path}-${hunk.newStart}`}
        title={commentTitle}
        onClick={(event) => { event.stopPropagation(); onComment(path, hunk); }}
        className={cn(
          'flex items-center gap-0.5 h-5 px-1.5 rounded text-[12px] border transition-colors',
          commentCount > 0 ? 'border-primary/50 bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:text-foreground hover:bg-accent/40',
        )}
      >
        <MessageSquare className="h-3 w-3" />
        {commentCount > 0 && <span className="font-mono">{commentCount}</span>}
      </button>
    </div>
  );
}

/** 审查文件行:名称 + 增删统计 + 注释徽标 + 通过开关。 */
function ReviewFileRow({ file, active, approved, commentCount, onOpen, onToggle, onComment, approveTitle, unapproveTitle, commentTitle }: {
  file: GitFileChange;
  active: boolean;
  approved: boolean;
  commentCount: number;
  onOpen: (path: string) => void;
  onToggle: (path: string) => void;
  onComment: (path: string) => void;
  approveTitle: string;
  unapproveTitle: string;
  commentTitle: string;
}) {
  const name = file.path.split('/').pop() ?? file.path;
  return (
    <div
      role="listitem"
      data-list-row
      className={cn(
        'group flex items-center gap-1.5 pl-2 pr-1 rounded-md text-xs cursor-pointer transition-colors',
        approved && 'bg-emerald-500/5',
        active ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-accent/40',
      )}
    >
      <button type="button" onClick={() => onOpen(file.path)} title={file.path} className="flex items-center gap-1.5 min-w-0 flex-1 h-8 text-left">
        {approved
          ? <FileCheck2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" aria-hidden="true" />
          : isImagePath(file.path)
            ? <ImageIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            : <FileCode2 className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden="true" />}
        <span className={cn('truncate', approved && 'text-emerald-600 dark:text-emerald-300')}>{name}</span>
        {(file.insertions || file.deletions) ? (
          <span className="font-mono text-[12px] shrink-0 opacity-80"><span className="text-git-added">+{file.insertions ?? 0}</span> <span className="text-git-deleted">-{file.deletions ?? 0}</span></span>
        ) : null}
      </button>
      {commentCount > 0 && (
        <button type="button" onClick={() => onComment(file.path)} title={commentTitle} className="flex items-center gap-0.5 h-5 px-1 rounded border border-primary/40 bg-primary/10 text-primary shrink-0">
          <MessageSquare className="h-3 w-3" /><span className="font-mono text-[12px]">{commentCount}</span>
        </button>
      )}
      <button
        type="button"
        data-testid={`review-file-approve-${file.path}`}
        aria-pressed={approved}
        title={approved ? unapproveTitle : approveTitle}
        onClick={() => onToggle(file.path)}
        className={cn(
          'flex items-center justify-center h-6 w-6 rounded shrink-0 transition-colors',
          approved ? 'text-emerald-500' : 'text-muted-foreground/0 group-hover:text-muted-foreground hover:!text-foreground hover:bg-accent/40',
        )}
      >
        <Check className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/** 审查文件面板:过滤 + 待审在上、已通过折叠在下(todo-list 语义)。 */
function ReviewFilePanel({ commitView, files, approval, comments, selectedFile, onOpenFile, onToggleFile, onFileComment }: {
  commitView: boolean;
  files: GitFileChange[];
  approval: ReviewApproval;
  comments: ReviewComment[];
  selectedFile: string | null;
  onOpenFile: (path: string) => void;
  onToggleFile: (path: string) => void;
  onFileComment: (path: string) => void;
}) {
  const { t } = useI18n();
  const [filter, setFilter] = useState('');
  const [approvedOpen, setApprovedOpen] = useState(false);
  const query = filter.trim().toLowerCase();
  const matches = (path: string) => !query || path.toLowerCase().includes(query);
  const pending = files.filter((file) => !isFileApproved(approval, file.path) && matches(file.path));
  const approved = files.filter((file) => isFileApproved(approval, file.path) && matches(file.path));
  const commentCount = (path: string) => comments.filter((comment) => comment.path === path).length;
  const pendingLabel = t(commitView ? 'review.commitPendingGroup' : 'review.pendingGroup');
  const approvedLabel = t(commitView ? 'review.commitApprovedGroup' : 'review.approvedGroup');

  const renderRows = (list: GitFileChange[]) => list.map((file) => (
    <ReviewFileRow
      key={file.path}
      file={file}
      active={selectedFile === file.path}
      approved={isFileApproved(approval, file.path)}
      commentCount={commentCount(file.path)}
      onOpen={onOpenFile}
      onToggle={onToggleFile}
      onComment={onFileComment}
      approveTitle={t(commitView ? 'review.commitViewFile' : 'review.approveFile')}
      unapproveTitle={t(commitView ? 'review.commitUnviewFile' : 'review.unapproveFile')}
      commentTitle={t('review.commentFile')}
    />
  ));

  return (
    <>
      <div className="p-2 border-b border-border shrink-0">
        <input
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder={t('review.filterFiles')}
          aria-label={t('review.filterFiles')}
          maxLength={128}
          className="w-full h-7 px-2 rounded-md border border-input bg-background text-[12px]"
        />
      </div>
      <ScrollArea className="flex-1 p-1.5">
        <div role="list" aria-label={pendingLabel}>
          <div className="flex items-center gap-1.5 px-1.5 py-1 text-[12px] font-semibold text-muted-foreground uppercase tracking-wider">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" aria-hidden="true" />
            <span>{pendingLabel} ({pending.length})</span>
          </div>
          {pending.length === 0
            ? <p className="px-1.5 py-2 text-[12px] text-muted-foreground">{t(commitView ? 'review.commitPendingEmpty' : 'review.pendingEmpty')}</p>
            : renderRows(pending)}
        </div>
        <div className="mt-2">
          <button
            type="button"
            data-testid="review-approved-toggle"
            aria-expanded={approvedOpen}
            onClick={() => setApprovedOpen((open) => !open)}
            className="flex items-center gap-1.5 px-1.5 py-1 w-full text-[12px] font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground"
          >
            <ChevronRight className={cn('h-3 w-3 transition-transform', approvedOpen && 'rotate-90')} aria-hidden="true" />
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" aria-hidden="true" />
            <span>{approvedLabel} ({approved.length})</span>
          </button>
          {approvedOpen && (approved.length === 0
            ? <p className="px-1.5 py-2 text-[12px] text-muted-foreground">{t(commitView ? 'review.commitApprovedEmpty' : 'review.approvedEmpty')}</p>
            : <div role="list" aria-label={approvedLabel}>{renderRows(approved)}</div>)}
        </div>
      </ScrollArea>
    </>
  );
}

/** 视图头部:标题 + 检查点状态与操作(子内容由调用方注入) */
function ReviewHeader({ children }: { children?: ReactNode }) {
  const { t } = useI18n();
  return (
    <div className="min-h-10 px-3 py-1 border-b border-border flex flex-wrap items-center gap-2 shrink-0">
      <ScanEye className="h-4 w-4 text-primary shrink-0" />
      <span className="font-semibold text-sm shrink-0">{t('review.title')}</span>
      {children}
    </div>
  );
}
