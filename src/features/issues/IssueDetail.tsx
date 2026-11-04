import { useCollaborationCapabilities, useIssueCapabilities } from '@/features/integrations/useCollaborationCapabilities';
import { useActiveProviderId } from '@/features/integrations/useActiveProviderId';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, GitBranch, GitPullRequest, Pencil, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/i18n';
import { openExternalUrl } from '@/utils/openExternal';
import type { CollaborationIssueComment } from '@/services/collaboration/CollaborationService';
import type { CollaborationIssue } from '@/services/collaboration/issueTypes';
import { getHostingPlugin, getTaskPlugin } from '@/services/integrations/plugins';
import { issueClientFor } from '@/services/integrations/taskService';
import { useRepoStore } from '@/stores/repoStore';
import { useIssueWorkflowStore } from '@/stores/issueWorkflowStore';
import { CreateBranchModal } from '@/features/git/CreateBranchModal';
import { CreatePullRequestModal } from '@/features/pr/CreatePullRequestModal';
import { IssueEditor } from './IssueEditor';
import { issueBranchName, issueUrl, referencedPullRequests } from './issueLogic';
import { useFallbackIssueScope, type IssueSourceScope } from './useIssueSource';
import { issueKey } from './issueLogic';
import { IssuePullRequestCard } from './IssuePullRequestCard';
import { confirmAction } from '@/stores/confirmStore';
import { Markdown, MarkdownField } from '@/components/ui/Markdown';

