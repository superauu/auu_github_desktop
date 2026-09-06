import React from 'react';
import {
  GitCommit as GitCommitIcon,
  GitBranch as GitBranchIcon,
  Tag as TagIcon,
  Calendar,
  User,
  Inbox,
} from 'lucide-react';
import { useRepoStore } from '@/stores/repoStore';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/utils/cn';

export const CommitHistoryView: React.FC = () => {
  const { commits, selectedCommit, setSelectedCommit } = useRepoStore();

  const activeCommit = selectedCommit || commits[0];

  return (
    <div className="flex-1 h-full flex flex-col overflow-hidden select-none bg-card/20">
      {/* Header bar */}
      <div className="h-9 px-4 border-b border-border flex items-center justify-between text-xs text-muted-foreground bg-card/40">
        <div className="flex items-center gap-2">
          <GitCommitIcon className="h-3.5 w-3.5 text-primary" />
          <span className="font-semibold text-foreground">提交历史 (Commit Log & Graph)</span>
          <Badge variant="outline" className="h-4 text-[10px] font-mono">
            {commits.length} 次提交
          </Badge>
        </div>
      </div>

      {/* Commit List Table */}
      <ScrollArea className="flex-1">
        {commits.length === 0 ? (
          <div className="py-20 text-center space-y-2 text-muted-foreground">
            <Inbox className="h-8 w-8 mx-auto text-muted-foreground/40" />
            <div className="text-xs">暂无提交历史</div>
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {commits.map((commit, index) => {
              const isSelected = activeCommit?.hash === commit.hash;

              return (
                <div
                  key={commit.hash}
                  onClick={() => setSelectedCommit(commit)}
                  className={cn(
                    "p-3 flex items-start gap-3 cursor-pointer transition-all hover:bg-accent/40 group",
                    isSelected
                      ? "bg-accent/60 border-l-2 border-primary"
                      : "border-l-2 border-transparent"
                  )}
                >
                  {/* Visual Graph Node Representation */}
                  <div className="flex flex-col items-center pt-0.5 shrink-0 w-5">
                    <div
                      className={cn(
                        "w-3 h-3 rounded-full border-2 transition-transform group-hover:scale-125",
                        index === 0
                          ? "border-primary bg-primary/20"
                          : commit.refs?.some((r) => r.startsWith('tag:'))
                          ? "border-amber-400 bg-amber-400/20"
                          : "border-indigo-400 bg-background"
                      )}
                    />
                    {index < commits.length - 1 && (
                      <div className="w-0.5 h-10 bg-border/80 my-0.5" />
                    )}
                  </div>

                  {/* Commit Main Info */}
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-xs text-foreground group-hover:text-primary transition-colors">
                        {commit.subject}
                      </span>

                      {/* Refs / Branches / Tags Badges */}
                      {commit.refs?.map((ref) => {
                        const isHead = ref.includes('HEAD');
                        const isTag = ref.startsWith('tag:');

                        return (
                          <Badge
                            key={ref}
                            variant={isTag ? 'warning' : isHead ? 'default' : 'secondary'}
                            className="h-4 px-1.5 text-[9px] gap-1 font-mono"
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

                    {/* Author, Date & Hash */}
                    <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <User className="h-3 w-3 text-muted-foreground/60" />
                        <span>{commit.author.name}</span>
                      </span>

                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3 text-muted-foreground/60" />
                        <span>{commit.author.relativeDate}</span>
                      </span>

                      <span className="font-mono text-[10px] text-muted-foreground/80 hover:text-foreground">
                        {commit.shortHash}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  );
};
