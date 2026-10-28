import { FileAttributionContent } from './FileAttributionContent';
import { WorkingDiffContent } from './WorkingDiffContent';
import { useWorkingReview } from '@/features/review/useWorkingReview';
import { WorkingReviewPanel, WorkingReviewHunkActions } from '@/features/review/WorkingReviewPanel';
import { WorkingReviewReport } from '@/features/review/WorkingReviewReport';
import { nextWorkingReviewFile, useWorkingReviewFileList } from '@/features/review/useWorkingReviewFileList';
import { WorkingReviewFileStatus, workingFileReviewLabel } from '@/features/review/WorkingReviewFileStatus';
import { approveAllWorkingReviews } from '@/features/review/approveAllWorkingReviews';
import { isImagePath } from '@/services/git/ImageDiffService';
import { stageSelectedLines } from '@/services/git/LineStagingService';
import { CommitSplitDialog } from './CommitSplitDialog';
import { RepositoryToolsDialog } from './RepositoryToolsDialog';
import { useShallow } from 'zustand/react/shallow';
import { VirtualRows } from '@/components/ui/VirtualRows';
import { DiffFontControl } from '@/components/ui/DiffFontControl';
import { useSettingsStore } from '@/stores/settingsStore';
import { useWorkspaceLayout } from '@/hooks/useWorkspaceLayout';
import { confirmAction } from '@/stores/confirmStore';
import { FilePath } from '@/components/ui/FilePath';
import { ContextMenu, type ContextMenuItem } from '@/components/ui/ContextMenu';
import { moveListFocus } from '@/utils/listKeyboard';
import { computeSplitRows } from '@/utils/diffRows';
import React, { useState, useMemo, useEffect, useRef, useId } from 'react';
import { DiffTools } from '@/components/ui/DiffTools';
import { useGitActivity } from '@/hooks/useGitActivity';
import {
  CheckSquare,
  Square,
  RotateCcw,
  Plus,
  Minus,
  Check,
  FileCode,
  Copy,
  Archive,
  Boxes,
  Split,
  Shield,
  Download,
  AlignLeft,
  Loader2,
  History,
  GitCompare,
  GitMerge,
} from 'lucide-react';
import { ConflictBanner } from './ConflictBanner';
import { IgnoreDialog } from './IgnoreDialog';
import { InteractiveConflictResolver } from './InteractiveConflictResolver';
import { useRepoStore } from '@/stores/repoStore';
import { useI18n } from '@/i18n';
import { useLayoutStore, DEFAULT_LAYOUT } from '@/stores/layoutStore';
import { ResizeHandle } from '@/components/ui/ResizeHandle';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { EmptyState } from '@/components/ui/EmptyState';
import { toast } from '@/stores/toastStore';
import { cn } from '@/utils/cn';
import { groupDiffIntoHunks } from '@/services/git/PorcelainParser';
import { gitService } from '@/services/git/GitService';
import { externalToolService, type ExternalToolConfig, type ExternalToolMode } from '@/services/tools/ExternalToolService';
import { GitBlameLine, GitCommit, GitFileChange } from '@/services/git/types';

