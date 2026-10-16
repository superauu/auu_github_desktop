import { ResizeHandle } from '@/components/ui/ResizeHandle';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { confirmAction } from '@/stores/confirmStore';
import { Button } from '@/components/ui/button';
import React, { useState, useEffect, useRef } from 'react';
import {
  GitCommit as GitCommitIcon,
  Tag as TagIcon,
  Search,
  Check,
  Cloud,
  FileCode2,
  Laptop,
  Copy,
  Cherry,
  Undo2,
  ArrowUpFromLine,
  ArrowDownToLine,
} from 'lucide-react';
import { useI18n } from '@/i18n';
import { useRepoStore } from '@/stores/repoStore';
import { GitGraphRenderer } from '@/features/graph/GitGraphRenderer';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/EmptyState';
import { ContextMenu, ContextMenuItem } from '@/components/ui/ContextMenu';
import { toast } from '@/stores/toastStore';
import { cn } from '@/utils/cn';
import { GitCommit } from '@/services/git/types';

export const CommitHistoryView: React.FC = () => {
  const { t } = useI18n();
  const {
    commits,
    selectedCommit,
    setSelectedCommit,
    setActiveTab,
    status,
    branches,
    selectedBranch,
    scrollToCommitHash,
    isLoading,
    commitsLoadedAll,
    loadMoreCommits,
    revertCommit,
    cherryPickCommit,
    softResetCommit,
    hardResetCommit,
  } = useRepoStore();

  const [metadataWidth, setMetadataWidth] = useState(176);
  const [graphWidth, setGraphWidth] = useState(64);
  const focusAfterRender = useRef<string | null>(null);
  const [columns, setColumns] = useState({ author: true, date: true, hash: false });
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedHash, setCopiedHash] = useState<string | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{ open: boolean; x: number; y: number; commit: GitCommit | null }>({
    open: false,
    x: 0,
    y: 0,
    commit: null,
  });

  const totalChanges =
    (status?.staged.length || 0) +
    (status?.unstaged.length || 0) +
    (status?.untracked.length || 0);

  const hasWip = totalChanges > 0;
  const viewportRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ top: 0, height: 800 });
  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    const update = () => setViewport({ top: element.scrollTop, height: element.clientHeight });
    const observer = new ResizeObserver(update); observer.observe(element); update();
    return () => observer.disconnect();
  }, []);

  // Auto-scroll to selected commit or target branch commit
  useEffect(() => {
    const hashToScroll = scrollToCommitHash || selectedCommit?.hash;
    if (!hashToScroll) return;

    const timer = setTimeout(() => {
      const index = filteredCommits.findIndex((commit) => commit.hash === hashToScroll);
      if (index >= 0 && viewportRef.current) {
        const top = (index + (hasWip ? 1 : 0)) * 42;
        if (scrollToCommitHash || top < viewportRef.current.scrollTop || top + 42 > viewportRef.current.scrollTop + viewportRef.current.clientHeight) viewportRef.current.scrollTo({ top: Math.max(0, top - viewportRef.current.clientHeight / 2), behavior: 'auto' });
      }
      const el = document.getElementById(`commit-row-${hashToScroll}`);
      if (scrollToCommitHash && el) el.scrollIntoView({ behavior: 'auto', block: 'nearest' });
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

  useEffect(() => { if (viewportRef.current) viewportRef.current.scrollTop = 0; setViewport(previous => ({ ...previous, top: 0 })); }, [searchQuery]);
  const firstVisible = Math.min(filteredCommits.length, Math.max(0, Math.floor(viewport.top / 42) - (hasWip ? 1 : 0) - 8));
  const lastVisible = Math.min(filteredCommits.length, Math.ceil((viewport.top + viewport.height) / 42) + 8);
  const activeCommit = filteredCommits.find(commit => commit.hash === selectedCommit?.hash) || filteredCommits[0];
  const selectedIndex = hasWip
    ? filteredCommits.findIndex((c) => c.hash === activeCommit?.hash) + 1
    : filteredCommits.findIndex((c) => c.hash === activeCommit?.hash);

  useEffect(() => {
    if (!focusAfterRender.current) return;
    const element = document.getElementById(`commit-row-${focusAfterRender.current}`);
    if (element) { element.focus({ preventScroll: true }); focusAfterRender.current = null; }
  }, [selectedCommit?.hash, firstVisible, lastVisible]);
  const handleHistoryKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (!target.hasAttribute('data-commit-row') || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    const index = filteredCommits.findIndex(commit => commit.hash === target.dataset.commitRow);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? filteredCommits.length - 1 : Math.max(0, Math.min(filteredCommits.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)));
    const commit = filteredCommits[next];
    if (!commit) return;
    event.preventDefault(); focusAfterRender.current = commit.hash; setSelectedCommit(commit);
    const rowTop = (next + (hasWip ? 1 : 0)) * 42;
    const element = viewportRef.current;
    if (element && (rowTop < element.scrollTop || rowTop + 42 > element.scrollTop + element.clientHeight)) element.scrollTop = Math.max(0, rowTop - element.clientHeight / 2);
    document.getElementById(`commit-row-${commit.hash}`)?.focus({ preventScroll: true });
  };

  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleCopyHash = (hash: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(hash);
    setCopiedHash(hash);
    toast.success(t('history.copyHash'), hash);
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    copyTimerRef.current = setTimeout(() => setCopiedHash(null), 2000);
  };

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  // 右键菜单动作：统一 toast 反馈，冲突场景由顶部 ConflictBanner 接管
  const runCommitAction = async (action: () => Promise<void>, success: string, failed: string) => {
    try {
      await action();
      toast.success(success);
    } catch (err: any) {
      toast.error(failed, err?.message);
    }
  };

  const ctxMenuItems: ContextMenuItem[] = ctxMenu.commit
    ? [
        {
          id: 'copy-hash',
          label: t('history.ctx.copyHash'),
          icon: <Copy className="h-3.5 w-3.5" />,
          onClick: () => {
            navigator.clipboard.writeText(ctxMenu.commit!.hash);
            toast.success(t('history.copyHash'), ctxMenu.commit!.shortHash);
          },
        },
        { id: 'sep-1', separator: true },
        {
          id: 'cherry-pick',
          label: t('history.ctx.cherryPick'),
          icon: <Cherry className="h-3.5 w-3.5" />,
          onClick: () =>
            runCommitAction(
              () => cherryPickCommit(ctxMenu.commit!.hash),
              t('history.cherryPicked').replace('{h}', ctxMenu.commit!.shortHash),
              t('history.cherryPickFailed')
            ),
        },
        {
          id: 'revert',
          label: t('history.ctx.revert'),
          icon: <Undo2 className="h-3.5 w-3.5" />,
          onClick: () =>
            runCommitAction(
              () => revertCommit(ctxMenu.commit!.hash),
              t('history.reverted').replace('{h}', ctxMenu.commit!.shortHash),
              t('history.revertFailed')
            ),
        },
        { id: 'sep-2', separator: true },
        {
          id: 'reset-soft',
          label: t('history.ctx.resetSoft'),
          icon: <ArrowUpFromLine className="h-3.5 w-3.5" />,
          onClick: async () => {
            if (!await confirmAction({ title: t('history.ctx.resetSoft'), description: t('history.resetSoftConfirm').replace('{h}', ctxMenu.commit!.shortHash), detail: ctxMenu.commit!.subject })) return;
            runCommitAction(
              () => softResetCommit(ctxMenu.commit!.hash),
              t('history.resetDone').replace('{h}', ctxMenu.commit!.shortHash),
              t('history.resetFailed')
            );
          },
        },
        {
          id: 'reset-hard',
          label: t('history.ctx.resetHard'),
          icon: <ArrowDownToLine className="h-3.5 w-3.5" />,
          danger: true,
          onClick: async () => {
            if (!await confirmAction({ title: t('history.ctx.resetHard'), description: t('history.resetHardConfirm').replace('{h}', ctxMenu.commit!.shortHash) + '\n' + t('composer.hardResetWarning'), detail: ctxMenu.commit!.subject })) return;
            runCommitAction(
              () => hardResetCommit(ctxMenu.commit!.hash),
              t('history.resetDone').replace('{h}', ctxMenu.commit!.shortHash),
              t('history.resetFailed')
            );
          },
        },
      ]
    : [];

  return (
    <div className="history-view flex-1 h-full flex flex-col overflow-hidden select-none bg-background">
      {/* Top Search & Filter Bar */}
      <div className="h-9 px-3 border-b border-border flex items-center justify-between text-xs bg-card/40 shrink-0">
        <div className="flex items-center gap-2">
          <GitCommitIcon className="h-3.5 w-3.5 text-primary" />
          <span className="font-semibold text-foreground">{t('history.title')}</span>
          <Badge variant="outline" className="h-4 text-[12px] font-mono">
            {filteredCommits.length} {t('history.commitCount')}
          </Badge>
          {hasWip && (
            <Badge variant="warning" className="h-4 px-1.5 text-[12px] font-mono gap-1 ">
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
              className="h-7 pl-7 text-[12px] bg-secondary/30"
            />
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end px-3 py-1 border-b border-border">
        <DropdownMenu.Root><DropdownMenu.Trigger asChild><Button variant="ghost" size="xs">{t('composer.columns')}</Button></DropdownMenu.Trigger>
          <DropdownMenu.Portal><DropdownMenu.Content align="end" className="z-50 min-w-40 bg-popover border border-border rounded-lg shadow-xl p-1">
            {(['author', 'date', 'hash'] as const).map(key => <DropdownMenu.CheckboxItem key={key} className="menu-item" checked={columns[key]} onCheckedChange={checked => setColumns(previous => ({ ...previous, [key]: checked === true }))}><span className="w-4">{columns[key] ? '✓' : ''}</span>{t(`composer.column.${key}`)}</DropdownMenu.CheckboxItem>)}
          </DropdownMenu.Content></DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
      {/* GitKraken-style Column Headers: BRANCH / TAG | GRAPH | COMMIT MESSAGE */}
      <div className="h-7 px-3 border-b border-border/80 bg-muted/20 flex items-center text-[12px] font-semibold text-muted-foreground uppercase tracking-wider shrink-0">
        <div style={{ width: graphWidth }} className="text-center shrink-0">{t('history.col.graph')}</div>
        <div className="flex-1 min-w-0 pl-3">{t('history.col.message')}</div>
        {Object.values(columns).some(Boolean) && <div style={{ width: metadataWidth }} className="history-meta text-right pr-2 shrink-0 items-center"><ResizeHandle currentSize={metadataWidth} onSizeChange={setMetadataWidth} minSize={120} maxSize={320} defaultSize={176} reverse title={t('composer.resizeMetadata')} className="h-7 mr-2" /><span className="flex-1">{t('history.col.authorDate')}</span></div>}
      </div>

      {/* Commit List Table with SVG Graph */}
      <div ref={viewportRef} role="list" aria-label={t('history.title')} onKeyDown={handleHistoryKey} className="flex-1 min-h-0 overflow-auto" onScroll={(event) => setViewport({ top: event.currentTarget.scrollTop, height: event.currentTarget.clientHeight })}>
        {isLoading && commits.length === 0 ? (
          <div className="py-6 px-3 space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="h-[30px] rounded-md skeleton"
                style={{ opacity: 1 - i * 0.1 }}
              />
            ))}
          </div>
        ) : filteredCommits.length === 0 && !hasWip ? (
          <EmptyState variant="search" title={t('history.noMatch')} />
        ) : (
          <div className="flex relative">
            {/* SVG Graph Column (Spanning entire rows, perfectly aligned to w-16 column at left: 12px(px-3) + 192px(w-48) = 204px) */}
            <div className="pt-0 shrink-0 z-10 absolute left-[14px] top-0 pointer-events-none" style={{ width: graphWidth }}>
              <GitGraphRenderer
                commits={filteredCommits}
                onWidthChange={setGraphWidth}
                selectedIndex={selectedIndex}
                rowHeight={42}
                hasWipNode={hasWip}
                visibleStart={firstVisible}
                visibleEnd={lastVisible}
              />
            </div>

            {/* Rows list */}
            <div className="flex-1 min-w-0">
              {/* GitKraken-style Row 0: // WIP (Work in Progress) */}
              {hasWip && (
                <div
                  role="listitem" tabIndex={0}
                  onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setActiveTab('changes'); } }}
                  onClick={() => {
                    setActiveTab('changes');
                    toast.info(t('history.wipToast'));
                  }}
                  className="h-[42px] px-3 flex items-center justify-between gap-3 text-xs cursor-pointer transition-colors bg-sky-500/10 hover:bg-sky-500/15 border-l-2 border-sky-600 dark:border-sky-400 group"
                  title={t('history.wipTitle')}
                >
                  {/* Spacer for Graph column */}
                  <div style={{ width: graphWidth }} className="shrink-0" />

                  {/* Commit message / WIP subject */}
                  <div className="flex items-center gap-2 min-w-0 flex-1 pl-3">
                    <span className="font-mono text-xs font-bold text-sky-600 dark:text-sky-400 flex items-center gap-1.5">
                      <FileCode2 className="h-3.5 w-3.5" />
                      <span>// WIP</span>
                    </span>
                    <Badge variant="success" className="h-4 px-1.5 text-[12px] font-mono font-bold">
                      +{totalChanges}
                    </Badge>
                    <span className="text-[12px] text-muted-foreground truncate hidden sm:inline">
                      {t('history.wipLabel')}
                    </span>
                  </div>

                  {/* Right Column: Prompt */}
                  <div className="history-meta w-44 text-right pr-2 text-[12px] text-primary shrink-0">
                    {t('history.viewChanges')}
                  </div>
                </div>
              )}

              {/* Commit Details Rows */}
              <div aria-hidden style={{ height: firstVisible * 42 }} />
              {filteredCommits.slice(firstVisible, lastVisible).map((commit) => {
                const isSelected = activeCommit?.hash === commit.hash;
                const isCopied = copiedHash === commit.hash;

                return (
                  <div
                    key={commit.hash}
                    id={`commit-row-${commit.hash}`}
                    role="listitem" data-commit-row={commit.hash} tabIndex={isSelected ? 0 : -1} aria-current={isSelected ? 'true' : undefined}
                    aria-label={`${commit.subject} · ${commit.author.name} · ${commit.shortHash}`}
                    title={commit.subject}
                    onFocus={event => { if (event.target === event.currentTarget) setSelectedCommit(commit); }}
                    onKeyDown={event => {
                      if (event.target !== event.currentTarget) return;
                      if (event.key === 'Enter') { event.preventDefault(); setSelectedCommit(commit); }
                      if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
                        event.preventDefault(); const box = event.currentTarget.getBoundingClientRect(); setCtxMenu({ open: true, x: box.left + 60, y: box.bottom, commit });
                      }
                    }}
                    onClick={() => setSelectedCommit(commit)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setSelectedCommit(commit);
                      setCtxMenu({ open: true, x: e.clientX, y: e.clientY, commit });
                    }}
                    className={cn(
                      "h-[42px] px-3 flex items-center justify-between gap-3 text-xs cursor-pointer transition-all group",
                      isSelected
                        ? "bg-sky-500/15 dark:bg-sky-500/20 border-l-2 border-sky-600 dark:border-sky-400  text-foreground font-medium"
                        : "hover:bg-accent/50 dark:hover:bg-white/[0.03] border-l-2 border-transparent text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {/* Spacer for Graph column */}
                    <div style={{ width: graphWidth }} className="shrink-0" />

                    {/* Subject */}
                    <div className="flex items-center gap-2 min-w-0 flex-1 pl-3">
                    {/* Left Column: BRANCH / TAG Badges */}
                    <div className="flex items-center gap-1 min-w-0 max-w-[180px] shrink overflow-hidden">
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
                                    "h-5 px-1.5 text-[12px] gap-1 font-mono shrink min-w-0 max-w-[120px] truncate rounded shadow-xs border transition-all",
                                    isTag && "bg-amber-500/15 text-amber-600 dark:text-amber-300 border-amber-500/40",
                                    isHead && "bg-primary/10 text-primary border-primary/30",
                                    isRemote && "bg-secondary text-secondary-foreground border-border",
                                    !isTag && !isHead && !isRemote && (isSelectedBranch
                                      ? "bg-accent text-accent-foreground border-primary/40 font-semibold"
                                      : "bg-secondary text-secondary-foreground border-border"
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
                              <Badge variant="outline" className="h-4 px-1 text-[12px] font-mono shrink-0">
                                +{rawRefs.length - 2}
                              </Badge>
                            )}
                          </>
                        );
                      })()}
                    </div>


                      <span className="text-[13px] text-foreground transition-colors truncate">
                        {commit.subject}
                      </span>
                    </div>

                    {/* Author & Date & Hash */}
                    {Object.values(columns).some(Boolean) && <div style={{ width: metadataWidth }} className="history-meta items-center justify-end gap-2 text-[12px] text-muted-foreground shrink-0 pr-2">
                      {columns.author && <span className="truncate max-w-[80px]" title={commit.author.name}>{commit.author.name}</span>}
                      {columns.date && <span className="whitespace-nowrap">{commit.author.relativeDate}</span>}
                      {columns.hash && <button
                        onClick={(e) => handleCopyHash(commit.hash, e)}
                        className="font-mono text-[12px] px-1 py-0.5 rounded bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                        title={t('history.copyHashTitle')}
                      >
                        {isCopied ? <Check className="h-2.5 w-2.5 text-git-added" /> : commit.shortHash}
                      </button>}
                    </div>}
                  </div>
                );
              })}

              <div aria-hidden style={{ height: (filteredCommits.length - lastVisible) * 42 }} />
              {/* Progressive history loading footer */}
              {filteredCommits.length > 0 && (
                <div className="py-3 flex justify-center">
                  {!commitsLoadedAll ? (
                    <button
                      onClick={() => loadMoreCommits().catch(() => {})}
                      className="px-3 py-1 rounded-md text-[12px] font-medium text-muted-foreground hover:text-foreground hover:bg-accent/50 border border-border/60 transition-colors"
                    >
                      {t('history.loadMore')}
                    </button>
                  ) : (
                    <span className="text-[12px] text-muted-foreground/60">
                      {t('history.allLoaded')}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Commit Context Menu (right click on any commit row) */}
      <ContextMenu
        open={ctxMenu.open}
        x={ctxMenu.x}
        y={ctxMenu.y}
        items={ctxMenuItems}
        onClose={() => setCtxMenu((s) => ({ ...s, open: false }))}
      />
    </div>
  );
};
