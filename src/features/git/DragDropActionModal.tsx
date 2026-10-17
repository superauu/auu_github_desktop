import { useShallow } from 'zustand/react/shallow';
import { ModalSurface } from '@/components/ui/ModalSurface';
import React, { useState } from 'react';
import { 
  GitMerge, 
  GitPullRequest, 
  X, 
  Loader2, 
  ArrowRight, 
  AlertTriangle,
  GitBranch as GitBranchIcon,
  Cloud
} from 'lucide-react';
import { useI18n } from '@/i18n';
import { useRepoStore } from '@/stores/repoStore';
import { GitBranch } from '@/services/git/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/stores/toastStore';
import { cn } from '@/utils/cn';

interface DragDropActionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceBranch: GitBranch | null;
  targetBranch: GitBranch | null;
}

export const DragDropActionModal: React.FC<DragDropActionModalProps> = ({
  open,
  onOpenChange,
  sourceBranch,
  targetBranch,
}) => {
  const { currentRepo, branches, status, checkoutBranch, mergeBranch, rebaseBranch } = useRepoStore(useShallow(state => ({ currentRepo: state.currentRepo, branches: state.branches, status: state.status, checkoutBranch: state.checkoutBranch, mergeBranch: state.mergeBranch, rebaseBranch: state.rebaseBranch })));
  const { t } = useI18n();
  const [loading, setLoading] = useState(false);
  const [selectedAction, setSelectedAction] = useState<'merge' | 'rebase-target' | 'rebase-source'>('merge');
  const [error, setError] = useState<string | null>(null);

  if (!open || !sourceBranch || !targetBranch) return null;

  const currentBranchName =
    branches.find((b) => b.isCurrent)?.name ||
    status?.currentBranch ||
    currentRepo?.currentBranch ||
    '';

  const handleExecute = async () => {
    setLoading(true);
    setError(null);

    try {
      if (selectedAction === 'merge') {
        // Merge source into target
        // If current branch is not target, checkout target first
        if (currentBranchName !== targetBranch.name) {
          toast.info(`${t('drag.checkingOut')}: ${targetBranch.name}...`);
          await checkoutBranch(targetBranch.name, { openWorktree: false });
        }
        toast.info(`${t('drag.merging').replace('{src}', sourceBranch.name).replace('{dst}', targetBranch.name)}`);
        await mergeBranch(sourceBranch.name);
        toast.success(t('drag.mergeDone'), `${sourceBranch.name} ➜ ${targetBranch.name}`);
      } else if (selectedAction === 'rebase-target') {
        // Rebase target onto source
        if (currentBranchName !== targetBranch.name) {
          toast.info(`${t('drag.checkingOut')}: ${targetBranch.name}...`);
          await checkoutBranch(targetBranch.name, { openWorktree: false });
        }
        toast.info(`${t('drag.rebasing').replace('{src}', targetBranch.name).replace('{dst}', sourceBranch.name)}`);
        await rebaseBranch(sourceBranch.name);
        toast.success(t('drag.rebaseDone'), `${targetBranch.name} onto ${sourceBranch.name}`);
      } else {
        // Rebase source onto target
        if (currentBranchName !== sourceBranch.name) {
          toast.info(`${t('drag.checkingOut')}: ${sourceBranch.name}...`);
          await checkoutBranch(sourceBranch.name, { openWorktree: false });
        }
        toast.info(`${t('drag.rebasing').replace('{src}', sourceBranch.name).replace('{dst}', targetBranch.name)}`);
        await rebaseBranch(targetBranch.name);
        toast.success(t('drag.rebaseDone'), `${sourceBranch.name} onto ${targetBranch.name}`);
      }

      onOpenChange(false);
    } catch (err: any) {
      console.error(t('drag.failedLog'), err);
      setError(err?.message || t('drag.failed'));
      toast.error(t('drag.opIncomplete'), err?.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalSurface onDismiss={() => onOpenChange(false)} dismissible={!loading} label={t('drag.title')}
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm animate-in fade-in-0 select-none p-4"
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-border bg-card shadow-2xl p-6 space-y-5 animate-in zoom-in-95"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-primary/10 text-primary border border-primary/20">
              <GitMerge className="h-5 w-5" />
            </div>
            <div>
              <div className="font-semibold text-sm text-foreground flex items-center gap-2">
                <span>{t('drag.title')}</span>
                <Badge variant="outline" className="text-[11px] font-normal py-0 h-4 border-primary/30 text-primary">
                  Drag & Drop
                </Badge>
              </div>
              <div className="text-[12px] text-muted-foreground mt-0.5">
                {t('drag.pickOp')}
              </div>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            disabled={loading}
            className="h-7 w-7 text-muted-foreground hover:text-foreground rounded-lg"
            onClick={() => onOpenChange(false)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Source & Target Flow Display Banner */}
        <div className="p-3 rounded-xl border border-border bg-accent/30 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <div className="p-1.5 rounded-lg bg-card border border-border shrink-0">
              {sourceBranch.isRemote ? (
                <Cloud className="h-3.5 w-3.5 text-sky-400" />
              ) : (
                <GitBranchIcon className="h-3.5 w-3.5 text-indigo-400" />
              )}
            </div>
            <div className="min-w-0">
              <div className="text-[11px] text-muted-foreground">{t('drag.source')}</div>
              <div className="text-xs font-mono font-semibold text-foreground truncate max-w-[170px]" title={sourceBranch.name}>
                {sourceBranch.name}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-center shrink-0 px-2 text-muted-foreground">
            <ArrowRight className="h-4 w-4 text-primary animate-pulse" />
          </div>

          <div className="flex items-center gap-2 min-w-0 flex-1 justify-end text-right">
            <div className="min-w-0">
              <div className="text-[11px] text-muted-foreground">{t('drag.target')}</div>
              <div className="text-xs font-mono font-semibold text-foreground truncate max-w-[170px]" title={targetBranch.name}>
                {targetBranch.name}
              </div>
            </div>
            <div className="p-1.5 rounded-lg bg-card border border-border shrink-0">
              {targetBranch.isRemote ? (
                <Cloud className="h-3.5 w-3.5 text-sky-400" />
              ) : (
                <GitBranchIcon className="h-3.5 w-3.5 text-emerald-400" />
              )}
            </div>
          </div>
        </div>

        {/* Action Options Selection */}
        <div className="space-y-2">
          {/* Option 1: Merge */}
          <div
            onClick={() => setSelectedAction('merge')}
            className={cn(
              "p-3 rounded-xl border transition-all cursor-pointer flex items-start gap-3",
              selectedAction === 'merge'
                ? "border-primary bg-primary/10 shadow-xs ring-1 ring-primary/40"
                : "border-border/70 hover:border-border hover:bg-accent/40 bg-card/60"
            )}
          >
            <div className={cn("p-2 rounded-lg shrink-0 mt-0.5", selectedAction === 'merge' ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
              <GitMerge className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0 space-y-0.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground">
                  {t('drag.merge')}
                </span>
                <span className="text-[11px] font-mono text-muted-foreground">{t('drag.recommended')}</span>
              </div>
              <div className="text-[12px] text-muted-foreground leading-relaxed">
                {t('drag.mergeDescPrefix')} <span className="font-mono text-foreground font-medium">{sourceBranch.name}</span> {t('drag.mergeDescMid')} <span className="font-mono text-foreground font-medium">{targetBranch.name}</span>
              </div>
              <div className="text-[11px] text-primary/80 font-mono pt-1">
                $ git checkout {targetBranch.name} && git merge {sourceBranch.name}
              </div>
            </div>
          </div>

          {/* Option 2: Rebase target onto source */}
          <div
            onClick={() => setSelectedAction('rebase-target')}
            className={cn(
              "p-3 rounded-xl border transition-all cursor-pointer flex items-start gap-3",
              selectedAction === 'rebase-target'
                ? "border-amber-500 bg-amber-500/10 shadow-xs ring-1 ring-amber-500/40"
                : "border-border/70 hover:border-border hover:bg-accent/40 bg-card/60"
            )}
          >
            <div className={cn("p-2 rounded-lg shrink-0 mt-0.5", selectedAction === 'rebase-target' ? "bg-amber-500 text-white" : "bg-muted text-muted-foreground")}>
              <GitPullRequest className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0 space-y-0.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground">
                  {t('drag.rebaseTarget')}
                </span>
              </div>
              <div className="text-[12px] text-muted-foreground leading-relaxed">
                <span className="font-mono text-foreground font-medium">{targetBranch.name}</span> {t('drag.rebaseDescSuffix')} <span className="font-mono text-foreground font-medium">{sourceBranch.name}</span>
              </div>
              <div className="text-[11px] text-amber-500/90 font-mono pt-1">
                $ git checkout {targetBranch.name} && git rebase {sourceBranch.name}
              </div>
            </div>
          </div>

          {/* Option 3: Rebase source onto target */}
          <div
            onClick={() => setSelectedAction('rebase-source')}
            className={cn(
              "p-3 rounded-xl border transition-all cursor-pointer flex items-start gap-3",
              selectedAction === 'rebase-source'
                ? "border-amber-500 bg-amber-500/10 shadow-xs ring-1 ring-amber-500/40"
                : "border-border/70 hover:border-border hover:bg-accent/40 bg-card/60"
            )}
          >
            <div className={cn("p-2 rounded-lg shrink-0 mt-0.5", selectedAction === 'rebase-source' ? "bg-amber-500 text-white" : "bg-muted text-muted-foreground")}>
              <GitPullRequest className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0 space-y-0.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground">
                  {t('drag.rebaseSource')}
                </span>
              </div>
              <div className="text-[12px] text-muted-foreground leading-relaxed">
                <span className="font-mono text-foreground font-medium">{sourceBranch.name}</span> {t('drag.rebaseDescSuffix')} <span className="font-mono text-foreground font-medium">{targetBranch.name}</span>
              </div>
              <div className="text-[11px] text-amber-500/90 font-mono pt-1">
                $ git checkout {sourceBranch.name} && git rebase {targetBranch.name}
              </div>
            </div>
          </div>
        </div>

        {/* Error notification if any */}
        {error && (
          <div className="p-3 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-500 text-xs flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <div className="flex-1 leading-relaxed">{error}</div>
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-2 border-t border-border">
          <Button
            variant="ghost"
            size="sm"
            disabled={loading}
            onClick={() => onOpenChange(false)}
            className="h-8 text-xs text-muted-foreground"
          >
            {t('common.cancel')}
          </Button>

          <Button
            size="sm"
            disabled={loading}
            onClick={handleExecute}
            className="h-8 text-xs px-5 gap-1.5 font-medium"
          >
            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            <span>{t('drag.confirm')}</span>
          </Button>
        </div>
      </div>
    </ModalSurface>
  );
};
