import { useEffect, useId, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { ModalSurface } from '@/components/ui/ModalSurface';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/i18n';
import { githubService } from '@/services/github/GitHubService';
import type { GitHubIssue, GitHubLabel, IssueUser } from '@/services/github/issueTypes';
import { useGitHubScope } from './useGitHubScope';
import { toast } from '@/stores/toastStore';

export function IssueEditor({ issue, onClose, onSaved }: { issue?: GitHubIssue; onClose: () => void; onSaved: (issue: GitHubIssue) => void }) {
  const { t } = useI18n(), scope = useGitHubScope(), id = useId();
  const [title, setTitle] = useState(issue?.title || ''), [body, setBody] = useState(issue?.body || '');
  const [labels, setLabels] = useState(issue?.labels.map(label => label.name) || []);
  const [assignees, setAssignees] = useState(issue?.assignees.map(user => user.login) || []);
  const [availableLabels, setAvailableLabels] = useState<GitHubLabel[]>(issue?.labels || []);
  const [availableUsers, setAvailableUsers] = useState<IssueUser[]>(issue?.assignees || []);
  const [loadingMetadata, setLoadingMetadata] = useState(true), [metadataError, setMetadataError] = useState('');
  const [submitting, setSubmitting] = useState(false), [error, setError] = useState(''), [attempt, setAttempt] = useState(0);
  const mounted = useRef(true), sending = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    let active = true;
    if (!scope.owner || !scope.repo) return;
    setLoadingMetadata(true); setMetadataError('');
    void Promise.allSettled([githubService.getIssueLabels(scope.owner, scope.repo), githubService.getIssueAssignees(scope.owner, scope.repo)]).then(([labelResult, userResult]) => {
      if (!active || !scope.isCurrent()) return;
      if (labelResult.status === 'fulfilled') setAvailableLabels(previous => [...new Map([...previous, ...labelResult.value].map(label => [label.name, label])).values()]);
      if (userResult.status === 'fulfilled') setAvailableUsers(previous => [...new Map([...previous, ...userResult.value].map(user => [user.login, user])).values()]);
      const failure = [labelResult, userResult].find(result => result.status === 'rejected');
      if (failure?.status === 'rejected') setMetadataError(String(failure.reason?.message || failure.reason));
      setLoadingMetadata(false);
    });
    return () => { active = false; };
  }, [scope, attempt]);
  const toggle = (values: string[], value: string) => values.includes(value) ? values.filter(item => item !== value) : [...values, value];
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (sending.current || !title.trim() || !scope.owner || !scope.repo || !scope.isCurrent()) return;
    sending.current = true; setSubmitting(true); setError('');
    try {
      const input = { title: title.trim(), body, labels, assignees };
      const saved = issue ? await githubService.updateIssue(scope.owner, scope.repo, issue.number, input) : await githubService.createIssue(scope.owner, scope.repo, input);
      if (mounted.current && scope.isCurrent()) {
        const normalized = (values: string[]) => [...values].map(value => value.toLowerCase()).sort().join('\0');
        if (normalized(labels) !== normalized(saved.labels.map(label => label.name)) || normalized(assignees) !== normalized(saved.assignees.map(user => user.login))) toast.warning(t('issues.metadataNotApplied'));
        onSaved(saved);
      }
    } catch (reason) { if (mounted.current && scope.isCurrent()) setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { sending.current = false; if (mounted.current && scope.isCurrent()) setSubmitting(false); }
  };
  return <ModalSurface onDismiss={onClose} dismissible={!submitting} label={t(issue ? 'issues.edit' : 'issues.create')} className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-xs p-3">
    <form onSubmit={submit} className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-xl border border-border bg-card p-5 space-y-4 shadow-2xl">
      <div className="flex items-center justify-between gap-3"><h2 className="text-sm font-semibold">{t(issue ? 'issues.edit' : 'issues.create')}</h2><Button type="button" variant="ghost" size="icon" aria-label={t('common.close')} onClick={onClose} disabled={submitting}><X className="h-4 w-4" /></Button></div>
      <p className="text-xs text-muted-foreground">{scope.owner}/{scope.repo}{issue ? ` #${issue.number}` : ''}</p>
      <fieldset disabled={submitting} className="space-y-4 min-w-0">
        <label className="block space-y-1 text-xs" htmlFor={`${id}-title`}><span>{t('issues.title')}</span><Input id={`${id}-title`} value={title} maxLength={256} onChange={event => setTitle(event.target.value)} required autoFocus /></label>
        <label className="block space-y-1 text-xs" htmlFor={`${id}-body`}><span>{t('issues.description')}</span><textarea id={`${id}-body`} value={body} onChange={event => setBody(event.target.value)} rows={7} className="w-full rounded-lg border border-input bg-background p-2 text-xs font-mono resize-y" /></label>
        {loadingMetadata && <p role="status" className="text-xs text-muted-foreground">{t('common.loading')}</p>}
        {metadataError && <div role="alert" className="text-xs text-destructive">{metadataError} <Button type="button" size="xs" variant="outline" onClick={() => setAttempt(value => value + 1)}>{t('remote.retry')}</Button></div>}
        <div role="group" aria-label={t('issues.labels')} className="space-y-2"><p className="text-xs font-medium">{t('issues.labels')}</p><div className="flex flex-wrap gap-2 max-h-28 overflow-y-auto">
          {availableLabels.map(label => <label key={label.name} className="flex items-center gap-1.5 text-xs rounded border border-border px-2 py-1"><input type="checkbox" checked={labels.includes(label.name)} onChange={() => setLabels(toggle(labels, label.name))} /><span>{label.name}</span></label>)}
          {!loadingMetadata && !availableLabels.length && <span className="text-xs text-muted-foreground">{t('issues.none')}</span>}
        </div></div>
        <div role="group" aria-label={t('issues.assignees')} className="space-y-2"><p className="text-xs font-medium">{t('issues.assignees')}</p><div className="flex flex-wrap gap-2 max-h-28 overflow-y-auto">
          {availableUsers.map(user => <label key={user.login} className="flex items-center gap-1.5 text-xs rounded border border-border px-2 py-1"><input type="checkbox" checked={assignees.includes(user.login)} disabled={!assignees.includes(user.login) && assignees.length >= 10} onChange={() => setAssignees(toggle(assignees, user.login))} />{user.login}</label>)}
          {!loadingMetadata && !availableUsers.length && <span className="text-xs text-muted-foreground">{t('issues.none')}</span>}
        </div></div>
      </fieldset>
      {error && <p role="alert" className="text-xs text-destructive whitespace-pre-wrap">{error}</p>}
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" size="sm" onClick={onClose} disabled={submitting}>{t('common.cancel')}</Button><Button type="submit" size="sm" disabled={submitting || !title.trim()}>{t(submitting ? 'issues.saving' : 'issues.save')}</Button></div>
    </form>
  </ModalSurface>;
}
