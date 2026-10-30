import { CircleDot, RefreshCw, Unlink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/i18n';
import { useRepoStore } from '@/stores/repoStore';
import { useIssueWorkflowStore } from '@/stores/issueWorkflowStore';
import { issueKey, issueUrl } from './issueLogic';
import { useCurrentBranchIssue } from './useCurrentBranchIssue';

export function CurrentBranchIssue() {
  const { t } = useI18n();
  const { path, branch, reference, scope, issue, error, loading } = useCurrentBranchIssue();
  if (!reference || !path || !branch) return null;
  const sameRepo = reference.owner.toLowerCase() === scope.owner?.toLowerCase() && reference.repo.toLowerCase() === scope.repo?.toLowerCase();
  const label = `${issueKey(reference)}${issue ? ` · ${issue.title}` : ''}`;
  return <section aria-label={t('issueFlow.currentTask')} className="flex items-center gap-2 shrink-0 min-w-0 px-3 py-1 border-b border-border bg-primary/5 text-xs" data-current-issue={issueKey(reference)}>
    <CircleDot className="h-3.5 w-3.5 shrink-0 text-git-added" /><span className="shrink-0 text-muted-foreground">{t('issueFlow.currentTask')}</span>
    {sameRepo ? <button className="truncate text-primary text-left min-w-0" title={label} onClick={() => { useIssueWorkflowStore.getState().openIssue(reference); useRepoStore.getState().setActiveTab('issues'); }}>{label}</button>
      : <a className="truncate text-primary min-w-0" href={issueUrl(reference)} target="_blank" rel="noreferrer" title={label}>{label} ↗</a>}
    {issue && <span className="shrink-0 text-muted-foreground">{t(issue.state === 'open' ? 'issues.open' : 'issues.closed')}</span>}
    {loading && <span role="status" className="text-muted-foreground">{t('common.loading')}</span>}
    {error && <span className="truncate text-destructive" title={error}>{error}</span>}
    <div className="ml-auto flex shrink-0 gap-1">
      <Button size="xs" variant="ghost" aria-label={t('issues.refresh')} disabled={loading} onClick={() => useIssueWorkflowStore.getState().refreshIssues([reference])}><RefreshCw className="h-3 w-3" /></Button>
      <Button size="xs" variant="ghost" aria-label={t('issueFlow.unlinkBranch')} title={t('issueFlow.localLinkHint')} onClick={() => useIssueWorkflowStore.getState().unlinkBranch(path, branch)}><Unlink className="h-3 w-3" /></Button>
    </div>
  </section>;
}
