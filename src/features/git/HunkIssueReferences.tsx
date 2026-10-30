import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/i18n';
import { useRepoStore } from '@/stores/repoStore';
import { useIssueWorkflowStore } from '@/stores/issueWorkflowStore';
import { issueKey, issueUrl } from '@/features/issues/issueLogic';
import type { useCurrentBranchIssue } from '@/features/issues/useCurrentBranchIssue';
import { hunkCommitService, type HunkCommitGroup, type HunkCommitPlan } from '@/services/git/HunkCommitService';
import { proposeHunkIssueReferences } from './hunkIssueReferencePlan';

export function HunkIssueReferences({ plan, groups, task, blocked, onApply, onBlockedChange, onNavigate }: {
  plan: HunkCommitPlan; groups: HunkCommitGroup[]; task: ReturnType<typeof useCurrentBranchIssue>; blocked: boolean;
  onApply: (groups: HunkCommitGroup[]) => void; onBlockedChange: (blocked: boolean) => void; onNavigate: () => void;
}) {
  const { t } = useI18n();
  const reference = task.path === plan.repoPath && task.branch === plan.branch ? task.reference : undefined;
  const key = reference ? issueKey(reference) : '';
  const [selected, setSelected] = useState<string[]>([]);
  const [proposal, setProposal] = useState<ReturnType<typeof proposeHunkIssueReferences> | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const generation = useRef(0), waiting = useRef(false), mounted = useRef(true);
  const origin = useRef<{ groups: HunkCommitGroup[]; key: string; scope: typeof task.scope } | null>(null);
  const invalidate = useCallback(() => { generation.current++; waiting.current = false; origin.current = null; onBlockedChange(false); }, [onBlockedChange]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; invalidate(); }; }, [invalidate]);
  useEffect(() => {
    const interrupted = waiting.current;
    invalidate(); setBusy(false); setProposal(null); setError('');
    setSelected(previous => previous.filter(id => groups.some(group => group.id === id)));
    if (interrupted) setNotice(t('hunkIssue.changed'));
  }, [plan, groups, key, task.scope, invalidate, t]);
  const preview = () => {
    if (!reference || blocked || waiting.current || !selected.length) return;
    setError(''); setNotice('');
    try {
      const result = proposeHunkIssueReferences(groups, selected, reference);
      if (!result.changed.length) { setNotice(t('hunkIssue.already')); return; }
      origin.current = { groups, key, scope: task.scope }; waiting.current = true; onBlockedChange(true); setProposal(result);
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
  };
  const apply = async () => {
    const source = origin.current;
    if (!reference || !proposal || !source || blocked || busy) return;
    const id = ++generation.current; setBusy(true); setError('');
    try {
      await hunkCommitService.verify(plan);
      if (!mounted.current || id !== generation.current) return;
      const repo = useRepoStore.getState();
      const linked = useIssueWorkflowStore.getState().issueForBranch(plan.repoPath, plan.branch);
      if (repo.currentRepo?.path !== plan.repoPath || (repo.currentRepo?.currentBranch || repo.status?.currentBranch) !== plan.branch
        || !linked || issueKey(linked) !== source.key || !source.scope.isCurrent() || source.groups !== groups) throw new Error(t('hunkIssue.changed'));
      waiting.current = false; origin.current = null; setProposal(null); onBlockedChange(false);
      onApply(proposal.groups.map(group => ({ ...group, units: [...group.units] }))); setNotice(t('hunkIssue.applied'));
    } catch (reason) {
      if (mounted.current && id === generation.current) { invalidate(); setProposal(null); setError(reason instanceof Error ? reason.message : String(reason)); }
    } finally { if (mounted.current && (id === generation.current || !waiting.current)) setBusy(false); }
  };
  if (!reference) return <p className="text-xs text-muted-foreground">{t('hunkIssue.noTask')}</p>;
  const sameRepo = reference.owner.toLowerCase() === task.scope.owner?.toLowerCase() && reference.repo.toLowerCase() === task.scope.repo?.toLowerCase();
  return <section aria-label={t('hunkIssue.title')} className="border border-border rounded-lg p-3 space-y-3">
    <h3 className="font-medium text-sm">{t('hunkIssue.title')}</h3>
    <p className="text-sm break-all">{key}{task.issue ? ` · ${task.issue.title}` : ''}{task.issue && <span className="ml-2 text-xs text-muted-foreground">{t(task.issue.state === 'open' ? 'issues.open' : 'issues.closed')}</span>}</p>
    {task.loading && <p role="status" className="text-xs">{t('common.loading')}</p>}
    {task.error && <p role="alert" className="text-xs text-destructive break-all">{task.error}</p>}
    {task.issue?.body && <details className="text-xs"><summary className="cursor-pointer min-h-7">{t('issueFlow.background')}</summary><pre className="max-h-36 overflow-auto whitespace-pre-wrap wrap-break-word select-text">{task.issue.body.slice(0, 2000)}{task.issue.body.length > 2000 ? '…' : ''}</pre></details>}
    <div className="flex flex-wrap gap-2">{sameRepo ? <Button size="xs" variant="outline" disabled={blocked || busy || !!proposal} onClick={() => { useIssueWorkflowStore.getState().openIssue(reference); useRepoStore.getState().setActiveTab('issues'); onNavigate(); }}>{t('hunkIssue.view')}</Button> : <a href={issueUrl(reference)} target="_blank" rel="noreferrer" className="text-xs text-primary underline">{t('hunkIssue.view')} ↗</a>}
      <Button size="xs" variant="outline" disabled={!task.scope.isAuthenticated || task.loading || blocked || busy || !!proposal} onClick={() => useIssueWorkflowStore.getState().refreshIssues([reference])}>{t('issues.refresh')}</Button></div>
    <p className="text-xs text-muted-foreground">{t('hunkIssue.scope')}</p>
    <fieldset disabled={blocked || busy || !!proposal} className="min-w-0 space-y-2"><legend className="text-xs mb-2">{t('hunkIssue.select')}</legend>{groups.map((group, index) => <label key={group.id} className="flex items-start gap-2 text-xs"><input type="checkbox" className="shrink-0" checked={selected.includes(group.id)} onChange={event => setSelected(previous => event.target.checked ? [...previous, group.id] : previous.filter(id => id !== group.id))} /><span className="min-w-0 break-all">{index + 1}. {group.title || t('hunkPlan.subject')}</span></label>)}</fieldset>
    <Button size="sm" variant="outline" disabled={blocked || busy || !!proposal || !selected.length} onClick={preview}>{t('hunkIssue.preview')}</Button>
    {notice && <p role="status" className="text-xs text-muted-foreground">{notice}</p>}
    {error && <p role="alert" className="text-xs text-destructive wrap-break-word">{error}</p>}
    {proposal && <section aria-label={t('hunkIssue.previewTitle')} className="space-y-3">
      <p className="text-xs text-muted-foreground">{t('hunkIssue.previewHint')}</p>
      {proposal.groups.filter(group => proposal.changed.includes(group.id)).map(group => <pre key={group.id} className="text-xs whitespace-pre-wrap wrap-break-word max-h-52 overflow-auto select-text bg-muted rounded-md p-3">{group.title}{'\n\n'}{group.body}</pre>)}
      <div className="flex flex-wrap gap-2"><Button size="sm" disabled={blocked || busy} onClick={() => void apply()}>{t('hunkIssue.apply')}</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => { invalidate(); setProposal(null); setError(''); }}>{t('hunkIssue.cancel')}</Button></div>
      {busy && <p role="status" className="text-xs">{t('hunkAi.applying')}</p>}
    </section>}
  </section>;
}
