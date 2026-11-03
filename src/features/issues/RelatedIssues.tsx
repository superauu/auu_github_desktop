import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/i18n';
import type { CollaborationIssue, IssueReference } from '@/services/collaboration/issueTypes';
import { issueClientFor } from '@/services/integrations/taskService';
import { useIssueWorkflowStore } from '@/stores/issueWorkflowStore';
import { useRepoStore } from '@/stores/repoStore';
import { issueLabel, issueKey, issueReferences, issueUrl } from './issueLogic';
import { useCollaborationScope } from './useCollaborationScope';
import { useCollaborationCapabilities } from '@/features/integrations/useCollaborationCapabilities';

/** References are read from the PR description; actual state comes from the selected task plugin. */
export function RelatedIssues({ body, owner, repo }: { body: string | null; owner: string; repo: string }) {
  const { t } = useI18n(), scope = useCollaborationScope();
  const { can } = useCollaborationCapabilities();
  const canRead = can('task-tracking:issue-detail');
  const references = useMemo(() => issueReferences(body, owner, repo), [body, owner, repo]);
  const revision = useIssueWorkflowStore(state => references.reduce((sum, reference) => sum + (state.revisions[issueKey(reference)] || 0), 0));
  const [issues, setIssues] = useState<{ reference: IssueReference; issue?: CollaborationIssue; error?: string }[]>([]);
  const [loading, setLoading] = useState(false), [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    if (!canRead) { setIssues([]); setLoading(false); return; }
    setIssues([]); setLoading(!!references.length);
    // 按引用路由：任务引用走任务通道（后续 Linear URL 解析接入后生效），托管走协作通道。
    void Promise.all(references.map(async reference => {
      try { return { reference, issue: await issueClientFor(reference.providerId).getIssue(reference.owner, reference.repo, reference.number) }; }
      catch (reason) { return { reference, error: reason instanceof Error ? reason.message : String(reason) }; }
    })).then(result => { if (active && scope.isCurrent()) { setIssues(result); setLoading(false); } });
    return () => { active = false; };
  }, [references, scope, attempt, revision, canRead]);
  if (!references.length || !canRead) return null;
  return <section className="space-y-2 text-xs" aria-label={t('issues.relatedIssues')}><h3 className="font-semibold">{t('issues.relatedIssues')}</h3><p className="text-muted-foreground text-[11px]">{t('issues.descriptionReferences')}</p>
    {loading && <p role="status">{t('common.loading')}</p>}
    {issues.map(({ reference, issue, error }) => {
      const sameRepo = reference.owner.toLowerCase() === scope.owner?.toLowerCase() && reference.repo.toLowerCase() === scope.repo?.toLowerCase();
      return <div key={issueKey(reference)} className="rounded-lg border border-border p-2 space-y-1">
        {sameRepo && issue ? <button className="text-primary text-left break-words" onClick={() => { useIssueWorkflowStore.getState().openIssue(reference); useRepoStore.getState().setActiveTab('issues'); }}>{issueLabel(reference)} · {issue.title}</button> : <a className="text-primary" href={issueUrl(reference)} target="_blank" rel="noreferrer">{issueLabel(reference)} ↗</a>}
        {issue && <p className="text-muted-foreground">{t(issue.state === 'open' ? 'issues.open' : 'issues.closed')}</p>}
        {error && <p className="text-destructive">{error}</p>}
      </div>;
    })}
    <Button size="xs" variant="ghost" disabled={loading} onClick={() => setAttempt(value => value + 1)}>{t('issues.refresh')}</Button>
  </section>;
}
