import React, { useState } from 'react';
import {
  GitCommit as GitCommitIcon,
  GitBranch as GitBranchIcon,
  Tag as TagIcon,
  Calendar,
  User,
  Inbox,
  Search,
  Copy,
  Check,
  CheckCircle2,
} from 'lucide-react';
import { useRepoStore } from '@/stores/repoStore';
import { GitGraphRenderer } from '@/features/graph/GitGraphRenderer';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from '@/stores/toastStore';
import { cn } from '@/utils/cn';

export const CommitHistoryView: React.FC = () => {
  const { commits, selectedCommit, setSelectedCommit, setActiveTab } = useRepoStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedHash, setCopiedHash] = useState<string | null>(null);

  const activeCommit = selectedCommit || commits[0];

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

  const selectedIndex = filteredCommits.findIndex((c) => c.hash === activeCommit?.hash);

  const handleCopyHash = (hash: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(hash);
    setCopiedHash(hash);
    toast.success('已复制 Commit Hash', hash);
    setTimeout(() => setCopiedHash(null), 2000);
  };

  return (
    <div className="flex-1 h-full flex flex-col overflow-hidden select-none bg-background">
      {/* Header bar */}
      <div className="h-9 px-3 border-b border-border flex items-center justify-between text-xs bg-card/40 shrink-0">
        <div className="flex items-center gap-2">
          <GitCommitIcon className="h-3.5 w-3.5 text-primary" />
          <span className="font-semibold text-foreground">提交历史与 Git Graph</span>
          <Badge variant="outline" className="h-4 text-[10px] font-mono">
            {filteredCommits.length} 条记录
          </Badge>
        </div>

        {/* Search commit box */}
        <div className="flex items-center gap-2">
          <div className="relative w-48">
            <Search className="h-3 w-3 text-muted-foreground absolute left-2 top-2" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索信息、作者或 Hash..."
              className="h-7 pl-7 text-[11px]"
            />
          </div>
        </div>
      </div>

      {/* Commit List Table with Left SVG Graph */}
      <ScrollArea className="flex-1">
        {filteredCommits.length === 0 ? (
          <div className="py-24 text-center space-y-2 text-muted-foreground">
            <Inbox className="h-8 w-8 mx-auto text-muted-foreground/30" />
            <div className="text-xs">未找到符合条件的提交记录</div>
          </div>
        ) : (
          <div className="flex relative">
            {/* SVG Graph Column */}
            <div className="pt-0 pl-1 shrink-0 z-10">
              <GitGraphRenderer
                commits={filteredCommits}
                selectedIndex={selectedIndex}
                rowHeight={44}
              />
            </div>

            {/* Commit Details Rows */}
            <div className="flex-1 divide-y divide-border/40 min-w-0">
              {filteredCommits.map((commit) => {
                const isSelected = activeCommit?.hash === commit.hash;
                const isCopied = copiedHash === commit.hash;

                return (
                  <div
                    key={commit.hash}
                    onClick={() => setSelectedCommit(commit)}
                    className={cn(
                      "h-[44px] px-3 flex items-center justify-between gap-3 text-xs cursor-pointer transition-colors group",
                      isSelected
                        ? "bg-accent/70 border-l-2 border-primary"
                        : "hover:bg-accent/30 border-l-2 border-transparent"
                    )}
                  >
                    {/* Commit Subject & Refs */}
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className="font-medium text-xs text-foreground group-hover:text-primary transition-colors truncate">
                        {commit.subject}
                      </span>

                      {/* Refs / Branches / Tags Badges */}
                      <div className="flex items-center gap-1 shrink-0">
                        {commit.refs?.map((ref) => {
                          const isHead = ref.includes('HEAD');
                          const isTag = ref.startsWith('tag:');

                          return (
                            <Badge
                              key={ref}
                              variant={isTag ? "warning" : isHead ? "default" : "secondary"}
                              className={cn(
                                "h-4 px-1.5 text-[9px] gap-1 font-mono shrink-0",
                                isTag && "bg-amber-500/15 text-amber-400 border-amber-500/30",
                                isHead && "bg-indigo-500/15 text-indigo-400 border-indigo-500/30"
                              )}
                            >
                              {isTag ? (
                                <TagIcon className="h-2.5 w-2.5 text-amber-400" />
                              ) : (
                                <GitBranchIcon className="h-2.5 w-2.5" />
                              )}
                              <span>{ref.replace('tag: ', '')}</span>
                            </Badge>
                          );
                        })}
                      </div>
                    </div>

                    {/* Meta: Author, Relative Date & Short Hash */}
                    <div className="flex items-center gap-3 shrink-0 text-[11px] text-muted-foreground font-mono">
                      <div className="hidden md:flex items-center gap-1">
                        <User className="h-3 w-3 text-muted-foreground/60" />
                        <span className="truncate max-w-[90px]">{commit.author.name}</span>
                      </div>

                      <div className="flex items-center gap-1">
                        <Calendar className="h-3 w-3 text-muted-foreground/60" />
                        <span>{commit.author.relativeDate}</span>
                      </div>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveTab('actions');
                          toast.info(`已定位至 Commit ${commit.shortHash} 的 CI 运行记录`);
                        }}
                        className="p-1 rounded hover:bg-accent flex items-center text-emerald-400 group/ci"
                        title="GitHub Actions CI: 全部 4 个 Checks 均已通过 (点击进入 Actions 详情)"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5 transition-transform group-hover/ci:scale-110" />
                      </button>

                      <button
                        onClick={(e) => handleCopyHash(commit.hash, e)}
                        className="p-1 rounded hover:bg-accent hover:text-foreground flex items-center gap-1 group/btn"
                        title="点击复制完整 Hash"
                      >
                        <span className="text-[10px] text-muted-foreground/80 group-hover/btn:text-foreground">
                          {commit.shortHash}
                        </span>
                        {isCopied ? (
                          <Check className="h-2.5 w-2.5 text-emerald-400" />
                        ) : (
                          <Copy className="h-2.5 w-2.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                        )}
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
