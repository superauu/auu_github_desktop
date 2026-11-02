import { useEffect, useState } from 'react';
import { GitPullRequest, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/i18n';
import { collaborationService } from '@/services/collaboration/CollaborationService';
import type { CollaborationPullRequestReview } from '@/services/collaboration/CollaborationService';
import type { CollaborationCheckRun, CollaborationPullRequest } from '@/services/collaboration/types';
import type { CollaborationCommitStatus } from '@/services/collaboration/issueTypes';
import { useCollaborationStore } from '@/stores/collaborationStore';
import { useRepoStore } from '@/stores/repoStore';
import { useCollaborationScope } from './useCollaborationScope';
import { pullRequestReference, summarizeCI, summarizeReviews } from './workflowLogic';
import { useCollaborationCapabilities } from '@/features/integrations/useCollaborationCapabilities';

type Snapshot = { pr: CollaborationPullRequest; runs: CollaborationCheckRun[]; statuses: CollaborationCommitStatus[]; reviews: CollaborationPullRequestReview[]; ciIncomplete: boolean; reviewsIncomplete: boolean; errors: string[] };
export function IssuePullRequestCard({ url, refresh }: { url: string; refresh: number }) {
  const { t } = useI18n(), scope = useCollaborationScope();
  const { can } = useCollaborationCapabilities();
  const canRead = can('code-hosting:pull-request-detail'), canCheck = can('ci-cd:commit-checks');
  const [data, setData] = useState<Snapshot | null>(null), [error, setError] = useState('');
  const [loading, setLoading] = useState(true), [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    const target = pullRequestReference(url);
    if (!target) return;
    if (!canRead) { setLoading(false); setData(null); setError(''); return; }
    setLoading(true); setError(''); setData(null);
    void (async () => {
      try {
        const pr = await collaborationService.getPullRequest(target.owner, target.repo, target.number);
        if (!active || !scope.isCurrent()) return;
        const [checks, statuses, reviews] = await Promise.allSettled([
          canCheck ? collaborationService.getWorkflowCheckRuns(target.owner, target.repo, pr.head.sha) : Promise.resolve({ check_runs: [], total_count: 0 }),
          canCheck ? collaborationService.getWorkflowCommitStatuses(target.owner, target.repo, pr.head.sha) : Promise.resolve({ statuses: [], total_count: 0 }),
          collaborationService.getPullRequestReviews(target.owner, target.repo, target.number),
        ]);
        if (!active || !scope.isCurrent()) return;
        const runs = checks.status === 'fulfilled' ? checks.value.check_runs : [];
        const legacy = statuses.status === 'fulfilled' ? statuses.value.statuses : [];
        setData({ pr, runs, statuses: legacy, reviews: reviews.status === 'fulfilled' ? reviews.value : [],
          ciIncomplete: checks.status === 'rejected' || statuses.status === 'rejected'
            || checks.value.total_count > runs.length || statuses.value.total_count > legacy.length,
          reviewsIncomplete: reviews.status === 'rejected' || reviews.value.length >= 1000,
          errors: [checks, statuses, reviews].flatMap(result => result.status === 'rejected' ? [String(result.reason?.message || result.reason)] : []),
        });
      } catch (reason) { if (active && scope.isCurrent()) setError(reason instanceof Error ? reason.message : String(reason)); }
      finally { if (active && scope.isCurrent()) setLoading(false); }
    })();
    return () => { active = false; };
  }, [url, scope, refresh, attempt, canRead, canCheck]);
  const target = pullRequestReference(url);
  if (!target) return null;
  const sameRepo = target.owner.toLowerCase() === scope.owner?.toLowerCase() && target.repo.toLowerCase() === scope.repo?.toLowerCase();
  const ci = data && summarizeCI(data.runs, data.statuses, data.ciIncomplete), reviews = data && summarizeReviews(data.reviews);
  const openPR = () => { if (data && scope.isCurrent()) { useCollaborationStore.getState().openPullRequest(data.pr); useRepoStore.getState().setActiveTab('pullRequests'); } };
  return <article className="rounded-lg border border-border p-3 space-y-2" data-issue-pr={target.number}>
    <div className="flex items-start gap-2"><GitPullRequest className="h-4 w-4 shrink-0" />
      {sameRepo && canRead ? <button className="text-primary text-left break-words min-w-0" disabled={!data || loading} onClick={openPR}>{target.owner}/{target.repo}#{target.number}{data ? ` · ${data.pr.title}` : ''}</button>
        : <a href={url} target="_blank" rel="noreferrer" className="text-primary break-words min-w-0">{target.owner}/{target.repo}#{target.number}{data ? ` · ${data.pr.title}` : ''} ↗</a>}
      {canRead && <Button size="xs" variant="ghost" className="ml-auto shrink-0" aria-label={t('issueFlow.refreshPR')} disabled={loading} onClick={() => setAttempt(value => value + 1)}><RefreshCw className="h-3 w-3" /></Button>}
    </div>
    {loading && <p role="status" className="text-muted-foreground">{t('common.loading')}</p>}
    {error && <p role="alert" className="text-destructive">{error}</p>}
    {data && <>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        <span className="min-w-0 break-all">{t(data.pr.merged_at ? 'issues.merged' : data.pr.state === 'closed' ? 'issues.closed' : 'issues.open')} · {data.pr.head.ref} → {data.pr.base.ref}</span>
        {canCheck && <span data-ci-state={ci} className={ci === 'passing' ? 'text-git-added' : ci === 'failed' ? 'text-destructive' : 'text-muted-foreground'}>CI: {t(`issueFlow.ci.${ci}`)}</span>}
        <span>{t('issueFlow.reviews')}: {data.reviewsIncomplete ? t('issueFlow.unknown') : `${reviews!.approved} ${t('issueFlow.approved')} · ${reviews!.changesRequested} ${t('issueFlow.changesRequested')}`}</span>
      </div>
      {data.ciIncomplete && <p className="text-amber-600 dark:text-amber-400">{t('issueFlow.incomplete')}</p>}
      {!!data.errors.length && <p role="alert" className="text-destructive whitespace-pre-wrap">{data.errors.join('\n')}</p>}
      <details className="text-muted-foreground"><summary className="cursor-pointer">{t('issueFlow.statusDetails')} · {data.pr.head.sha.slice(0, 7)}</summary><ul className="mt-2 space-y-1">
        {data.runs.map(run => <li key={`check-${run.id}`}>{run.name} · {run.status === 'completed' ? run.conclusion || t('issueFlow.unknown') : run.status}</li>)}
        {data.statuses.map(status => <li key={`status-${status.id}`}>{status.context} · {status.state}</li>)}
      </ul><p className="mt-2 text-[11px]">{t('issueFlow.reviewHint')}</p></details>
      <p className="text-muted-foreground text-[10px]">{t('issueFlow.snapshotHint')}</p>
    </>}
  </article>;
}
