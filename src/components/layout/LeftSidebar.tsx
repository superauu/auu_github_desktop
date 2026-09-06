import React, { useState } from 'react';
import {
  GitBranch as GitBranchIcon,
  Tag as TagIcon,
  Clock,
  FileCode2,
  Plus,
  ChevronRight,
  ChevronDown,
  Cloud,
} from 'lucide-react';
import { useRepoStore } from '@/stores/repoStore';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/utils/cn';

export const LeftSidebar: React.FC = () => {
  const {
    currentRepo,
    activeTab,
    setActiveTab,
    status,
    branches,
    tags,
    isLeftSidebarCollapsed,
  } = useRepoStore();

  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    localBranches: true,
    remoteBranches: true,
    tags: true,
    stashes: false,
    remotes: false,
  });

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  if (isLeftSidebarCollapsed) return null;

  const changesCount = (status?.staged.length || 0) + (status?.unstaged.length || 0) + (status?.untracked.length || 0);

  const localBranches = branches.filter((b) => !b.isRemote);
  const remoteBranches = branches.filter((b) => b.isRemote);

  return (
    <aside className="w-56 border-r border-border bg-sidebar flex flex-col select-none shrink-0 h-full overflow-hidden text-xs">
      {/* Top Primary Navigation (Changes & History) */}
      <div className="p-2 space-y-1 border-b border-border/60">
        <button
          onClick={() => setActiveTab('changes')}
          className={cn(
            "w-full flex items-center justify-between px-2.5 py-1.5 rounded-md font-medium transition-all group",
            activeTab === 'changes'
              ? "bg-accent text-accent-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
          )}
        >
          <div className="flex items-center gap-2">
            <FileCode2 className={cn("h-3.5 w-3.5", activeTab === 'changes' ? "text-primary" : "text-muted-foreground")} />
            <span>工作区变更</span>
          </div>
          {changesCount > 0 ? (
            <Badge variant="warning" className="h-4 px-1 text-[10px]">
              {changesCount}
            </Badge>
          ) : (
            <span className="text-[10px] text-muted-foreground opacity-60">干净</span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('history')}
          className={cn(
            "w-full flex items-center justify-between px-2.5 py-1.5 rounded-md font-medium transition-all group",
            activeTab === 'history'
              ? "bg-accent text-accent-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
          )}
        >
          <div className="flex items-center gap-2">
            <Clock className={cn("h-3.5 w-3.5", activeTab === 'history' ? "text-primary" : "text-muted-foreground")} />
            <span>提交历史 & Graph</span>
          </div>
        </button>
      </div>

      {/* Scrollable Tree Navigator (Branches, Tags, Stashes, Remotes) */}
      <ScrollArea className="flex-1 px-1.5 py-2">
        <div className="space-y-3">
          {/* Local Branches Section */}
          <div>
            <div
              onClick={() => toggleSection('localBranches')}
              className="flex items-center justify-between px-2 py-1 text-[10px] font-semibold text-muted-foreground tracking-wider uppercase cursor-pointer hover:text-foreground group"
            >
              <div className="flex items-center gap-1">
                {expandedSections.localBranches ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
                <span>本地分支 ({localBranches.length})</span>
              </div>
              <Button
                variant="ghost"
                size="xs"
                className="h-4 w-4 p-0 opacity-0 group-hover:opacity-100 hover:text-primary"
                onClick={(e) => {
                  e.stopPropagation();
                }}
              >
                <Plus className="h-3 w-3" />
              </Button>
            </div>

            {expandedSections.localBranches && (
              <div className="mt-0.5 space-y-0.5 pl-1">
                {localBranches.length > 0 ? (
                  localBranches.map((branch) => (
                    <div
                      key={branch.name}
                      className={cn(
                        "group flex items-center justify-between px-2 py-1 rounded-md text-xs transition-colors cursor-pointer",
                        branch.isCurrent
                          ? "bg-indigo-500/15 text-indigo-400 font-medium"
                          : "text-muted-foreground hover:text-foreground hover:bg-accent/40"
                      )}
                    >
                      <div className="flex items-center gap-1.5 truncate">
                        <GitBranchIcon className={cn("h-3 w-3 shrink-0", branch.isCurrent ? "text-indigo-400" : "text-muted-foreground")} />
                        <span className="truncate">{branch.name}</span>
                      </div>
                      {branch.isCurrent && (
                        <span className="text-[9px] uppercase px-1 py-0.2 rounded bg-indigo-500/20 text-indigo-300 font-semibold">
                          HEAD
                        </span>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="px-2 py-1 text-[11px] text-muted-foreground/60 italic">暂无本地分支</div>
                )}
              </div>
            )}
          </div>

          {/* Remote Branches Section */}
          <div>
            <div
              onClick={() => toggleSection('remoteBranches')}
              className="flex items-center justify-between px-2 py-1 text-[10px] font-semibold text-muted-foreground tracking-wider uppercase cursor-pointer hover:text-foreground group"
            >
              <div className="flex items-center gap-1">
                {expandedSections.remoteBranches ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
                <span>远程分支 ({remoteBranches.length})</span>
              </div>
            </div>

            {expandedSections.remoteBranches && (
              <div className="mt-0.5 space-y-0.5 pl-1">
                {remoteBranches.length > 0 ? (
                  remoteBranches.map((branch) => (
                    <div
                      key={branch.name}
                      className="flex items-center justify-between px-2 py-1 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-accent/40 cursor-pointer transition-colors"
                    >
                      <div className="flex items-center gap-1.5 truncate">
                        <Cloud className="h-3 w-3 text-muted-foreground/80 shrink-0" />
                        <span className="truncate">{branch.name}</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="px-2 py-1 text-[11px] text-muted-foreground/60 italic">暂无远程跟踪分支</div>
                )}
              </div>
            )}
          </div>

          {/* Tags Section (Core highlight) */}
          <div>
            <div
              onClick={() => toggleSection('tags')}
              className="flex items-center justify-between px-2 py-1 text-[10px] font-semibold text-muted-foreground tracking-wider uppercase cursor-pointer hover:text-foreground group"
            >
              <div className="flex items-center gap-1">
                {expandedSections.tags ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
                <span>标签 Tags ({tags.length})</span>
              </div>
              <Button
                variant="ghost"
                size="xs"
                className="h-4 w-4 p-0 opacity-0 group-hover:opacity-100 hover:text-primary"
                onClick={(e) => {
                  e.stopPropagation();
                }}
              >
                <Plus className="h-3 w-3" />
              </Button>
            </div>

            {expandedSections.tags && (
              <div className="mt-0.5 space-y-0.5 pl-1">
                {tags.length > 0 ? (
                  tags.map((tag) => (
                    <div
                      key={tag.name}
                      className="flex items-center justify-between px-2 py-1 rounded-md text-xs text-muted-foreground hover:text-amber-400 hover:bg-accent/40 cursor-pointer transition-colors group"
                    >
                      <div className="flex items-center gap-1.5 truncate">
                        <TagIcon className="h-3 w-3 text-amber-500/70 shrink-0" />
                        <span className="truncate font-mono text-[11px]">{tag.name}</span>
                      </div>
                      <span className="text-[9px] font-mono text-muted-foreground/60 group-hover:text-muted-foreground">
                        {tag.commitHash.slice(0, 7)}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="px-2 py-1 text-[11px] text-muted-foreground/60 italic">暂无 Tags</div>
                )}
              </div>
            )}
          </div>

          {/* Stashes Section */}
          <div>
            <div
              onClick={() => toggleSection('stashes')}
              className="flex items-center justify-between px-2 py-1 text-[10px] font-semibold text-muted-foreground tracking-wider uppercase cursor-pointer hover:text-foreground"
            >
              <div className="flex items-center gap-1">
                {expandedSections.stashes ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
                <span>贮藏区 Stashes</span>
              </div>
            </div>

            {expandedSections.stashes && (
              <div className="mt-0.5 space-y-0.5 pl-1">
                <div className="px-2 py-1 text-[11px] text-muted-foreground/60 italic">暂无贮藏内容</div>
              </div>
            )}
          </div>
        </div>
      </ScrollArea>

      {/* Bottom Repository Path Footnote */}
      {currentRepo && (
        <div className="p-2 border-t border-border/60 bg-accent/20">
          <div className="text-[10px] text-muted-foreground truncate font-mono" title={currentRepo.path}>
            {currentRepo.path}
          </div>
        </div>
      )}
    </aside>
  );
};
