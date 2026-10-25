import { useShallow } from 'zustand/react/shallow';
import React, { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  GitPullRequest,
  Ban,
  ArrowRight,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { useI18n } from '@/i18n';
import { useRepoStore } from '@/stores/repoStore';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/stores/toastStore';

export const ConflictBanner: React.FC = () => {
  const { t } = useI18n();
  const {
    currentRepo,
    operationState,
    abortCurrentOperation,
    completeCurrentOperation,
  } = useRepoStore(useShallow(state => ({ currentRepo: state.currentRepo, operationState: state.operationState, abortCurrentOperation: state.abortCurrentOperation, completeCurrentOperation: state.completeCurrentOperation })));

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAbortConfirm, setShowAbortConfirm] = useState(false);

  if (!currentRepo || (!operationState.inConflict && operationState.type === 'none')) {
    return null;
  }

  const { type, conflictedFiles, isAllResolved } = operationState;
  const isCherryPick = type === 'cherry-pick';
  const isRebase = type === 'rebase';
  const opTitle = isCherryPick ? 'Cherry-pick' : isRebase ? t('banner.rebaseTitle') : t('banner.mergeTitle');

  const handleAbort = async () => {
    setIsSubmitting(true);
    try {
      await abortCurrentOperation();
      toast.info(isRebase ? t('banner.aborted') : t('banner.mergeAborted'), t('banner.abortedDesc'));
      setShowAbortConfirm(false);
    } catch (err: any) {
      toast.error(t('banner.abortFailed'), err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleComplete = async () => {
    setIsSubmitting(true);
    try {
      await completeCurrentOperation();
      toast.success(isRebase ? t('banner.rebaseDone') : t('banner.mergeDone'));
    } catch (err: any) {
      toast.error(t('banner.completeFailed'), err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="shrink-0 border-b border-border bg-gradient-to-r from-amber-500/10 via-rose-500/10 to-amber-500/5 dark:from-amber-950/40 dark:via-rose-950/30 dark:to-card px-4 py-2.5 flex items-center justify-between gap-4 select-none animate-in fade-in-0 duration-200">
      {/* Left info area */}
      <div className="flex items-center gap-3 min-w-0">
        <div
          className={`p-2 rounded-lg shrink-0 border ${
            isAllResolved
              ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
              : 'bg-amber-500/20 text-amber-400 border-amber-500/30'
          }`}
        >
          {isAllResolved ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : isRebase ? (
            <GitPullRequest className="h-4 w-4 animate-pulse" />
          ) : (
            <AlertTriangle className="h-4 w-4 animate-bounce" />
          )}
        </div>

        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-xs text-foreground flex items-center gap-1.5">
              <span>{opTitle}</span>
              <span className="text-muted-foreground/60">•</span>
              <span className="text-rose-400">{t('banner.statusTitle')}</span>
            </span>
            <Badge
              variant="outline"
              className={`text-[11px] h-4.5 px-1.5 font-mono ${
                isAllResolved
                  ? 'border-emerald-500/40 text-emerald-400 bg-emerald-500/10'
                  : 'border-amber-500/40 text-amber-400 bg-amber-500/10'
              }`}
            >
              {isAllResolved ? t('banner.allResolved') : `${t('banner.pending')}: ${conflictedFiles.length} ${t('banner.filesUnit')}`}
            </Badge>
          </div>

          <div className="text-[12px] text-muted-foreground truncate mt-0.5">
            {isAllResolved ? (
              <span className="text-emerald-400/90 flex items-center gap-1">
                <Sparkles className="h-3 w-3 inline" />
                {t('banner.allResolvedDesc')}
              </span>
            ) : (
              <span>
                {t('banner.resolveHintPrefix')}{' '}
                <span className="font-mono text-amber-300 font-semibold">
                  {conflictedFiles.slice(0, 3).join(', ')}
                  {conflictedFiles.length > 3 ? ` ${t('banner.andMore')} ${conflictedFiles.length} ${t('banner.filesUnit')}` : ''}
                </span>
                {t('banner.resolveHintSuffix')}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Right action area */}
      <div className="flex items-center gap-2 shrink-0">
        {showAbortConfirm ? (
          <div className="flex items-center gap-1.5 bg-background/80 border border-rose-500/40 rounded-lg p-1 animate-in zoom-in-95">
            <span className="text-[11px] text-rose-400 px-1 font-medium">{t('banner.confirmAbort')}</span>
            <Button
              variant="destructive"
              size="xs"
              onClick={handleAbort}
              disabled={isSubmitting}
              className="h-6 text-[11px] px-2"
            >
              {t('banner.confirm')}
            </Button>
            <Button
              variant="ghost"
              size="xs"
              onClick={() => setShowAbortConfirm(false)}
              className="h-6 text-[11px] px-1.5 text-muted-foreground"
            >
              {t('banner.cancel')}
            </Button>
          </div>
        ) : (
          <Button
            variant="outline"
            size="xs"
            onClick={() => setShowAbortConfirm(true)}
            disabled={isSubmitting}
            className="h-7 text-xs gap-1.5 border-rose-500/30 text-rose-400 hover:bg-rose-500/10 hover:text-rose-300"
            title={isRebase ? t('banner.abortRebaseRestore') : t('banner.abortMergeRestore')}
          >
            <Ban className="h-3.5 w-3.5" />
            <span>{isCherryPick ? t('banner.abortCherryPick') : isRebase ? t('banner.abortRebase') : t('banner.abortMerge')}</span>
          </Button>
        )}

        <Button
          variant={isAllResolved ? 'default' : 'secondary'}
          size="xs"
          onClick={handleComplete}
          disabled={!isAllResolved || isSubmitting}
          className={`h-7 text-xs gap-1.5 shadow-sm transition-[background-color,border-color,box-shadow] ${
            isAllResolved
              ? 'bg-emerald-600 hover:bg-emerald-500 text-white animate-pulse'
              : 'opacity-60 cursor-not-allowed'
          }`}
          title={
            isAllResolved
              ? isRebase
                ? t('banner.continueRebase')
                : t('banner.commitMerge')
              : t('banner.needStageFirst')
          }
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isSubmitting ? 'animate-spin' : ''}`} />
          <span>{isCherryPick ? t('banner.continueCherryPick') : isRebase ? t('banner.continueBtn') : t('banner.finishMergeBtn')}</span>
          <ArrowRight className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
};
