import { useEffect, useRef, useState } from 'react';
import { ExternalLink, GitBranch, GitPullRequest, Pencil, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/i18n';
import { githubService, type GitHubIssueComment } from '@/services/github/GitHubService';
import type { GitHubIssue } from '@/services/github/issueTypes';
import { useRepoStore } from '@/stores/repoStore';
import { useIssueWorkflowStore } from '@/stores/issueWorkflowStore';
import { CreateBranchModal } from '@/features/git/CreateBranchModal';
import { CreatePullRequestModal } from '@/features/pr/CreatePullRequestModal';
import { IssueEditor } from './IssueEditor';
import { issueBranchName, issueUrl, referencedPullRequests } from './issueLogic';
import { useGitHubScope } from './useGitHubScope';
import { issueKey } from './issueLogic';
import { IssuePullRequestCard } from './IssuePullRequestCard';
import { confirmAction } from '@/stores/confirmStore';

export function IssueDetail({ number, onChanged }: { number: number; onChanged: () => void }) {
  const { t } = useI18n(), scope = useGitHubScope();
  const repoPath = useRepoStore(state => state.currentRepo?.path);
  const branch = useRepoStore(state => state.currentRepo?.currentBranch || state.status?.currentBranch || state.branches.find(item => item.isCurrent)?.name);
  const reference = { owner: scope.owner!, repo: scope.repo!, number };
  const revision = useIssueWorkflowStore(state => state.revisions[issueKey(reference)] || 0);
  const [issue, setIssue] = useState<GitHubIssue | null>(null), [comments, setComments] = useState<GitHubIssueComment[]>([]);
  const [prs, setPRs] = useState<ReturnType<typeof referencedPullRequests>>([]);
  const [loading, setLoading] = useState(true), [loadError, setLoadError] = useState(''), [activityError, setActivityError] = useState('');
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [attempt, setAttempt] = useState(0), [comment, setComment] = useState('');
  const [editing, setEditing] = useState(false), [branchOpen, setBranchOpen] = useState(false), [prOpen, setPROpen] = useState(false);
  const [autoTick, setAutoTick] = useState(0), [prLimit, setPRLimit] = useState(5);
  const reads = useRef(0);
  const mounted = useRef(true), sending = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    let active = true;
    const request = ++reads.current;
    if (!scope.owner || !scope.repo) return;
    setLoading(true); setLoadError(''); setActivityError('');
    void Promise.allSettled([
      githubService.getIssue(scope.owner, scope.repo, number), githubService.getIssueComments(scope.owner, scope.repo, number), githubService.getIssueTimeline(scope.owner, scope.repo, number),
    ]).then(([detail, discussion, timeline]) => {
      if (!active || request !== reads.current || !scope.isCurrent()) return;
      if (detail.status === 'fulfilled') setIssue(detail.value); else setLoadError(String(detail.reason?.message || detail.reason));
      if (discussion.status === 'fulfilled') setComments(discussion.value);
      if (timeline.status === 'fulfilled') setPRs(referencedPullRequests(timeline.value));
      const failure = [discussion, timeline].find(result => result.status === 'rejected');
      if (failure?.status === 'rejected') setActivityError(String(failure.reason?.message || failure.reason));
      setLoading(false);
    });
    return () => { active = false; };
  }, [scope, number, attempt, autoTick, revision]);
  useEffect(() => {
    if (typeof window === 'undefined' || busy || editing || branchOpen || prOpen) return;
    const refresh = () => { if (document.visibilityState === 'visible') setAutoTick(value => value + 1); };
    const timer = setInterval(refresh, 60_000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => { clearInterval(timer); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, [busy, editing, branchOpen, prOpen]);
  const valid = () => mounted.current && scope.isCurrent();
  const run = async (action: () => Promise<void>) => {
    if (sending.current || !valid()) return;
    sending.current = true; reads.current++; setLoading(false); setBusy(true); setError('');
    try { await action(); } catch (reason) { if (valid()) setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { sending.current = false; if (valid()) { setBusy(false); setAttempt(value => value + 1); } }
  };
  const changeState = (state: 'open' | 'closed', state_reason: 'completed' | 'not_planned' | 'reopened') => run(async () => {
    const updated = await githubService.updateIssue(scope.owner!, scope.repo!, number, { state, state_reason });
    if (valid()) { setIssue(updated); onChanged(); }
  });
  const linkCurrentBranch = () => run(async () => {
    if (!repoPath || !branch || branch === 'DETACHED') return;
    const previous = useIssueWorkflowStore.getState().issueForBranch(repoPath, branch);
    if (previous && issueKey(previous) !== issueKey(reference) && !await confirmAction({ title: t('issueFlow.linkBranch'), description: `${branch}: ${issueKey(previous)} → ${issueKey(reference)}`, danger: false })) return;
    const repo = useRepoStore.getState();
    const currentBranch = repo.currentRepo?.currentBranch || repo.status?.currentBranch || repo.branches.find(item => item.isCurrent)?.name;
    if (valid() && repo.currentRepo?.path === repoPath && currentBranch === branch) useIssueWorkflowStore.getState().linkBranch(repoPath, branch, reference);
  });
  if (loading && !issue) return <p role="status" className="p-5 text-xs text-muted-foreground">{t('common.loading')}</p>;
  if (!issue) return <div role="alert" className="p-5 text-xs space-y-2"><p className="text-destructive">{loadError}</p><Button size="xs" variant="outline" onClick={() => setAttempt(value => value + 1)}>{t('remote.retry')}</Button></div>;
  return <div className="w-full p-4 sm:p-5 space-y-5 text-xs max-w-4xl mx-auto" data-issue-detail={number}>
    <div className="space-y-3">
      {loadError && <p role="alert" className="text-destructive">{loadError}</p>}
      <div className="flex flex-wrap gap-2 items-center"><span className={`rounded-full border px-2 py-1 font-medium ${issue.state === 'open' ? 'text-git-added border-git-added/40' : 'text-git-branch border-git-branch/40'}`}>{t(issue.state === 'open' ? 'issues.open' : issue.state_reason === 'not_planned' ? 'issues.notPlanned' : 'issues.closed')}</span><span className="text-muted-foreground">#{number} · {issue.user.login}</span><Button size="xs" variant="ghost" aria-label={t('issues.refresh')} disabled={busy} onClick={() => setAttempt(value => value + 1)}><RefreshCw className="h-3 w-3" /></Button><a className="inline-flex items-center gap-1 text-primary" href={issueUrl(reference)} target="_blank" rel="noreferrer">GitHub <ExternalLink className="h-3 w-3" /></a></div>
      <h1 className="text-lg font-semibold break-words select-text">{issue.title}</h1>
      <div className="flex flex-wrap gap-2">
        <Button size="xs" variant="outline" disabled={busy} onClick={() => setEditing(true)}><Pencil className="h-3 w-3 mr-1" />{t('issues.edit')}</Button>
        <Button size="xs" variant="outline" disabled={busy || !repoPath} onClick={() => setBranchOpen(true)}><GitBranch className="h-3 w-3 mr-1" />{t('issues.createBranch')}</Button>
        <Button size="xs" variant="outline" disabled={busy || !repoPath || !branch || branch === 'DETACHED'} onClick={() => void linkCurrentBranch()} title={branch}>{t('issueFlow.linkBranch')}</Button>
        <Button size="xs" variant="outline" disabled={busy || issue.state !== 'open'} onClick={() => setPROpen(true)}><GitPullRequest className="h-3 w-3 mr-1" />{t('issues.createPR')}</Button>
      </div>
      <div className="flex flex-wrap gap-1">{issue.labels.map(label => <span key={label.id} className="inline-flex items-center gap-1 rounded border border-border px-2 py-0.5"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: /^[a-f\d]{6}$/i.test(label.color) ? `#${label.color}` : undefined }} />{label.name}</span>)}</div>
      <p className="text-muted-foreground">{t('issues.assignees')}: {issue.assignees.map(user => user.login).join(', ') || t('issues.none')}</p>
    </div>
    <div className="rounded-xl border border-border bg-background/40 p-4 whitespace-pre-wrap break-words select-text leading-relaxed">{issue.body || t('issues.noDescription')}</div>
    <section className="space-y-2"><h2 className="font-semibold">{t('issues.relatedPRs')}</h2><p className="text-muted-foreground text-[11px]">{t('issues.referencesHint')}</p>
      {prs.slice(0, prLimit).map(pr => <IssuePullRequestCard key={pr.html_url} url={pr.html_url} refresh={attempt + autoTick + revision} />)}
      {prs.length > prLimit && <Button size="xs" variant="outline" onClick={() => setPRLimit(value => value + 5)}>{t('issueFlow.morePRs')}</Button>}
      <p className="text-muted-foreground text-[11px]">{t('issueFlow.refreshHint')}</p>
      {!prs.length && !activityError && <p className="text-muted-foreground">{t('issues.noPRs')}</p>}
    </section>
    <section className="space-y-3"><h2 className="font-semibold">{t('issues.comments')}</h2>
      {activityError && <div role="alert" className="text-destructive">{activityError} <Button size="xs" variant="outline" disabled={busy} onClick={() => setAttempt(value => value + 1)}>{t('remote.retry')}</Button></div>}
      {comments.map(item => <article key={item.id} className="rounded-lg border border-border p-3 space-y-2 select-text"><div className="flex gap-2 flex-wrap text-muted-foreground"><span className="font-semibold text-foreground">{item.user.login}</span><time>{new Date(item.created_at).toLocaleString()}</time></div><p className="whitespace-pre-wrap break-words leading-relaxed">{item.body}</p></article>)}
      <form onSubmit={event => { event.preventDefault(); if (!comment.trim()) return; void run(async () => { const saved = await githubService.createIssueComment(scope.owner!, scope.repo!, number, comment.trim()); if (valid()) { setComments(previous => [...previous, saved]); setComment(''); onChanged(); } }); }} className="space-y-2">
        <label className="block space-y-1"><span>{t('issues.addComment')}</span><textarea aria-label={t('issues.addComment')} value={comment} onChange={event => setComment(event.target.value)} disabled={busy || issue.locked} rows={4} className="w-full rounded-lg border border-input bg-background p-2 resize-y disabled:opacity-50" /></label>
        {issue.locked && <p className="text-muted-foreground">{t('issues.locked')}</p>}
        <div className="flex gap-2 flex-wrap"><Button type="submit" size="sm" disabled={busy || issue.locked || !comment.trim()}>{t('issues.sendComment')}</Button>
          {issue.state === 'open' ? <><Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void changeState('closed', 'completed')}>{t('issues.closeCompleted')}</Button><Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => void changeState('closed', 'not_planned')}>{t('issues.closeNotPlanned')}</Button></> : <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void changeState('open', 'reopened')}>{t('issues.reopen')}</Button>}
        </div>
      </form>
    </section>
    {error && <p role="alert" className="text-destructive whitespace-pre-wrap">{error}</p>}
    {editing && <IssueEditor issue={issue} onClose={() => setEditing(false)} onSaved={saved => { reads.current++; setLoading(false); setIssue(saved); setEditing(false); setAttempt(value => value + 1); onChanged(); }} />}
    {branchOpen && <CreateBranchModal open onOpenChange={setBranchOpen} defaultBranchName={issueBranchName(number, issue.title)} onCreated={name => { if (repoPath && scope.isCurrent()) useIssueWorkflowStore.getState().linkBranch(repoPath, name, reference); }} />}
    {prOpen && <CreatePullRequestModal open initialIssue={reference} onOpenChange={setPROpen} onCreated={() => { if (valid()) useRepoStore.getState().setActiveTab('pullRequests'); }} />}
  </div>;
}
