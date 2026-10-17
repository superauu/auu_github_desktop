import { useShallow } from 'zustand/react/shallow';
import { ModalSurface } from '@/components/ui/ModalSurface';
import React, { useState } from 'react';
import { GitPullRequest, X, Loader2, AlertTriangle, Check, ArrowRight, RefreshCw, Ban } from 'lucide-react';
import { useI18n } from '@/i18n';
import { useRepoStore } from '@/stores/repoStore';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/stores/toastStore';

interface RebaseBranchModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  upstreamBranch?: string;
}

export const RebaseBranchModal: React.FC<RebaseBranchModalProps> = ({
  open,
  onOpenChange,
  upstreamBranch: initialUpstreamBranch,
}) => {
  const { currentRepo, branches, status, rebaseBranch, rebaseContinue, rebaseAbort } = useRepoStore(useShallow(state => ({ currentRepo: state.currentRepo, branches: state.branches, status: state.status, rebaseBranch: state.rebaseBranch, rebaseContinue: state.rebaseContinue, rebaseAbort: state.rebaseAbort })));
  const { t } = useI18n();

  const currentBranch =
    branches.find((b) => b.isCurrent)?.name ||
    status?.currentBranch ||
    currentRepo?.currentBranch ||
    'main';
  const availableBranches = branches.filter((b) => b.name !== currentBranch);

  const [selectedBranch, setSelectedBranch] = useState(
    initialUpstreamBranch || availableBranches[0]?.name || ''
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inConflictState, setInConflictState] = useState(false);

  // 弹窗常驻挂载，useState 初值只在首次挂载生效；
  // 每次打开时同步右键菜单等入口传入的上游分支
  React.useEffect(() => {
    if (open && initialUpstreamBranch) {
      setSelectedBranch(initialUpstreamBranch);
    }
  }, [open, initialUpstreamBranch]);

  if (!open) return null;

  const handleRebase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBranch) return;

    setIsSubmitting(true);
    setError(null);

    try {
      await rebaseBranch(selectedBranch);
      toast.success(t('rebase.success'), `${t('rebase.successDesc').replace('{cur}', currentBranch).replace('{onto}', selectedBranch)}`);
      onOpenChange(false);
    } catch (err: any) {
      const msg = err.message || t('rebase.failed');
      setError(msg);
      if (msg.includes('CONFLICT') || msg.includes('conflict')) {
        setInConflictState(true);
        toast.error(t('rebase.conflict'), t('rebase.conflictDesc'));
      } else {
        toast.error(t('rebase.failed'), msg);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleContinue = async () => {
    setIsSubmitting(true);
    try {
      await rebaseContinue();
      toast.success(t('rebase.continueDone'));
      setInConflictState(false);
      onOpenChange(false);
    } catch (err: any) {
      setError(err.message);
      toast.error(t('rebase.continueFailed'), err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAbort = async () => {
    setIsSubmitting(true);
    try {
      await rebaseAbort();
      toast.info(t('rebase.aborted'), t('rebase.abortedDesc'));
      setInConflictState(false);
      onOpenChange(false);
    } catch (err: any) {
      toast.error(t('rebase.abortFailed'), err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ModalSurface onDismiss={() => onOpenChange(false)} dismissible={!isSubmitting} label={'Rebase branch'}
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm animate-in fade-in-0 select-none"
    >
      <div
        className="w-full max-w-md rounded-xl border border-border bg-card shadow-2xl p-5 space-y-4 animate-in zoom-in-95"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400">
              <GitPullRequest className="h-4 w-4" />
            </div>
            <div>
              <div className="font-semibold text-xs text-foreground">{t('rebase.title')}</div>
              <div className="text-[11px] text-muted-foreground">
                {t('rebase.desc')}
              </div>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-foreground"
            onClick={() => onOpenChange(false)}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Warning Alert */}
        <div className="p-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-300 text-xs flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
          <div className="text-[12px] leading-relaxed opacity-90">
            {t('rebase.warn')}
          </div>
        </div>

        {error && (
          <div className="p-2 rounded bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-mono break-all">
            {error}
          </div>
        )}

        {inConflictState ? (
          <div className="space-y-3 pt-2">
            <div className="text-xs text-foreground font-semibold">
              {t('rebase.conflictState')}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="destructive"
                size="xs"
                onClick={handleAbort}
                disabled={isSubmitting}
                className="flex-1 h-8 text-xs gap-1.5"
              >
                <Ban className="h-3.5 w-3.5" />
                <span>{t('rebase.abort')}</span>
              </Button>
              <Button
                variant="default"
                size="xs"
                onClick={handleContinue}
                disabled={isSubmitting}
                className="flex-1 h-8 text-xs gap-1.5"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isSubmitting ? 'animate-spin' : ''}`} />
                <span>{t('rebase.continue')}</span>
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleRebase} className="space-y-4 text-xs">
            {/* Branch Flow Visualizer */}
            <div className="p-3 rounded-lg border border-border bg-accent/20 flex items-center justify-between text-xs font-mono">
              <div className="flex flex-col gap-1">
                <span className="text-[11px] text-muted-foreground">{t('rebase.currentLabel')}</span>
                <Badge variant="outline" className="h-5 px-2 text-xs font-semibold">
                  {currentBranch}
                </Badge>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="flex flex-col gap-1 items-end">
                <span className="text-[11px] text-muted-foreground">{t('rebase.ontoLabel')}</span>
                <Badge variant="warning" className="h-5 px-2 text-xs font-semibold">
                  {selectedBranch || t('merge.none')}
                </Badge>
              </div>
            </div>

            {/* Select Upstream Branch */}
            <div className="space-y-1.5">
              <label className="text-[12px] font-medium text-foreground block">
                {t('rebase.pickUpstream')}
              </label>
              <select
                value={selectedBranch}
                onChange={(e) => setSelectedBranch(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-xs text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {availableBranches.length === 0 ? (
                  <option value="">{t('rebase.noBranches')}</option>
                ) : (
                  availableBranches.map((b) => (
                    <option key={b.name} value={b.name}>
                      {b.name} {b.isRemote ? t('rebase.remoteSuffix') : ''}
                    </option>
                  ))
                )}
              </select>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={() => onOpenChange(false)}
                className="h-7 text-xs"
              >
                {t('common.cancel')}
              </Button>
              <Button
                type="submit"
                size="xs"
                disabled={!selectedBranch || isSubmitting}
                className="h-7 text-xs gap-1.5 bg-amber-600 hover:bg-amber-700 text-white"
              >
                {isSubmitting ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Check className="h-3 w-3" />
                )}
                <span>{t('rebase.run')}</span>
              </Button>
            </div>
          </form>
        )}
      </div>
    </ModalSurface>
  );
};
