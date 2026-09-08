import React, { useState, useEffect } from 'react';
import {
  GitCommit as GitCommitIcon,
  Tag as TagIcon,
  Inbox,
  Search,
  Check,
  Monitor,
  Cloud,
  FileCode2,
  Laptop,
} from 'lucide-react';
import { useI18n } from '@/i18n';
import { useRepoStore } from '@/stores/repoStore';
import { GitGraphRenderer } from '@/features/graph/GitGraphRenderer';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from '@/stores/toastStore';
import { cn } from '@/utils/cn';

export const CommitHistoryView: React.FC = () => {
  const { t } = useI18n();
  const {
    commits,
    selectedCommit,
    setSelectedCommit,
    setActiveTab,
    status,
    currentRepo,
    branches,
    selectedBranch,
    scrollToCommitHash,
  } = useRepoStore();

  const currentBranchName =
    branches.find((b) => b.isCurrent)?.name ||
    status?.currentBranch ||
    currentRepo?.currentBranch ||
    'HEAD';

  const [searchQuery, setSearchQuery] = useState('');
  const [copiedHash, setCopiedHash] = useState<string | null>(null);

  const totalChanges =
    (status?.staged.length || 0) +
    (status?.unstaged.length || 0) +
    (status?.untracked.length || 0);

  const hasWip = totalChanges > 0;

  // Auto-scroll to selected commit or target branch commit
  useEffect(() => {
    const hashToScroll = scrollToCommitHash || selectedCommit?.hash;
    if (!hashToScroll) return;

    const timer = setTimeout(() => {
      const el = document.getElementById(`commit-row-${hashToScroll}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 60);

    return () => clearTimeout(timer);
  }, [scrollToCommitHash, selectedCommit?.hash]);

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
    toast.success(t('history.copyHash'), hash);
    setTimeout(() => setCopiedHash(null), 2000);
  };

  return (
    <div className="flex-1 h-full flex flex-col overflow-hidden select-none bg-background">
      {/* Top Search & Filter Bar */}
      <div className="h-9 px-3 border-b border-border flex items-center justify-between text-xs bg-card/40 shrink-0">
        <div className="flex items-center gap-2">
          <GitCommitIcon className="h-3.5 w-3.5 text-primary" />
          <span className="font-semibold text-foreground">{t('history.title')}</span>
          <Badge variant="outline" className="h-4 text-[10px] font-mono">
            {filteredCommits.length} commits
          </Badge>
          {hasWip && (
            <Badge variant="warning" className="h-4 px-1.5 text-[10px] font-mono gap-1 animate-pulse">
              <span>{totalChanges} {t('history.uncommitted')}</span>
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
              placeholder={t('history.searchPlaceholder')}
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
            <div className="text-xs">{t('history.noMatch')}</div>
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
                    toast.info(t('history.wipToast'));
                  }}
                  className="h-[42px] px-3 flex items-center justify-between gap-3 text-xs cursor-pointer transition-colors bg-sky-500/10 hover:bg-sky-500/15 border-l-2 border-sky-600 dark:border-sky-400 group"
                  title={t('history.wipTitle')}
                >
                  {/* Left Column: Branch Indicator */}
                  <div className="w-48 flex items-center gap-1.5 shrink-0 overflow-hidden pr-3">
                    <Badge variant="outline" className="h-4 px-1.5 text-[9px] font-mono gap-1 bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30 max-w-[120px] truncate">
                      <Monitor className="h-2.5 w-2.5 shrink-0" />
                      <span className="truncate">{currentBranchName}</span>
                    </Badge>
                  </div>

                  {/* Spacer for Graph column */}
                  <div className="w-16 shrink-0" />

                  {/* Commit message / WIP subject */}
                  <div className="flex items-center gap-2 min-w-0 flex-1 pl-3">
                    <span className="font-mono text-xs font-bold text-sky-600 dark:text-sky-400 flex items-center gap-1.5">
                      <FileCode2 className="h-3.5 w-3.5" />
                      <span>// WIP</span>
                    </span>
                    <Badge variant="success" className="h-4 px-1.5 text-[9px] font-mono font-bold">
                      +{totalChanges}
                    </Badge>
                    <span className="text-[11px] text-muted-foreground truncate hidden sm:inline">
                      {t('history.wipLabel')}
                    </span>
                  </div>

                  {/* Right Column: Prompt */}
                  <div className="w-44 text-right pr-2 text-[10px] text-sky-600 dark:text-sky-400 font-mono shrink-0 hidden md:block">
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
                    id={`commit-row-${commit.hash}`}
                    onClick={() => setSelectedCommit(commit)}
                    className={cn(
                      "h-[42px] px-3 flex items-center justify-between gap-3 text-xs cursor-pointer transition-all group",
                      isSelected
                        ? "bg-sky-500/15 dark:bg-sky-500/20 border-l-2 border-sky-600 dark:border-sky-400 shadow-[inset_0_0_16px_rgba(56,189,248,0.12)] text-foreground font-medium"
                        : "hover:bg-accent/50 dark:hover:bg-white/[0.03] border-l-2 border-transparent text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {/* Left Column: BRANCH / TAG Badges */}
                    <div className="w-48 flex items-center gap-1 shrink-0 overflow-hidden pr-3">
                      {(() => {
                        const rawRefs = commit.refs ? [...commit.refs] : [];
                        if (
                          selectedBranch &&
                          !rawRefs.some((r) => r.includes(selectedBranch))
                        ) {
                          const branchObj = branches.find((b) => b.name === selectedBranch);
                          if (branchObj?.lastCommit?.hash === commit.hash) {
                            rawRefs.unshift(selectedBranch);
                          }
                        }

                        if (rawRefs.length === 0) return null;

                        return (
                          <>
                            {rawRefs.slice(0, 2).map((ref) => {
                              const isHead = ref.includes('HEAD');
                              const isTag = ref.startsWith('tag:');
                              const isRemote = ref.includes('origin/') || ref.startsWith('remotes/');
                              const cleanName = ref.replace('tag: ', '').replace('HEAD -> ', '').replace(/^remotes\//, '');
                              const isSelectedBranch = selectedBranch && (cleanName === selectedBranch || cleanName.endsWith('/' + selectedBranch));

                              return (
                                <Badge
                                  key={ref}
                                  title={ref}
                                  className={cn(
                                    "h-5 px-1.5 text-[9px] gap-1 font-mono shrink min-w-0 max-w-[120px] truncate rounded shadow-xs border transition-all",
                                    isTag && "bg-amber-500/15 text-amber-600 dark:text-amber-300 border-amber-500/40",
                                    isHead && "bg-sky-500/15 text-sky-800 dark:text-sky-200 border-sky-500/40 shadow-[0_0_8px_rgba(56,189,248,0.25)]",
                                    isRemote && "bg-secondary text-secondary-foreground border-border",
                                    !isTag && !isHead && !isRemote && (isSelectedBranch
                                      ? "bg-sky-950/80 dark:bg-sky-950/90 text-sky-200 border-sky-500/80 font-semibold ring-1 ring-sky-500/40 shadow-xs"
                                      : "bg-slate-800/80 dark:bg-[#1f1f23] text-slate-200 border-border"
                                    )
                                  )}
                                >
                                  {isTag ? (
                                    <>
                                      <TagIcon className="h-2.5 w-2.5 text-amber-500 dark:text-amber-400 shrink-0" />
                                      <span className="truncate">{cleanName}</span>
                                    </>
                                  ) : isRemote ? (
                                    <>
                                      <Cloud className="h-2.5 w-2.5 text-slate-400 shrink-0" />
                                      <span className="truncate">{cleanName}</span>
                                    </>
                                  ) : (
                                    <>
                                      <span className="truncate">{cleanName}</span>
                                      <Laptop className="h-2.5 w-2.5 text-slate-300 shrink-0 opacity-80" />
                                    </>
                                  )}
                                </Badge>
                              );
                            })}
                            {rawRefs.length > 2 && (
                              <Badge variant="outline" className="h-4 px-1 text-[9px] font-mono shrink-0">
                                +{rawRefs.length - 2}
                              </Badge>
                            )}
                          </>
                        );
                      })()}
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
                        title={t('history.copyHashTitle')}
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
