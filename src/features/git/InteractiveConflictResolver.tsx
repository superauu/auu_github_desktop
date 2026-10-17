import { useShallow } from 'zustand/react/shallow';
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
import { useI18n } from '@/i18n';
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
  const [isSaving, setIsSaving] = useState(false);
  const [activeBlockIndex, setActiveBlockIndex] = useState<number>(0);
  const blockRefs = useRef<Map<number, HTMLDivElement>>(new Map());

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
    void loadContent();
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
                className="h-7 text-[11px] px-2 text-sky-400 hover:text-sky-300 hover:bg-sky-500/10"
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
                className="h-7 text-[11px] px-2 text-sky-400/80 hover:text-sky-300 hover:bg-sky-500/10 gap-1"
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

      {/* Editor Content Area */}
      <div className="flex-1 overflow-auto bg-[#0c0c0e] text-foreground font-mono text-xs select-text">
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

        <div className="p-2 space-y-2">
          {segments.map((seg, sIdx) => {
            if (seg.type === 'plain') {
              return (
                <div key={sIdx} className="py-1 px-3 text-muted-foreground/80 leading-relaxed whitespace-pre font-mono text-[12px]">
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
                      className="h-6 px-2 text-[11px] border-sky-500/40 text-sky-400 hover:bg-sky-500/15 hover:text-sky-300 font-medium"
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
                  <div className="bg-sky-950/25 border-l-4 border-sky-500 p-2.5 space-y-1">
                    <div className="flex items-center justify-between text-[11px] text-sky-400 font-semibold select-none">
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
                    <pre className="text-sky-200/90 whitespace-pre-wrap font-mono text-[12px] leading-relaxed select-text">
                      {block.incomingContent || <span className="italic opacity-50">{t('resolver.emptyLine')}</span>}
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
