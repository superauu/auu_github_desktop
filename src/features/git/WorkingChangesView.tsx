import React, { useState } from 'react';
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
} from 'lucide-react';
import { useRepoStore } from '@/stores/repoStore';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from '@/stores/toastStore';
import { cn } from '@/utils/cn';

export const WorkingChangesView: React.FC = () => {
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
  } = useRepoStore();

  const [diffMode, setDiffMode] = useState<'unified' | 'split'>('unified');
  const [copiedPath, setCopiedPath] = useState(false);

  const stagedFiles = status?.staged || [];
  const unstagedFiles = status?.unstaged || [];
  const untrackedFiles = status?.untracked || [];

  const activeFile = selectedFile || stagedFiles[0] || unstagedFiles[0] || untrackedFiles[0];

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
        return <span className="text-[10px] font-mono font-bold text-purple-400">U</span>;
      case 'conflicted':
        return <span className="text-[10px] font-mono font-bold text-rose-500">C</span>;
      default:
        return <span className="text-[10px] font-mono font-bold text-blue-400">?</span>;
    }
  };

  const totalChanges = stagedFiles.length + unstagedFiles.length + untrackedFiles.length;

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

  return (
    <div className="flex-1 h-full flex overflow-hidden select-none bg-background">
      {/* Changes File List Sub-panel */}
      <div className="w-64 border-r border-border bg-sidebar/50 flex flex-col shrink-0 h-full overflow-hidden">
        <div className="h-9 px-3 border-b border-border flex items-center justify-between font-medium text-xs text-foreground bg-accent/20 shrink-0">
          <span>工作区变更 ({totalChanges})</span>
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
                  stageAll();
                  toast.success('已暂存所有工作区修改');
                }}
                className="h-6 px-1.5 text-[10px] text-muted-foreground hover:text-foreground"
              >
                暂存全部
              </Button>
            ) : stagedFiles.length > 0 ? (
              <Button
                variant="ghost"
                size="xs"
                onClick={() => {
                  unstageAll();
                  toast.info('已取消全部暂存');
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
              <div className="text-xs font-medium text-foreground">工作区非常干净</div>
              <div className="text-[11px] leading-relaxed">
                没有任何未提交的修改或未跟踪文件。
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Staged Section */}
              {stagedFiles.length > 0 && (
                <div>
                  <div className="flex items-center justify-between px-1.5 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                    <span>已暂存改动 ({stagedFiles.length})</span>
                    <button
                      onClick={() => {
                        unstageAll();
                        toast.info('已取消全部暂存');
                      }}
                      className="text-[9px] text-muted-foreground hover:text-foreground"
                    >
                      全部取消
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
                            unstageFile(file.path);
                            toast.info(`已取消暂存: ${file.path}`);
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
                    <span>未暂存改动 ({unstagedFiles.length})</span>
                    <button
                      onClick={() => {
                        stageAll();
                        toast.success('已暂存所有修改');
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
                          {getStatusBadge(file.status)}
                          <span className="truncate text-[11px] font-mono">{file.path}</span>
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 shrink-0">
                          <Button
                            variant="ghost"
                            size="xs"
                            className="h-5 w-5 p-0 hover:text-rose-400"
                            title="放弃修改 (Discard)"
                            onClick={(e) => {
                              e.stopPropagation();
                              discardChanges(file.path);
                              toast.info(`已还原文件: ${file.path}`);
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
                              stageFile(file.path);
                              toast.success(`已暂存: ${file.path}`);
                            }}
                          >
                            <Plus className="h-3 w-3" />
                          </Button>
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
                    <span>未跟踪文件 ({untrackedFiles.length})</span>
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
                            stageFile(file.path);
                            toast.success(`已添加跟踪: ${file.path}`);
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
              {/* Unified / Split Toggle */}
              <div className="flex items-center bg-secondary/50 rounded-md p-0.5 border border-border/60">
                <button
                  onClick={() => setDiffMode('unified')}
                  className={cn(
                    "px-2 py-0.5 rounded text-[10px] font-medium transition-colors",
                    diffMode === 'unified'
                      ? "bg-accent text-accent-foreground shadow-xs"
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
                      ? "bg-accent text-accent-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  Split
                </button>
              </div>

              {/* Quick Stage/Unstage button */}
              <Button
                variant="outline"
                size="xs"
                className="h-6 text-[10px] gap-1"
                onClick={() => {
                  if (activeFile.staged) {
                    unstageFile(activeFile.path);
                    toast.info(`已取消暂存: ${activeFile.path}`);
                  } else {
                    stageFile(activeFile.path);
                    toast.success(`已暂存文件: ${activeFile.path}`);
                  }
                }}
              >
                {activeFile.staged ? <Square className="h-3 w-3" /> : <CheckSquare className="h-3 w-3" />}
                <span>{activeFile.staged ? '取消暂存' : '暂存此文件'}</span>
              </Button>
            </div>
          )}
        </div>

        {/* Diff Content View */}
        <div className="flex-1 overflow-auto font-mono text-[11px] leading-relaxed bg-[#070a12] select-text">
          {fileDiffLines.length === 0 ? (
            <div className="py-24 text-center space-y-2 text-muted-foreground select-none">
              <FileCode className="h-8 w-8 mx-auto text-muted-foreground/30" />
              <div className="text-xs">
                {activeFile ? '暂无代码差异或该文件为新增加的未跟踪文件' : '请在左侧选择需要对比的文件'}
              </div>
            </div>
          ) : (
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
                    "flex items-stretch hover:bg-white/[0.03] transition-colors border-l-2",
                    isAdd
                      ? "diff-line-add text-emerald-300"
                      : isDel
                      ? "diff-line-del text-rose-300"
                      : "border-transparent text-foreground/80"
                  )}
                >
                  {/* Line Numbers */}
                  <div className="w-10 px-2 text-right text-muted-foreground/30 select-none shrink-0 font-mono text-[10px] bg-background/20">
                    {line.oldNo ?? ''}
                  </div>
                  <div className="w-10 px-2 text-right text-muted-foreground/30 select-none shrink-0 font-mono text-[10px] border-r border-border/20 bg-background/20">
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
      </div>
    </div>
  );
};
