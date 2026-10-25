import { useShallow } from 'zustand/react/shallow';
import { ModalSurface } from '@/components/ui/ModalSurface';
import React, { useEffect, useState } from 'react';
import { Archive, X, Loader2 } from 'lucide-react';
import { useI18n } from '@/i18n';
import { useRepoStore } from '@/stores/repoStore';
import { gitService } from '@/services/git/GitService';
import { ParsedDiffLine } from '@/services/git/PorcelainParser';
import { GitStash } from '@/services/git/types';
import { Button } from '@/components/ui/button';
import { cn } from '@/utils/cn';

interface StashPreviewModalProps {
  stash: GitStash | null;
  onClose: () => void;
}

export const StashPreviewModal: React.FC<StashPreviewModalProps> = ({ stash, onClose }) => {
  const { t } = useI18n();
  const { currentRepo } = useRepoStore(useShallow(state => ({ currentRepo: state.currentRepo })));
  const [patchLines, setPatchLines] = useState<ParsedDiffLine[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!stash || !currentRepo) return;
    let cancelled = false;
    setIsLoading(true);
    gitService
      .getStashPatch(currentRepo.path, stash.index)
      .then((lines) => {
        if (!cancelled) setPatchLines(lines);
      })
      .catch(() => {
        if (!cancelled) setPatchLines([]);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [stash]);

  if (!stash) return null;

  return (
    <ModalSurface onDismiss={onClose} dismissible label={t('stashPreview.title')}
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm animate-in fade-in-0 select-none"
    >
      <div
        className="w-full max-w-3xl max-h-[80vh] rounded-xl border border-border bg-card shadow-2xl flex flex-col animate-in zoom-in-95"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-2 p-4 pb-3 border-b border-border/70 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className="p-2 rounded-lg bg-primary/10 text-primary shrink-0">
              <Archive className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="font-semibold text-xs text-foreground truncate">{stash.message}</div>
              <div className="text-[11px] text-muted-foreground font-mono">
                {stash.branch} · {stash.date}
              </div>
            </div>
          </div>
          <Button
            variant="ghost"
            size="xs"
            onClick={onClose}
            className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground shrink-0"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Patch Body */}
        <div className="flex-1 overflow-auto font-mono text-[12px] leading-relaxed bg-card dark:bg-sunken text-foreground select-text p-2">
          {isLoading ? (
            <div className="py-20 flex items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <span className="text-xs">{t('changes.loadingData')}</span>
            </div>
          ) : patchLines.length === 0 ? (
            <div className="py-20 text-center text-xs text-muted-foreground">
              {t('stashPreview.empty')}
            </div>
          ) : (
            patchLines.map((line, idx) =>
              line.type === 'header' ? (
                <div
                  key={idx}
                  className="diff-line-header px-4 py-1 font-semibold select-none font-mono text-[11px] mt-1 first:mt-0"
                >
                  {line.content}
                </div>
              ) : (
                <div
                  key={idx}
                  className={cn(
                    'flex items-stretch border-l-2',
                    line.type === 'add'
                      ? 'diff-line-add border-emerald-500'
                      : line.type === 'delete'
                      ? 'diff-line-del border-rose-500'
                      : 'border-transparent text-foreground/85'
                  )}
                >
                  <div className="w-10 px-2 text-right text-muted-foreground/60 dark:text-muted-foreground/30 select-none shrink-0 font-mono text-[11px] bg-muted/40 dark:bg-background/20">
                    {line.oldNo ?? ''}
                  </div>
                  <div className="w-10 px-2 text-right text-muted-foreground/60 dark:text-muted-foreground/30 select-none shrink-0 font-mono text-[11px] bg-muted/40 dark:bg-background/20 border-r border-border/40">
                    {line.newNo ?? ''}
                  </div>
                  <div className="px-3 whitespace-pre font-mono flex-1 overflow-x-auto">
                    {line.content}
                  </div>
                </div>
              )
            )
          )}
        </div>
      </div>
    </ModalSurface>
  );
};
