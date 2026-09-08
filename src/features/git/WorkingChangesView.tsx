import React, { useState, useMemo, useEffect } from 'react';
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
  Split,
  Shield,
  Download,
  AlignLeft,
  History,
  Loader2,
} from 'lucide-react';
import { ConflictBanner } from './ConflictBanner';
import { InteractiveConflictResolver } from './InteractiveConflictResolver';
import { useRepoStore } from '@/stores/repoStore';
import { useI18n } from '@/i18n';
import { useLayoutStore, DEFAULT_LAYOUT } from '@/stores/layoutStore';
import { ResizeHandle } from '@/components/ui/ResizeHandle';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from '@/stores/toastStore';
import { cn } from '@/utils/cn';
import { ParsedDiffLine, groupDiffIntoHunks } from '@/services/git/PorcelainParser';
import { gitService } from '@/services/git/GitService';
import { GitBlameLine, GitCommit } from '@/services/git/types';

interface SplitRow {
  isHeader?: boolean;
  headerContent?: string;
  hunkIdx?: number;
  left?: {
    lineNo?: number | null;
    content: string;
    type: 'delete' | 'context';
  };
  right?: {
    lineNo?: number | null;
    content: string;
    type: 'add' | 'context';
  };
}

function computeSplitRows(diffLines: ParsedDiffLine[]): SplitRow[] {
  const rows: SplitRow[] = [];
  let i = 0;
  let hunkIdx = -1;

  while (i < diffLines.length) {
    const line = diffLines[i];

    if (line.type === 'header') {
      hunkIdx++;
      rows.push({
        isHeader: true,
        headerContent: line.content,
        hunkIdx,
      });
      i++;
      continue;
    }

    if (line.type === 'context') {
      rows.push({
        left: { lineNo: line.oldNo, content: line.content, type: 'context' },
        right: { lineNo: line.newNo, content: line.content, type: 'context' },
      });
      i++;
      continue;
    }

    // Accumulate consecutive deletes and adds to align them side-by-side
    const deletes: ParsedDiffLine[] = [];
    const adds: ParsedDiffLine[] = [];

    while (i < diffLines.length && (diffLines[i].type === 'delete' || diffLines[i].type === 'add')) {
      if (diffLines[i].type === 'delete') {
        deletes.push(diffLines[i]);
      } else {
        adds.push(diffLines[i]);
      }
      i++;
    }

    const maxLen = Math.max(deletes.length, adds.length);
    for (let k = 0; k < maxLen; k++) {
      const del = deletes[k];
      const add = adds[k];
      rows.push({
        left: del ? { lineNo: del.oldNo, content: del.content, type: 'delete' } : undefined,
        right: add ? { lineNo: add.newNo, content: add.content, type: 'add' } : undefined,
      });
    }
  }

  return rows;
}

