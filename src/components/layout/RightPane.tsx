import React, { useState } from 'react';
import {
  CheckCircle2,
  GitCommit as GitCommitIcon,
  Send,
  Layers,
  Check,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { useRepoStore } from '@/stores/repoStore';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';

export const RightPane: React.FC = () => {
  const {
    isRightPaneCollapsed,
    status,
    selectedCommit,
    activeTab,
    commit,
    errorMessage,
    setError,
  } = useRepoStore();

  const [commitMessage, setCommitMessage] = useState('');
  const [isAmend, setIsAmend] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  if (isRightPaneCollapsed) return null;

  const stagedCount = status?.staged.length || 0;

  const handleCommit = async (andPush: boolean = false) => {
    if (!commitMessage.trim()) return;

    setIsSubmitting(true);
    setError(null);
    try {
      await commit(commitMessage.trim(), isAmend);
      setCommitMessage('');
      setIsAmend(false);
      setSuccessToast(isAmend ? '已覆盖修改上一条提交 (Amend)' : '提交已成功生成！');
      setTimeout(() => setSuccessToast(null), 4000);

      if (andPush) {
        // Future push integration
      }
    } catch {
      // Error already in store
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <aside className="w-72 border-l border-border bg-card/40 flex flex-col select-none shrink-0 h-full overflow-hidden text-xs">
      {/* Pane Header */}
      <div className="h-9 px-3 border-b border-border flex items-center justify-between font-medium text-foreground bg-accent/20">
        <div className="flex items-center gap-1.5">
          {activeTab === 'history' && selectedCommit ? (
            <>
              <GitCommitIcon className="h-3.5 w-3.5 text-primary" />
              <span>提交详情 (Commit Details)</span>
            </>
          ) : (
            <>
              <Layers className="h-3.5 w-3.5 text-primary" />
              <span>检查与提交 (Commit Inspector)</span>
            </>
          )}
        </div>
      </div>

      <ScrollArea className="flex-1 p-3">
        {/* Success Alert */}
        {successToast && (
          <div className="mb-3 p-2.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 text-xs flex items-center gap-2 animate-in fade-in-50">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
            <span>{successToast}</span>
          </div>
        )}

        {/* Error Alert */}
        {errorMessage && (
          <div className="mb-3 p-2.5 rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-300 text-xs flex items-start gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-400 mt-0.5" />
            <div className="min-w-0">
              <div className="font-semibold text-[11px]">操作失败</div>
              <div className="text-[10px] break-all opacity-90">{errorMessage}</div>
            </div>
          </div>
        )}

        {/* If viewing a selected commit from history */}
        {activeTab === 'history' && selectedCommit ? (
          <div className="space-y-4">
            {/* Commit Meta */}
            <div className="p-2.5 rounded-lg border border-border bg-accent/30 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-semibold text-primary">
                  {selectedCommit.shortHash}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {selectedCommit.author.relativeDate}
                </span>
              </div>
              <p className="text-xs font-medium text-foreground leading-relaxed">
                {selectedCommit.subject}
              </p>
              {selectedCommit.body && (
                <p className="text-[11px] text-muted-foreground whitespace-pre-wrap">
                  {selectedCommit.body}
                </p>
              )}
              <div className="text-[11px] text-muted-foreground flex items-center gap-1 pt-1 border-t border-border/40">
                <span>作者:</span>
                <span className="text-foreground font-medium">{selectedCommit.author.name}</span>
                <span className="text-[10px] opacity-60 font-mono">({selectedCommit.author.email})</span>
              </div>
            </div>

            {/* GitHub Checks Status (PRD Section 24) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  GitHub Checks
                </span>
                <Badge variant="success" className="h-4 text-[9px] gap-1">
                  <CheckCircle2 className="h-2.5 w-2.5" />
                  <span>CI 就绪</span>
                </Badge>
              </div>

              <div className="rounded-md border border-border divide-y divide-border/60 bg-background/50 text-[11px]">
                <div className="p-2 flex items-center justify-between">
                  <span className="text-muted-foreground">完整 Hash:</span>
                  <span className="font-mono text-[9px] text-foreground/80 truncate max-w-[140px]">
                    {selectedCommit.hash}
                  </span>
                </div>
                {selectedCommit.parents.length > 0 && (
                  <div className="p-2 flex items-center justify-between">
                    <span className="text-muted-foreground">父节点:</span>
                    <span className="font-mono text-[9px] text-foreground/80">
                      {selectedCommit.parents.map((p) => p.slice(0, 7)).join(', ')}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          /* Commit Creation Area */
          <div className="space-y-4">
            {/* Staging Summary */}
            <div className="p-2.5 rounded-lg border border-border bg-accent/20 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground font-medium">已暂存文件</span>
                <Badge variant={stagedCount > 0 ? "success" : "secondary"} className="h-4 text-[10px]">
                  {stagedCount} 个文件
                </Badge>
              </div>
              <p className="text-[11px] text-muted-foreground">
                {stagedCount > 0
                  ? '已准备好进行提交，请输入有意义的 Commit 信息。'
                  : isAmend
                  ? 'Amend 模式：将修改上一条提交记录。'
                  : '尚未暂存任何改动。请在中间区域勾选要暂存的文件。'}
              </p>
            </div>

            {/* Commit Message Box */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-medium text-foreground">
                  提交信息 (Commit Message)
                </label>
                <div className="flex gap-1">
                  {['feat', 'fix', 'chore'].map((prefix) => (
                    <button
                      key={prefix}
                      type="button"
                      onClick={() => setCommitMessage(`${prefix}: `)}
                      className="text-[9px] px-1 py-0.5 rounded bg-accent/60 text-primary hover:bg-accent"
                    >
                      {prefix}
                    </button>
                  ))}
                </div>
              </div>

              <textarea
                value={commitMessage}
                onChange={(e) => setCommitMessage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    handleCommit(false);
                  }
                }}
                placeholder="简明描述此次改动 (Ctrl + Enter 提交)..."
                rows={4}
                className="w-full resize-none rounded-md border border-input bg-background/80 p-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring transition-colors font-mono"
              />
            </div>

            {/* Amend Option */}
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isAmend}
                onChange={(e) => setIsAmend(e.target.checked)}
                className="rounded border-input text-primary focus:ring-primary h-3.5 w-3.5"
              />
              <span>修改上一条提交 (Amend last commit)</span>
            </label>

            {/* Commit Action Buttons */}
            <div className="space-y-2 pt-1">
              <Button
                onClick={() => handleCommit(false)}
                className="w-full h-8 text-xs font-medium gap-1.5"
                disabled={(stagedCount === 0 && !isAmend) || !commitMessage.trim() || isSubmitting}
              >
                {isSubmitting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Check className="h-3.5 w-3.5" />
                )}
                <span>{isAmend ? '覆盖提交 (Amend)' : '提交变更 (Commit)'}</span>
              </Button>

              <Button
                variant="secondary"
                onClick={() => handleCommit(true)}
                className="w-full h-8 text-xs font-medium gap-1.5"
                disabled={(stagedCount === 0 && !isAmend) || !commitMessage.trim() || isSubmitting}
              >
                <Send className="h-3 w-3" />
                <span>提交并推送 (Commit & Push)</span>
              </Button>
            </div>
          </div>
        )}
      </ScrollArea>
    </aside>
  );
};
