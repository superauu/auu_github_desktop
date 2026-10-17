import { useShallow } from 'zustand/react/shallow';
import { ModalSurface } from '@/components/ui/ModalSurface';
import React, { useEffect, useState } from 'react';
import { GitMerge, X, Loader2, AlertCircle, Check, ArrowRight } from 'lucide-react';
import { useI18n } from '@/i18n';
import { useRepoStore } from '@/stores/repoStore';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/stores/toastStore';

interface MergeBranchModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetBranch?: string; // Branch to merge into current
}

export const MergeBranchModal: React.FC<MergeBranchModalProps> = ({
  open,
  onOpenChange,
  targetBranch: initialTargetBranch,
}) => {
  const { currentRepo, branches, status, mergeBranch } = useRepoStore(useShallow(state => ({ currentRepo: state.currentRepo, branches: state.branches, status: state.status, mergeBranch: state.mergeBranch })));
  const { t } = useI18n();

  const currentBranch =
    branches.find((b) => b.isCurrent)?.name ||
    status?.currentBranch ||
    currentRepo?.currentBranch ||
    'main';
  const availableBranches = branches.filter((b) => b.name !== currentBranch);

  const [selectedBranch, setSelectedBranch] = useState(
    initialTargetBranch || availableBranches[0]?.name || ''
  );
  const [noFastForward, setNoFastForward] = useState(false);
  const [customMessage, setCustomMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 弹窗常驻挂载，useState 初值只在首次挂载生效；
  // 每次打开时同步右键菜单等入口传入的目标分支
  useEffect(() => {
    if (open && initialTargetBranch) {
      setSelectedBranch(initialTargetBranch);
    }
  }, [open, initialTargetBranch]);

  if (!open) return null;

  const handleMerge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBranch) return;

    setIsSubmitting(true);
    setError(null);

    try {
      await mergeBranch(selectedBranch, {
        noFf: noFastForward,
        message: customMessage.trim() || undefined,
      });

      toast.success(t('merge.success'), `${t('merge.successDesc').replace('{src}', selectedBranch).replace('{dst}', currentBranch)}`);
      onOpenChange(false);
    } catch (err: any) {
      const msg = err.message || t('merge.failed');
      setError(msg);
      if (msg.includes('CONFLICT') || msg.includes('conflict')) {
        toast.error(t('merge.conflict'), t('merge.conflictDesc'));
      } else {
        toast.error(t('merge.failed'), msg);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ModalSurface onDismiss={() => onOpenChange(false)} dismissible={!isSubmitting} label={'Merge branch'}
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm animate-in fade-in-0 select-none"
    >
      <div
        className="w-full max-w-md rounded-xl border border-border bg-card shadow-2xl p-5 space-y-4 animate-in zoom-in-95"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400">
              <GitMerge className="h-4 w-4" />
            </div>
            <div>
              <div className="font-semibold text-xs text-foreground">{t('merge.title')}</div>
              <div className="text-[11px] text-muted-foreground">
                {t('merge.desc')}
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

        {error && (
          <div className="p-2.5 rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-300 text-xs flex items-start gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-400 mt-0.5" />
            <div className="text-[12px] break-all leading-relaxed">{error}</div>
          </div>
        )}

        <form onSubmit={handleMerge} className="space-y-4 text-xs">
          {/* Branch Flow Visualizer */}
          <div className="p-3 rounded-lg border border-border bg-accent/20 flex items-center justify-between text-xs font-mono">
            <div className="flex flex-col gap-1">
              <span className="text-[11px] text-muted-foreground">{t('merge.sourceLabel')}</span>
              <Badge variant="outline" className="h-5 px-2 text-xs">
                {selectedBranch || t('merge.none')}
              </Badge>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
            <div className="flex flex-col gap-1 items-end">
              <span className="text-[11px] text-muted-foreground">{t('merge.targetLabel')}</span>
              <Badge variant="success" className="h-5 px-2 text-xs font-semibold">
                {currentBranch}
              </Badge>
            </div>
          </div>

          {/* Select Source Branch */}
          <div className="space-y-1.5">
            <label className="text-[12px] font-medium text-foreground block">
              {t('merge.pickSource')}
            </label>
            <select
              value={selectedBranch}
              onChange={(e) => setSelectedBranch(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-xs text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-ring"
            >
              {availableBranches.length === 0 ? (
                <option value="">{t('merge.noBranches')}</option>
              ) : (
                availableBranches.map((b) => (
                  <option key={b.name} value={b.name}>
                    {b.name} {b.isRemote ? t('merge.remoteSuffix') : ''}
                  </option>
                ))
              )}
            </select>
          </div>

          {/* Options */}
          <div className="space-y-2 pt-1">
            <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer select-none">
              <input
                type="checkbox"
                checked={noFastForward}
                onChange={(e) => setNoFastForward(e.target.checked)}
                className="rounded border-input text-primary focus:ring-primary h-3.5 w-3.5"
              />
              <span>{t('merge.noFf')}</span>
            </label>

            {noFastForward && (
              <div className="space-y-1">
                <label className="text-[11px] text-muted-foreground block">
                  {t('merge.customMsg')}
                </label>
                <input
                  type="text"
                  value={customMessage}
                  onChange={(e) => setCustomMessage(e.target.value)}
                  placeholder={`Merge branch '${selectedBranch}' into ${currentBranch}`}
                  className="w-full rounded-md border border-input bg-background px-2 py-1 text-xs text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
            )}
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
              className="h-7 text-xs gap-1.5"
            >
              {isSubmitting ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Check className="h-3 w-3" />
              )}
              <span>{t('merge.run')}</span>
            </Button>
          </div>
        </form>
      </div>
    </ModalSurface>
  );
};
