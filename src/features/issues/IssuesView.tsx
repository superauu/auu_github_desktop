import { useEffect, useState } from 'react';
import { ArrowLeft, CircleDot, Plus, RefreshCw, Search } from 'lucide-react';
import { useI18n } from '@/i18n';
import { Button } from '@/components/ui/button';
import './IssuesView.css';
import { githubService } from '@/services/github/GitHubService';
import type { GitHubIssue, IssueListOptions } from '@/services/github/issueTypes';
import { useIssueWorkflowStore } from '@/stores/issueWorkflowStore';
import { useRepoStore } from '@/stores/repoStore';
import { useGitHubScope } from './useGitHubScope';
import { IssueDetail } from './IssueDetail';
import { IssueEditor } from './IssueEditor';
import { keyboardRowProps } from '@/utils/keyboardNavigation';

export function IssuesView({ onOpenAuthDialog }: { onOpenAuthDialog?: () => void }) {
  const { t } = useI18n(), scope = useGitHubScope();
  const path = useRepoStore(state => state.currentRepo?.path);
  if (!scope.isAuthenticated) return <div className="p-6 space-y-3 text-sm"><h1 className="font-semibold">{t('issues.nav')}</h1><p>{t('issues.needAuth')}</p><Button onClick={onOpenAuthDialog}>{t('issues.connect')}</Button></div>;
  if (!scope.owner || !scope.repo) return <div className="p-6 space-y-3 text-sm"><h1 className="font-semibold">{t('issues.nav')}</h1><p>{t('issues.noRepo')}</p><Button variant="outline" onClick={() => window.dispatchEvent(new CustomEvent('auugit:open-settings', { detail: 'git' }))}>{t('issues.configureRemote')}</Button></div>;
  return <IssueWorkspace key={JSON.stringify([scope.key, path])} />;
}

