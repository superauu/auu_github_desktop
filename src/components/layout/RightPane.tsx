import React, { useState } from 'react';
import {
  CheckCircle2,
  GitCommit as GitCommitIcon,
  Send,
  Sparkles,
  Layers,
  Check,
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
  } = useRepoStore();

  const [commitMessage, setCommitMessage] = useState('');
  const [isAmend, setIsAmend] = useState(false);

  if (isRightPaneCollapsed) return null;

  const stagedCount = status?.staged.length || 0;

  // Mock GitHub Checks for selected commit (PRD Section 24)
  const mockChecks = [
    { name: 'Build & Typecheck', status: 'success', duration: '1m 12s' },
    { name: 'Unit Tests (Vitest)', status: 'success', duration: '45s' },
    { name: 'ESLint & Formatting', status: 'success', duration: '30s' },
    { name: 'Tauri Desktop Bundle Check', status: 'success', duration: '2m 04s' },
  ];

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
              <div className="text-[11px] text-muted-foreground flex items-center gap-1">
                <span>作者:</span>
                <span className="text-foreground font-medium">{selectedCommit.author.name}</span>
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
                  <span>4 / 4 通过</span>
                </Badge>
              </div>

              <div className="rounded-md border border-border divide-y divide-border/60 bg-background/50">
                {mockChecks.map((check) => (
                  <div key={check.name} className="p-2 flex items-center justify-between text-xs hover:bg-accent/30 transition-colors">
                    <div className="flex items-center gap-1.5">
                      <CheckCircle2 className="h-3 w-3 text-emerald-400 shrink-0" />
                      <span className="text-foreground/90 truncate max-w-[140px]">{check.name}</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground font-mono">{check.duration}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Changes files summary */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                涉及改动文件
              </span>
              <div className="text-xs text-muted-foreground p-2 rounded border border-border bg-accent/20">
                包含 {selectedCommit.changedFilesCount || 3} 个文件的修改
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
                  : '尚未暂存任何改动。请在中间区域勾选要提交的文件。'}
              </p>
            </div>

            {/* Commit Message Box */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-medium text-foreground">
                  提交信息 (Commit Message)
                </label>
                <button
                  type="button"
                  onClick={() => setCommitMessage('feat: ')}
                  className="text-[10px] text-primary hover:underline flex items-center gap-0.5"
                >
                  <Sparkles className="h-2.5 w-2.5" />
                  <span>模板</span>
                </button>
              </div>

              <textarea
                value={commitMessage}
                onChange={(e) => setCommitMessage(e.target.value)}
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
                className="w-full h-8 text-xs font-medium gap-1.5"
                disabled={stagedCount === 0 || !commitMessage.trim()}
              >
                <Check className="h-3.5 w-3.5" />
                <span>{isAmend ? '覆盖提交 (Amend)' : '提交变更 (Commit)'}</span>
              </Button>

              <Button
                variant="secondary"
                className="w-full h-8 text-xs font-medium gap-1.5"
                disabled={stagedCount === 0 || !commitMessage.trim()}
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