/** 详情页：桌面式全宽布局（吸顶标题栏 + 主内容/属性双栏），不再是网页式居中窄栏。 */
export function IssueDetail({ scope: scopeProp, number, onChanged }: { scope?: IssueSourceScope; number: number; onChanged: () => void }) {
  const { t, lang } = useI18n();
  // scope 可省略（独立挂载/测试场景）：回落到仓库作用域。
  const fallback = useFallbackIssueScope();
  const scope = scopeProp ?? fallback;
  // 任务引用按任务连接的 manifest 收敛能力（不借托管平台亮按钮）；托管引用维持并集口径。
  const { can } = useIssueCapabilities(scope.source === 'task' ? scope.providerId : undefined);
  // 建 PR 永远走托管绑定（任务引用没有 PR 语义），按托管并集口径判定。
  const { can: hostingCan } = useCollaborationCapabilities();
  const providerId = useActiveProviderId();
  const providerLabel = scope.source === 'task'
    ? getTaskPlugin(scope.providerId)?.manifest.name ?? null
    : providerId ? getHostingPlugin(providerId)?.manifest.name ?? null : null;
  const repoPath = useRepoStore(state => state.currentRepo?.path);
  const branch = useRepoStore(state => state.currentRepo?.currentBranch || state.status?.currentBranch || state.branches.find(item => item.isCurrent)?.name);
  const [issue, setIssue] = useState<CollaborationIssue | null>(null);
  // 任务引用显式携带 providerId/server（不套托管绑定落款）；identifier 在加载后补齐，
  // 供分支名与外链使用（issueKey 不含 identifier，刷新修订不受影响）。
  const reference = useMemo(() => ({
    owner: scope.owner, repo: scope.repo, number,
    ...(scope.source === 'task' ? { providerId: scope.providerId, server: scope.server } : {}),
    ...(issue?.identifier ? { identifier: issue.identifier } : {}),
  }), [scope, number, issue?.identifier]);
  const revision = useIssueWorkflowStore(state => state.revisions[issueKey(reference)] || 0);
  const [comments, setComments] = useState<CollaborationIssueComment[]>([]);
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
    setLoading(true); setLoadError(''); setActivityError('');
    const client = issueClientFor(scope.providerId);
    void Promise.allSettled([
      client.getIssue(scope.owner, scope.repo, number), client.getIssueComments(scope.owner, scope.repo, number), client.getIssueTimeline(scope.owner, scope.repo, number),
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
    const updated = await issueClientFor(scope.providerId).updateIssue(scope.owner, scope.repo, number, { state, state_reason });
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
  const stateLabel = t(issue.state === 'open' ? 'issues.open' : issue.state_reason === 'not_planned' ? 'issues.notPlanned' : 'issues.closed');
  return <div className="issues-detail" data-issue-detail={number}>
    <header className="issues-detail-head">
      <div className="issues-detail-title-row">
        <span className="issues-detail-id">{issue.identifier ?? `#${number}`}</span>
        <h1 className="issues-detail-title select-text">{issue.title}</h1>
      </div>
      <div className="issues-detail-meta">
        <span className="issues-state-chip" data-state={issue.state}>{stateLabel}</span>
        <span>{issue.user.login}</span>
        {providerLabel && <a className="inline-flex items-center gap-1 text-primary" href={issueUrl(reference)} target="_blank" rel="noreferrer" onClick={event => { const url = issueUrl(reference); if (url) { event.preventDefault(); void openExternalUrl(url); } }}>{providerLabel} <ExternalLink className="h-3 w-3" /></a>}
        <Button size="icon-xs" variant="ghost" aria-label={t('issues.refresh')} disabled={busy} onClick={() => setAttempt(value => value + 1)}><RefreshCw className="h-3 w-3" /></Button>
      </div>
      <div className="issues-detail-actions">
        <Button size="xs" variant="outline" disabled={busy || !can('task-tracking:update-issue')} title={can('task-tracking:update-issue') ? undefined : t('connections.unavailableCapability')} onClick={() => setEditing(true)}><Pencil className="h-3 w-3 mr-1" />{t('issues.edit')}</Button>
        <Button size="xs" variant="outline" disabled={busy || !repoPath} onClick={() => setBranchOpen(true)}><GitBranch className="h-3 w-3 mr-1" />{t('issues.createBranch')}</Button>
        <Button size="xs" variant="outline" disabled={busy || !repoPath || !branch || branch === 'DETACHED'} onClick={() => void linkCurrentBranch()} title={branch}>{t('issueFlow.linkBranch')}</Button>
        <Button size="xs" variant="outline" disabled={busy || issue.state !== 'open' || !hostingCan('code-hosting:create-pull-request')} title={hostingCan('code-hosting:create-pull-request') ? undefined : t('connections.unavailableCapability')} onClick={() => setPROpen(true)}><GitPullRequest className="h-3 w-3 mr-1" />{t('issues.createPR')}</Button>
      </div>
      {loadError && <p role="alert" className="text-destructive text-xs">{loadError}</p>}
    </header>
    <div className="issues-detail-body">
      <div className="issues-detail-main">
        <div className="issues-description"><Markdown baseUrl={issue.html_url}>{issue.body || t('issues.noDescription')}</Markdown></div>
        <section className="issues-section">
          <h2 className="issues-section-title">{t('issues.relatedPRs')}</h2>
          {prs.slice(0, prLimit).map(pr => <IssuePullRequestCard key={pr.html_url} url={pr.html_url} refresh={attempt + autoTick + revision} />)}
          {prs.length > prLimit && <Button size="xs" variant="outline" onClick={() => setPRLimit(value => value + 5)}>{t('issueFlow.morePRs')}</Button>}
          <p className="text-muted-foreground text-[11px]">{t('issues.referencesHint')}</p>
          <p className="text-muted-foreground text-[11px]">{t('issueFlow.refreshHint')}</p>
          {!prs.length && !activityError && <p className="text-muted-foreground text-xs">{t('issues.noPRs')}</p>}
        </section>

        <section className="issues-section issues-discussion">
          <h2 className="issues-section-title">{t('issues.comments')} <span className="panel-count">{comments.length}</span></h2>
          {!comments.length && !activityError && <p className="text-xs text-muted-foreground">{t('issues.noComments')}</p>}
          {activityError && <div role="alert" className="text-destructive text-xs">{activityError} <Button size="xs" variant="outline" disabled={busy} onClick={() => setAttempt(value => value + 1)}>{t('remote.retry')}</Button></div>}
          {comments.map(item => <article key={item.id} className="issues-comment select-text"><div className="issues-comment-head"><span className="issues-comment-author">{item.user.login}</span><time dateTime={item.created_at}>{new Date(item.created_at).toLocaleString(lang === 'zh' ? 'zh-CN' : 'en')}</time></div><Markdown baseUrl={issue.html_url}>{item.body}</Markdown></article>)}
          <form onSubmit={event => { event.preventDefault(); if (!comment.trim()) return; void run(async () => { const saved = await issueClientFor(scope.providerId).createIssueComment(scope.owner, scope.repo, number, comment.trim()); if (valid()) { setComments(previous => [...previous, saved]); setComment(''); onChanged(); } }); }} className="issues-composer space-y-2">
            <MarkdownField label={t('issues.addComment')} value={comment} onChange={setComment} disabled={busy || issue.locked} rows={4} baseUrl={issue.html_url} />
            {issue.locked && <p className="text-muted-foreground text-[11px]">{t('issues.locked')}</p>}
            <div className="flex gap-2 flex-wrap"><Button type="submit" size="sm" disabled={busy || issue.locked || !comment.trim() || !can('task-tracking:comment')} title={can('task-tracking:comment') ? undefined : t('connections.unavailableCapability')}>{t('issues.sendComment')}</Button>
              {issue.state === 'open' ? <><Button type="button" size="sm" variant="outline" disabled={busy || !can('task-tracking:update-issue')} title={can('task-tracking:update-issue') ? undefined : t('connections.unavailableCapability')} onClick={() => void changeState('closed', 'completed')}>{t('issues.closeCompleted')}</Button><Button type="button" size="sm" variant="ghost" disabled={busy || !can('task-tracking:update-issue') || !can('task-tracking:close-state-reason')} title={!can('task-tracking:close-state-reason') ? t('issues.notPlannedUnsupported') : can('task-tracking:update-issue') ? undefined : t('connections.unavailableCapability')} onClick={() => void changeState('closed', 'not_planned')}>{t('issues.closeNotPlanned')}</Button></> : <Button type="button" size="sm" variant="outline" disabled={busy || !can('task-tracking:update-issue')} title={can('task-tracking:update-issue') ? undefined : t('connections.unavailableCapability')} onClick={() => void changeState('open', 'reopened')}>{t('issues.reopen')}</Button>}
            </div>
          </form>
        </section>

        {error && <p role="alert" className="text-destructive whitespace-pre-wrap text-xs">{error}</p>}
      </div>
      <aside className="issues-detail-aside">
        <h2 className="issues-section-title">{t('issues.properties')}</h2>
        <div className="issues-prop"><span className="issues-prop-label">{t('issues.assignees')}</span><span className="issues-prop-value">{issue.assignees.map(user => user.login).join(', ') || t('issues.none')}</span></div>
        <div className="issues-prop"><span className="issues-prop-label">{t('issues.labels')}</span><span className="issues-prop-value">{issue.labels.length ? issue.labels.map(label => <span key={label.id} className="issues-label-chip"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: /^[a-f\d]{6}$/i.test(label.color) ? `#${label.color}` : undefined }} />{label.name}</span>) : t('issues.none')}</span></div>
        <div className="issues-prop"><span className="issues-prop-label">{t('issues.source')}</span><span className="issues-prop-value">{providerLabel ?? '—'}</span></div>
        <div className="issues-prop"><span className="issues-prop-label">{t('issues.updated')}</span><time className="issues-prop-value" dateTime={issue.updated_at}>{new Date(issue.updated_at).toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'en')}</time></div>

      </aside>
    </div>
    {editing && <IssueEditor scope={scope} issue={issue} onClose={() => setEditing(false)} onSaved={saved => { reads.current++; setLoading(false); setIssue(saved); setEditing(false); setAttempt(value => value + 1); onChanged(); }} />}
    {branchOpen && <CreateBranchModal open onOpenChange={setBranchOpen} defaultBranchName={issueBranchName(issue.identifier ?? number, issue.title)} onCreated={name => { if (repoPath && scope.isCurrent()) useIssueWorkflowStore.getState().linkBranch(repoPath, name, reference); }} />}
    {prOpen && <CreatePullRequestModal open initialIssue={reference} onOpenChange={setPROpen} onCreated={() => { if (valid()) useRepoStore.getState().setActiveTab('pullRequests'); }} />}
  </div>;
}
