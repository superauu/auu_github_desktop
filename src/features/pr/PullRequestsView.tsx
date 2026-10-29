import { useShallow } from 'zustand/react/shallow';
import { confirmAction } from '@/stores/confirmStore';
import React, { useState, useMemo, useEffect } from 'react';
import {
  GitPullRequest,
  Search,
  CheckCircle2,
  GitBranch,
  User,
  ExternalLink,
  DownloadCloud,
  ShieldCheck,
  RotateCw,
  Clock,
  AlertCircle,
  MessageSquare,
  Plus,
  GitMerge,
  XCircle,
} from 'lucide-react';
import { useGitHubStore } from '@/stores/githubStore';
import { useI18n } from '@/i18n';
import { useRepoStore } from '@/stores/repoStore';
import { githubService } from '@/services/github/GitHubService';
import type { GitHubPullRequest } from '@/services/github/types';
import { CreatePullRequestModal } from './CreatePullRequestModal';
import { PullRequestDetailModal } from './PullRequestDetailModal';
import { useLayoutStore, DEFAULT_LAYOUT } from '@/stores/layoutStore';
import { ResizeHandle } from '@/components/ui/ResizeHandle';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { EmptyState } from '@/components/ui/EmptyState';
import { toast } from '@/stores/toastStore';
import { cn } from '@/utils/cn';
import { keyboardRowProps } from '@/utils/keyboardNavigation';
import { ErrorNotice } from '@/components/ui/ErrorNotice';

