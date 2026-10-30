import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/i18n';
import { githubService } from '@/services/github/GitHubService';
import type { GitHubIssue, IssueReference } from '@/services/github/issueTypes';
import { issueKey } from './issueLogic';
import { useGitHubScope } from './useGitHubScope';

export function IssuePicker({ selected, onChange, disabled }: { selected: IssueReference[]; onChange: (issues: IssueReference[]) => void; disabled: boolean }) {
  const { t } = useI18n(), scope = useGitHubScope();
  const [query, setQuery] = useState(''), [items, setItems] = useState<GitHubIssue[]>([]), [error, setError] = useState('');
  const [loading, setLoading] = useState(true), [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    if (!scope.owner || !scope.repo) return;
    setLoading(true); setError(''); setItems([]);
    const timer = setTimeout(() => {
      void githubService.searchIssues(scope.owner!, scope.repo!, { state: 'open', query, label: '', assignee: '', page: 1 })
        .then(result => { if (active && scope.isCurrent()) setItems(result.items); })
        .catch(reason => { if (active && scope.isCurrent()) setError(String(reason?.message || reason)); })
        .finally(() => { if (active && scope.isCurrent()) setLoading(false); });
    }, 300);
    return () => { active = false; clearTimeout(timer); };
  }, [scope, query, attempt]);
  return <fieldset disabled={disabled} className="space-y-2 rounded-lg border border-border p-3">
    <legend className="text-xs font-semibold px-1">{t('issues.linkIssues')}</legend>
    <div className="flex flex-wrap gap-1">{selected.map(issue => <Button type="button" key={issueKey(issue)} variant="outline" size="xs" aria-label={`${t('issues.unlink')} ${issueKey(issue)}`} onClick={() => onChange(selected.filter(item => issueKey(item) !== issueKey(issue)))}>{issueKey(issue)} ×</Button>)}</div>
    <Input aria-label={t('issues.search')} placeholder={t('issues.search')} value={query} onChange={event => setQuery(event.target.value)} />
    <div className="max-h-28 overflow-y-auto space-y-1">
      {items.map(issue => { const reference = { owner: scope.owner!, repo: scope.repo!, number: issue.number }; return <label key={issue.id} className="flex items-start gap-2 text-xs p-1"><input type="checkbox" checked={selected.some(item => issueKey(item) === issueKey(reference))} onChange={event => onChange(event.target.checked ? [...selected, reference] : selected.filter(item => issueKey(item) !== issueKey(reference)))} /><span>#{issue.number} {issue.title}</span></label>; })}
      {loading && <p role="status" className="text-xs text-muted-foreground">{t('common.loading')}</p>}
      {!loading && !items.length && !error && <p className="text-xs text-muted-foreground">{t('issues.empty')}</p>}
    </div>
    {error && <p role="alert" className="text-xs text-destructive">{error} <Button type="button" size="xs" variant="outline" onClick={() => setAttempt(value => value + 1)}>{t('remote.retry')}</Button></p>}
    <p className="text-[11px] text-muted-foreground">{t('issues.closingHint')}</p>
  </fieldset>;
}
