import React, { useState } from 'react';
import { GitPullRequest, X, Loader2, AlertTriangle, Check, ArrowRight, RefreshCw, Ban } from 'lucide-react';
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
  const { currentRepo, branches, status, rebaseBranch, rebaseContinue, rebaseAbort } = useRepoStore();

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

  if (!open) return null;

  const handleRebase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBranch) return;

    setIsSubmitting(true);
    setError(null);

    try {
      await rebaseBranch(selectedBranch);
      toast.success(`变基完成`, `已成功将 ${currentBranch} 变基到 ${selectedBranch}`);
      onOpenChange(false);
    } catch (err: any) {
      const msg = err.message || '变基失败';
      setError(msg);
      if (msg.includes('CONFLICT') || msg.includes('conflict')) {
        setInConflictState(true);
        toast.error('变基遇到冲突 (Conflict)', '请先在工作区解决冲突文件，然后点击“继续变基”');
      } else {
        toast.error('变基失败', msg);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleContinue = async () => {
    setIsSubmitting(true);
    try {
      await rebaseContinue();
      toast.success('变基继续完成！');
      setInConflictState(false);
      onOpenChange(false);
    } catch (err: any) {
      setError(err.message);
      toast.error('继续变基失败', err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAbort = async () => {
    setIsSubmitting(true);
    try {
      await rebaseAbort();
      toast.info('已中止变基', '工作区已还原至变基前状态');
      setInConflictState(false);
      onOpenChange(false);
    } catch (err: any) {
      toast.error('中止变基失败', err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm animate-in fade-in-0 select-none"
      onClick={() => onOpenChange(false)}
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
              <div className="font-semibold text-xs text-foreground">分支变基 (Rebase Branch)</div>
              <div className="text-[10px] text-muted-foreground">
                将当前分支的提交重新基底到目标分支之上
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
          <div className="text-[11px] leading-relaxed opacity-90">
            变基 (Rebase) 会重新编写当前分支的 Commit 提交历史。请确保您仅对本地未公开或特性分支进行此操作，避免对共享主干分支执行变基。
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
              当前变基处于冲突状态，请选择操作：
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
                <span>中止变基 (--abort)</span>
              </Button>
              <Button
                variant="default"
                size="xs"
                onClick={handleContinue}
                disabled={isSubmitting}
                className="flex-1 h-8 text-xs gap-1.5"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isSubmitting ? 'animate-spin' : ''}`} />
                <span>已解决冲突，继续 (--continue)</span>
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleRebase} className="space-y-4 text-xs">
            {/* Branch Flow Visualizer */}
            <div className="p-3 rounded-lg border border-border bg-accent/20 flex items-center justify-between text-xs font-mono">
              <div className="flex flex-col gap-1">
                <span className="text-[10px] text-muted-foreground">当前分支 (重基底)</span>
                <Badge variant="outline" className="h-5 px-2 text-xs font-semibold">
                  {currentBranch}
                </Badge>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="flex flex-col gap-1 items-end">
                <span className="text-[10px] text-muted-foreground">目标基底分支 (Onto)</span>
                <Badge variant="warning" className="h-5 px-2 text-xs font-semibold">
                  {selectedBranch || '未选择'}
                </Badge>
              </div>
            </div>

            {/* Select Upstream Branch */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-medium text-foreground block">
                选择作为新基底的目标分支 (Upstream)
              </label>
              <select
                value={selectedBranch}
                onChange={(e) => setSelectedBranch(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-xs text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {availableBranches.length === 0 ? (
                  <option value="">暂无其他可选分支</option>
                ) : (
                  availableBranches.map((b) => (
                    <option key={b.name} value={b.name}>
                      {b.name} {b.isRemote ? '(远程)' : ''}
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
                取消
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
                <span>开始变基 (Rebase)</span>
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
