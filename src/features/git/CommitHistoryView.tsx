import React, { useState } from 'react';
import {
  GitCommit as GitCommitIcon,
  GitBranch as GitBranchIcon,
  Tag as TagIcon,
  Inbox,
  Search,
  Check,
  Monitor,
  Cloud,
  FileCode2,
} from 'lucide-react';
import { useRepoStore } from '@/stores/repoStore';
import { GitGraphRenderer } from '@/features/graph/GitGraphRenderer';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from '@/stores/toastStore';
import { cn } from '@/utils/cn';

export const CommitHistoryView: React.FC = () => {
  const {
    commits,
    selectedCommit,
    setSelectedCommit,
    setActiveTab,
    status,
    currentRepo,
  } = useRepoStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [copiedHash, setCopiedHash] = useState<string | null>(null);

  const totalChanges =
    (status?.staged.length || 0) +
    (status?.unstaged.length || 0) +
    (status?.untracked.length || 0);

  const hasWip = totalChanges > 0;

  const filteredCommits = commits.filter((c) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      c.subject.toLowerCase().includes(q) ||
      c.author.name.toLowerCase().includes(q) ||
      c.shortHash.toLowerCase().includes(q) ||
      c.refs?.some((r) => r.toLowerCase().includes(q))
    );
  });

  const activeCommit = selectedCommit || filteredCommits[0];
  const selectedIndex = hasWip
    ? filteredCommits.findIndex((c) => c.hash === activeCommit?.hash) + 1
    : filteredCommits.findIndex((c) => c.hash === activeCommit?.hash);

  const handleCopyHash = (hash: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(hash);
    setCopiedHash(hash);
    toast.success('已复制 Commit Hash', hash);
    setTimeout(() => setCopiedHash(null), 2000);
  };

  return (
    <div className="flex-1 h-full flex flex-col overflow-hidden select-none bg-background">
      {/* Top Search & Filter Bar */}
      <div className="h-9 px-3 border-b border-border flex items-center justify-between text-xs bg-card/40 shrink-0">
        <div className="flex items-center gap-2">
          <GitCommitIcon className="h-3.5 w-3.5 text-primary" />
          <span className="font-semibold text-foreground">提交历史与 Git Graph</span>
          <Badge variant="outline" className="h-4 text-[10px] font-mono">
            {filteredCommits.length} commits
          </Badge>
          {hasWip && (
            <Badge variant="warning" className="h-4 px-1.5 text-[10px] font-mono gap-1 animate-pulse">
              <span>{totalChanges} 未提交修改</span>
            </Badge>
          )}
        </div>

        {/* Search commit box */}
        <div className="flex items-center gap-2">
          <div className="relative w-52">
            <Search className="h-3 w-3 text-muted-foreground absolute left-2 top-2" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索主题、作者或 Hash..."
              className="h-7 pl-7 text-[11px] bg-secondary/30"
            />
          </div>
        </div>
      </div>

      {/* GitKraken-style Column Headers: BRANCH / TAG | GRAPH | COMMIT MESSAGE */}
      <div className="h-7 px-3 border-b border-border/80 bg-muted/20 flex items-center text-[10px] font-semibold text-muted-foreground uppercase tracking-wider shrink-0">
        <div className="w-48 truncate pr-2">BRANCH / TAG</div>
        <div className="w-16 text-center shrink-0">GRAPH</div>
        <div className="flex-1 min-w-0 pl-3">COMMIT MESSAGE</div>
        <div className="w-44 text-right pr-2 hidden md:block shrink-0">AUTHOR / DATE</div>
      </div>

      {/* Commit List Table with SVG Graph */}
      <ScrollArea className="flex-1">
        {filteredCommits.length === 0 && !hasWip ? (
          <div className="py-24 text-center space-y-2 text-muted-foreground">
            <Inbox className="h-8 w-8 mx-auto text-muted-foreground/30" />
            <div className="text-xs">未找到符合条件的提交记录</div>
          </div>
        ) : (
          <div className="flex relative">
            {/* SVG Graph Column (Spanning entire rows, perfectly aligned to w-16 column at left: 12px(px-3) + 192px(w-48) = 204px) */}
            <div className="pt-0 shrink-0 z-10 absolute left-[204px] top-0 pointer-events-none w-16">
              <GitGraphRenderer
                commits={filteredCommits}
                selectedIndex={selectedIndex}
                rowHeight={42}
                hasWipNode={hasWip}
              />
            </div>

            {/* Rows list */}
            <div className="flex-1 divide-y divide-border/30 min-w-0">
              {/* GitKraken-style Row 0: // WIP (Work in Progress) */}
              {hasWip && (
                <div
                  onClick={() => {
                    setActiveTab('changes');
                    toast.info('已快速跳转至工作区未提交变更 (WIP)');
                  }}
                  className="h-[42px] px-3 flex items-center justify-between gap-3 text-xs cursor-pointer transition-colors bg-sky-500/10 hover:bg-sky-500/20 border-l-2 border-sky-400 group"
                  title="点击查看并提交工作区变动"
                >
                  {/* Left Column: Branch Indicator */}
                  <div className="w-48 flex items-center gap-1.5 shrink-0 overflow-hidden pr-3">
                    <Badge variant="outline" className="h-4 px-1.5 text-[9px] font-mono gap-1 bg-sky-500/20 text-sky-400 border-sky-500/40 max-w-[120px] truncate">
                      <Monitor className="h-2.5 w-2.5 shrink-0" />
                      <span className="truncate">{currentRepo?.currentBranch || 'HEAD'}</span>
                    </Badge>
                  </div>

                  {/* Spacer for Graph column */}
                  <div className="w-16 shrink-0" />

                  {/* Commit message / WIP subject */}
                  <div className="flex items-center gap-2 min-w-0 flex-1 pl-3">
                    <span className="font-mono text-xs font-bold text-sky-400 flex items-center gap-1.5">
                      <FileCode2 className="h-3.5 w-3.5" />
                      <span>// WIP</span>
                    </span>
                    <Badge variant="success" className="h-4 px-1.5 text-[9px] font-mono font-bold">
                      +{totalChanges}
                    </Badge>
                    <span className="text-[11px] text-muted-foreground truncate hidden sm:inline">
                      工作区未提交代码修改 (点击进入检查)
                    </span>
                  </div>

                  {/* Right Column: Prompt */}
                  <div className="w-44 text-right pr-2 text-[10px] text-sky-400 font-mono shrink-0 hidden md:block">
                    View Changes →
                  </div>
                </div>
              )}

              {/* Commit Details Rows */}
              {filteredCommits.map((commit) => {
                const isSelected = activeCommit?.hash === commit.hash;
                const isCopied = copiedHash === commit.hash;

                return (
                  <div
                    key={commit.hash}
                    onClick={() => setSelectedCommit(commit)}
                    className={cn(
                      "h-[42px] px-3 flex items-center justify-between gap-3 text-xs cursor-pointer transition-colors group",
                      isSelected
                        ? "bg-primary/15 border-l-2 border-primary font-medium"
                        : "hover:bg-accent/30 border-l-2 border-transparent"
                    )}
                  >
                    {/* Left Column: BRANCH / TAG Badges */}
                    <div className="w-48 flex items-center gap-1 shrink-0 overflow-hidden pr-3">
                      {commit.refs && commit.refs.length > 0 ? (
                        <>
                          {commit.refs.slice(0, 2).map((ref) => {
                            const isHead = ref.includes('HEAD');
                            const isTag = ref.startsWith('tag:');
                            const isRemote = ref.includes('origin/');

                            return (
                              <Badge
                                key={ref}
                                title={ref}
                                variant={isTag ? "warning" : isHead ? "default" : "secondary"}
                                className={cn(
                                  "h-4 px-1 text-[9px] gap-1 font-mono shrink min-w-0 max-w-[86px] truncate",
                                  isTag && "bg-amber-500/15 text-amber-400 border-amber-500/30",
                                  isHead && "bg-indigo-500/15 text-indigo-400 border-indigo-500/30",
                                  isRemote && "bg-sky-500/15 text-sky-400 border-sky-500/30"
                                )}
                              >
                                {isTag ? (
                                  <TagIcon className="h-2.5 w-2.5 text-amber-400 shrink-0" />
                                ) : isRemote ? (
                                  <Cloud className="h-2.5 w-2.5 text-sky-400 shrink-0" />
                                ) : (
                                  <GitBranchIcon className="h-2.5 w-2.5 shrink-0" />
                                )}
                                <span className="truncate">{ref.replace('tag: ', '').replace('HEAD -> ', '')}</span>
                              </Badge>
                            );
                          })}
                          {commit.refs.length > 2 && (
                            <Badge variant="outline" className="h-4 px-1 text-[9px] font-mono shrink-0">
                              +{commit.refs.length - 2}
                            </Badge>
                          )}
                        </>
                      ) : null}
                    </div>

                    {/* Spacer for Graph column */}
                    <div className="w-16 shrink-0" />

                    {/* Subject */}
                    <div className="flex items-center gap-2 min-w-0 flex-1 pl-3">
                      <span className="text-xs text-foreground group-hover:text-primary transition-colors truncate">
                        {commit.subject}
                      </span>
                    </div>

                    {/* Author & Date & Hash */}
                    <div className="w-44 flex items-center justify-end gap-2 text-[10px] text-muted-foreground shrink-0 pr-2 hidden md:flex">
                      <span className="truncate max-w-[80px]">{commit.author.name}</span>
                      <span className="opacity-70 whitespace-nowrap">{commit.author.relativeDate}</span>
                      <button
                        onClick={(e) => handleCopyHash(commit.hash, e)}
                        className="font-mono text-[10px] px-1 py-0.5 rounded bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                        title="点击复制 Hash"
                      >
                        {isCopied ? <Check className="h-2.5 w-2.5 text-emerald-400" /> : commit.shortHash}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </ScrollArea>
    </div>
  );
};
