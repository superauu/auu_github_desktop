import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  GitCommit as GitCommitIcon,
  Send,
  Layers,
  Check,
  AlertCircle,
  Loader2,
  Copy,
} from 'lucide-react';
import { useRepoStore } from '@/stores/repoStore';
import { useGitHubStore } from '@/stores/githubStore';
import { GitHubCheckRun } from '@/services/github/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from '@/stores/toastStore';

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

  const { fetchCommitChecks } = useGitHubStore();

  const [commitMessage, setCommitMessage] = useState('');
  const [isAmend, setIsAmend] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [checks, setChecks] = useState<GitHubCheckRun[]>([]);
  const [copiedHash, setCopiedHash] = useState(false);

  useEffect(() => {
    if (activeTab === 'history' && selectedCommit) {
      fetchCommitChecks(selectedCommit.hash).then((res) => {
        setChecks(res);
      });
    }
  }, [activeTab, selectedCommit, fetchCommitChecks]);

  if (isRightPaneCollapsed) return null;

  const stagedCount = status?.staged.length || 0;

  const handleCommit = async (andPush: boolean = false) => {
    if (!commitMessage.trim()) return;

    setIsSubmitting(true);
    setError(null);
    try {
      await commit(commitMessage.trim(), isAmend);
      const title = isAmend ? '已覆盖修改上一条提交 (Amend)' : '新提交创建成功！';
      toast.success(title, commitMessage.trim());
      setCommitMessage('');
      setIsAmend(false);

      if (andPush) {
        toast.info('正在推送本地提交到远程...');
      }
    } catch (err: any) {
      toast.error('提交失败', err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const copyHash = (hash: string) => {
    navigator.clipboard.writeText(hash);
    setCopiedHash(true);
    toast.success('已复制 Commit Hash', hash);
    setTimeout(() => setCopiedHash(false), 2000);
  };

  return (
    <aside className="w-72 border-l border-border bg-card/40 flex flex-col select-none shrink-0 h-full overflow-hidden text-xs">
      {/* Pane Header */}
      <div className="h-9 px-3 border-b border-border flex items-center justify-between font-medium text-foreground bg-accent/20 shrink-0">
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
            <div className="p-3 rounded-xl border border-border/80 bg-accent/30 space-y-2.5">
              <div className="flex items-center justify-between">
                <button
                  onClick={() => copyHash(selectedCommit.hash)}
                  className="font-mono text-xs font-semibold text-primary hover:underline flex items-center gap-1"
                  title="点击复制完整 Hash"
                >
                  <span>{selectedCommit.shortHash}</span>
                  {copiedHash ? (
                    <Check className="h-2.5 w-2.5 text-emerald-400" />
                  ) : (
                    <Copy className="h-2.5 w-2.5 text-muted-foreground" />
                  )}
                </button>
                <span className="text-[10px] text-muted-foreground">
                  {selectedCommit.author.relativeDate}
                </span>
              </div>

              <p className="text-xs font-medium text-foreground leading-relaxed">
                {selectedCommit.subject}
              </p>

              {selectedCommit.body && (
                <p className="text-[11px] text-muted-foreground whitespace-pre-wrap font-mono bg-background/40 p-2 rounded border border-border/40">
                  {selectedCommit.body}
                </p>
              )}

              <div className="text-[11px] text-muted-foreground flex items-center justify-between pt-2 border-t border-border/40">
                <div className="flex items-center gap-1">
                  <span>作者:</span>
                  <span className="text-foreground font-medium">{selectedCommit.author.name}</span>
                </div>
                <span className="text-[10px] opacity-60 font-mono">
                  {selectedCommit.author.email}
                </span>
              </div>
            </div>

            {/* GitHub Checks Status (PRD Section 24) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  GitHub Checks
                </span>
                <Badge variant="success" className="h-4 text-[9px] gap-1 font-mono">
                  <CheckCircle2 className="h-2.5 w-2.5 text-emerald-400" />
                  <span>{checks.length} / {checks.length} 通过</span>
                </Badge>
              </div>

              <div className="rounded-xl border border-border/80 divide-y divide-border/60 bg-background/50 text-[11px] overflow-hidden">
                {checks.length === 0 ? (
                  <div className="p-3 text-center text-[10px] text-muted-foreground">
                    正在查询 Checks 状态...
                  </div>
                ) : (
                  checks.map((c) => (
                    <div
                      key={c.id}
                      className="p-2 flex items-center justify-between hover:bg-accent/30 transition-colors"
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        <CheckCircle2 className="h-3 w-3 text-emerald-400 shrink-0" />
                        <span className="truncate max-w-[150px]">{c.name}</span>
                      </div>
                      <span className="text-[9px] font-mono text-emerald-400 uppercase">
                        {c.conclusion}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Commit Hash & Parents */}
            <div className="p-2.5 rounded-lg border border-border/60 bg-accent/15 space-y-1.5 text-[11px] font-mono">
              <div className="flex items-center justify-between text-muted-foreground">
                <span>完整 Hash:</span>
                <span className="text-foreground/90 text-[10px] truncate max-w-[150px]">
                  {selectedCommit.hash}
                </span>
              </div>
              {selectedCommit.parents.length > 0 && (
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>Parent:</span>
                  <span className="text-foreground/90 text-[10px]">
                    {selectedCommit.parents.map((p) => p.slice(0, 7)).join(', ')}
                  </span>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Commit Creation Area */
          <div className="space-y-4">
            {/* Staging Summary */}
            <div className="p-3 rounded-xl border border-border/80 bg-accent/20 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground font-medium">已暂存文件</span>
                <Badge
                  variant={stagedCount > 0 ? "success" : "secondary"}
                  className="h-4 text-[10px] font-mono"
                >
                  {stagedCount} 个文件
                </Badge>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                {stagedCount > 0
                  ? '改动已暂存就绪，请输入提交信息。'
                  : isAmend
                  ? 'Amend 模式：将修改并替换上一条提交记录。'
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
                  {['feat', 'fix', 'chore', 'perf'].map((prefix) => (
                    <button
                      key={prefix}
                      type="button"
                      onClick={() => setCommitMessage(`${prefix}: `)}
                      className="text-[9px] px-1.5 py-0.5 rounded bg-accent/70 text-primary hover:bg-accent font-mono"
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
                placeholder="简明描述改动 (Ctrl + Enter 快速提交)..."
                rows={4}
                className="w-full resize-none rounded-lg border border-input bg-background/80 p-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring transition-colors font-mono"
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
                className="w-full h-8 text-xs font-medium gap-1.5 shadow-sm"
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