export const WorkingChangesView: React.FC = () => {
  const { changesFileListWidth, setChangesFileListWidth } = useLayoutStore();
  const {
    status,
    selectedFile,
    setSelectedFile,
    fileDiffLines,
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
  } = useRepoStore();
  const { t, lang } = useI18n();

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

  // Auto activate resolver mode when selecting a conflicted file
  React.useEffect(() => {
    if (activeFile?.status === 'conflicted') {
      setShowResolver(true);
    }
  }, [activeFile?.path, activeFile?.status]);

  // 切换文件时回到 Diff 视图并清空 blame/历史数据
  useEffect(() => {
    setContentMode('diff');
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
  }, [contentMode, activeFile?.path, currentRepo]);

  const getStatusBadge = (statusType: string) => {
    switch (statusType) {
      case 'modified':
        return <span className="text-[10px] font-mono font-bold text-amber-400">M</span>;
      case 'added':
        return <span className="text-[10px] font-mono font-bold text-emerald-400">A</span>;
      case 'deleted':
        return <span className="text-[10px] font-mono font-bold text-red-400">D</span>;
      case 'renamed':
        return <span className="text-[10px] font-mono font-bold text-blue-400">R</span>;
      case 'untracked':
        return <span className="text-[10px] font-mono font-bold text-teal-400">U</span>;
      case 'conflicted':
        return (
          <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-400 border border-rose-500/40 animate-pulse" title={t('changes.conflictBadge')}>
            {t('changes.conflict')}
          </span>
        );
      default:
        return <span className="text-[10px] font-mono font-bold text-blue-400">?</span>;
    }
  };

  const totalChanges = stagedFiles.length + unstagedFiles.length + untrackedFiles.length;

  // 统一处理暂存/取消暂存/放弃修改：等待真实结果后再提示，失败弹错误 toast
  const runGitAction = async (action: () => Promise<void>, successMsg: string, failMsg: string) => {
    try {
      await action();
      toast.success(successMsg);
    } catch (err: any) {
      toast.error(failMsg, err?.message);
    }
  };

  const handleDiscard = (path: string) => {
    if (!confirm(`${t('changes.discardConfirmPrefix')} "${path}" ${t('changes.discardConfirm')}`)) return;
    runGitAction(
      () => discardChanges(path),
      `${t('changes.discarded')}: ${path}`,
      `${t('changes.discardFailed')}: ${path}`
    );
  };

  const copyFilePath = () => {
    if (!activeFile) return;
    navigator.clipboard.writeText(activeFile.path);
    setCopiedPath(true);
    toast.success(t('changes.copiedPath'), activeFile.path);
    setTimeout(() => setCopiedPath(false), 2000);
  };

  // Compute diff addition / deletion counts
  const addCount = fileDiffLines.filter((l) => l.type === 'add').length;
  const delCount = fileDiffLines.filter((l) => l.type === 'delete').length;

  const splitRows = useMemo(() => {
    if (diffMode !== 'split' || fileDiffLines.length === 0) return [];
    return computeSplitRows(fileDiffLines);
  }, [diffMode, fileDiffLines]);

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

  const handleHunkAction = (hunkIdx: number, mode: 'stage' | 'unstage' | 'discard') => {
    if (!activeFile) return;
    const hunk = hunks[hunkIdx];
    if (!hunk) return;
    const path = activeFile.path;

    if (mode === 'discard') {
      if (!confirm(`${t('changes.discardConfirmPrefix')} "${path}" ${t('changes.discardConfirm')}`)) return;
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
    if (!showHunkActions || hunkIdx < 0 || !activeFile) return null;
    const isUntracked = activeFile.status === 'untracked';
    const btnBase =
      'h-5 w-5 rounded flex items-center justify-center shrink-0 transition-colors';
    return (
      <div className="flex items-center gap-0.5 shrink-0">
        {activeFile.staged && !isUntracked ? (
          <button
            onClick={() => handleHunkAction(hunkIdx, 'unstage')}
            className={cn(btnBase, 'text-sky-500/70 hover:text-sky-400 hover:bg-sky-500/10')}
            title={t('changes.unstageHunk')}
          >
            <Minus className="h-3 w-3" />
          </button>
        ) : (
          <>
            <button
              onClick={() => handleHunkAction(hunkIdx, 'stage')}
              className={cn(btnBase, 'text-emerald-500/70 hover:text-emerald-400 hover:bg-emerald-500/10')}
              title={t('changes.stageHunk')}
            >
              <Plus className="h-3 w-3" />
            </button>
            {!isUntracked && (
              <button
                onClick={() => handleHunkAction(hunkIdx, 'discard')}
                className={cn(btnBase, 'text-rose-500/70 hover:text-rose-400 hover:bg-rose-500/10')}
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

  // 按提交哈希稳定着色，便于在 Blame 视图区分连续改动块
  const blameTints = [
    'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300',
    'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
    'bg-amber-500/15 text-amber-700 dark:text-amber-300',
    'bg-rose-500/15 text-rose-700 dark:text-rose-300',
    'bg-sky-500/15 text-sky-700 dark:text-sky-300',
    'bg-teal-500/15 text-teal-700 dark:text-teal-300',
  ];
  const blameTint = (hash: string) =>
    blameTints[
      [...(hash || '0')].reduce((acc, ch) => acc + ch.charCodeAt(0), 0) % blameTints.length
    ];

  const blameDate = (iso: string) => {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleDateString(lang === 'en' ? 'en-US' : 'zh-CN');
    } catch {
      return '';
    }
  };

  return (
    <div className="flex-1 h-full flex flex-col overflow-hidden select-none bg-background">
      {/* Top Conflict In-Progress Banner */}
      <ConflictBanner />

      <div className="flex-1 min-h-0 flex overflow-hidden">
        {/* Changes File List Sub-panel */}
        <div
          style={{ width: changesFileListWidth }}
          className="border-r border-border bg-sidebar/50 flex flex-col shrink-0 h-full overflow-hidden"
        >
          <div className="h-9 px-3 border-b border-border flex items-center justify-between font-medium text-xs text-foreground bg-accent/20 shrink-0">
          <div className="flex items-center gap-2">
            {totalChanges > 0 && (
              <button
                onClick={() => {
                  if (stagedFiles.length === totalChanges) {
                    runGitAction(() => unstageAll(), t('changes.unstageAllToast'), t('changes.unstageFailed'));
                  } else {
                    runGitAction(() => stageAll(), t('changes.stageAllToast'), t('changes.stageFailed'));
                  }
                }}
                className="text-muted-foreground hover:text-foreground transition-colors"
                title={stagedFiles.length === totalChanges ? t("changes.unselectAll") : t("changes.selectAll")}
              >
                {stagedFiles.length === totalChanges ? (
                  <CheckSquare className="h-3.5 w-3.5 text-emerald-400" />
                ) : stagedFiles.length > 0 ? (
                  <CheckSquare className="h-3.5 w-3.5 text-primary" />
                ) : (
                  <Square className="h-3.5 w-3.5 text-muted-foreground" />
                )}
              </button>
            )}
            <span>{t('rightPane.changes')} ({totalChanges})</span>
          </div>

          <div className="flex items-center gap-1">
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
                className="h-6 px-1.5 text-[10px] text-muted-foreground hover:text-cyan-400 gap-1"
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
                onClick={() => {
                  runGitAction(() => stageAll(), t('changes.stageAllToast'), t('changes.stageFailed'));
                }}
                className="h-6 px-1.5 text-[10px] text-muted-foreground hover:text-foreground"
              >
                {t('changes.stageAll')}
              </Button>
            ) : stagedFiles.length > 0 ? (
              <Button
                variant="ghost"
                size="xs"
                onClick={() => {
                  runGitAction(() => unstageAll(), t('changes.unstageAllToast'), t('changes.unstageFailed'));
                }}
                className="h-6 px-1.5 text-[10px] text-muted-foreground hover:text-foreground"
              >
                {t('changes.unstageAllSection')}
              </Button>
            ) : null}
          </div>
        </div>

        <ScrollArea className="flex-1 p-2">
          {totalChanges === 0 ? (
            <div className="py-24 px-4 text-center space-y-2 text-muted-foreground">
              <Check className="h-8 w-8 mx-auto text-emerald-400/60" />
              <div className="text-xs font-medium text-foreground">{t('changes.empty')}</div>
              <div className="text-[11px] leading-relaxed">
                {t('changes.emptyDesc')}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Staged Section */}
              {stagedFiles.length > 0 && (
                <div>
                  <div className="flex items-center justify-between px-1.5 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                    <span>{t('changes.section.staged')} ({stagedFiles.length})</span>
                    <button
                      onClick={() => {
                        runGitAction(() => unstageAll(), t('changes.unstageAllToast'), t('changes.unstageFailed'));
                      }}
                      className="text-[9px] text-muted-foreground hover:text-foreground"
                    >
                      {t('changes.unstageAll')}
                    </button>
                  </div>
                  <div className="space-y-0.5">
                    {stagedFiles.map((file) => (
                      <div
                        key={file.path}
                        onClick={() => setSelectedFile(file)}
                        className={cn(
                          "flex items-center justify-between px-2 py-1.5 rounded-md text-xs cursor-pointer transition-colors group",
                          activeFile?.path === file.path
                            ? "bg-accent text-accent-foreground font-medium"
                            : "text-muted-foreground hover:text-foreground hover:bg-accent/40"
                        )}
                      >
                        <div className="flex items-center gap-2 truncate min-w-0">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              runGitAction(
                                () => unstageFile(file.path),
                                `${t('changes.unstagedToast')}: ${file.path}`,
                                `${t('changes.unstageFailed')}: ${file.path}`
                              );
                            }}
                            className="text-emerald-400 hover:text-emerald-300 shrink-0"
                            title={t('changes.clickToUnstage')}
                          >
                            <CheckSquare className="h-3.5 w-3.5" />
                          </button>
                          {getStatusBadge(file.status)}
                          <span className="truncate text-[11px] font-mono">{file.path}</span>
                        </div>
                        <Button
                          variant="ghost"
                          size="xs"
                          className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100 hover:text-rose-400 shrink-0"
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
                    ))}
                  </div>
                </div>
              )}

              {/* Unstaged Section */}
              {unstagedFiles.length > 0 && (
                <div>
                  <div className="flex items-center justify-between px-1.5 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                    <span>{t('changes.section.unstaged')} ({unstagedFiles.length})</span>
                    <button
                      onClick={() => {
                        runGitAction(() => stageAll(), t('changes.stageAllToast'), t('changes.stageFailed'));
                      }}
                      className="text-[9px] text-muted-foreground hover:text-foreground"
                    >
                      {t('changes.stageAllSection')}
                    </button>
                  </div>
                  <div className="space-y-0.5">
                    {unstagedFiles.map((file) => (
                      <div
                        key={file.path}
                        onClick={() => setSelectedFile(file)}
                        className={cn(
                          "flex items-center justify-between px-2 py-1.5 rounded-md text-xs cursor-pointer transition-colors group",
                          activeFile?.path === file.path
                            ? "bg-accent text-accent-foreground font-medium"
                            : "text-muted-foreground hover:text-foreground hover:bg-accent/40"
                        )}
                      >
                        <div className="flex items-center gap-2 truncate min-w-0">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              runGitAction(
                                () => stageFile(file.path),
                                `${t('changes.stagedToast')}: ${file.path}`,
                                `${t('changes.stageFailed')}: ${file.path}`
                              );
                            }}
                            className="text-muted-foreground hover:text-emerald-400 shrink-0"
                            title={t('changes.clickToStage')}
                          >
                            <Square className="h-3.5 w-3.5" />
                          </button>
                          {getStatusBadge(file.status)}
                          <span className="truncate text-[11px] font-mono">{file.path}</span>
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 shrink-0">
                          {file.status === 'conflicted' ? (
                            <>
                              <Button
                                variant="ghost"
                                size="xs"
                                className="h-5 w-5 p-0 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10"
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
                                className="h-5 w-5 p-0 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10"
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
                                className="h-5 w-5 p-0 text-sky-400 hover:text-sky-300 hover:bg-sky-500/10"
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
                                className="h-5 w-5 p-0 text-muted-foreground hover:text-foreground"
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
                                className="h-5 w-5 p-0 hover:text-emerald-400"
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
                                className="h-5 w-5 p-0 hover:text-rose-400"
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
                                className="h-5 w-5 p-0 hover:text-emerald-400"
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
                    ))}
                  </div>
                </div>
              )}

              {/* Untracked Section */}
              {untrackedFiles.length > 0 && (
                <div>
                  <div className="flex items-center justify-between px-1.5 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                    <span>{t('changes.untracked')} ({untrackedFiles.length})</span>
                  </div>
                  <div className="space-y-0.5">
                    {untrackedFiles.map((file) => (
                      <div
                        key={file.path}
                        onClick={() => setSelectedFile(file)}
                        className={cn(
                          "flex items-center justify-between px-2 py-1.5 rounded-md text-xs cursor-pointer transition-colors group",
                          activeFile?.path === file.path
                            ? "bg-accent text-accent-foreground font-medium"
                            : "text-muted-foreground hover:text-foreground hover:bg-accent/40"
                        )}
                      >
                        <div className="flex items-center gap-2 truncate min-w-0">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              runGitAction(
                                () => stageFile(file.path),
                                `${t('changes.tracked')}: ${file.path}`,
                                `${t('changes.trackedFailed')}: ${file.path}`
                              );
                            }}
                            className="text-muted-foreground hover:text-emerald-400 shrink-0"
                            title={t('changes.clickToTrack')}
                          >
                            <Square className="h-3.5 w-3.5" />
                          </button>
                          {getStatusBadge(file.status)}
                          <span className="truncate text-[11px] font-mono">{file.path}</span>
                        </div>
                        <Button
                          variant="ghost"
                          size="xs"
                          className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100 hover:text-emerald-400 shrink-0"
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
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </ScrollArea>
      </div>

      <ResizeHandle
        currentSize={changesFileListWidth}
        onSizeChange={setChangesFileListWidth}
        minSize={160}
        maxSize={500}
        defaultSize={DEFAULT_LAYOUT.changesFileListWidth}
        title={t('changes.resizeHint')}
      />

      {/* Diff Viewer Pane */}
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-card/10">
        {/* Diff Toolbar */}
        <div className="h-9 px-3 border-b border-border flex items-center justify-between text-xs bg-card/40 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-mono text-xs font-semibold text-foreground truncate">
              {activeFile?.path || t('rightPane.noFileSelected')}
            </span>
            {activeFile && (
              <>
                <button
                  onClick={copyFilePath}
                  className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground shrink-0"
                  title={t('changes.copyPath')}
                >
                  {copiedPath ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                </button>
                <Badge variant="outline" className="h-4 px-1.5 text-[9px] uppercase font-mono">
                  {activeFile.status} {activeFile.staged ? t('changes.stagedSuffix') : ''}
                </Badge>
                {(addCount > 0 || delCount > 0) && (
                  <div className="flex items-center gap-1 text-[10px] font-mono">
                    <span className="text-emerald-400 font-semibold">+{addCount}</span>
                    <span className="text-rose-400 font-semibold">-{delCount}</span>
                  </div>
                )}
              </>
            )}
          </div>

          {activeFile && (
            <div className="flex items-center gap-2 shrink-0">
              {/* Content Mode: Diff / Blame / File History */}
              <div className="flex items-center bg-secondary/50 rounded-md p-0.5 border border-border/60">
                <button
                  onClick={() => setContentMode('diff')}
                  className={cn(
                    "px-2 py-0.5 rounded text-[10px] font-medium transition-colors flex items-center gap-1",
                    contentMode === 'diff'
                      ? "bg-accent text-accent-foreground shadow-xs font-semibold"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <FileCode className="h-3 w-3" />
                  <span>{t('changes.mode.diff')}</span>
                </button>
                <button
                  onClick={() => setContentMode('blame')}
                  className={cn(
                    "px-2 py-0.5 rounded text-[10px] font-medium transition-colors flex items-center gap-1",
                    contentMode === 'blame'
                      ? "bg-accent text-accent-foreground shadow-xs font-semibold"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <AlignLeft className="h-3 w-3" />
                  <span>{t('changes.mode.blame')}</span>
                </button>
                <button
                  onClick={() => setContentMode('history')}
                  className={cn(
                    "px-2 py-0.5 rounded text-[10px] font-medium transition-colors flex items-center gap-1",
                    contentMode === 'history'
                      ? "bg-accent text-accent-foreground shadow-xs font-semibold"
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
                      "px-2 py-0.5 rounded text-[10px] font-medium transition-colors flex items-center gap-1",
                      showResolver
                        ? "bg-rose-500/20 text-rose-300 font-semibold border border-rose-500/40"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <Split className="h-3 w-3 text-rose-400" />
                    <span>{t('changes.resolveConflict')}</span>
                  </button>
                  <button
                    onClick={() => setShowResolver(false)}
                    className={cn(
                      "px-2 py-0.5 rounded text-[10px] font-medium transition-colors",
                      !showResolver
                        ? "bg-accent text-accent-foreground font-semibold shadow-xs"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {t('changes.viewDiff')}
                  </button>
                </div>
              )}

              {/* Unified / Split Toggle */}
              {contentMode === 'diff' && (!showResolver || activeFile.status !== 'conflicted') && (
                <div className="flex items-center bg-secondary/50 rounded-md p-0.5 border border-border/60">
                  <button
                    onClick={() => setDiffMode('unified')}
                    className={cn(
                      "px-2 py-0.5 rounded text-[10px] font-medium transition-colors",
                      diffMode === 'unified'
                        ? "bg-accent text-accent-foreground shadow-xs font-semibold"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {t('diff.unified')}
                  </button>
                  <button
                    onClick={() => setDiffMode('split')}
                    className={cn(
                      "px-2 py-0.5 rounded text-[10px] font-medium transition-colors",
                      diffMode === 'split'
                        ? "bg-accent text-accent-foreground shadow-xs font-semibold"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {t('diff.split')}
                  </button>
                </div>
              )}

              {/* Quick Stage/Unstage button */}
              <Button
                variant="outline"
                size="xs"
                className="h-6 text-[10px] gap-1"
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
        {activeFile?.status === 'conflicted' && showResolver ? (
          <InteractiveConflictResolver
            filePath={activeFile.path}
            onClose={() => setShowResolver(false)}
            onResolved={() => setShowResolver(false)}
          />
        ) : contentMode === 'blame' ? (
          /* Blame View */
          <div className="flex-1 overflow-auto font-mono text-[11px] leading-relaxed bg-card dark:bg-[#0c0c0e] text-foreground select-text">
            {loadingFileData ? (
              <div className="py-24 flex items-center justify-center gap-2 text-muted-foreground select-none">
                <Loader2 className="h-4 w-4 animate-spin text-cyan-400" />
                <span className="text-xs">{t('changes.loadingData')}</span>
              </div>
            ) : blameLines.length === 0 ? (
              <div className="py-24 text-center space-y-2 text-muted-foreground select-none">
                <AlignLeft className="h-8 w-8 mx-auto text-muted-foreground/30" />
                <div className="text-xs">{t('changes.blameEmpty')}</div>
              </div>
            ) : (
              blameLines.map((bl, idx) => (
                <div
                  key={idx}
                  className="flex items-stretch border-b border-border/25 hover:bg-accent/40 dark:hover:bg-white/[0.03] transition-colors"
                >
                  <div className="w-10 px-2 text-right text-muted-foreground/60 dark:text-muted-foreground/30 select-none shrink-0 bg-muted/40 dark:bg-background/20">
                    {bl.lineNo}
                  </div>
                  <button
                    onClick={() => jumpToCommit(bl.hash)}
                    className={cn(
                      'w-24 shrink-0 truncate px-1.5 font-mono text-[10px] hover:underline cursor-pointer text-left',
                      blameTint(bl.hash)
                    )}
                    title={`${bl.shortHash} ${bl.summary}`}
                  >
                    {bl.shortHash}
                  </button>
                  <div className="w-24 shrink-0 truncate px-1.5 text-muted-foreground">
                    {bl.author}
                  </div>
                  <div className="w-20 shrink-0 px-1 text-muted-foreground/70 font-mono text-[10px]">
                    {blameDate(bl.authorDateIso)}
                  </div>
                  <div className="px-2 whitespace-pre font-mono flex-1 overflow-x-auto">
                    {bl.content}
                  </div>
                </div>
              ))
            )}
          </div>
        ) : contentMode === 'history' ? (
          /* File History View */
          <div className="flex-1 overflow-auto bg-card dark:bg-[#0c0c0e] text-foreground select-none">
            {loadingFileData ? (
              <div className="py-24 flex items-center justify-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin text-cyan-400" />
                <span className="text-xs">{t('changes.loadingData')}</span>
              </div>
            ) : fileCommits.length === 0 ? (
              <div className="py-24 text-center space-y-2 text-muted-foreground">
                <History className="h-8 w-8 mx-auto text-muted-foreground/30" />
                <div className="text-xs">{t('changes.fileHistoryEmpty')}</div>
              </div>
            ) : (
              fileCommits.map((c) => (
                <div
                  key={c.hash}
                  onClick={() => jumpToCommit(c.hash)}
                  className="flex items-center gap-2 px-3 py-1.5 border-b border-border/25 hover:bg-accent/40 dark:hover:bg-white/[0.03] cursor-pointer transition-colors text-[11px]"
                >
                  <span className="font-mono text-cyan-600 dark:text-cyan-400 shrink-0">
                    {c.shortHash}
                  </span>
                  <span className="flex-1 truncate" title={c.subject}>
                    {c.subject}
                  </span>
                  <span className="text-muted-foreground shrink-0 max-w-[100px] truncate">
                    {c.author.name}
                  </span>
                  <span className="text-muted-foreground/70 font-mono text-[10px] shrink-0 w-20 text-right">
                    {c.author.relativeDate}
                  </span>
                </div>
              ))
            )}
          </div>
        ) : (
          /* Diff Content View */
          <div className="flex-1 overflow-auto font-mono text-[11px] leading-relaxed bg-card dark:bg-[#0c0c0e] text-foreground select-text">
            {fileDiffLines.length === 0 ? (
              <div className="py-24 text-center space-y-2 text-muted-foreground select-none">
                <FileCode className="h-8 w-8 mx-auto text-muted-foreground/30" />
                <div className="text-xs">
                  {activeFile ? t('changes.emptyDiffUntracked') : t('rightPane.noFileSelectedDesc')}
                </div>
              </div>
            ) : diffMode === 'split' ? (
              /* Split Two-Column View */
              <div className="min-w-full">
                {splitRows.map((row, idx) => {
                  if (row.isHeader) {
                    return (
                      <div
                        key={idx}
                        className="diff-line-header px-4 py-1 font-semibold select-none font-mono text-[10px] w-full flex items-center justify-between gap-2"
                      >
                        <span className="truncate">{row.headerContent}</span>
                        {renderHunkActions(row.hunkIdx ?? -1)}
                      </div>
                    );
                  }

                  const hasLeft = !!row.left;
                  const hasRight = !!row.right;
                  const isLeftDel = row.left?.type === 'delete';
                  const isRightAdd = row.right?.type === 'add';

                  return (
                    <div
                      key={idx}
                      className="grid grid-cols-2 divide-x divide-border/60 hover:bg-accent/40 dark:hover:bg-white/[0.03] transition-colors"
                    >
                      {/* Left Column (Original / Deletions) */}
                      <div
                        className={cn(
                          "flex items-stretch overflow-hidden min-w-0 border-l-2",
                          isLeftDel
                            ? "diff-line-del font-medium dark:font-normal"
                            : hasLeft
                            ? "border-transparent text-foreground/85"
                            : "border-transparent bg-muted/15 opacity-40 select-none"
                        )}
                      >
                        <div className="w-10 px-2 text-right text-muted-foreground/60 dark:text-muted-foreground/30 select-none shrink-0 font-mono text-[10px] bg-muted/40 dark:bg-background/20 border-r border-border/40">
                          {row.left?.lineNo ?? ''}
                        </div>
                        <div className="px-2.5 whitespace-pre font-mono flex-1 overflow-x-auto">
                          {row.left?.content ?? ''}
                        </div>
                      </div>

                      {/* Right Column (Modified / Additions) */}
                      <div
                        className={cn(
                          "flex items-stretch overflow-hidden min-w-0 border-l-2",
                          isRightAdd
                            ? "diff-line-add font-medium dark:font-normal"
                            : hasRight
                            ? "border-transparent text-foreground/85"
                            : "border-transparent bg-muted/15 opacity-40 select-none"
                        )}
                      >
                        <div className="w-10 px-2 text-right text-muted-foreground/60 dark:text-muted-foreground/30 select-none shrink-0 font-mono text-[10px] bg-muted/40 dark:bg-background/20 border-r border-border/40">
                          {row.right?.lineNo ?? ''}
                        </div>
                        <div className="px-2.5 whitespace-pre font-mono flex-1 overflow-x-auto">
                          {row.right?.content ?? ''}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              /* Unified Single Column View */
              fileDiffLines.map((line, idx) => {
                if (line.type === 'header') {
                  return (
                    <div
                      key={idx}
                      className="diff-line-header px-4 py-1 font-semibold select-none font-mono text-[10px] flex items-center justify-between gap-2"
                    >
                      <span className="truncate">{line.content}</span>
                      {renderHunkActions(headerHunkIdx.get(idx) ?? -1)}
                    </div>
                  );
                }

                const isAdd = line.type === 'add';
                const isDel = line.type === 'delete';

                return (
                  <div
                    key={idx}
                    className={cn(
                      "flex items-stretch hover:bg-accent/40 dark:hover:bg-white/[0.03] transition-colors border-l-2",
                      isAdd
                        ? "diff-line-add font-medium dark:font-normal"
                        : isDel
                        ? "diff-line-del font-medium dark:font-normal"
                        : "border-transparent text-foreground/85"
                    )}
                  >
                    {/* Line Numbers */}
                    <div className="w-10 px-2 text-right text-muted-foreground/60 dark:text-muted-foreground/30 select-none shrink-0 font-mono text-[10px] bg-muted/40 dark:bg-background/20">
                      {line.oldNo ?? ''}
                    </div>
                    <div className="w-10 px-2 text-right text-muted-foreground/60 dark:text-muted-foreground/30 select-none shrink-0 font-mono text-[10px] border-r border-border/60 dark:border-border/20 bg-muted/40 dark:bg-background/20">
                      {line.newNo ?? ''}
                    </div>
                    {/* Content */}
                    <div className="px-3 whitespace-pre font-mono flex-1 overflow-x-auto">
                      {line.content}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  </div>
);
};
