import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Save,
  Split,
  X,
  Sparkles,
  Shield,
  Download,
} from 'lucide-react';
import { useRepoStore } from '@/stores/repoStore';
import {
  parseConflictBlocks,
  resolveSingleBlock,
  resolveAllBlocks,
  ConflictBlock,
} from '@/services/git/ConflictParser';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/stores/toastStore';
import { cn } from '@/utils/cn';

interface InteractiveConflictResolverProps {
  filePath: string;
  onClose?: () => void;
  onResolved?: () => void;
}

interface TextSegment {
  type: 'plain' | 'conflict';
  startLine: number;
  content: string;
  block?: ConflictBlock;
}

export const InteractiveConflictResolver: React.FC<InteractiveConflictResolverProps> = ({
  filePath,
  onClose,
  onResolved,
}) => {
  const {
    readWorkingFile,
    saveAndStageConflictFile,
    resetFileConflictMarkers,
    resolveFileOurs,
    resolveFileTheirs,
  } = useRepoStore();

  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState<string>('');
  const [initialConflictCount, setInitialConflictCount] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [activeBlockIndex, setActiveBlockIndex] = useState<number>(0);
  const blockRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  // Load file content
  const loadContent = async () => {
    setLoading(true);
    try {
      const text = await readWorkingFile(filePath);
      setContent(text);
      const parsed = parseConflictBlocks(text);
      setInitialConflictCount(parsed.totalConflicts);
    } catch (err: any) {
      toast.error('加载冲突文件失败', err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadContent();
  }, [filePath]);

  // Parse conflicts from current edited content
  const parsed = useMemo(() => parseConflictBlocks(content), [content]);
  const { blocks, totalConflicts, hasConflicts } = parsed;

  // Split content into renderable segments (plain lines vs conflict blocks)
  const segments = useMemo(() => {
    if (!content) return [];
    const lines = content.split(/\r?\n/);
    const segs: TextSegment[] = [];

    let currentLineIdx = 0; // 0-indexed

    for (const b of blocks) {
      const plainBeforeEnd = b.startLine - 1;
      if (plainBeforeEnd > currentLineIdx) {
        segs.push({
          type: 'plain',
          startLine: currentLineIdx + 1,
          content: lines.slice(currentLineIdx, plainBeforeEnd).join('\n'),
        });
      }

      segs.push({
        type: 'conflict',
        startLine: b.startLine,
        content: lines.slice(b.startLine - 1, b.endLine).join('\n'),
        block: b,
      });

      currentLineIdx = b.endLine;
    }

    if (currentLineIdx < lines.length) {
      segs.push({
        type: 'plain',
        startLine: currentLineIdx + 1,
        content: lines.slice(currentLineIdx).join('\n'),
      });
    }

    return segs;
  }, [content, blocks]);

  const handleResolveBlock = (
    index: number,
    resolution: 'current' | 'incoming' | 'both' | 'both_reverse'
  ) => {
    const updated = resolveSingleBlock(content, index, resolution);
    setContent(updated);

    const nextParsed = parseConflictBlocks(updated);
    if (nextParsed.totalConflicts === 0) {
      toast.success('所有冲突已解决！', '请点击右上角“保存并标记已解决”暂存此文件。');
    }
  };

  const handleResolveAll = (resolution: 'current' | 'incoming' | 'both') => {
    const updated = resolveAllBlocks(content, resolution);
    setContent(updated);
    toast.success(
      resolution === 'current'
        ? '已全部采用当前更改 (HEAD)'
        : resolution === 'incoming'
        ? '已全部采用传入更改'
        : '已全部保留双方更改',
      '请点击“保存并标记已解决”完成暂存。'
    );
  };

  const handleQuickOurs = async () => {
    setIsSaving(true);
    try {
      await resolveFileOurs(filePath);
      toast.success(`已采用当前版本并标记已解决`, filePath);
      onResolved?.();
    } catch (err: any) {
      toast.error('操作失败', err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleQuickTheirs = async () => {
    setIsSaving(true);
    try {
      await resolveFileTheirs(filePath);
      toast.success(`已采用传入版本并标记已解决`, filePath);
      onResolved?.();
    } catch (err: any) {
      toast.error('操作失败', err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetMarkers = async () => {
    setIsSaving(true);
    try {
      await resetFileConflictMarkers(filePath);
      await loadContent();
      toast.info('已重置回初始冲突标记', filePath);
    } catch (err: any) {
      toast.error('重置失败', err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveAndStage = async () => {
    setIsSaving(true);
    try {
      await saveAndStageConflictFile(filePath, content);
      toast.success('冲突解决成功已暂存！', filePath);
      onResolved?.();
      onClose?.();
    } catch (err: any) {
      toast.error('保存失败', err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const scrollToBlock = (idx: number) => {
    if (blocks.length === 0) return;
    const clamped = Math.max(0, Math.min(blocks.length - 1, idx));
    setActiveBlockIndex(clamped);
    const targetBlock = blocks[clamped];
    if (targetBlock) {
      const el = blockRefs.current.get(targetBlock.index);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center h-full p-8 text-muted-foreground gap-3">
        <RotateCcw className="h-6 w-6 animate-spin text-primary" />
        <div className="text-xs">正在分析冲突代码与标记...</div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-background select-none">
      {/* Top Toolbar */}
      <div className="h-10 px-3 border-b border-border flex items-center justify-between gap-2 bg-card/60 backdrop-blur-sm shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1 rounded bg-rose-500/10 text-rose-400 shrink-0">
            <Split className="h-3.5 w-3.5" />
          </div>
          <span className="font-mono text-xs font-semibold text-foreground truncate max-w-[240px]" title={filePath}>
            {filePath}
          </span>
          <Badge
            variant="outline"
            className={cn(
              "h-5 px-2 text-[10px] font-mono",
              hasConflicts
                ? "border-rose-500/40 text-rose-400 bg-rose-500/10"
                : "border-emerald-500/40 text-emerald-400 bg-emerald-500/10"
            )}
          >
            {hasConflicts ? `剩余 ${totalConflicts} 处冲突` : '✓ 冲突已全部解决'}
          </Badge>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Conflict Navigation */}
          {blocks.length > 0 && (
            <div className="flex items-center bg-secondary/50 rounded-md border border-border/60 p-0.5 mr-1">
              <span className="text-[10px] font-mono px-2 text-muted-foreground">
                {activeBlockIndex + 1} / {blocks.length}
              </span>
              <button
                onClick={() => scrollToBlock(activeBlockIndex - 1)}
                disabled={activeBlockIndex <= 0}
                className="p-1 rounded hover:bg-accent disabled:opacity-30 text-muted-foreground hover:text-foreground"
                title="上一处冲突"
              >
                <ChevronUp className="h-3 w-3" />
              </button>
              <button
                onClick={() => scrollToBlock(activeBlockIndex + 1)}
                disabled={activeBlockIndex >= blocks.length - 1}
                className="p-1 rounded hover:bg-accent disabled:opacity-30 text-muted-foreground hover:text-foreground"
                title="下一处冲突"
              >
                <ChevronDown className="h-3 w-3" />
              </button>
            </div>
          )}

          {/* Batch Actions */}
          {hasConflicts && (
            <>
              <Button
                variant="ghost"
                size="xs"
                onClick={() => handleResolveAll('current')}
                className="h-7 text-[10px] px-2 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10"
                title="所有冲突块统一采用本地修改"
              >
                全部采用当前
              </Button>
              <Button
                variant="ghost"
                size="xs"
                onClick={() => handleResolveAll('incoming')}
                className="h-7 text-[10px] px-2 text-sky-400 hover:text-sky-300 hover:bg-sky-500/10"
                title="所有冲突块统一采用传入分支修改"
              >
                全部采用传入
              </Button>
              <Button
                variant="ghost"
                size="xs"
                onClick={handleQuickOurs}
                disabled={isSaving}
                className="h-7 text-[10px] px-2 text-emerald-400/80 hover:text-emerald-300 hover:bg-emerald-500/10 gap-1"
                title="直接将当前分支整个文件作为解决结果"
              >
                <Shield className="h-3 w-3" />
                <span>整文件用当前</span>
              </Button>
              <Button
                variant="ghost"
                size="xs"
                onClick={handleQuickTheirs}
                disabled={isSaving}
                className="h-7 text-[10px] px-2 text-sky-400/80 hover:text-sky-300 hover:bg-sky-500/10 gap-1"
                title="直接将传入分支整个文件作为解决结果"
              >
                <Download className="h-3 w-3" />
                <span>整文件用传入</span>
              </Button>
            </>
          )}

          <Button
            variant="ghost"
            size="xs"
            onClick={handleResetMarkers}
            disabled={isSaving}
            className="h-7 text-[10px] px-2 text-muted-foreground hover:text-foreground gap-1"
            title="还原为原始冲突标记"
          >
            <RotateCcw className="h-3 w-3" />
            <span>重置标记</span>
          </Button>

          {/* Primary Save & Stage button */}
          <Button
            size="xs"
            onClick={handleSaveAndStage}
            disabled={isSaving}
            className={cn(
              "h-7 text-xs px-3 gap-1.5 shadow-sm transition-all",
              !hasConflicts
                ? "bg-emerald-600 hover:bg-emerald-500 text-white animate-pulse"
                : "bg-primary hover:bg-primary/90 text-primary-foreground"
            )}
            title="将解决后的文件写入并执行 git add"
          >
            {hasConflicts ? (
              <>
                <Save className="h-3.5 w-3.5" />
                <span>保存并暂存</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>已完全解决，暂存</span>
              </>
            )}
          </Button>

          {onClose && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              onClick={onClose}
              title="关闭冲突解决器并返回 Diff 视图"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Editor Content Area */}
      <div className="flex-1 overflow-auto bg-[#070a12] text-foreground font-mono text-xs select-text">
        {!hasConflicts && initialConflictCount > 0 && (
          <div className="p-4 mx-4 my-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Sparkles className="h-5 w-5 shrink-0 text-emerald-400" />
              <div>
                <div className="font-semibold text-xs text-foreground">所有冲突标记已成功消除！</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  已按所选决策合成了最终文件，请点击右上角【保存并暂存】写入磁盘并标记已解决。
                </div>
              </div>
            </div>
            <Button
              size="xs"
              onClick={handleSaveAndStage}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs px-3 h-7 gap-1"
            >
              <Check className="h-3 w-3" />
              <span>立即完成暂存</span>
            </Button>
          </div>
        )}

        <div className="p-2 space-y-2">
          {segments.map((seg, sIdx) => {
            if (seg.type === 'plain') {
              return (
                <div key={sIdx} className="py-1 px-3 text-muted-foreground/80 leading-relaxed whitespace-pre font-mono text-[11px]">
                  {seg.content}
                </div>
              );
            }

            const block = seg.block!;
            const isActive = blocks[activeBlockIndex]?.index === block.index;

            return (
              <div
                key={block.id}
                ref={(el) => {
                  if (el) blockRefs.current.set(block.index, el);
                  else blockRefs.current.delete(block.index);
                }}
                className={cn(
                  "rounded-xl border transition-all overflow-hidden my-3 shadow-md",
                  isActive
                    ? "border-primary ring-1 ring-primary/40 bg-card/40"
                    : "border-border/80 bg-card/20 hover:border-border"
                )}
              >
                {/* Conflict Block Action Banner */}
                <div className="bg-secondary/70 border-b border-border/80 px-3 py-1.5 flex items-center justify-between text-xs select-none">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-[11px] text-foreground font-mono bg-background/60 px-2 py-0.5 rounded border border-border/60">
                      冲突 #{block.index + 1}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      第 {block.startLine} - {block.endLine} 行
                    </span>
                  </div>

                  {/* Decision Action Buttons */}
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="outline"
                      size="xs"
                      onClick={() => handleResolveBlock(block.index, 'current')}
                      className="h-6 px-2 text-[10px] border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/15 hover:text-emerald-300 font-medium"
                      title="保留当前分支代码"
                    >
                      采用当前 (Ours)
                    </Button>

                    <Button
                      variant="outline"
                      size="xs"
                      onClick={() => handleResolveBlock(block.index, 'incoming')}
                      className="h-6 px-2 text-[10px] border-sky-500/40 text-sky-400 hover:bg-sky-500/15 hover:text-sky-300 font-medium"
                      title="保留传入分支代码"
                    >
                      采用传入 (Theirs)
                    </Button>

                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => handleResolveBlock(block.index, 'both')}
                      className="h-6 px-2 text-[10px] text-muted-foreground hover:text-foreground"
                      title="同时保留双方修改（当前在前，传入在后）"
                    >
                      保留双方
                    </Button>
                  </div>
                </div>

                {/* Conflict Preview Blocks */}
                <div className="divide-y divide-border/40">
                  {/* Current Section (HEAD) */}
                  <div className="bg-emerald-950/25 border-l-4 border-emerald-500 p-2.5 space-y-1">
                    <div className="flex items-center justify-between text-[10px] text-emerald-400 font-semibold select-none">
                      <span className="flex items-center gap-1">
                        <span>◀ 当前分支更改</span>
                        <span className="font-mono opacity-75">({block.currentBranchName})</span>
                      </span>
                      <button
                        onClick={() => handleResolveBlock(block.index, 'current')}
                        className="hover:underline text-[9px] opacity-80 hover:opacity-100"
                      >
                        采用此段
                      </button>
                    </div>
                    <pre className="text-emerald-200/90 whitespace-pre-wrap font-mono text-[11px] leading-relaxed select-text">
                      {block.currentContent || <span className="italic opacity-50">&lt;空行&gt;</span>}
                    </pre>
                  </div>

                  {/* Optional Base Section (3-Way) */}
                  {block.baseContent !== undefined && (
                    <div className="bg-muted/10 border-l-4 border-muted-foreground/30 p-2 space-y-1">
                      <div className="text-[9px] text-muted-foreground font-medium select-none">
                        公共祖先基底 (Base)
                      </div>
                      <pre className="text-muted-foreground/70 whitespace-pre-wrap font-mono text-[10px]">
                        {block.baseContent}
                      </pre>
                    </div>
                  )}

                  {/* Incoming Section */}
                  <div className="bg-sky-950/25 border-l-4 border-sky-500 p-2.5 space-y-1">
                    <div className="flex items-center justify-between text-[10px] text-sky-400 font-semibold select-none">
                      <span className="flex items-center gap-1">
                        <span>▶ 传入分支更改</span>
                        <span className="font-mono opacity-75">({block.incomingBranchName})</span>
                      </span>
                      <button
                        onClick={() => handleResolveBlock(block.index, 'incoming')}
                        className="hover:underline text-[9px] opacity-80 hover:opacity-100"
                      >
                        采用此段
                      </button>
                    </div>
                    <pre className="text-sky-200/90 whitespace-pre-wrap font-mono text-[11px] leading-relaxed select-text">
                      {block.incomingContent || <span className="italic opacity-50">&lt;空行&gt;</span>}
                    </pre>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