export const PullRequestsView: React.FC = () => {
  const { prListWidth, setPrListWidth } = useLayoutStore(useShallow(state => ({ prListWidth: state.prListWidth, setPrListWidth: state.setPrListWidth })));
  const {
    pullRequests,
    selectedPR,
    selectPR,
    prFilterState,
    setPRFilterState,
    loadPullRequests,
    currentOwner,
    currentRepoName,
    isLoadingPullRequests,
    pullRequestsError,
  } = useGitHubStore(useShallow(state => ({ pullRequests: state.pullRequests, selectedPR: state.selectedPR, selectPR: state.selectPR, prFilterState: state.prFilterState, setPRFilterState: state.setPRFilterState, loadPullRequests: state.loadPullRequests, currentOwner: state.currentOwner, currentRepoName: state.currentRepoName, isLoadingPullRequests: state.isLoadingPullRequests, pullRequestsError: state.pullRequestsError })));

  const { fetchAndCheckoutPR } = useRepoStore(useShallow(state => ({ fetchAndCheckoutPR: state.fetchAndCheckoutPR })));
  const { t } = useI18n();

  const [searchQuery, setSearchQuery] = useState('');
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [realReviewStatus, setRealReviewStatus] = useState<string>('PENDING');
  const [realChecks, setRealChecks] = useState<{ total: number; success: number; failure: number } | null>(null);
  const [createPROpen, setCreatePROpen] = useState(false);
  const [mergeMethod, setMergeMethod] = useState<'merge' | 'squash' | 'rebase'>('merge');
  const [isMerging, setIsMerging] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [reviewPR, setReviewPR] = useState<GitHubPullRequest | null>(null);

  const filteredPRs = useMemo(() => {
    return pullRequests.filter((pr) => {
      // Status filter
      if (prFilterState === 'open' && pr.state !== 'open') return false;
      if (prFilterState === 'closed' && pr.state !== 'closed') return false;

      // Text query
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        pr.title.toLowerCase().includes(q) ||
        pr.user.login.toLowerCase().includes(q) ||
        String(pr.number).includes(q) ||
        pr.head.ref.toLowerCase().includes(q)
      );
    });
  }, [pullRequests, prFilterState, searchQuery]);

  const activePR = filteredPRs.find(pr => pr.id === selectedPR?.id) || filteredPRs[0] || null;

  useEffect(() => {
    let cancelled = false;
    setRealReviewStatus('PENDING'); setRealChecks(null);
    if (activePR && currentOwner && currentRepoName) {
      void githubService.getPullRequestReviews(currentOwner, currentRepoName, activePR.number).then((reviews) => {
        if (cancelled) return;
        const latest = new Map<string, string>();
        for (const review of [...reviews].sort((a, b) => a.id - b.id)) {
          if (review.state !== 'COMMENTED' && review.state !== 'PENDING') latest.set(review.user.login, review.state);
        }
        const states = [...latest.values()];
        setRealReviewStatus(states.includes('CHANGES_REQUESTED') ? 'CHANGES_REQUESTED' : states.includes('APPROVED') ? 'APPROVED' : 'PENDING');
      }).catch(() => { if (!cancelled) setRealReviewStatus('PENDING'); });
      void githubService.getCommitChecks(currentOwner, currentRepoName, activePR.head.sha).then((checks) => {
        if (cancelled) return;
        setRealChecks({ total: checks.length, success: checks.filter((check) => check.conclusion === 'success').length,
          failure: checks.filter((check) => check.status === 'completed' && check.conclusion !== 'success' && check.conclusion !== 'neutral').length });
      }).catch(() => { if (!cancelled) setRealChecks(null); });
    }
    return () => { cancelled = true; };
  }, [activePR?.number, activePR?.head.sha, currentOwner, currentRepoName]);

  const handleCheckoutPR = async () => {
    if (!activePR) return;
    setIsCheckingOut(true);
    toast.info(t('pr.fetching').replace('{n}', String(activePR.number)));
    try {
      const localBranch = await fetchAndCheckoutPR(activePR.number);
      toast.success(
        t('pr.fetched').replace('{n}', String(activePR.number)) + ',',
        `${t('pr.switchedTo')}: ${localBranch}`
      );
    } catch (err: any) {
      toast.error(t('pr.checkoutFailed'), err.message);
    } finally {
      setIsCheckingOut(false);
    }
  };

  const handleMergePR = async () => {
    if (!activePR || !currentOwner || !currentRepoName) return;
    if (!await confirmAction({ title: t('composer.mergePr'), description: t('pr.mergeConfirm').replace('{n}', String(activePR.number)).replace('{base}', activePR.base.ref), detail: activePR.title })) {
      return;
    }
    setIsMerging(true);
    try {
      const result = await githubService.mergePullRequest(currentOwner, currentRepoName, activePR.number, {
        mergeMethod,
      });
      if (result.merged) {
        toast.success(t('pr.mergeMerged').replace('{n}', String(activePR.number)), result.message);
      } else {
        toast.info(result.message || t('pr.mergeNotMerged'));
      }
      await loadPullRequests();
    } catch (err: any) {
      toast.error(t('pr.mergeFailed'), err?.message);
    } finally {
      setIsMerging(false);
    }
  };

  const handleClosePR = async () => {
    if (!activePR || !currentOwner || !currentRepoName) return;
    if (!await confirmAction({ title: t('composer.closePr'), description: t('pr.closeConfirm').replace('{n}', String(activePR.number)), detail: activePR.title, danger: false })) return;
    setIsClosing(true);
    try {
      await githubService.updatePullRequestState(currentOwner, currentRepoName, activePR.number, 'closed');
      toast.success(t('pr.closed').replace('{n}', String(activePR.number)));
      await loadPullRequests();
    } catch (err: any) {
      toast.error(t('pr.closeFailed'), err?.message);
    } finally {
      setIsClosing(false);
    }
  };

  const canManagePR = Boolean(currentOwner && currentRepoName && activePR && activePR.state === 'open');

  return (
    <div className="flex-1 h-full flex flex-col overflow-hidden select-none bg-background">
      {/* Top Header Filter Bar */}
      <div className="min-h-10 py-2 px-4 border-b border-border bg-card/40 flex flex-wrap gap-2 items-center justify-between text-xs shrink-0">
        <div className="flex items-center gap-2">
          <GitPullRequest className="h-4 w-4 text-primary" />
          <span className="font-semibold text-foreground">{t('pr.title')}</span>
          <Badge variant="outline" className="h-4 text-[11px] font-mono">
            {filteredPRs.length} {t('pr.count')}
          </Badge>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* New Pull Request */}
          <Button
            variant="outline"
            size="xs"
            onClick={() => setCreatePROpen(true)}
            disabled={!currentOwner || !currentRepoName}
            className="h-7 text-[12px] gap-1 border-emerald-500/40 text-emerald-600 dark:text-git-added hover:bg-emerald-500/10"
            title={currentOwner ? t('pr.createTitle') : t('pr.needLogin')}
          >
            <Plus className="h-3 w-3" />
            <span>{t('pr.newPR')}</span>
          </Button>

          {/* State Filter Buttons */}
          <div className="flex items-center bg-secondary/50 rounded-md p-0.5 border border-border/60">
            <button
              aria-pressed={prFilterState === 'open'} onClick={() => setPRFilterState('open')}
              className={cn(
                "px-2.5 py-0.5 rounded text-[12px] font-medium transition-colors",
                prFilterState === 'open'
                  ? "bg-accent text-accent-foreground shadow-2xs font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {t('pr.filterOpen')}
            </button>
            <button
              aria-pressed={prFilterState === 'closed'} onClick={() => setPRFilterState('closed')}
              className={cn(
                "px-2.5 py-0.5 rounded text-[12px] font-medium transition-colors",
                prFilterState === 'closed'
                  ? "bg-accent text-accent-foreground shadow-2xs font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {t('pr.filterClosed')}
            </button>
            <button
              aria-pressed={prFilterState === 'all'} onClick={() => setPRFilterState('all')}
              className={cn(
                "px-2.5 py-0.5 rounded text-[12px] font-medium transition-colors",
                prFilterState === 'all'
                  ? "bg-accent text-accent-foreground shadow-2xs font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {t('pr.filterAll')}
            </button>
          </div>

          {/* Search Box */}
          <div className="relative w-48">
            <Search className="h-3 w-3 text-muted-foreground absolute left-2 top-2.5" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('pr.searchPlaceholder')}
              aria-label={t('pr.searchPlaceholder')}
              className="h-7 pl-7 text-[12px]"
            />
          </div>

          {/* Refresh */}
          <Button
            variant="ghost"
            size="xs"
            onClick={() => loadPullRequests()}
            disabled={isLoadingPullRequests || !currentOwner || !currentRepoName}
            aria-busy={isLoadingPullRequests}
            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
            title={t('pr.refreshTitle')}
          >
            <RotateCw className={cn('h-3.5 w-3.5', isLoadingPullRequests && 'animate-spin')} />
          </Button>
        </div>
      </div>

      {pullRequestsError && <div role="alert" className="px-4 py-2 border-b border-border"><ErrorNotice error={pullRequestsError} /><Button variant="outline" size="xs" disabled={isLoadingPullRequests} onClick={() => void loadPullRequests()}>{t('remote.retry')}</Button></div>}
      {isLoadingPullRequests && <p role="status" className="px-4 py-2 text-xs text-muted-foreground">{t('ui.pr.loading')}</p>}

      {/* Main Split: Left PR List + Right PR Review Details */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sub-column: PRs List */}
        <div
          style={{ width: prListWidth }}
          className="border-r border-border bg-sidebar/50 flex flex-col shrink-0 h-full overflow-hidden"
        >
          <ScrollArea className="flex-1 p-2">
            {filteredPRs.length === 0 ? (
              !isLoadingPullRequests && !pullRequestsError && <EmptyState variant={searchQuery.trim() ? 'search' : 'inbox'} title={t(!currentOwner || !currentRepoName ? 'ui.pr.noRepository' : searchQuery.trim() ? 'pr.noMatch' : 'ui.pr.empty')} desc={searchQuery.trim() ? undefined : t('ui.pr.emptyDesc')} />
            ) : (
              <div className="space-y-1.5" role="list" data-keyboard-list aria-label={t('pr.title')} aria-busy={isLoadingPullRequests}>
                {filteredPRs.map((pr) => {
                  const isSelected = activePR?.id === pr.id;
                  const isMerged = !!pr.merged_at;
                  const isOpen = pr.state === 'open';

                  return (
                    <div
                      key={pr.id}
                      {...keyboardRowProps(`#${pr.number} ${pr.title}`)}
                      aria-current={isSelected ? 'true' : undefined}
                      onClick={() => selectPR(pr)}
                      className={cn(
                        "p-3 rounded-lg border text-xs cursor-pointer transition-[background-color,border-color,box-shadow] group space-y-2",
                        isSelected
                          ? "bg-accent border-primary/40 shadow-2xs"
                          : "bg-card/40 border-border/60 hover:bg-accent/40"
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <GitPullRequest
                            className={cn(
                              "h-3.5 w-3.5 shrink-0",
                              isOpen
                                ? "text-git-added"
                                : isMerged
                                ? "text-git-branch"
                                : "text-git-deleted"
                            )}
                          />
                          <span className="font-semibold text-foreground group-hover:text-primary transition-colors line-clamp-1">
                            {pr.title}
                          </span>
                        </div>
                        <span className="text-[11px] font-mono text-muted-foreground shrink-0">
                          #{pr.number}
                        </span>
                      </div>

                      {/* Branch flows & Labels */}
                      <div className="flex items-center justify-between text-[11px] text-muted-foreground font-mono">
                        <div className="flex items-center gap-1 truncate max-w-[170px]">
                          <span className="truncate text-git-branch/90">{pr.head.ref}</span>
                          <span>→</span>
                          <span>{pr.base.ref}</span>
                        </div>

                        <div className="flex items-center gap-1">
                          <User className="h-3 w-3 text-muted-foreground/60" />
                          <span>{pr.user.login}</span>
                        </div>
                      </div>

                      {/* Badges row */}
                      <div className="flex items-center gap-1 flex-wrap pt-0.5">
                        <Badge
                          variant={isOpen ? 'success' : isMerged ? 'secondary' : 'outline'}
                          className={cn(
                            "h-3.5 text-[10px] px-1",
                            isMerged && "bg-git-branch/15 text-git-branch border-git-branch/30"
                          )}
                        >
                          {isOpen ? t('pr.stateOpen') : isMerged ? t('pr.stateMerged') : t('pr.stateClosed')}
                        </Badge>

                        {pr.labels?.map((label) => (
                          <Badge
                            key={label.name}
                            variant="outline"
                            className="h-3.5 text-[10px] px-1 font-normal opacity-80"
                          >
                            {label.name}
                          </Badge>
                        ))}

                        {/* 打开应用内 PR Review 弹窗（阻止冒泡，不影响行选中） */}
                        <Button
                          variant="outline"
                          size="xs"
                          onClick={(event) => { event.stopPropagation(); setReviewPR(pr); }}
                          aria-label={t('prReview.openAria').replace('{n}', String(pr.number))}
                          title={t('prReview.openTitle').replace('{n}', String(pr.number))}
                          className="ml-auto h-5 px-1.5 text-[10px] gap-1 shrink-0"
                        >
                          <MessageSquare className="h-2.5 w-2.5" />
                          <span>{t('prReview.open')}</span>
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </div>

        <ResizeHandle
          currentSize={prListWidth}
          onSizeChange={setPrListWidth}
          minSize={200}
          maxSize={550}
          defaultSize={DEFAULT_LAYOUT.prListWidth}
          title={t('pr.resizeHint')}
        />

        {/* Right Stage: Detailed PR Review View */}
        <div className="flex-1 flex flex-col h-full overflow-hidden bg-card/10">
          {!activePR ? (
            <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground">
              {t('pr.pickToReview')}
            </div>
          ) : (
            <div className="flex-1 flex flex-col h-full overflow-hidden">
              {/* PR Header Toolbar */}
              <div className="p-4 border-b border-border/80 bg-accent/15 flex flex-wrap items-start justify-between gap-4 shrink-0">
                <div className="space-y-1.5 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-foreground">
                      {activePR.title}
                    </span>
                    <span className="text-xs font-mono text-muted-foreground">
                      #{activePR.number}
                    </span>
                  </div>

                  {/* Flow branch indicator */}
                  <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
                    <Badge variant="outline" className="h-4 text-[11px] gap-1">
                      <GitBranch className="h-2.5 w-2.5 text-git-branch" />
                      <span>{activePR.head.ref}</span>
                    </Badge>
                    <span>{t('pr.mergeInto')}</span>
                    <Badge variant="outline" className="h-4 text-[11px]">
                      {activePR.base.ref}
                    </Badge>

                    <span className="text-muted-foreground/60">•</span>
                    <span>{t('pr.openedBy').replace('{user}', activePR.user.login)}</span>
                  </div>
                </div>

                {/* Right Action: Checkout PR Branch + Merge/Close */}
                <div className="flex flex-wrap items-center gap-2 min-w-0">
                  <Button
                    variant="outline"
                    size="xs"
                    onClick={handleCheckoutPR}
                    disabled={isCheckingOut}
                    className="h-7 text-xs gap-1.5 border-primary/40 text-primary hover:bg-primary/10"
                    title={t('pr.checkoutTitle').replace('{n}', String(activePR.number))}
                  >
                    <DownloadCloud className="h-3.5 w-3.5" />
                    <span>{isCheckingOut ? t('pr.checkingOut') : t('pr.checkout')}</span>
                  </Button>

                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => window.open(activePR.html_url, '_blank')}
                    className="h-7 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground"
                    title={t('pr.openInBrowser')}
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    <span>{t('pr.viewOnWeb')}</span>
                  </Button>

                  {canManagePR && (
                    <>
                      {/* Merge method picker */}
                      <select
                        value={mergeMethod}
                        onChange={(e) => setMergeMethod(e.target.value as 'merge' | 'squash' | 'rebase')}
                        className="h-7 rounded-md border border-border/70 bg-background/80 px-1.5 text-[12px] text-foreground focus:outline-hidden focus:ring-1 focus:ring-ring"
                        title={t('pr.mergeMethod')}
                        aria-label={t('pr.mergeMethod')}
                      >
                        <option value="merge">{t('pr.mergeMethod.merge')}</option>
                        <option value="squash">{t('pr.mergeMethod.squash')}</option>
                        <option value="rebase">{t('pr.mergeMethod.rebase')}</option>
                      </select>

                      <Button
                        variant="default"
                        size="xs"
                        onClick={handleMergePR}
                        disabled={isMerging}
                        className="h-7 text-xs gap-1.5 btn-neon dark:btn-neon"
                        title={t('pr.mergeTitle').replace('{n}', String(activePR.number))}
                      >
                        <GitMerge className="h-3.5 w-3.5" />
                        <span>{isMerging ? t('pr.merging') : t('pr.merge')}</span>
                      </Button>

                      <Button
                        variant="ghost"
                        size="xs"
                        onClick={handleClosePR}
                        disabled={isClosing}
                        className="h-7 text-xs gap-1 text-git-deleted hover:text-git-deleted hover:bg-rose-500/10"
                        title={t('pr.closeConfirmTitle')}
                      >
                        <XCircle className="h-3.5 w-3.5" />
                        <span>{isClosing ? t('pr.closing') : t('pr.closePR')}</span>
                      </Button>
                    </>
                  )}
                </div>
              </div>

              {/* PR Content Details Body */}
              <ScrollArea className="flex-1 p-5">
                <div className="max-w-3xl space-y-5">
                  {/* Status & Review Summary Row */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="p-3 rounded-lg border border-border/60 bg-card/60 space-y-1">
                      <div className="text-[11px] text-muted-foreground uppercase font-semibold">
                        {t('pr.reviewStatus')}
                      </div>
                      <div className="flex items-center gap-1.5 text-xs font-medium">
                        {realReviewStatus === 'APPROVED' ? (
                          <>
                            <CheckCircle2 className="h-3.5 w-3.5 text-git-added" />
                            <span className="text-git-added">{t('pr.approved')}</span>
                          </>
                        ) : realReviewStatus === 'CHANGES_REQUESTED' ? (
                          <>
                            <AlertCircle className="h-3.5 w-3.5 text-git-deleted" />
                            <span className="text-git-deleted">{t('pr.changesRequested')}</span>
                          </>
                        ) : realReviewStatus === 'COMMENTED' ? (
                          <>
                            <MessageSquare className="h-3.5 w-3.5 text-git-renamed" />
                            <span className="text-git-renamed">{t('pr.commented')}</span>
                          </>
                        ) : (
                          <>
                            <Clock className="h-3.5 w-3.5 text-git-tag" />
                            <span className="text-git-tag">{t('pr.pendingReview')}</span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="p-3 rounded-lg border border-border/60 bg-card/60 space-y-1">
                      <div className="text-[11px] text-muted-foreground uppercase font-semibold">
                        {t('pr.checks')}
                      </div>
                      <div className="flex items-center gap-1.5 text-xs font-medium font-mono">
                        {realChecks ? (
                          <>
                            <ShieldCheck className={cn("h-3.5 w-3.5", realChecks.failure > 0 ? "text-git-deleted" : "text-git-added")} />
                            <span className={cn(realChecks.failure > 0 ? "text-git-deleted" : "text-git-added")}>
                              {realChecks.success} / {realChecks.total} {t('pr.checksPass')}
                              {realChecks.failure > 0 ? ` (${realChecks.failure} ${t('pr.checksFailed')})` : ''}
                            </span>
                          </>
                        ) : (
                          <>
                            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="text-muted-foreground">{t('pr.noChecks')}</span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="p-3 rounded-lg border border-border/60 bg-card/60 space-y-1 font-mono">
                      <div className="text-[11px] text-muted-foreground uppercase font-semibold">
                        {t('pr.diffStats')}
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-git-added font-semibold">+{activePR.additions || 0}</span>
                        <span className="text-git-deleted font-semibold">-{activePR.deletions || 0}</span>
                        <span className="text-muted-foreground">({activePR.changed_files || 0} {t('pr.filesCount')})</span>
                      </div>
                    </div>
                  </div>

                  {/* PR Body / Markdown Description */}
                  <div className="space-y-2">
                    <div className="text-xs font-semibold text-foreground uppercase tracking-wider">
                      {t('pr.body')}
                    </div>
                    <div className="p-4 rounded-lg border border-border/70 bg-background/50 font-sans text-xs text-foreground/90 leading-relaxed whitespace-pre-wrap">
                      {activePR.body || t('pr.noBody')}
                    </div>
                  </div>
                </div>
              </ScrollArea>
            </div>
          )}
        </div>
      </div>

      {/* Create Pull Request Modal */}
      <CreatePullRequestModal open={createPROpen} onOpenChange={setCreatePROpen} />

      {/* PR Review 详情弹窗（对话 / 文件 / 提交评审） */}
      {reviewPR && currentOwner && currentRepoName && (
        <PullRequestDetailModal
          pr={reviewPR}
          owner={currentOwner}
          repo={currentRepoName}
          onClose={() => setReviewPR(null)}
        />
      )}
    </div>
  );
};
