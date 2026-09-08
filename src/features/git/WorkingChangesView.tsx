import React, { useState, useMemo } from 'react';
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
import { ParsedDiffLine } from '@/services/git/PorcelainParser';

interface SplitRow {
  isHeader?: boolean;
  headerContent?: string;
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

  while (i < diffLines.length) {
    const line = diffLines[i];

    if (line.type === 'header') {
      rows.push({
        isHeader: true,
        headerContent: line.content,
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
    stageFile,
    unstageFile,
    stageAll,
    unstageAll,
    discardChanges,
    stashPush,
    resolveFileOurs,
    resolveFileTheirs,
    resetFileConflictMarkers,
  } = useRepoStore();
  const { t } = useI18n();

  const [diffMode, setDiffMode] = useState<'unified' | 'split'>('unified');
  const [copiedPath, setCopiedPath] = useState(false);
  const [showResolver, setShowResolver] = useState(true);

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
          <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-400 border border-rose-500/40 animate-pulse" title="存在未解决代码冲突">
            冲突
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
    toast.success('已复制文件路径', activeFile.path);
    setTimeout(() => setCopiedPath(false), 2000);
  };

  // Compute diff addition / deletion counts
  const addCount = fileDiffLines.filter((l) => l.type === 'add').length;
  const delCount = fileDiffLines.filter((l) => l.type === 'delete').length;

  const splitRows = useMemo(() => {
    if (diffMode !== 'split' || fileDiffLines.length === 0) return [];
    return computeSplitRows(fileDiffLines);
  }, [diffMode, fileDiffLines]);

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
                title={stagedFiles.length === totalChanges ? "取消全选" : "全选暂存"}
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
                    await stashPush('工作区快捷暂存');
                    toast.success('已存入贮藏 (Stash)', '修改已存入贮藏堆栈');
                  } catch (err: any) {
                    toast.error('贮藏失败', err.message);
                  }
                }}
                className="h-6 px-1.5 text-[10px] text-muted-foreground hover:text-cyan-400 gap-1"
                title="快速暂存当前修改并还原工作区"
              >
                <Archive className="h-3 w-3" />
                <span>贮藏</span>
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
                取消全部
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
                            title="点击取消暂存"
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
                          title="取消暂存"
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
                      全部暂存
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
                            title="点击暂存此文件"
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
                                title="打开解决冲突工作台"
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
                                title="采用当前更改 (Ours)"
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  try {
                                    await resolveFileOurs(file.path);
                                    toast.success(`已采用当前版本: ${file.path}`);
                                  } catch (err: any) {
                                    toast.error('操作失败', err.message);
                                  }
                                }}
                              >
                                <Shield className="h-3 w-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="xs"
                                className="h-5 w-5 p-0 text-sky-400 hover:text-sky-300 hover:bg-sky-500/10"
                                title="采用传入更改 (Theirs)"
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  try {
                                    await resolveFileTheirs(file.path);
                                    toast.success(`已采用传入版本: ${file.path}`);
                                  } catch (err: any) {
                                    toast.error('操作失败', err.message);
                                  }
                                }}
                              >
                                <Download className="h-3 w-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="xs"
                                className="h-5 w-5 p-0 text-muted-foreground hover:text-foreground"
                                title="重置回冲突标记 (Reset Markers)"
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  try {
                                    await resetFileConflictMarkers(file.path);
                                    toast.info(`已重置冲突标记: ${file.path}`);
                                  } catch (err: any) {
                                    toast.error('重置失败', err.message);
                                  }
                                }}
                              >
                                <RotateCcw className="h-3 w-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="xs"
                                className="h-5 w-5 p-0 hover:text-emerald-400"
                                title="标记为已解决并暂存"
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
                                title="放弃修改 (Discard)"
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
                                title="暂存此文件 (Stage)"
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
                            title="点击添加跟踪并暂存"
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
                          title="跟踪并暂存"
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
        title="按住拖拽调节变更列表宽度，双击恢复默认"
      />

      {/* Diff Viewer Pane */}
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-card/10">
        {/* Diff Toolbar */}
        <div className="h-9 px-3 border-b border-border flex items-center justify-between text-xs bg-card/40 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-mono text-xs font-semibold text-foreground truncate">
              {activeFile?.path || '未选择任何文件'}
            </span>
            {activeFile && (
              <>
                <button
                  onClick={copyFilePath}
                  className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground shrink-0"
                  title="复制路径"
                >
                  {copiedPath ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                </button>
                <Badge variant="outline" className="h-4 px-1.5 text-[9px] uppercase font-mono">
                  {activeFile.status} {activeFile.staged ? '(已暂存)' : ''}
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
                    <span>解决冲突</span>
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
                    查看 Diff
                  </button>
                </div>
              )}

              {/* Unified / Split Toggle */}
              {(!showResolver || activeFile.status !== 'conflicted') && (
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
                    Unified
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
                    Split
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
                <span>{activeFile.staged ? '取消暂存' : '暂存此文件'}</span>
              </Button>
            </div>
          )}
        </div>

        {/* Content Pane: Conflict Resolver or Diff View */}
        {activeFile?.status === 'conflicted' && showResolver ? (
          <InteractiveConflictResolver
            filePath={activeFile.path}
            onClose={() => setShowResolver(false)}
            onResolved={() => setShowResolver(false)}
          />
        ) : (
          /* Diff Content View */
          <div className="flex-1 overflow-auto font-mono text-[11px] leading-relaxed bg-card dark:bg-[#0c0c0e] text-foreground select-text">
            {fileDiffLines.length === 0 ? (
              <div className="py-24 text-center space-y-2 text-muted-foreground select-none">
                <FileCode className="h-8 w-8 mx-auto text-muted-foreground/30" />
                <div className="text-xs">
                  {activeFile ? '暂无代码差异或该文件为新增加的未跟踪文件' : '请在左侧选择需要对比的文件'}
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
                        className="diff-line-header px-4 py-1 font-semibold select-none font-mono text-[10px] w-full"
                      >
                        {row.headerContent}
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
                      className="diff-line-header px-4 py-1 font-semibold select-none font-mono text-[10px]"
                    >
                      {line.content}
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
