import { AiTaskDialog } from './AiTaskDialog';
import { ConflictAiSuggestion } from './ConflictAiSuggestion';
import { useShallow } from 'zustand/react/shallow';
import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Columns3,
  RotateCcw,
  Save,
  Split,
  X,
  Sparkles,
  Shield,
  Download,
} from 'lucide-react';
import { useI18n } from '@/i18n';
import { useRepoStore } from '@/stores/repoStore';
import { useSettingsStore } from '@/stores/settingsStore';
import {
  parseConflictBlocks,
  resolveSingleBlock,
  resolveAllBlocks,
  ConflictBlock,
} from '@/services/git/ConflictParser';
import {
  fetchStages,
  locateBlockSpans,
  type BlockSpan,
  type ConflictSide,
  type ConflictStages,
} from '@/services/git/ConflictBaseService';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { VirtualRows } from '@/components/ui/VirtualRows';
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
  // plain 段按行拆分，交给 VirtualRows 窗口化渲染（大文件数千行 plain 段不再一次性进 DOM）
  lines?: string[];
  block?: ConflictBlock;
}

export const InteractiveConflictResolver: React.FC<InteractiveConflictResolverProps> = ({
  filePath,
  onClose,
  onResolved,
}) => {
  const {
    currentRepo,
    readWorkingFile,
    saveAndStageConflictFile,
    resetFileConflictMarkers,
    resolveFileOurs,
    resolveFileTheirs,
  } = useRepoStore(useShallow(state => ({ currentRepo: state.currentRepo, readWorkingFile: state.readWorkingFile, saveAndStageConflictFile: state.saveAndStageConflictFile, resetFileConflictMarkers: state.resetFileConflictMarkers, resolveFileOurs: state.resolveFileOurs, resolveFileTheirs: state.resolveFileTheirs })));
  const { t } = useI18n();

  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState<string>('');
  const [readError, setReadError] = useState<string | null>(null);
  const originalContent = useRef<string | undefined>(undefined);
  const loadId = useRef(0);
  const [initialConflictCount, setInitialConflictCount] = useState(0);
  const [aiBlock, setAiBlock] = useState<{ index: number; snapshot: string; context: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [activeBlockIndex, setActiveBlockIndex] = useState<number>(0);
  const blockRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  // F3 三方对照：整文件开关、块级展开集合、索引三阶段版本（基线/我方/对方）。
  const diffFontSize = useSettingsStore(state => state.diffFontSize);
  const [wholeCompareOpen, setWholeCompareOpen] = useState(false);
  const [expandedCompare, setExpandedCompare] = useState<Set<number>>(new Set());
  const [stages, setStages] = useState<ConflictStages | null>(null);
  const [stagesLoading, setStagesLoading] = useState(false);
  const [stagesError, setStagesError] = useState<string | null>(null);
  const stagesId = useRef(0);

  // Load file content
  const loadContent = async () => {
    const request = ++loadId.current;
    const repoPath = currentRepo?.path;
    setLoading(true); setReadError(null); originalContent.current = undefined;
    try {
      const text = await readWorkingFile(filePath);
      if (request !== loadId.current || useRepoStore.getState().currentRepo?.path !== repoPath) return;
      originalContent.current = text;
      setContent(text);
      const parsed = parseConflictBlocks(text);
      setInitialConflictCount(parsed.totalConflicts);
    } catch (err: any) {
      if (request === loadId.current) { setReadError(err.message); setContent(''); toast.error(t('resolver.loadFailed'), err.message); }
    } finally {
      if (request === loadId.current) setLoading(false);
    }
  };

  useEffect(() => {
    setAiBlock(null); void loadContent();
    return () => { loadId.current++; };
  }, [filePath, currentRepo?.path]);

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
        const plainLines = lines.slice(currentLineIdx, plainBeforeEnd);
        segs.push({
          type: 'plain',
          startLine: currentLineIdx + 1,
          content: plainLines.join('\n'),
          lines: plainLines,
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
      const plainLines = lines.slice(currentLineIdx);
      segs.push({
        type: 'plain',
        startLine: currentLineIdx + 1,
        content: plainLines.join('\n'),
        lines: plainLines,
      });
    }

    return segs;
  }, [content, blocks]);

  // F3：读取索引中的三阶段版本（git show :1:/:2:/:3:）。服务层大小护栏（>2MB）与
  // 路径校验失败会走到 stagesError，UI 提供重试；缺失基线（add/add）按 null 透传。
  const loadStages = async () => {
    const request = ++stagesId.current;
    const repoPath = useRepoStore.getState().currentRepo?.path;
    if (!repoPath) return;
    setStagesLoading(true);
    setStagesError(null);
    try {
      const result = await fetchStages(repoPath, filePath);
      if (request !== stagesId.current || useRepoStore.getState().currentRepo?.path !== repoPath) return;
      setStages(result);
    } catch (err: any) {
      if (request !== stagesId.current) return;
      setStages(null);
      setStagesError(err?.message || String(err));
    } finally {
      if (request === stagesId.current) setStagesLoading(false);
    }
  };

  useEffect(() => {
    setExpandedCompare(new Set());
    setWholeCompareOpen(false);
    setStages(null);
    setStagesError(null);
    setStagesLoading(false);
    if (!hasConflicts) return;
    void loadStages();
    return () => { stagesId.current++; };
  }, [filePath, currentRepo?.path, hasConflicts]);

  const toggleBlockCompare = (index: number) => {
    setExpandedCompare(previous => {
      const next = new Set(previous);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  // F3：把每个冲突块定位到三个版本中的行区间——基线用上下文锚点启发式（失败按比例
  // 兜底），我方/对方的区域内容即块解析结果，可精确匹配。高亮映射供整文件对照使用。
  const compareData = useMemo(() => {
    if (!stages || !hasConflicts || !content) return null;
    const workingLines = content.split(/\r?\n/);
    const buildColumn = (side: ConflictSide, text: string | null) => {
      if (text === null) return null;
      const lines = text.split(/\r?\n/);
      const spans = locateBlockSpans(lines, blocks, workingLines, side);
      const spansByBlock = new Map<number, BlockSpan>();
      const highlights = new Map<number, number>();
      blocks.forEach((block, spanIndex) => {
        const span = spans[spanIndex];
        if (!span) return;
        spansByBlock.set(block.index, span);
        for (let line = span.start; line < span.end; line++) highlights.set(line, block.index);
      });
      return { lines, spansByBlock, highlights };
    };
    return {
      columns: {
        base: buildColumn('base', stages.base),
        ours: buildColumn('ours', stages.ours),
        theirs: buildColumn('theirs', stages.theirs),
      },
    };
  }, [stages, hasConflicts, content, blocks]);

  const handleResolveBlock = (
    index: number,
    resolution: 'current' | 'incoming' | 'both' | 'both_reverse'
  ) => {
    const updated = resolveSingleBlock(content, index, resolution);
    setContent(updated);

    const nextParsed = parseConflictBlocks(updated);
    if (nextParsed.totalConflicts === 0) {
      toast.success(t('resolver.allResolvedToast'), t('resolver.allResolvedDesc'));
    }
  };

  const handleResolveAll = (resolution: 'current' | 'incoming' | 'both') => {
    const updated = resolveAllBlocks(content, resolution);
    setContent(updated);
    toast.success(
      resolution === 'current'
        ? t('resolver.allOurs')
        : resolution === 'incoming'
        ? t('resolver.allTheirs')
        : t('resolver.allBoth'),
      t('resolver.stageHint')
    );
  };

  const handleQuickOurs = async () => {
    setIsSaving(true);
    try {
      await resolveFileOurs(filePath);
      toast.success(t('resolver.oursResolved'), filePath);
      onResolved?.();
    } catch (err: any) {
      toast.error(t('resolver.opFailed'), err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleQuickTheirs = async () => {
    setIsSaving(true);
    try {
      await resolveFileTheirs(filePath);
      toast.success(t('resolver.theirsResolved'), filePath);
      onResolved?.();
    } catch (err: any) {
      toast.error(t('resolver.opFailed'), err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetMarkers = async () => {
    setIsSaving(true);
    try {
      await resetFileConflictMarkers(filePath);
      await loadContent();
      toast.info(t('resolver.markersResetToast'), filePath);
    } catch (err: any) {
      toast.error(t('resolver.resetFailed'), err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveAndStage = async () => {
    setIsSaving(true);
    try {
      if (readError || originalContent.current === undefined || hasConflicts) throw new Error('Resolve all conflicts before saving');
      await saveAndStageConflictFile(filePath, content, originalContent.current);
      toast.success(t('resolver.savedStaged'), filePath);
      onResolved?.();
      onClose?.();
    } catch (err: any) {
      toast.error(t('resolver.saveFailed'), err.message);
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

  // ===== F3 三方对照渲染 =====

  // 整文件对照单栏：列内横向滚动（overflow-y-hidden 使 VirtualRows 的纵向视口
  // 探测继续命中外层滚动容器，不破坏窗口化）；冲突区域高亮，点击跳到对应解决块。
  const renderWholeCompareColumn = (side: ConflictSide) => {
    const column = compareData?.columns[side];
    const meta: Record<ConflictSide, { label: string; tone: string; missing: string }> = {
      base: { label: t('conflictBase.columnBase'), tone: 'text-muted-foreground', missing: t('conflictBase.baseMissing') },
      ours: { label: t('conflictBase.columnOurs'), tone: 'text-emerald-400', missing: t('conflictBase.sideMissing') },
      theirs: { label: t('conflictBase.columnTheirs'), tone: 'text-cyan-700 dark:text-cyan-300', missing: t('conflictBase.sideMissing') },
    };
    const info = meta[side];
    return (
      <div key={side} className="flex-1 min-w-[240px] flex flex-col overflow-x-auto overflow-y-hidden">
        <div className="px-3 py-1.5 text-[11px] font-semibold bg-background/40 border-b border-border/60 flex items-center justify-between gap-2 select-none shrink-0">
          <span className={info.tone}>{info.label}</span>
          {column && <span className="text-[10px] font-mono text-muted-foreground">{column.lines.length}</span>}
        </div>
        {column ? (
          <VirtualRows
            items={column.lines}
            contentWidth
            rowHeight={Math.ceil(diffFontSize * 1.625)}
            renderRow={(line, lineIndex) => {
              const target = column.highlights.get(lineIndex);
              const highlighted = target !== undefined;
              return (
                <div
                  onClick={highlighted ? () => scrollToBlock(target) : undefined}
                  title={highlighted ? t('conflictBase.clickHint') : undefined}
                  className={cn(
                    'px-3 whitespace-pre font-mono leading-relaxed select-text',
                    side === 'base' && (highlighted ? 'bg-rose-500/15 text-foreground cursor-pointer' : 'text-muted-foreground/80'),
                    side === 'ours' && (highlighted ? 'bg-emerald-500/15 text-foreground cursor-pointer' : 'text-foreground/85'),
                    side === 'theirs' && (highlighted ? 'bg-cyan-500/15 text-foreground cursor-pointer' : 'text-foreground/85'),
                  )}
                >
                  {line.length === 0 ? '\u00A0' : line}
                </div>
              );
            }}
          />
        ) : (
          <div className="px-3 py-4 text-[11px] text-muted-foreground select-none">{info.missing}</div>
        )}
      </div>
    );
  };

  const renderBlockCompare = (block: ConflictBlock) => {
    const baseColumn = compareData?.columns.base ?? null;
    const baseSpan = baseColumn?.spansByBlock.get(block.index) ?? null;
    const baseRegion = baseColumn && baseSpan ? baseColumn.lines.slice(baseSpan.start, baseSpan.end) : null;
    const regionLines = (text: string) => (text.length > 0 ? text.split(/\r?\n/) : []);

    const lineRangeLabel = (span: BlockSpan) =>
      t('resolver.lines').replace('{a}', String(span.start + 1)).replace('{b}', String(span.end));

    const shell = (label: string, tone: string, badge: string | null, body: React.ReactNode) => (
      <div className="flex-1 min-w-[160px] rounded-lg border border-border/60 bg-background/40 flex flex-col overflow-hidden">
        <div className="px-2 py-1 text-[10px] font-semibold border-b border-border/50 bg-secondary/40 flex items-center justify-between gap-1 select-none shrink-0">
          <span className={cn(tone, 'truncate')} title={label}>{label}</span>
          {badge && <span className="font-mono text-[10px] text-muted-foreground shrink-0">{badge}</span>}
        </div>
        <div className="p-1">{body}</div>
      </div>
    );

    const regionRows = (lines: string[]) => (
      <VirtualRows
        items={lines}
        renderRow={(line) => (
          <div
            className="px-2 py-0.5 whitespace-pre-wrap break-all font-mono leading-relaxed text-foreground/85 select-text"
            style={{ fontSize: diffFontSize }}
          >
            {line.length === 0 ? '\u00A0' : line}
          </div>
        )}
      />
    );

    const renderBaseBody = () => {
      if (stagesError) {
        return (
          <div className="px-2 py-2 text-[11px] text-destructive flex flex-col items-start gap-1.5 select-none">
            <span>{t('conflictBase.loadFailed')}: {stagesError}</span>
            <Button variant="outline" size="xs" className="h-5 px-2 text-[10px]" onClick={() => void loadStages()}>
              {t('conflictBase.retry')}
            </Button>
          </div>
        );
      }
      if (stagesLoading || !compareData) {
        return (
          <div className="px-2 py-2 text-[11px] text-muted-foreground flex items-center gap-1.5 select-none">
            <RotateCcw className="h-3 w-3 animate-spin" />
            <span>{t('conflictBase.loading')}</span>
          </div>
        );
      }
      if (!baseColumn || !baseSpan) {
        return <div className="px-2 py-1 text-[11px] text-muted-foreground select-none">{t('conflictBase.baseMissing')}</div>;
      }
      return (
        <div>
          {baseRegion && baseRegion.length > 0
            ? regionRows(baseRegion)
            : <div className="px-2 py-1 text-[11px] text-muted-foreground italic select-none">{t('conflictBase.emptyRegion')}</div>}
          {!baseSpan.matched && (
            <div className="px-2 pt-1 pb-0.5 text-[10px] text-muted-foreground/80 select-none">{t('conflictBase.approxRegion')}</div>
          )}
        </div>
      );
    };

    const sideBody = (lines: string[]) => (lines.length > 0
      ? regionRows(lines)
      : <div className="px-2 py-1 text-[11px] text-muted-foreground italic select-none">{t('conflictBase.emptyRegion')}</div>);

    return (
      <div className="flex items-stretch gap-2 p-2 border-t border-border/80 bg-background/20">
        {shell(
          t('conflictBase.blockBase'),
          'text-muted-foreground',
          baseSpan ? lineRangeLabel(baseSpan) : null,
          renderBaseBody()
        )}
        {shell(
          t('conflictBase.blockOurs').replace('{name}', block.currentBranchName),
          'text-emerald-400',
          null,
          sideBody(regionLines(block.currentContent))
        )}
        {shell(
          t('conflictBase.blockTheirs').replace('{name}', block.incomingBranchName),
          'text-cyan-700 dark:text-cyan-300',
          null,
          sideBody(regionLines(block.incomingContent))
        )}
      </div>
    );
  };

  if (readError && !loading) {
    return <div role="alert" className="p-6 text-sm text-destructive">{t('resolver.loadFailed')}: {readError}<Button onClick={() => void loadContent()}>{t('resolver.resetMarkers')}</Button></div>;
  }

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center h-full p-8 text-muted-foreground gap-3">
        <RotateCcw className="h-6 w-6 animate-spin text-primary" />
        <div className="text-xs">{t('resolver.analyzing')}</div>
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
              "h-5 px-2 text-[11px] font-mono",
              hasConflicts
                ? "border-rose-500/40 text-rose-400 bg-rose-500/10"
                : "border-emerald-500/40 text-emerald-400 bg-emerald-500/10"
            )}
          >
            {hasConflicts ? t('resolver.remaining').replace('{n}', String(totalConflicts)) : t('resolver.allDone')}
          </Badge>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* F3: whole-file three-way compare toggle */}
          {hasConflicts && (
            <Button
              variant="ghost"
              size="xs"
              onClick={() => setWholeCompareOpen(open => !open)}
              className={cn(
                "h-7 text-[11px] px-2 gap-1",
                wholeCompareOpen
                  ? "text-primary bg-primary/10 hover:text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
              title={t('conflictBase.toggleTitle')}
            >
              <Columns3 className="h-3 w-3" />
              <span>{t('conflictBase.toggle')}</span>
            </Button>
          )}

          {/* Conflict Navigation */}
          {blocks.length > 0 && (
            <div className="flex items-center bg-secondary/50 rounded-md border border-border/60 p-0.5 mr-1">
              <span className="text-[11px] font-mono px-2 text-muted-foreground">
                {activeBlockIndex + 1} / {blocks.length}
              </span>
              <button
                onClick={() => scrollToBlock(activeBlockIndex - 1)}
                disabled={activeBlockIndex <= 0}
                className="p-1 rounded hover:bg-accent disabled:opacity-30 text-muted-foreground hover:text-foreground"
                title={t('resolver.prevConflict')}
              >
                <ChevronUp className="h-3 w-3" />
              </button>
              <button
                onClick={() => scrollToBlock(activeBlockIndex + 1)}
                disabled={activeBlockIndex >= blocks.length - 1}
                className="p-1 rounded hover:bg-accent disabled:opacity-30 text-muted-foreground hover:text-foreground"
                title={t('resolver.nextConflict')}
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
                className="h-7 text-[11px] px-2 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10"
                title={t('resolver.takeAllOursTitle')}
              >
                {t('resolver.takeAllOurs')}
              </Button>
              <Button
                variant="ghost"
                size="xs"
                onClick={() => handleResolveAll('incoming')}
                className="h-7 text-[11px] px-2 text-cyan-700 dark:text-cyan-400 hover:text-cyan-600 dark:hover:text-cyan-300 hover:bg-cyan-500/10"
                title={t('resolver.takeAllTheirsTitle')}
              >
                {t('resolver.takeAllTheirs')}
              </Button>
              <Button
                variant="ghost"
                size="xs"
                onClick={handleQuickOurs}
                disabled={isSaving}
                className="h-7 text-[11px] px-2 text-emerald-400/80 hover:text-emerald-300 hover:bg-emerald-500/10 gap-1"
                title={t('resolver.oursFileTitle')}
              >
                <Shield className="h-3 w-3" />
                <span>{t('resolver.oursFile')}</span>
              </Button>
              <Button
                variant="ghost"
                size="xs"
                onClick={handleQuickTheirs}
                disabled={isSaving}
                className="h-7 text-[11px] px-2 text-cyan-700/80 dark:text-cyan-400/80 hover:text-cyan-600 dark:hover:text-cyan-300 hover:bg-cyan-500/10 gap-1"
                title={t('resolver.theirsFileTitle')}
              >
                <Download className="h-3 w-3" />
                <span>{t('resolver.theirsFile')}</span>
              </Button>
            </>
          )}

          <Button
            variant="ghost"
            size="xs"
            onClick={handleResetMarkers}
            disabled={isSaving}
            className="h-7 text-[11px] px-2 text-muted-foreground hover:text-foreground gap-1"
            title={t('resolver.resetTitle')}
          >
            <RotateCcw className="h-3 w-3" />
            <span>{t('resolver.resetMarkers')}</span>
          </Button>

          {/* Primary Save & Stage button */}
          <Button
            size="xs"
            onClick={handleSaveAndStage}
            disabled={isSaving || hasConflicts || originalContent.current === undefined}
            className={cn(
              "h-7 text-xs px-3 gap-1.5 shadow-sm transition-all",
              !hasConflicts
                ? "bg-emerald-600 hover:bg-emerald-500 text-white animate-pulse"
                : "bg-primary hover:bg-primary/90 text-primary-foreground"
            )}
            title={t('resolver.saveStageTitle')}
          >
            {hasConflicts ? (
              <>
                <Save className="h-3.5 w-3.5" />
                <span>{t('resolver.saveStage')}</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>{t('resolver.fullyResolved')}</span>
              </>
            )}
          </Button>

          {onClose && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              onClick={onClose}
              title={t('resolver.closeTitle')}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {aiBlock && <AiTaskDialog key={`${filePath}-${aiBlock.index}`} title={t('flow.aiConflict')} task="conflict" context={aiBlock.context} onClose={() => setAiBlock(null)}>{raw => <ConflictAiSuggestion key={raw} raw={raw} onApply={resolution => { if (content !== aiBlock.snapshot) { toast.error(t('safety.stale')); setAiBlock(null); return; } setContent(resolveSingleBlock(content, aiBlock.index, 'custom', resolution)); setAiBlock(null); }} />}</AiTaskDialog>}
      {/* Editor Content Area */}
      <div className="flex-1 overflow-auto bg-card dark:bg-sunken text-foreground font-mono text-xs select-text">
        {!hasConflicts && initialConflictCount > 0 && (
          <div className="p-4 mx-4 my-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Sparkles className="h-5 w-5 shrink-0 text-emerald-400" />
              <div>
                <div className="font-semibold text-xs text-foreground">{t('resolver.successTitle')}</div>
                <div className="text-[12px] text-muted-foreground mt-0.5">
                  {t('resolver.successDesc')}
                </div>
              </div>
            </div>
            <Button
              size="xs"
              onClick={handleSaveAndStage}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs px-3 h-7 gap-1"
            >
              <Check className="h-3 w-3" />
              <span>{t('resolver.stageNow')}</span>
            </Button>
          </div>
        )}

        {/* F3: whole-file three-way compare (base / ours / theirs) */}
        {wholeCompareOpen && hasConflicts && (
          <div className="mx-2 mt-2 rounded-xl border border-border bg-card/30 overflow-hidden">
            <div className="px-3 py-1.5 border-b border-border/80 bg-secondary/50 flex items-center justify-between gap-2 text-[11px] select-none">
              <span className="text-muted-foreground truncate">{t('conflictBase.clickHint')}</span>
              {stagesError && (
                <Button variant="outline" size="xs" className="h-5 px-2 text-[10px] shrink-0" onClick={() => void loadStages()}>
                  {t('conflictBase.retry')}
                </Button>
              )}
            </div>
            {stagesError ? (
              <div className="px-3 py-3 text-[11px] text-destructive">{t('conflictBase.loadFailed')}: {stagesError}</div>
            ) : !compareData ? (
              <div className="px-3 py-4 text-[11px] text-muted-foreground flex items-center gap-2 select-none">
                <RotateCcw className="h-3 w-3 animate-spin" />
                <span>{t('conflictBase.loading')}</span>
              </div>
            ) : (
              <div className="flex items-stretch divide-x divide-border/60">
                {(['base', 'ours', 'theirs'] as const).map(side => renderWholeCompareColumn(side))}
              </div>
            )}
          </div>
        )}

        <div className="p-2 space-y-2">
          {segments.map((seg, sIdx) => {
            if (seg.type === 'plain') {
              // plain 段按行交给 VirtualRows（默认 300 行阈值）：小段直接渲染，大段窗口化，避免数万行一次进 DOM。
              // 冲突块仍保持独立 DOM（见下方分支），scrollIntoView 依赖的 blockRefs 不受影响。
              return (
                <div key={sIdx} className="py-1">
                  <VirtualRows
                    items={seg.lines ?? []}
                    renderRow={(line) => (
                      <div className="px-3 text-muted-foreground/80 leading-relaxed whitespace-pre font-mono text-[12px]">
                        {line.length === 0 ? '\u00A0' : line}
                      </div>
                    )}
                  />
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
                    <span className="font-bold text-[12px] text-foreground font-mono bg-background/60 px-2 py-0.5 rounded border border-border/60">
                      {t('resolver.conflictNo').replace('{n}', String(block.index + 1))}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {t('resolver.lines').replace('{a}', String(block.startLine)).replace('{b}', String(block.endLine))}
                    </span>
                  </div>

                  {/* Decision Action Buttons */}
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => toggleBlockCompare(block.index)}
                      className="h-6 px-2 text-[11px] text-muted-foreground hover:text-foreground gap-1"
                      title={expandedCompare.has(block.index) ? t('conflictBase.blockCollapse') : t('conflictBase.blockCompareTitle')}
                    >
                      <Columns3 className="h-3 w-3" />
                      <span>{expandedCompare.has(block.index) ? t('conflictBase.blockCollapse') : t('conflictBase.blockCompare')}</span>
                    </Button>

                    <Button
                      variant="outline"
                      size="xs"
                      onClick={() => handleResolveBlock(block.index, 'current')}
                      className="h-6 px-2 text-[11px] border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/15 hover:text-emerald-300 font-medium"
                      title={t('resolver.keepOursTitle')}
                    >
                      {t('resolver.takeOurs')}
                    </Button>

                    <Button
                      variant="outline"
                      size="xs"
                      onClick={() => handleResolveBlock(block.index, 'incoming')}
                      className="h-6 px-2 text-[11px] border-cyan-500/40 text-cyan-700 dark:text-cyan-400 hover:bg-cyan-500/15 hover:text-cyan-600 dark:hover:text-cyan-300 font-medium"
                      title={t('resolver.keepTheirsTitle')}
                    >
                      {t('resolver.takeTheirs')}
                    </Button>

                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => handleResolveBlock(block.index, 'both')}
                      className="h-6 px-2 text-[11px] text-muted-foreground hover:text-foreground"
                      title={t('resolver.keepBothTitle')}
                    >
                      {t('resolver.keepBoth')}
                    </Button>
                  </div>
                </div>

                <div className="p-2 border-b border-border"><Button size="sm" variant="outline" onClick={() => setAiBlock({ index: block.index, snapshot: content, context: JSON.stringify({ path: filePath, before: content.split(/\r?\n/).slice(Math.max(0, block.startLine - 8), block.startLine - 1).join('\n'), after: content.split(/\r?\n/).slice(block.endLine, block.endLine + 7).join('\n'), current: block.currentContent, base: block.baseContent, incoming: block.incomingContent }) })}>{t('flow.aiConflict')}</Button></div>
                {/* Conflict Preview Blocks */}
                <div className="divide-y divide-border/40">
                  {/* Current Section (HEAD) */}
                  <div className="bg-emerald-950/25 border-l-4 border-emerald-500 p-2.5 space-y-1">
                    <div className="flex items-center justify-between text-[11px] text-emerald-400 font-semibold select-none">
                      <span className="flex items-center gap-1">
                        <span>{t('resolver.oursHeader')}</span>
                        <span className="font-mono opacity-75">({block.currentBranchName})</span>
                      </span>
                      <button
                        onClick={() => handleResolveBlock(block.index, 'current')}
                        className="hover:underline text-[10px] opacity-80 hover:opacity-100"
                      >
                        {t('resolver.takeSegment')}
                      </button>
                    </div>
                    <pre className="text-emerald-200/90 whitespace-pre-wrap font-mono text-[12px] leading-relaxed select-text">
                      {block.currentContent || <span className="italic opacity-50">{t('resolver.emptyLine')}</span>}
                    </pre>
                  </div>

                  {/* Optional Base Section (3-Way) */}
                  {block.baseContent !== undefined && (
                    <div className="bg-muted/10 border-l-4 border-muted-foreground/30 p-2 space-y-1">
                      <div className="text-[10px] text-muted-foreground font-medium select-none">
                        {t('resolver.baseHeader')}
                      </div>
                      <pre className="text-muted-foreground/70 whitespace-pre-wrap font-mono text-[11px]">
                        {block.baseContent}
                      </pre>
                    </div>
                  )}

                  {/* Incoming Section */}
                  <div className="bg-cyan-500/10 dark:bg-cyan-950/25 border-l-4 border-cyan-500 p-2.5 space-y-1">
                    <div className="flex items-center justify-between text-[11px] text-cyan-700 dark:text-cyan-400 font-semibold select-none">
                      <span className="flex items-center gap-1">
                        <span>{t('resolver.theirsHeader')}</span>
                        <span className="font-mono opacity-75">({block.incomingBranchName})</span>
                      </span>
                      <button
                        onClick={() => handleResolveBlock(block.index, 'incoming')}
                        className="hover:underline text-[10px] opacity-80 hover:opacity-100"
                      >
                        {t('resolver.takeSegment')}
                      </button>
                    </div>
                    <pre className="text-cyan-800 dark:text-cyan-200/90 whitespace-pre-wrap font-mono text-[12px] leading-relaxed select-text">
                      {block.incomingContent || <span className="italic opacity-50">{t('resolver.emptyLine')}</span>}
                    </pre>
                  </div>
                </div>

                {/* F3: per-block three-way comparison (base region / ours / theirs) */}
                {expandedCompare.has(block.index) && renderBlockCompare(block)}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