const isDesktopRuntime = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export const WorkingChangesView: React.FC = () => {
  const { setChangesFileListWidth } = useLayoutStore();
  const { panels } = useWorkspaceLayout();
  const diffFontSize = useSettingsStore(state => state.diffFontSize);
  const wrap = useSettingsStore(state => state.diffWrapLines);
  const ignoreWhitespace = useSettingsStore(state => state.diffIgnoreWhitespace);
  const workingChangesRevision = useRepoStore(state => state.workingChangesRevision);
  const [diffQuery, setDiffQuery] = useState('');
  const diffId = useId();
  const {
    status,
    selectedFile,
    setSelectedFile,
    fileDiffLines,
    fileDiffLoading,
    fileDiffError,
    loadFileDiff,
    commits,
    setSelectedCommit,
    setActiveTab,
    currentRepo,
    stageFile,
    unstageFile,
    stageHunk,
    unstageHunk,
    discardHunk,
    stageAll,
    unstageAll,
    discardChanges,
    stashPush,
    resolveFileOurs,
    resolveFileTheirs,
    resetFileConflictMarkers,
  } = useRepoStore(useShallow(state => ({ status: state.status, selectedFile: state.selectedFile, setSelectedFile: state.setSelectedFile, fileDiffLines: state.fileDiffLines, fileDiffLoading: state.fileDiffLoading, fileDiffError: state.fileDiffError, loadFileDiff: state.loadFileDiff, commits: state.commits, setSelectedCommit: state.setSelectedCommit, setActiveTab: state.setActiveTab, currentRepo: state.currentRepo, stageFile: state.stageFile, unstageFile: state.unstageFile, stageHunk: state.stageHunk, unstageHunk: state.unstageHunk, discardHunk: state.discardHunk, stageAll: state.stageAll, unstageAll: state.unstageAll, discardChanges: state.discardChanges, stashPush: state.stashPush, resolveFileOurs: state.resolveFileOurs, resolveFileTheirs: state.resolveFileTheirs, resetFileConflictMarkers: state.resetFileConflictMarkers })));
  const { t } = useI18n();

  const [selectedLines, setSelectedLines] = useState<Set<number>>(() => new Set());
  const [lineBusy, setLineBusy] = useState(false);
  const [splitOpen, setSplitOpen] = useState(false);
  const [repoToolsOpen, setRepoToolsOpen] = useState(false);
  const [diffMode, setDiffMode] = useState<'unified' | 'split'>('unified');
  const [copiedPath, setCopiedPath] = useState(false);
  const [showResolver, setShowResolver] = useState(true);

  // 内容视图模式：Diff / Blame 追溯 / 文件历史
  const [contentMode, setContentMode] = useState<'diff' | 'blame' | 'history'>('diff');
  const [blameLines, setBlameLines] = useState<GitBlameLine[]>([]);
  const [fileCommits, setFileCommits] = useState<GitCommit[]>([]);
  const [loadingFileData, setLoadingFileData] = useState(false);

  const stagedFiles = status?.staged || [];
  const unstagedFiles = status?.unstaged || [];
  const untrackedFiles = status?.untracked || [];

  const activeFile = selectedFile || stagedFiles[0] || unstagedFiles[0] || untrackedFiles[0];
  const workingReview = useWorkingReview(currentRepo?.path ?? '', status, activeFile, fileDiffLines, fileDiffLoading, ignoreWhitespace, fileDiffError, workingChangesRevision);
  const allFiles = useMemo(() => [...stagedFiles, ...unstagedFiles, ...untrackedFiles], [stagedFiles, unstagedFiles, untrackedFiles]);
  const fileReviews = useWorkingReviewFileList(currentRepo?.path ?? '', status, allFiles, workingChangesRevision, { file: activeFile, snapshot: workingReview.verifiedSnapshot });
  const fileListRef = useRef<HTMLDivElement>(null);
  const nextReviewFile = nextWorkingReviewFile(allFiles, activeFile, fileReviews.stateFor);
  const goToNextReview = () => {
    if (!nextReviewFile) return;
    setSelectedFile(nextReviewFile);
    requestAnimationFrame(() => {
      const row = Array.from(fileListRef.current?.querySelectorAll<HTMLElement>('[data-file-path]') ?? []).find(element => element.dataset.filePath === nextReviewFile.path && element.dataset.fileStaged === String(!!nextReviewFile.staged));
      if (row) row.scrollIntoView({ block: 'nearest' });
      else {
        const section = nextReviewFile.staged ? 'staged' : nextReviewFile.status === 'untracked' ? 'untracked' : 'unstaged';
        const files = section === 'staged' ? stagedFiles : section === 'untracked' ? untrackedFiles : unstagedFiles;
        const index = files.indexOf(nextReviewFile);
        fileListRef.current?.querySelector(`[data-working-file-group="${section}"] [data-virtual-count]`)?.dispatchEvent(new CustomEvent('auugit-focus-row', { detail: index }));
      }
    });
  };
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const selectionAnchor = useRef(0);
  const [batchBusy, setBatchBusy] = useState(false);
  const [reviewAllBusy, setReviewAllBusy] = useState(false);
  const reviewAllRunning = useRef(false);
  const approveAll = async () => {
    if (!currentRepo || !status || reviewAllRunning.current) return;
    reviewAllRunning.current = true; setReviewAllBusy(true);
    try {
      const result = await approveAllWorkingReviews(currentRepo.path, status);
      if (result.cancelled) {
        toast.warning(t('workingReview.approveAllChanged')); return;
      }
      const skipped = result.unresolved + result.conflicts + result.failed;
      const title = t('workingReview.approveAllDone').replace('{n}', String(result.approved));
      if (skipped) toast.warning(title, t('workingReview.approveAllSkipped').replace('{n}', String(skipped)));
      else toast.success(title);
    } catch (error: any) { toast.error(t('workingReview.approveAllFailed'), error.message); }
    finally { reviewAllRunning.current = false; setReviewAllBusy(false); }
  };
  const pendingWrites = useGitActivity(currentRepo?.path || '');
  const fileKey = (file: GitFileChange) => JSON.stringify([file.path, file.staged]);
  useEffect(() => { setPicked(new Set()); }, [currentRepo?.path]);
  const selectedFiles = allFiles.filter(file => picked.has(fileKey(file)));
  const togglePicked = (file: GitFileChange, range: boolean) => {
    const index = allFiles.indexOf(file);
    if (range) {
      setPicked(previous => new Set([...previous, ...allFiles.slice(Math.min(selectionAnchor.current, index), Math.max(selectionAnchor.current, index) + 1).map(fileKey)]));
    } else {
      setPicked(previous => { const next = new Set(previous); const key = fileKey(file); next.has(key) ? next.delete(key) : next.add(key); return next; });
      selectionAnchor.current = index;
    }
  };
  const pickCheckbox = (file: GitFileChange) => (
    <input
      type="checkbox"
      aria-label={t('changes.pickFile')}
      title={t('changes.pickFile')}
      checked={picked.has(fileKey(file))}
      onChange={() => { /* Click handles Shift selection as well as keyboard activation. */ }}
      onClick={event => { event.stopPropagation(); togglePicked(file, event.shiftKey); }}
      className="h-3.5 w-3.5 shrink-0 cursor-pointer accent-primary"
    />
  );
  const applySelection = async (mode: 'stage' | 'unstage') => {
    if (!currentRepo || batchBusy) return;
    const path = currentRepo.path;
    const paths = selectedFiles.filter(file => mode === 'stage' ? !file.staged : file.staged).map(file => file.path);
    setBatchBusy(true);
    try {
      await (mode === 'stage' ? gitService.stageFiles(path, paths) : gitService.unstageFiles(path, paths));
      if (useRepoStore.getState().currentRepo?.path === path) { setPicked(new Set()); await useRepoStore.getState().refreshStatus(); }
    } catch (error: any) { toast.error(t('changes.opFailed'), error.message); }
    finally { setBatchBusy(false); }
  };

  useEffect(() => { setSelectedLines(new Set()); }, [activeFile?.path, activeFile?.staged, fileDiffLines]);
  const applyLines = async () => {
    if (!currentRepo || !activeFile) return; setLineBusy(true);
    try { await stageSelectedLines(currentRepo.path, activeFile.path, fileDiffLines, selectedLines, activeFile.staged); if (useRepoStore.getState().currentRepo?.path === currentRepo.path) await useRepoStore.getState().refreshStatus(); toast.success(t('flow.linesApplied')); }
    catch (error: any) { toast.error(t('changes.opFailed'), error.message); } finally { setLineBusy(false); }
  };
  // Auto activate resolver mode when selecting a conflicted file
  React.useEffect(() => {
    if (activeFile?.status === 'conflicted') {
      setShowResolver(true);
    }
  }, [activeFile?.path, activeFile?.status]);

  // 切换文件时回到 Diff 视图并清空 blame/历史数据
  useEffect(() => {
    setContentMode('diff'); setDiffQuery('');
    setBlameLines([]);
    setFileCommits([]);
  }, [activeFile?.path]);

  // 按需加载 Blame / 文件历史
  useEffect(() => {
    if (!currentRepo || !activeFile || contentMode === 'diff') return;
    let cancelled = false;
    setLoadingFileData(true);
    const loader =
      contentMode === 'blame'
        ? gitService.blameFile(currentRepo.path, activeFile.path)
        : gitService.getCommitsForFile(currentRepo.path, activeFile.path);
    loader
      .then((data) => {
        if (cancelled) return;
        if (contentMode === 'blame') setBlameLines(data as GitBlameLine[]);
        else setFileCommits(data as GitCommit[]);
      })
      .catch(() => {
        if (!cancelled) {
          if (contentMode === 'blame') setBlameLines([]);
          else setFileCommits([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingFileData(false);
      });
    return () => {
      cancelled = true;
    };
  }, [contentMode, activeFile?.path, currentRepo?.path]);

  const getStatusBadge = (statusType: string) => {
    switch (statusType) {
      case 'modified':
        return <span className="text-[12px] font-mono font-bold text-git-modified">M</span>;
      case 'added':
        return <span className="text-[12px] font-mono font-bold text-git-added">A</span>;
      case 'deleted':
        return <span className="text-[12px] font-mono font-bold text-git-deleted">D</span>;
      case 'renamed':
        return <span className="text-[12px] font-mono font-bold text-git-renamed">R</span>;
      case 'untracked':
        return <span className="text-[12px] font-mono font-bold text-git-untracked">U</span>;
      case 'conflicted':
        return (
          <span className="text-[12px] font-mono font-bold px-1.5 py-0.5 rounded bg-rose-500/20 text-git-deleted border border-rose-500/40 " title={t('changes.conflictBadge')}>
            {t('changes.conflict')}
          </span>
        );
      default:
        return <span className="text-[12px] font-mono font-bold text-git-renamed">?</span>;
    }
  };

  const totalChanges = stagedFiles.length + unstagedFiles.length + untrackedFiles.length;

  // 统一处理暂存/取消暂存/放弃修改：等待真实结果后再提示，失败弹错误 toast；
  // 互斥防重入——并发改索引会撞 git index 锁
  const [listBusy, setListBusy] = useState(false);
  const runGitAction = async (action: () => Promise<void>, successMsg: string, failMsg: string) => {
    if (listBusy) return;
    setListBusy(true);
    try {
      await action();
      toast.success(successMsg);
    } catch (err: any) {
      toast.error(failMsg, err?.message);
    } finally {
      setListBusy(false);
    }
  };

  const handleDiscard = async (path: string) => {
    if (!await confirmAction({ title: t('changes.discardTitle'), description: t('composer.discardWarning'), detail: path })) return;
    runGitAction(
      () => discardChanges(path),
      `${t('changes.discarded')}: ${path}`,
      `${t('changes.discardFailed')}: ${path}`
    );
  };

  const [fileMenu, setFileMenu] = useState<{ file: GitFileChange; x: number; y: number } | null>(null);
  const [ignorePaths, setIgnorePaths] = useState<string[] | null>(null);
  useEffect(() => { setIgnorePaths(null); setFileMenu(null); }, [currentRepo?.path]);

  // 外部 diff/merge 工具（F4，仅桌面端）：加载一次后端配置镜像，供右键菜单列出。
  const desktop = isDesktopRuntime();
  const externalTools = useSettingsStore(useShallow((state) => state.externalTools));
  useEffect(() => {
    if (!desktop) return;
    useSettingsStore.getState().initExternalTools().catch(() => {
      // 菜单入口随列表为空而隐藏；失败由设置区的加载提示兜底。
    });
  }, [desktop]);

  const launchWithExternalTool = async (tool: ExternalToolConfig, mode: ExternalToolMode, file: GitFileChange) => {
    if (!currentRepo) return;
    try {
      await externalToolService.launch(tool.id, mode, currentRepo.path, file.path);
      toast.success(t('externalTools.launched'), `${tool.name}: ${file.path}`);
    } catch (error: any) {
      toast.error(t('externalTools.launchFailed'), String(error?.message || error));
    }
  };
  const toggleFile = async (file: GitFileChange) => {
    await runGitAction(() => file.staged ? unstageFile(file.path) : stageFile(file.path), t(file.staged ? 'changes.unstagedToast' : 'changes.stagedToast'), t('changes.opFailed'));
    requestAnimationFrame(() => {
      const row = Array.from(document.querySelectorAll<HTMLElement>('[data-file-path]')).find(element => element.dataset.filePath === file.path);
      row?.focus();
    });
  };
  const fileRowProps = (file: GitFileChange): React.HTMLAttributes<HTMLDivElement> & { 'data-list-row': string; 'data-file-path': string; 'data-picked': string; 'data-review-state': string; 'data-file-staged': string } => {
    const selected = activeFile?.path === file.path && activeFile?.staged === file.staged;
    return {
      role: 'listitem', tabIndex: selected ? 0 : -1, 'aria-current': selected ? 'true' : undefined,
      'aria-label': `${file.path} · ${workingFileReviewLabel(fileReviews.stateFor(file), t)}`, 'data-list-row': '', 'data-file-path': file.path,
      'data-review-state': fileReviews.stateFor(file).kind, 'data-file-staged': String(!!file.staged),
      'data-picked': String(picked.has(fileKey(file))),
      onClick: event => {
        const index = allFiles.indexOf(file);
        if (event.shiftKey) {
          setPicked(previous => new Set([...previous, ...allFiles.slice(Math.min(selectionAnchor.current, index), Math.max(selectionAnchor.current, index) + 1).map(fileKey)]));
        } else if (event.ctrlKey || event.metaKey) {
          setPicked(previous => { const next = new Set(previous); const key = fileKey(file); next.has(key) ? next.delete(key) : next.add(key); return next; });
          selectionAnchor.current = index;
        } else { setPicked(new Set()); selectionAnchor.current = index; }
        setSelectedFile(file);
      },
      onFocus: event => { if (event.target === event.currentTarget) setSelectedFile(file); },
      onContextMenu: event => { event.preventDefault(); setSelectedFile(file); setFileMenu({ file, x: event.clientX, y: event.clientY }); },
      onKeyDown: event => {
        if (event.target !== event.currentTarget) return;
        if (event.key === 'Enter') { event.preventDefault(); setSelectedFile(file); }
        if (event.key === ' ') { event.preventDefault(); void toggleFile(file); }
        if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
          event.preventDefault(); const box = event.currentTarget.getBoundingClientRect(); setFileMenu({ file, x: box.left + 20, y: box.bottom });
        }
      },
    };
  };
  // 外部工具入口：ContextMenu 组件无子菜单，按当前文件语义平铺列出已配置工具——
  // 冲突文件列出 merge 工具（index 三阶段合并），其余文件列出 diff 工具（working vs HEAD）。
  const externalMenuItems: ContextMenuItem[] = (() => {
    if (!fileMenu || !desktop) return [];
    const conflicted = fileMenu.file.status === 'conflicted';
    const tools = externalTools.filter((tool) => tool.mode === (conflicted ? 'merge' : 'diff'));
    if (!tools.length) return [];
    return [
      { id: 'external-tools-separator', separator: true } as ContextMenuItem,
      ...tools.map((tool) => ({
        id: `external-tool-${tool.id}`,
        label: t(conflicted ? 'externalTools.mergeWith' : 'externalTools.diffWith').replace('{name}', tool.name),
        icon: conflicted ? <GitMerge className="h-3.5 w-3.5" /> : <GitCompare className="h-3.5 w-3.5" />,
        onClick: () => void launchWithExternalTool(tool, conflicted ? 'merge' : 'diff', fileMenu.file),
      } as ContextMenuItem)),
    ];
  })();

  const fileMenuItems: ContextMenuItem[] = fileMenu ? [
    { id: 'stage', label: t(fileMenu.file.staged ? 'changes.unstageTitle' : 'changes.stageTitle'), onClick: () => void toggleFile(fileMenu.file) },
    ...(fileMenu.file.status === 'untracked' ? [{ id: 'ignore', label: t('ignore.title'), onClick: () => setIgnorePaths(
      picked.has(fileKey(fileMenu.file)) ? selectedFiles.filter(file => file.status === 'untracked').map(file => file.path) : [fileMenu.file.path]
    ) }] : []),
    ...(!fileMenu.file.staged && fileMenu.file.status !== 'untracked' ? [{ id: 'discard', label: t('changes.discardTitle'), danger: true, onClick: () => void handleDiscard(fileMenu.file.path) }] : []),
    ...externalMenuItems,
  ] : [];

  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const copyFilePath = () => {
    if (!activeFile) return;
    navigator.clipboard.writeText(activeFile.path);
    setCopiedPath(true);
    toast.success(t('changes.copiedPath'), activeFile.path);
    if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    copiedTimerRef.current = setTimeout(() => setCopiedPath(false), 2000);
  };

  // 卸载时清理复制提示的延时器，避免卸载后 setState
  useEffect(() => () => {
    if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
  }, []);

  // Compute diff addition / deletion counts (memoized)
  const { addCount, delCount } = useMemo(() => {
    let add = 0;
    let del = 0;
    for (const l of fileDiffLines) {
      if (l.type === 'add') add++;
      else if (l.type === 'delete') del++;
    }
    return { addCount: add, delCount: del };
  }, [fileDiffLines]);

  const splitRows = useMemo(() => {
    if (diffMode !== 'split' || fileDiffLines.length === 0) return [];
    return computeSplitRows(fileDiffLines);
  }, [diffMode, fileDiffLines]);
  const diffContents = useMemo(() => diffMode === 'split' ? splitRows.map(row => row.headerContent || `${row.left?.content || ''}\n${row.right?.content || ''}`) : fileDiffLines.map(line => line.content), [diffMode, splitRows, fileDiffLines]);

  // 块级操作：按 @@ 头切分 hunk，并为统一视图的每个块头记录索引
  const hunks = useMemo(() => groupDiffIntoHunks(fileDiffLines), [fileDiffLines]);

  const headerHunkIdx = useMemo(() => {
    const map = new Map<number, number>();
    let h = -1;
    fileDiffLines.forEach((l, i) => {
      if (l.type === 'header') {
        h++;
        map.set(i, h);
      }
    });
    return map;
  }, [fileDiffLines]);

  // 冲突文件走专用解决器（git apply 对 unmerged 路径无效），不提供块级按钮
  const showHunkActions = !!activeFile && activeFile.status !== 'conflicted' && hunks.length > 0;

  const handleHunkAction = async (hunkIdx: number, mode: 'stage' | 'unstage' | 'discard') => {
    if (!activeFile) return;
    const hunk = hunks[hunkIdx];
    if (!hunk) return;
    const path = activeFile.path;

    if (mode === 'discard') {
      if (!await confirmAction({ title: t('changes.discardHunk'), description: t('composer.discardHunkWarning'), detail: `${path}\n${hunk.map(line => line.content).join('\n')}` })) return;
    }

    const action =
      mode === 'stage'
        ? () => stageHunk(path, hunk, activeFile.status === 'untracked')
        : mode === 'unstage'
        ? () => unstageHunk(path, hunk)
        : () => discardHunk(path, hunk);
    const successKey =
      mode === 'stage'
        ? 'changes.hunkStaged'
        : mode === 'unstage'
        ? 'changes.hunkUnstaged'
        : 'changes.hunkDiscarded';

    runGitAction(action, `${t(successKey)}: ${path}`, `${t('changes.hunkOpFailed')}: ${path}`);
  };

  const renderHunkActions = (hunkIdx: number) => {
    if (ignoreWhitespace || !showHunkActions || hunkIdx < 0 || !activeFile || !hunks[hunkIdx]?.some(line => line.type === 'add' || line.type === 'delete')) return null;
    const isUntracked = activeFile.status === 'untracked';
    const btnBase =
      'h-7 w-7 rounded flex items-center justify-center shrink-0 transition-colors';
    return (
      <div className="flex items-center gap-0.5 shrink-0">
        <WorkingReviewHunkActions review={workingReview} header={hunks[hunkIdx][0].content} />
        {activeFile.staged && !isUntracked ? (
          <button
            onClick={() => handleHunkAction(hunkIdx, 'unstage')}
            className={cn(btnBase, 'text-sky-600/70 hover:text-sky-500 hover:bg-sky-500/10')}
            title={t('changes.unstageHunk')}
          >
            <Minus className="h-3 w-3" />
          </button>
        ) : (
          <>
            <button
              onClick={() => handleHunkAction(hunkIdx, 'stage')}
              className={cn(btnBase, 'text-emerald-500/70 hover:text-git-added hover:bg-emerald-500/10')}
              title={t('changes.stageHunk')}
            >
              <Plus className="h-3 w-3" />
            </button>
            {!isUntracked && (
              <button
                onClick={() => handleHunkAction(hunkIdx, 'discard')}
                className={cn(btnBase, 'text-rose-500/70 hover:text-git-deleted hover:bg-rose-500/10')}
                title={t('changes.discardHunk')}
              >
                <RotateCcw className="h-3 w-3" />
              </button>
            )}
          </>
        )}
      </div>
    );
  };

  // 从 Blame / 文件历史跳转到提交详情（需在已加载的历史中）
  const jumpToCommit = (hash: string) => {
    const commit = commits.find((c) => c.hash === hash || c.shortHash === hash);
    if (!commit) {
      toast.info(t('changes.commitNotLoaded'));
      return;
    }
    setSelectedCommit(commit);
    setActiveTab('history');
  };

  return (
    <div className="flex-1 h-full flex flex-col overflow-hidden select-none bg-transparent">
      {/* Top Conflict In-Progress Banner */}
      <ConflictBanner />
      {splitOpen && currentRepo && <CommitSplitDialog repoPath={currentRepo.path} onClose={() => setSplitOpen(false)} />}
      {repoToolsOpen && currentRepo && <RepositoryToolsDialog repoPath={currentRepo.path} onClose={() => setRepoToolsOpen(false)} />}

      <div className="flex-1 min-h-0 flex overflow-hidden">
        {/* Changes File List Sub-panel */}
        <div
          style={{ width: panels.files }}
          className="glass-file-list border-r border-border flex flex-col shrink-0 h-full overflow-hidden"
        >
          <div className="h-9 px-3 border-b border-border flex items-center justify-between font-medium text-xs text-foreground bg-accent/20 shrink-0">
          <div className="flex items-center gap-2">
            <span className="whitespace-nowrap">{t('rightPane.changes')} ({totalChanges})</span>
          </div>

          <div className="flex items-center gap-1">
            <Button variant="ghost" size="xs" title={t('ignore.manage')} onClick={() => setIgnorePaths([])}>
              <Shield className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="xs" title={t('repoTools.open')} onClick={() => setRepoToolsOpen(true)}>
              <Boxes className="h-3.5 w-3.5" />
            </Button>
            {totalChanges > 0 && (
              <Button
                variant="ghost"
                size="xs"
                onClick={async () => {
                  try {
                    await stashPush(t('changes.quickStashMsg'));
                    toast.success(t('changes.stashSuccess'), t('changes.stashSuccessDesc'));
                  } catch (err: any) {
                    toast.error(t('changes.stashFailed'), err.message);
                  }
                }}
                className="h-6 px-1.5 text-[12px] text-muted-foreground hover:text-primary gap-1"
                title={t('changes.quickStashTitle')}
              >
                <Archive className="h-3 w-3" />
                <span>{t('changes.stash')}</span>
              </Button>
            )}
            {unstagedFiles.length > 0 || untrackedFiles.length > 0 ? (
              <Button
                variant="ghost"
                size="xs"
                disabled={listBusy}
                onClick={() => {
                  runGitAction(() => stageAll(), t('changes.stageAllToast'), t('changes.stageFailed'));
                }}
                className="h-6 px-1.5 text-[12px] text-muted-foreground hover:text-foreground"
              >
                {t('changes.stageAll')}
              </Button>
            ) : stagedFiles.length > 0 ? (
              <Button
                variant="ghost"
                size="xs"
                disabled={listBusy}
                onClick={() => {
                  runGitAction(() => unstageAll(), t('changes.unstageAllToast'), t('changes.unstageFailed'));
                }}
                className="h-6 px-1.5 text-[12px] text-muted-foreground hover:text-foreground"
              >
                {t('changes.unstageAllSection')}
              </Button>
            ) : null}
          </div>
        </div>

        {totalChanges > 0 && <div aria-label={t('workingReview.listProgress')} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-1.5 border-b border-border text-[12px]">
          <span className="text-emerald-700 dark:text-emerald-400">{t('workingReview.approved')} {fileReviews.approved}</span>
          <span className="text-amber-700 dark:text-amber-400">{t('workingReview.pending')} {fileReviews.pending}</span>
          {!!fileReviews.checking && <span className="text-muted-foreground">{t('workingReview.listChecking')} {fileReviews.checking}</span>}
          <Button data-testid="working-review-approve-all" size="xs" variant="ghost" className="ml-auto min-w-[112px]" title={t('workingReview.approveAllHint')} aria-busy={reviewAllBusy} disabled={!currentRepo || !status || reviewAllBusy || batchBusy || !!pendingWrites || !(fileReviews.pending + fileReviews.checking)} onClick={() => void approveAll()}>
            {reviewAllBusy ? <Loader2 aria-hidden="true" className="size-3 animate-spin" /> : <Check aria-hidden="true" className="size-3" />}{t(reviewAllBusy ? 'workingReview.approveAllBusy' : 'workingReview.approveAll')}
          </Button>
        </div>}
        {totalChanges > 0 && <div className="px-2 py-1 border-b border-border"><Button variant="ghost" size="xs" className="w-full justify-start gap-2" onClick={() => setSplitOpen(true)}><Split className="w-3.5 h-3.5" />{t('flow.splitCommits')}</Button></div>}
        {selectedFiles.length > 0 && <div className="flex flex-wrap items-center gap-1 p-2 border-b border-border text-[12px]" role="toolbar" aria-label={t('changes.selectionActions')}>
          <span>{selectedFiles.length} {t('changes.selected')}</span>
          <Button size="xs" variant="outline" disabled={batchBusy || !selectedFiles.some(file => !file.staged)} onClick={() => void applySelection('stage')}>{t('changes.stageSelected')}</Button>
          <Button size="xs" variant="outline" disabled={batchBusy || !selectedFiles.some(file => file.staged)} onClick={() => void applySelection('unstage')}>{t('changes.unstageSelected')}</Button>
          <Button size="xs" variant="outline" disabled={batchBusy || !selectedFiles.some(file => file.status === 'untracked')} onClick={() => setIgnorePaths(selectedFiles.filter(file => file.status === 'untracked').map(file => file.path))}>{t('ignore.title')}</Button>
          <Button size="xs" variant="ghost" onClick={() => setPicked(new Set())}>{t('changes.clearSelection')}</Button>
        </div>}
        {pendingWrites > 0 && <p role="status" className="flex items-center gap-2 px-3 py-1 text-[12px] text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" />{t('changes.processing')}</p>}
        <ScrollArea className="flex-1 p-2">
          {totalChanges === 0 ? (
            <EmptyState
              variant="check"
              title={t('changes.empty')}
              desc={t('changes.emptyDesc')}
              className="py-24"
            />
          ) : (
            <div ref={fileListRef} role="list" aria-label={t('composer.changedFiles')} onKeyDown={moveListFocus} className="space-y-3">
              {/* Staged Section */}
              {stagedFiles.length > 0 && (
                <div>
                  <div className="flex items-center justify-between px-1.5 py-1 text-[12px] font-semibold text-muted-foreground uppercase tracking-wider">
                    <span>{t('changes.section.staged')} ({stagedFiles.length})</span>
                    <button
                      onClick={() => {
                        runGitAction(() => unstageAll(), t('changes.unstageAllToast'), t('changes.unstageFailed'));
                      }}
                      disabled={listBusy}
                      className="text-[12px] text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {t('changes.unstageAll')}
                    </button>
                  </div>
                  <div data-working-file-group="staged" className="space-y-0.5">
                    <VirtualRows items={stagedFiles} rowHeight={44} renderRow={(file) => (
                      <div
                        key={file.path}
                        {...fileRowProps(file)}
                        className={cn(
                          "flex min-h-[44px] items-center justify-between px-2 py-1.5 rounded-md text-xs cursor-pointer transition-colors group",
                          activeFile?.path === file.path && activeFile?.staged === file.staged
                            ? "bg-accent text-accent-foreground font-medium"
                            : "text-muted-foreground hover:text-foreground hover:bg-accent/40"
                        )}
                      >
                        <div className="flex flex-1 items-center gap-2 min-w-0">
                          {pickCheckbox(file)}
                          {getStatusBadge(file.status)}
                          <FilePath path={file.path} />
                          <WorkingReviewFileStatus state={fileReviews.stateFor(file)} compact={panels.files < 240} />
                        </div>
                        <Button
                          variant="ghost"
                          size="xs"
                          className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 hover:text-git-deleted shrink-0"
                          title={t('changes.unstageTitle')}
                          onClick={(e) => {
                            e.stopPropagation();
                            runGitAction(
                              () => unstageFile(file.path),
                              `${t('changes.unstagedToast')}: ${file.path}`,
                              `${t('changes.unstageFailed')}: ${file.path}`
                            );
                          }}
                        >
                          <Minus className="h-3 w-3" />
                        </Button>
                      </div>
                    )} />
                  </div>
                </div>
              )}

              {/* Unstaged Section */}
              {unstagedFiles.length > 0 && (
                <div>
                  <div className="flex items-center justify-between px-1.5 py-1 text-[12px] font-semibold text-muted-foreground uppercase tracking-wider">
                    <span>{t('changes.section.unstaged')} ({unstagedFiles.length})</span>
                    <button
                      onClick={() => {
                        runGitAction(() => stageAll(), t('changes.stageAllToast'), t('changes.stageFailed'));
                      }}
                      className="text-[12px] text-muted-foreground hover:text-foreground"
                    >
                      {t('changes.stageAllSection')}
                    </button>
                  </div>
                  <div data-working-file-group="unstaged" className="space-y-0.5">
                    <VirtualRows items={unstagedFiles} rowHeight={44} renderRow={(file) => (
                      <div
                        key={file.path}
                        {...fileRowProps(file)}
                        className={cn(
                          "flex min-h-[44px] items-center justify-between px-2 py-1.5 rounded-md text-xs cursor-pointer transition-colors group",
                          activeFile?.path === file.path && activeFile?.staged === file.staged
                            ? "bg-accent text-accent-foreground font-medium"
                            : "text-muted-foreground hover:text-foreground hover:bg-accent/40"
                        )}
                      >
                        <div className="flex flex-1 items-center gap-2 min-w-0">
                          {pickCheckbox(file)}
                          {getStatusBadge(file.status)}
                          <FilePath path={file.path} />
                          <WorkingReviewFileStatus state={fileReviews.stateFor(file)} compact={panels.files < 240} />
                        </div>
                        <div className="hidden items-center gap-1 group-hover:flex group-focus-within:flex shrink-0">
                          {file.status === 'conflicted' ? (
                            <>
                              <Button
                                variant="ghost"
                                size="xs"
                                className="h-7 w-7 p-0 text-git-deleted hover:text-git-deleted hover:bg-rose-500/10"
                                title={t('changes.openConflictTool')}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedFile(file);
                                  setShowResolver(true);
                                }}
                              >
                                <Split className="h-3 w-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="xs"
                                className="h-7 w-7 p-0 text-git-added hover:text-git-added hover:bg-emerald-500/10"
                                title={t('changes.takeOurs')}
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  try {
                                    await resolveFileOurs(file.path);
                                    toast.success(`${t('changes.tookOurs')}: ${file.path}`);
                                  } catch (err: any) {
                                    toast.error(t('changes.opFailed'), err.message);
                                  }
                                }}
                              >
                                <Shield className="h-3 w-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="xs"
                                className="h-7 w-7 p-0 text-cyan-700 dark:text-cyan-400 hover:text-cyan-600 dark:hover:text-cyan-300 hover:bg-cyan-500/10"
                                title={t('changes.takeTheirs')}
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  try {
                                    await resolveFileTheirs(file.path);
                                    toast.success(`${t('changes.tookTheirs')}: ${file.path}`);
                                  } catch (err: any) {
                                    toast.error(t('changes.opFailed'), err.message);
                                  }
                                }}
                              >
                                <Download className="h-3 w-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="xs"
                                className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                                title={t('changes.resetMarkers')}
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  try {
                                    await resetFileConflictMarkers(file.path);
                                    toast.info(`${t('changes.markersReset')}: ${file.path}`);
                                  } catch (err: any) {
                                    toast.error(t('changes.resetFailed'), err.message);
                                  }
                                }}
                              >
                                <RotateCcw className="h-3 w-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="xs"
                                className="h-7 w-7 p-0 hover:text-git-added"
                                title={t('changes.resolvedTitle')}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  runGitAction(
                                    () => stageFile(file.path),
                                    `${t('changes.resolved')}: ${file.path}`,
                                    `${t('changes.resolvedFailed')}: ${file.path}`
                                  );
                                }}
                              >
                                <Plus className="h-3 w-3" />
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button
                                variant="ghost"
                                size="xs"
                                className="h-7 w-7 p-0 hover:text-git-deleted"
                                title={t('changes.discardTitle')}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDiscard(file.path);
                                }}
                              >
                                <RotateCcw className="h-3 w-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="xs"
                                className="h-7 w-7 p-0 hover:text-git-added"
                                title={t('changes.stageTitle')}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  runGitAction(
                                    () => stageFile(file.path),
                                    `${t('changes.stagedToast')}: ${file.path}`,
                                    `${t('changes.stageFailed')}: ${file.path}`
                                  );
                                }}
                              >
                                <Plus className="h-3 w-3" />
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    )} />
                  </div>
                </div>
              )}

              {/* Untracked Section */}
              {untrackedFiles.length > 0 && (
                <div>
                  <div className="flex items-center justify-between px-1.5 py-1 text-[12px] font-semibold text-muted-foreground uppercase tracking-wider">
                    <span>{t('changes.untracked')} ({untrackedFiles.length})</span>
                    <button
                      onClick={() => {
                        const path = currentRepo?.path;
                        if (!path) return;
                        runGitAction(
                          async () => {
                            await gitService.stageFiles(path, untrackedFiles.map(file => file.path));
                            if (useRepoStore.getState().currentRepo?.path === path) await useRepoStore.getState().refreshStatus();
                          },
                          t('changes.addAllToast'),
                          t('changes.stageFailed')
                        );
                      }}
                      className="text-[12px] text-muted-foreground hover:text-foreground"
                    >
                      {t('changes.addAllSection')}
                    </button>
                  </div>
                  <div data-working-file-group="untracked" className="space-y-0.5">
                    <VirtualRows items={untrackedFiles} rowHeight={44} renderRow={(file) => (
                      <div
                        key={file.path}
                        {...fileRowProps(file)}
                        className={cn(
                          "flex min-h-[44px] items-center justify-between px-2 py-1.5 rounded-md text-xs cursor-pointer transition-colors group",
                          activeFile?.path === file.path && activeFile?.staged === file.staged
                            ? "bg-accent text-accent-foreground font-medium"
                            : "text-muted-foreground hover:text-foreground hover:bg-accent/40"
                        )}
                      >
                        <div className="flex flex-1 items-center gap-2 min-w-0">
                          {pickCheckbox(file)}
                          {getStatusBadge(file.status)}
                          <FilePath path={file.path} />
                          <WorkingReviewFileStatus state={fileReviews.stateFor(file)} compact={panels.files < 240} />
                        </div>
                        <Button
                          variant="ghost"
                          size="xs"
                          className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 hover:text-git-added shrink-0"
                          title={t('changes.trackStageTitle')}
                          onClick={(e) => {
                            e.stopPropagation();
                            runGitAction(
                              () => stageFile(file.path),
                              `${t('changes.tracked')}: ${file.path}`,
                              `${t('changes.trackedFailed')}: ${file.path}`
                            );
                          }}
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                    )} />
                  </div>
                </div>
              )}
            </div>
          )}
        </ScrollArea>
        {totalChanges > 0 && <p className="px-3 py-2 text-[12px] text-muted-foreground border-t border-border">{t('changes.selectionHint')}</p>}
      </div>

      <ResizeHandle
        currentSize={panels.files}
        onSizeChange={setChangesFileListWidth}
        minSize={160}
        maxSize={500}
        defaultSize={DEFAULT_LAYOUT.changesFileListWidth}
        title={t('changes.resizeHint')}
      />

      {/* Diff Viewer Pane */}
      <div className="flex-1 min-w-0 flex flex-col h-full overflow-hidden bg-card/10">
        {/* Diff Toolbar */}
        <div className="workspace-divider px-3 py-2 border-b border-border flex flex-wrap gap-2 text-xs bg-card/40 shrink-0">
          <div className="flex items-center gap-2 min-w-0 w-full">
            <span title={activeFile?.path} className="font-mono text-[13px] font-semibold text-foreground truncate">
              {activeFile?.path || t('rightPane.noFileSelected')}
            </span>
            {activeFile && (
              <>
                <button
                  onClick={copyFilePath}
                  className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground shrink-0"
                  title={t('changes.copyPath')}
                >
                  {copiedPath ? <Check className="h-3 w-3 text-git-added" /> : <Copy className="h-3 w-3" />}
                </button>
                <Badge variant="outline" className="h-4 px-1.5 text-[12px] uppercase font-mono shrink-0 whitespace-nowrap">
                  {t(`fileStatus.${activeFile.status}`)} {activeFile.staged ? t('changes.stagedSuffix') : ''}
                </Badge>
                {(addCount > 0 || delCount > 0) && (
                  <div className="flex items-center gap-1 text-[12px] font-mono">
                    <span className="text-git-added font-semibold">+{addCount}</span>
                    <span className="text-git-deleted font-semibold">-{delCount}</span>
                  </div>
                )}
              </>
            )}
            <WorkingReviewReport key={JSON.stringify([currentRepo?.path, status?.currentBranch])} repoPath={currentRepo?.path ?? ''} branch={status?.currentBranch ?? currentRepo?.currentBranch ?? ''} files={status ? allFiles : undefined} />
          </div>

          {activeFile && (
            <div className="flex flex-wrap items-center gap-2 min-w-0 w-full">
              {/* Content Mode: Diff / Blame / File History */}
              <div className="glass-segmented flex items-center">
                <button
                  aria-pressed={contentMode === 'diff'} onClick={() => setContentMode('diff')}
                  className={cn(
                    "px-2 py-0.5 rounded text-[12px] font-medium transition-colors flex items-center gap-1",
                    contentMode === 'diff'
                      ? "bg-accent text-accent-foreground shadow-2xs font-semibold"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <FileCode className="h-3 w-3" />
                  <span>{t('changes.mode.diff')}</span>
                </button>
                <button
                  aria-pressed={contentMode === 'blame'} onClick={() => setContentMode('blame')}
                  className={cn(
                    "px-2 py-0.5 rounded text-[12px] font-medium transition-colors flex items-center gap-1",
                    contentMode === 'blame'
                      ? "bg-accent text-accent-foreground shadow-2xs font-semibold"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <AlignLeft className="h-3 w-3" />
                  <span>{t('changes.mode.blame')}</span>
                </button>
                <button
                  aria-pressed={contentMode === 'history'} onClick={() => setContentMode('history')}
                  className={cn(
                    "px-2 py-0.5 rounded text-[12px] font-medium transition-colors flex items-center gap-1",
                    contentMode === 'history'
                      ? "bg-accent text-accent-foreground shadow-2xs font-semibold"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <History className="h-3 w-3" />
                  <span>{t('changes.mode.history')}</span>
                </button>
              </div>

              {/* Conflict Resolver / Diff Toggle */}
              {activeFile.status === 'conflicted' && (
                <div className="flex items-center bg-secondary/60 rounded-md p-0.5 border border-rose-500/30">
                  <button
                    onClick={() => setShowResolver(true)}
                    className={cn(
                      "px-2 py-0.5 rounded text-[12px] font-medium transition-colors flex items-center gap-1",
                      showResolver
                        ? "bg-rose-500/20 text-rose-300 font-semibold border border-rose-500/40"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <Split className="h-3 w-3 text-git-deleted" />
                    <span>{t('changes.resolveConflict')}</span>
                  </button>
                  <button
                    onClick={() => setShowResolver(false)}
                    className={cn(
                      "px-2 py-0.5 rounded text-[12px] font-medium transition-colors",
                      !showResolver
                        ? "bg-accent text-accent-foreground font-semibold shadow-2xs"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {t('changes.viewDiff')}
                  </button>
                </div>
              )}

              {/* Unified / Split Toggle */}
              {contentMode === 'diff' && (!showResolver || activeFile.status !== 'conflicted') && (
                <div className="glass-segmented flex items-center">
                  <button
                    aria-pressed={diffMode === 'unified'} onClick={() => setDiffMode('unified')}
                    className={cn(
                      "px-2 py-0.5 rounded text-[12px] font-medium transition-colors",
                      diffMode === 'unified'
                        ? "bg-accent text-accent-foreground shadow-2xs font-semibold"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {t('diff.unified')}
                  </button>
                  <button
                    aria-pressed={diffMode === 'split'} onClick={() => setDiffMode('split')}
                    className={cn(
                      "px-2 py-0.5 rounded text-[12px] font-medium transition-colors",
                      diffMode === 'split'
                        ? "bg-accent text-accent-foreground shadow-2xs font-semibold"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {t('diff.split')}
                  </button>
                </div>
              )}

              <DiffFontControl />
              {/* Quick Stage/Unstage button */}
              <Button
                variant="outline"
                size="xs"
                className="h-6 text-[12px] gap-1"
                onClick={() => {
                  if (activeFile.staged) {
                    runGitAction(
                      () => unstageFile(activeFile.path),
                      `${t('changes.unstagedToast')}: ${activeFile.path}`,
                      `${t('changes.unstageFailed')}: ${activeFile.path}`
                    );
                  } else {
                    runGitAction(
                      () => stageFile(activeFile.path),
                      `${t('changes.stagedToast')}: ${activeFile.path}`,
                      `${t('changes.stageFailed')}: ${activeFile.path}`
                    );
                  }
                }}
              >
                {activeFile.staged ? <Square className="h-3 w-3" /> : <CheckSquare className="h-3 w-3" />}
                <span>{activeFile.staged ? t('changes.unstageOrStage') : t('changes.stageThisFile')}</span>
              </Button>
            </div>
          )}
        </div>

        {/* Content Pane: Conflict Resolver / Blame / File History / Diff View */}
        {activeFile && activeFile.status !== 'conflicted' && contentMode === 'diff' && <WorkingReviewPanel review={workingReview} filtered={ignoreWhitespace} onNext={nextReviewFile ? goToNextReview : undefined} />}
        {activeFile?.status === 'modified' && !isImagePath(activeFile.path) && contentMode === 'diff' && diffMode === 'unified' && !ignoreWhitespace && <div className="workspace-divider px-3 py-1.5 border-b border-border flex items-center justify-between gap-2 text-xs"><span className="text-muted-foreground">{t('flow.lineHint')} ({selectedLines.size})</span><Button variant="outline" size="xs" disabled={lineBusy || !selectedLines.size || !!pendingWrites} onClick={() => void applyLines()}>{t(activeFile.staged ? 'flow.unstageLines' : 'flow.stageLines')}</Button></div>}
        {activeFile && !isImagePath(activeFile.path) && contentMode === 'diff' && !(activeFile.status === 'conflicted' && showResolver) && <DiffTools query={diffQuery} onQueryChange={setDiffQuery} contents={diffContents} targetId={diffId} onReload={() => void loadFileDiff(activeFile)} />}
        {activeFile?.status === 'conflicted' && showResolver ? (
          <InteractiveConflictResolver
            filePath={activeFile.path}
            onClose={() => setShowResolver(false)}
            onResolved={() => setShowResolver(false)}
          />
        ) : contentMode !== 'diff' ? (
          <FileAttributionContent contentMode={contentMode} diffFontSize={diffFontSize} loadingFileData={loadingFileData}
            blameLines={blameLines} fileCommits={fileCommits} jumpToCommit={jumpToCommit} />
        ) : (
          /* Diff Content View */
          <WorkingDiffContent
            diffId={diffId}
            diffFontSize={diffFontSize}
            wrap={wrap}
            currentRepo={currentRepo}
            activeFile={activeFile}
            status={status}
            fileDiffLoading={fileDiffLoading}
            fileDiffError={fileDiffError}
            loadFileDiff={loadFileDiff}
            fileDiffLines={fileDiffLines}
            diffMode={diffMode}
            splitRows={splitRows}
            renderHunkActions={renderHunkActions}
            headerHunkIdx={headerHunkIdx}
            ignoreWhitespace={ignoreWhitespace}
            selectedLines={selectedLines}
            lineBusy={lineBusy}
            pendingWrites={pendingWrites}
            setSelectedLines={setSelectedLines}
            diffQuery={diffQuery}
          />
        )}
      </div>
    </div>
      <ContextMenu open={!!fileMenu} x={fileMenu?.x || 0} y={fileMenu?.y || 0} items={fileMenuItems} onClose={() => setFileMenu(null)} />
      {ignorePaths && currentRepo && <IgnoreDialog repoPath={currentRepo.path} paths={ignorePaths} onClose={() => setIgnorePaths(null)} />}
  </div>
);
};