function IssueWorkspace() {
  const { t } = useI18n(), scope = useGitHubScope();
  const [state, setState] = useState<IssueListOptions['state']>('open'), [query, setQuery] = useState('');
  const [label, setLabel] = useState(''), [assignee, setAssignee] = useState(''), [page, setPage] = useState(1);
  const [items, setItems] = useState<GitHubIssue[]>([]), [total, setTotal] = useState(0), [incomplete, setIncomplete] = useState(false);
  const [selected, setSelected] = useState<number | null>(null), [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [attempt, setAttempt] = useState(0);
  const requested = useIssueWorkflowStore(store => store.requestedIssue);
  const revision = useIssueWorkflowStore(store => Object.entries(store.revisions)
    .filter(([key]) => key.startsWith(`${scope.owner}/${scope.repo}#`.toLowerCase())).reduce((sum, [, value]) => sum + value, 0));
  useEffect(() => {
    if (!requested || requested.owner.toLowerCase() !== scope.owner?.toLowerCase() || requested.repo.toLowerCase() !== scope.repo?.toLowerCase()) return;
    setSelected(requested.number); useIssueWorkflowStore.getState().openIssue(null);
  }, [requested, scope]);
  useEffect(() => {
    let active = true;
    setLoading(true); setError(''); setItems([]);
    const timer = setTimeout(() => {
      void githubService.searchIssues(scope.owner!, scope.repo!, { state, query, label, assignee, page }).then(result => {
        if (!active || !scope.isCurrent()) return;
        setItems(result.items); setTotal(result.total_count); setIncomplete(result.incomplete_results);
      }).catch(reason => { if (active && scope.isCurrent()) setError(String(reason?.message || reason)); })
        .finally(() => { if (active && scope.isCurrent()) setLoading(false); });
    }, 350);
    return () => { active = false; clearTimeout(timer); };
  }, [scope, state, query, label, assignee, page, attempt, revision]);
  const refresh = () => setAttempt(value => value + 1);
  const filter = (update: () => void) => { update(); setPage(1); setSelected(null); };
  return <div className="@container flex flex-col h-full min-h-0" data-issues-workspace>
    <header className="app-toolbar">
      <div className="app-toolbar-group">
        <Button variant="ghost" size="icon" className="issues-icon-btn" disabled={loading} aria-label={t('issues.refresh')} title={t('issues.refresh')} onClick={refresh}><RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /></Button>
        <Button size="toolbar" className="" onClick={() => setCreating(true)}><Plus className="h-3.5 w-3.5" />{t('issues.create')}</Button>
        <span className="issues-scope" title={`${scope.owner}/${scope.repo}`}>{scope.owner}/{scope.repo}</span>
      </div>
      <div className="issues-tools">
        <div className="issues-search"><Search aria-hidden="true" size={13} /><input type="text" name="issue-search" autoComplete="off" spellCheck={false} aria-label={t('issues.search')} placeholder={t('issues.searchHint')} value={query} onChange={event => filter(() => setQuery(event.target.value))} /></div>
        <select aria-label={t('issues.state')} className="issues-select" value={state} onChange={event => filter(() => setState(event.target.value as IssueListOptions['state']))}>{(['open', 'closed', 'all'] as const).map(value => <option key={value} value={value}>{t(`issues.${value}`)}</option>)}</select>
        <input type="text" name="issue-labels" autoComplete="off" spellCheck={false} aria-label={t('issues.labels')} placeholder={t('issues.labels')} className="issues-input" value={label} onChange={event => filter(() => setLabel(event.target.value))} />
        <input type="text" name="issue-assignees" autoComplete="off" spellCheck={false} aria-label={t('issues.assignees')} placeholder={t('issues.assignees')} className="issues-input" value={assignee} onChange={event => filter(() => setAssignee(event.target.value))} />
      </div>
    </header>
    <div className="grid grid-cols-1 @[760px]:grid-cols-[280px_minmax(0,1fr)] flex-1 min-h-0">
      <section aria-label={t('issues.list')} className={`${selected ? 'hidden @[760px]:flex' : 'flex'} flex-col min-h-0 border-r border-border`}>
        <div className="flex-1 overflow-y-auto" role="list" data-keyboard-list aria-label={t('issues.list')}>
          {loading && <p role="status" className="issues-note">{t('common.loading')}</p>}
          {error && <div role="alert" className="issues-note space-y-2"><p>{error}</p><Button variant="outline" size="xs" onClick={refresh}>{t('remote.retry')}</Button></div>}
          {!loading && !error && !items.length && <div className="issues-empty"><CircleDot aria-hidden="true" size={20} /><p>{t('issues.empty')}</p></div>}
          {items.map(issue => <div key={issue.id} aria-current={selected === issue.number ? 'true' : undefined} className="issues-row" onClick={() => setSelected(issue.number)} {...keyboardRowProps(`#${issue.number} ${issue.title}`)}>
            <div className="issues-row-title"><span className="issues-state-dot" data-state={issue.state} aria-hidden="true" />{issue.title}</div>
            <div className="issues-row-meta"><span>#{issue.number}</span><span>· {issue.user.login}</span><span>· {t(issue.state === 'open' ? 'issues.open' : 'issues.closed')}</span></div>
            {!!issue.labels.length && <p className="issues-row-labels">{issue.labels.map(item => item.name).join(' · ')}</p>}
          </div>)}
        </div>
        <footer className="issues-list-footer">
          <div><Button variant="ghost" size="xs" disabled={loading || page <= 1} onClick={() => setPage(value => value - 1)}>{t('issues.previous')}</Button><span>{page} · {total} {t('issues.results')}</span><Button variant="ghost" size="xs" disabled={loading || page * 30 >= Math.min(total, 1000)} onClick={() => setPage(value => value + 1)}>{t('issues.next')}</Button></div>
          {(incomplete || total > 1000) && <p>{t('issues.searchLimit')}</p>}
        </footer>
      </section>
      <section aria-label={t('issues.detail')} className={`${selected ? 'flex' : 'hidden @[760px]:flex'} flex-col min-w-0 min-h-0 overflow-y-auto`}>
        {selected ? <><Button className="@[760px]:hidden shrink-0 m-2 self-start" variant="ghost" size="xs" onClick={() => setSelected(null)}><ArrowLeft className="h-3 w-3 mr-1" />{t('issues.back')}</Button><IssueDetail key={JSON.stringify([scope.key, selected])} number={selected} onChanged={refresh} /></> : <p className="m-auto p-6 text-xs text-muted-foreground">{t('issues.select')}</p>}
      </section>
    </div>
    {creating && <IssueEditor onClose={() => setCreating(false)} onSaved={issue => { setCreating(false); setSelected(issue.number); refresh(); }} />}
  </div>;
}
