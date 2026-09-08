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
} from 'lucide-react';
import { useGitHubStore } from '@/stores/githubStore';
import { useI18n } from '@/i18n';
import { useRepoStore } from '@/stores/repoStore';
import { githubService } from '@/services/github/GitHubService';
import { useLayoutStore, DEFAULT_LAYOUT } from '@/stores/layoutStore';
import { ResizeHandle } from '@/components/ui/ResizeHandle';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from '@/stores/toastStore';
import { cn } from '@/utils/cn';

export const PullRequestsView: React.FC = () => {
  const { prListWidth, setPrListWidth } = useLayoutStore();
  const {
    pullRequests,
    selectedPR,
    selectPR,
    prFilterState,
    setPRFilterState,
    loadPullRequests,
    currentOwner,
    currentRepoName,
  } = useGitHubStore();

  const { fetchAndCheckoutPR } = useRepoStore();
  const { t } = useI18n();

  const [searchQuery, setSearchQuery] = useState('');
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [realReviewStatus, setRealReviewStatus] = useState<string>('PENDING');
  const [realChecks, setRealChecks] = useState<{ total: number; success: number; failure: number } | null>(null);

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

  const activePR = selectedPR || filteredPRs[0] || null;

  // Dynamically load real review and check runs for activePR
  useEffect(() => {
    if (!activePR) return;

    if (currentOwner && currentRepoName) {
      // Fetch real PR reviews
      githubService.getPullRequestReviews(currentOwner, currentRepoName, activePR.number).then((reviews) => {
        if (reviews.some((r) => r.state === 'CHANGES_REQUESTED')) {
          setRealReviewStatus('CHANGES_REQUESTED');
        } else if (reviews.some((r) => r.state === 'APPROVED')) {
          setRealReviewStatus('APPROVED');
        } else if (reviews.some((r) => r.state === 'COMMENTED')) {
          setRealReviewStatus('COMMENTED');
        } else {
          setRealReviewStatus('PENDING');
        }
      }).catch(() => {
        setRealReviewStatus('PENDING');
      });

      // Fetch real PR commit checks
      githubService.getCommitChecks(currentOwner, currentRepoName, activePR.head.sha).then((checkRuns) => {
        const total = checkRuns.length;
        const success = checkRuns.filter((c) => c.conclusion === 'success').length;
        const failure = checkRuns.filter((c) => c.conclusion === 'failure').length;
        setRealChecks({ total, success, failure });
      }).catch(() => {
        setRealChecks(null);
      });
    } else {
      // 未绑定 GitHub 仓库时无从获取真实数据
      setRealReviewStatus('PENDING');
      setRealChecks(null);
    }
  }, [activePR, currentOwner, currentRepoName]);

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

  return (
    <div className="flex-1 h-full flex flex-col overflow-hidden select-none bg-background">
      {/* Top Header Filter Bar */}
      <div className="h-10 px-4 border-b border-border bg-card/40 flex items-center justify-between text-xs shrink-0">
        <div className="flex items-center gap-2">
          <GitPullRequest className="h-4 w-4 text-primary" />
          <span className="font-semibold text-foreground">{t('pr.title')}</span>
          <Badge variant="outline" className="h-4 text-[10px] font-mono">
            {filteredPRs.length} {t('pr.count')}
          </Badge>
        </div>

        <div className="flex items-center gap-3">
          {/* State Filter Buttons */}
          <div className="flex items-center bg-secondary/50 rounded-md p-0.5 border border-border/60">
            <button
              onClick={() => setPRFilterState('open')}
              className={cn(
                "px-2.5 py-0.5 rounded text-[11px] font-medium transition-colors",
                prFilterState === 'open'
                  ? "bg-accent text-accent-foreground shadow-xs font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {t('pr.filterOpen')}
            </button>
            <button
              onClick={() => setPRFilterState('closed')}
              className={cn(
                "px-2.5 py-0.5 rounded text-[11px] font-medium transition-colors",
                prFilterState === 'closed'
                  ? "bg-accent text-accent-foreground shadow-xs font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {t('pr.filterClosed')}
            </button>
            <button
              onClick={() => setPRFilterState('all')}
              className={cn(
                "px-2.5 py-0.5 rounded text-[11px] font-medium transition-colors",
                prFilterState === 'all'
                  ? "bg-accent text-accent-foreground shadow-xs font-semibold"
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
              className="h-7 pl-7 text-[11px]"
            />
          </div>

          {/* Refresh */}
          <Button
            variant="ghost"
            size="xs"
            onClick={() => loadPullRequests()}
            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
            title={t('pr.refreshTitle')}
          >
            <RotateCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Main Split: Left PR List + Right PR Review Details */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sub-column: PRs List */}
        <div
          style={{ width: prListWidth }}
          className="border-r border-border bg-sidebar/50 flex flex-col shrink-0 h-full overflow-hidden"
        >
          <ScrollArea className="flex-1 p-2">
            {filteredPRs.length === 0 ? (
              <div className="py-20 text-center text-xs text-muted-foreground">
                {t('pr.noMatch')}
              </div>
            ) : (
              <div className="space-y-1.5">
                {filteredPRs.map((pr) => {
                  const isSelected = activePR?.id === pr.id;
                  const isMerged = !!pr.merged_at;
                  const isOpen = pr.state === 'open';

                  return (
                    <div
                      key={pr.id}
                      onClick={() => selectPR(pr)}
                      className={cn(
                        "p-3 rounded-lg border text-xs cursor-pointer transition-all group space-y-2",
                        isSelected
                          ? "bg-accent border-primary/40 shadow-xs"
                          : "bg-card/40 border-border/60 hover:bg-accent/40"
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <GitPullRequest
                            className={cn(
                              "h-3.5 w-3.5 shrink-0",
                              isOpen
                                ? "text-emerald-400"
                                : isMerged
                                ? "text-violet-400"
                                : "text-rose-400"
                            )}
                          />
                          <span className="font-semibold text-foreground group-hover:text-primary transition-colors line-clamp-1">
                            {pr.title}
                          </span>
                        </div>
                        <span className="text-[10px] font-mono text-muted-foreground shrink-0">
                          #{pr.number}
                        </span>
                      </div>

                      {/* Branch flows & Labels */}
                      <div className="flex items-center justify-between text-[10px] text-muted-foreground font-mono">
                        <div className="flex items-center gap-1 truncate max-w-[170px]">
                          <span className="truncate text-indigo-300/90">{pr.head.ref}</span>
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
                            "h-3.5 text-[9px] px-1",
                            isMerged && "bg-violet-500/15 text-violet-300 border-violet-500/30"
                          )}
                        >
                          {isOpen ? 'Open' : isMerged ? 'Merged' : 'Closed'}
                        </Badge>

                        {pr.labels?.map((label) => (
                          <Badge
                            key={label.name}
                            variant="outline"
                            className="h-3.5 text-[9px] px-1 font-normal opacity-80"
                          >
                            {label.name}
                          </Badge>
                        ))}
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
              <div className="p-4 border-b border-border/80 bg-accent/15 flex items-start justify-between gap-4 shrink-0">
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
                    <Badge variant="outline" className="h-4 text-[10px] gap-1">
                      <GitBranch className="h-2.5 w-2.5 text-indigo-400" />
                      <span>{activePR.head.ref}</span>
                    </Badge>
                    <span>{t('pr.mergeInto')}</span>
                    <Badge variant="outline" className="h-4 text-[10px]">
                      {activePR.base.ref}
                    </Badge>

                    <span className="text-muted-foreground/60">•</span>
                    <span>{t('pr.openedBy').replace('{user}', activePR.user.login)}</span>
                  </div>
                </div>

                {/* Right Action: Checkout PR Branch */}
                <div className="flex items-center gap-2 shrink-0">
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
                </div>
              </div>

              {/* PR Content Details Body */}
              <ScrollArea className="flex-1 p-5">
                <div className="max-w-3xl space-y-5">
                  {/* Status & Review Summary Row */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="p-3 rounded-lg border border-border/60 bg-card/60 space-y-1">
                      <div className="text-[10px] text-muted-foreground uppercase font-semibold">
                        {t('pr.reviewStatus')}
                      </div>
                      <div className="flex items-center gap-1.5 text-xs font-medium">
                        {realReviewStatus === 'APPROVED' ? (
                          <>
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                            <span className="text-emerald-400">{t('pr.approved')}</span>
                          </>
                        ) : realReviewStatus === 'CHANGES_REQUESTED' ? (
                          <>
                            <AlertCircle className="h-3.5 w-3.5 text-rose-400" />
                            <span className="text-rose-400">{t('pr.changesRequested')}</span>
                          </>
                        ) : realReviewStatus === 'COMMENTED' ? (
                          <>
                            <MessageSquare className="h-3.5 w-3.5 text-cyan-400" />
                            <span className="text-cyan-400">{t('pr.commented')}</span>
                          </>
                        ) : (
                          <>
                            <Clock className="h-3.5 w-3.5 text-amber-400" />
                            <span className="text-amber-400">{t('pr.pendingReview')}</span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="p-3 rounded-lg border border-border/60 bg-card/60 space-y-1">
                      <div className="text-[10px] text-muted-foreground uppercase font-semibold">
                        {t('pr.checks')}
                      </div>
                      <div className="flex items-center gap-1.5 text-xs font-medium font-mono">
                        {realChecks ? (
                          <>
                            <ShieldCheck className={cn("h-3.5 w-3.5", realChecks.failure > 0 ? "text-rose-400" : "text-emerald-400")} />
                            <span className={cn(realChecks.failure > 0 ? "text-rose-400" : "text-emerald-400")}>
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
                      <div className="text-[10px] text-muted-foreground uppercase font-semibold">
                        {t('pr.diffStats')}
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-emerald-400 font-semibold">+{activePR.additions || 0}</span>
                        <span className="text-rose-400 font-semibold">-{activePR.deletions || 0}</span>
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
    </div>
  );
};
