import React, { useState } from 'react';
import { GitBranch, X, Loader2, Check } from 'lucide-react';
import { useRepoStore } from '@/stores/repoStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/stores/toastStore';

interface CreateBranchModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultBaseBranch?: string;
  defaultCommitHash?: string;
}

export const CreateBranchModal: React.FC<CreateBranchModalProps> = ({
  open,
  onOpenChange,
  defaultBaseBranch,
  defaultCommitHash,
}) => {
  const { currentRepo, branches, status, commits, createBranch } = useRepoStore();

  const currentBranch =
    branches.find((b) => b.isCurrent)?.name ||
    status?.currentBranch ||
    currentRepo?.currentBranch ||
    'main';

  const [branchName, setBranchName] = useState('');
  const [baseType, setBaseType] = useState<'current' | 'branch' | 'commit'>(
    defaultCommitHash ? 'commit' : 'current'
  );
  const [selectedBaseBranch, setSelectedBaseBranch] = useState(
    defaultBaseBranch || currentBranch
  );
  const [selectedCommitHash, setSelectedCommitHash] = useState(
    defaultCommitHash || (commits[0]?.hash ?? '')
  );
  const [checkoutAfterCreate, setCheckoutAfterCreate] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = branchName.trim();
    if (!cleanName) {
      setError('分支名称不能为空');
      return;
    }

    if (/\s/.test(cleanName)) {
      setError('分支名称不能包含空格');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    let startPoint: string | undefined = undefined;
    if (baseType === 'branch') {
      startPoint = selectedBaseBranch;
    } else if (baseType === 'commit') {
      startPoint = selectedCommitHash;
    }

    try {
      await createBranch(cleanName, startPoint, checkoutAfterCreate);
      toast.success(
        `新分支 ${cleanName} 创建成功！`,
        checkoutAfterCreate ? '已自动切换至新分支' : '留在当前分支'
      );
      setBranchName('');
      onOpenChange(false);
    } catch (err: any) {
      setError(err.message || '创建分支失败');
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
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <GitBranch className="h-4 w-4" />
            </div>
            <div>
              <div className="font-semibold text-xs text-foreground">新建 Git 分支</div>
              <div className="text-[10px] text-muted-foreground">
                在仓库 {currentRepo?.name} 中创建新分支
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
          <div className="p-2 rounded bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {/* Branch Name */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-foreground block">
              新分支名称 (Branch Name)
            </label>
            <Input
              value={branchName}
              onChange={(e) => setBranchName(e.target.value)}
              placeholder="e.g. feature/awesome-feature 或 fix/bug-123"
              className="font-mono text-xs"
              autoFocus
            />
          </div>

          {/* Base Selection */}
          <div className="space-y-2">
            <label className="text-[11px] font-medium text-foreground block">
              基于基底 (Base Source)
            </label>
            <div className="grid grid-cols-3 gap-1.5 p-1 bg-muted/40 rounded-lg border border-border/50 text-[11px]">
              <button
                type="button"
                onClick={() => setBaseType('current')}
                className={`py-1.5 px-2 rounded-md transition-colors ${
                  baseType === 'current'
                    ? 'bg-card text-foreground shadow-xs font-semibold'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                当前分支 HEAD
              </button>
              <button
                type="button"
                onClick={() => setBaseType('branch')}
                className={`py-1.5 px-2 rounded-md transition-colors ${
                  baseType === 'branch'
                    ? 'bg-card text-foreground shadow-xs font-semibold'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                其他分支
              </button>
              <button
                type="button"
                onClick={() => setBaseType('commit')}
                className={`py-1.5 px-2 rounded-md transition-colors ${
                  baseType === 'commit'
                    ? 'bg-card text-foreground shadow-xs font-semibold'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                特定 Commit
              </button>
            </div>

            {baseType === 'current' && (
              <div className="text-[10px] text-muted-foreground px-1">
                将从当前所在分支 <span className="font-mono text-foreground font-semibold">{currentBranch}</span> 的最新提交检出。
              </div>
            )}

            {baseType === 'branch' && (
              <select
                value={selectedBaseBranch}
                onChange={(e) => setSelectedBaseBranch(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-xs text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {branches.map((b) => (
                  <option key={b.name} value={b.name}>
                    {b.name} {b.isCurrent ? '(当前)' : ''}
                  </option>
                ))}
              </select>
            )}

            {baseType === 'commit' && (
              <div className="space-y-1.5">
                <select
                  value={selectedCommitHash}
                  onChange={(e) => setSelectedCommitHash(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-xs text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-ring truncate"
                >
                  {commits.map((c) => (
                    <option key={c.hash} value={c.hash}>
                      {c.shortHash} - {c.subject.slice(0, 35)}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Checkout checkbox */}
          <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer select-none pt-1">
            <input
              type="checkbox"
              checked={checkoutAfterCreate}
              onChange={(e) => setCheckoutAfterCreate(e.target.checked)}
              className="rounded border-input text-primary focus:ring-primary h-3.5 w-3.5"
            />
            <span>创建后立即切换至新分支 (Checkout branch)</span>
          </label>

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
              disabled={!branchName.trim() || isSubmitting}
              className="h-7 text-xs gap-1.5"
            >
              {isSubmitting ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Check className="h-3 w-3" />
              )}
              <span>创建分支</span>
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
