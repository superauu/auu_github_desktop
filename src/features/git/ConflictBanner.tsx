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
import { useRepoStore } from '@/stores/repoStore';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/stores/toastStore';

export const ConflictBanner: React.FC = () => {
  const {
    currentRepo,
    operationState,
    abortCurrentOperation,
    completeCurrentOperation,
  } = useRepoStore();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAbortConfirm, setShowAbortConfirm] = useState(false);

  if (!currentRepo || (!operationState.inConflict && operationState.type === 'none')) {
    return null;
  }

  const { type, conflictedFiles, isAllResolved } = operationState;
  const isRebase = type === 'rebase';
  const opTitle = isRebase ? '变基进行中 (Rebase)' : '分支合并中 (Merge)';

  const handleAbort = async () => {
    setIsSubmitting(true);
    try {
      await abortCurrentOperation();
      toast.info(isRebase ? '已中止变基' : '已中止合并', '工作区已还原至操作前状态');
      setShowAbortConfirm(false);
    } catch (err: any) {
      toast.error('中止操作失败', err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleComplete = async () => {
    setIsSubmitting(true);
    try {
      await completeCurrentOperation();
      toast.success(isRebase ? '变基已成功完成！' : '合并提交已成功创建！');
    } catch (err: any) {
      toast.error('完成操作失败', err.message);
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
              <span className="text-rose-400">冲突处理状态</span>
            </span>
            <Badge
              variant="outline"
              className={`text-[10px] h-4.5 px-1.5 font-mono ${
                isAllResolved
                  ? 'border-emerald-500/40 text-emerald-400 bg-emerald-500/10'
                  : 'border-amber-500/40 text-amber-400 bg-amber-500/10'
              }`}
            >
              {isAllResolved ? '所有冲突已标记解决' : `待解决冲突: ${conflictedFiles.length} 个文件`}
            </Badge>
          </div>

          <div className="text-[11px] text-muted-foreground truncate mt-0.5">
            {isAllResolved ? (
              <span className="text-emerald-400/90 flex items-center gap-1">
                <Sparkles className="h-3 w-3 inline" />
                所有冲突代码均已标记解决并暂存，点击右侧完成收尾提交。
              </span>
            ) : (
              <span>
                请在变更列表中解决{' '}
                <span className="font-mono text-amber-300 font-semibold">
                  {conflictedFiles.slice(0, 3).join(', ')}
                  {conflictedFiles.length > 3 ? ` 等共 ${conflictedFiles.length} 个文件` : ''}
                </span>
                ，暂存后即可继续。
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Right action area */}
      <div className="flex items-center gap-2 shrink-0">
        {showAbortConfirm ? (
          <div className="flex items-center gap-1.5 bg-background/80 border border-rose-500/40 rounded-lg p-1 animate-in zoom-in-95">
            <span className="text-[10px] text-rose-400 px-1 font-medium">确认中止？</span>
            <Button
              variant="destructive"
              size="xs"
              onClick={handleAbort}
              disabled={isSubmitting}
              className="h-6 text-[10px] px-2"
            >
              确认
            </Button>
            <Button
              variant="ghost"
              size="xs"
              onClick={() => setShowAbortConfirm(false)}
              className="h-6 text-[10px] px-1.5 text-muted-foreground"
            >
              取消
            </Button>
          </div>
        ) : (
          <Button
            variant="outline"
            size="xs"
            onClick={() => setShowAbortConfirm(true)}
            disabled={isSubmitting}
            className="h-7 text-xs gap-1.5 border-rose-500/30 text-rose-400 hover:bg-rose-500/10 hover:text-rose-300"
            title={isRebase ? '中止变基并恢复现场' : '中止合并并恢复现场'}
          >
            <Ban className="h-3.5 w-3.5" />
            <span>{isRebase ? '中止变基' : '中止合并'}</span>
          </Button>
        )}

        <Button
          variant={isAllResolved ? 'default' : 'secondary'}
          size="xs"
          onClick={handleComplete}
          disabled={!isAllResolved || isSubmitting}
          className={`h-7 text-xs gap-1.5 shadow-sm transition-all ${
            isAllResolved
              ? 'bg-emerald-600 hover:bg-emerald-500 text-white animate-pulse'
              : 'opacity-60 cursor-not-allowed'
          }`}
          title={
            isAllResolved
              ? isRebase
                ? '继续变基下一提交'
                : '提交合并代码'
              : '需先暂存所有解决后的冲突文件'
          }
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isSubmitting ? 'animate-spin' : ''}`} />
          <span>{isRebase ? '继续变基 (--continue)' : '完成提交合并'}</span>
          <ArrowRight className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
};
