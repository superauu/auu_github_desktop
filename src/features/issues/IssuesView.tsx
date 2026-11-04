import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CircleDot, Plus, RefreshCw, Search } from 'lucide-react';
import { useI18n } from '@/i18n';
import { Button } from '@/components/ui/button';
import { ModalSurface } from '@/components/ui/ModalSurface';
import './IssuesView.css';
import type { CollaborationIssue, IssueListOptions } from '@/services/collaboration/issueTypes';
import { issueClientFor, usesTaskProvider } from '@/services/integrations/taskService';
import { useCollaborationStore } from '@/stores/collaborationStore';
import { useIssueWorkflowStore } from '@/stores/issueWorkflowStore';
import { issueKey, mergeIssuePages, type SourcedIssue } from './issueLogic';
import { IssueDetail } from './IssueDetail';
import { IssueEditor } from './IssueEditor';
import { keyboardRowProps } from '@/utils/keyboardNavigation';
import { useIssueSources, readLastCreateSource, rememberCreateSource, type IssueSourceFilter, type IssueSourceScope } from './useIssueSource';


export function IssuesView({ onOpenAuthDialog }: { onOpenAuthDialog?: () => void }) {
  const { t } = useI18n();
  const sources = useIssueSources();
  const available = [sources.repo, sources.task].filter((scope): scope is IssueSourceScope => !!scope);
  // 双空才引导连接；托管已登录但未配远程时给配置远程入口（任务来源可用则直接工作）。
  if (!available.length) {
    const auth = useCollaborationStore.getState().isAuthenticated;
    return <div className="p-6 space-y-3 text-sm"><h1 className="font-semibold">{t('issues.nav')}</h1><p>{auth ? t('issues.noRepo') : t('issues.needAuth')}</p>
      {auth
        ? <Button variant="outline" onClick={() => window.dispatchEvent(new CustomEvent('auugit:open-settings', { detail: 'git' }))}>{t('issues.configureRemote')}</Button>
        : <Button onClick={onOpenAuthDialog}>{t('issues.connect')}</Button>}
    </div>;
  }
  return <IssueWorkspace available={available} />;
}

interface SourcePage { scope: IssueSourceScope; items: CollaborationIssue[]; total: number; error?: string }
type SelectedIssue = { scope: IssueSourceScope; number: number };
type CreateTarget = 'pick' | IssueSourceScope | null;

function IssueWorkspace({ available }: { available: IssueSourceScope[] }) {
  const { t } = useI18n();
  const [filter, setFilter] = useState<IssueSourceFilter>('all');
  const [state, setState] = useState<IssueListOptions['state']>('open'), [query, setQuery] = useState('');
  const [label, setLabel] = useState(''), [assignee, setAssignee] = useState(''), [page, setPage] = useState(1);
  const [pages, setPages] = useState<SourcePage[]>([]);
  const [selected, setSelected] = useState<SelectedIssue | null>(null), [creating, setCreating] = useState<CreateTarget>(null);
  const [loading, setLoading] = useState(true), [attempt, setAttempt] = useState(0);
  const requested = useIssueWorkflowStore(store => store.requestedIssue);
  const activeScopes = useMemo(() => filter === 'all' ? available : available.filter(scope => scope.source === filter), [available, filter]);

  // 修订号：两个来源各自的前缀都纳入（详情页改单后列表即时刷新）。
  const revision = useIssueWorkflowStore(store => Object.entries(store.revisions)
    .filter(([key]) => available.some(scope => key.startsWith(issueKey(scope.source === 'task'
      ? { owner: scope.owner, repo: scope.repo, number: 0, providerId: scope.providerId, server: scope.server }
      : { owner: scope.owner, repo: scope.repo, number: 0 }).replace(/0$/, '')))).reduce((sum, [, value]) => sum + value, 0));

  useEffect(() => {
    if (!requested) return;
    // 引用跳转：任务引用按平台匹配，托管引用按 owner/repo 匹配；选中的行带上对应来源作用域。
    const scope = usesTaskProvider(requested.providerId)
      ? available.find(item => item.source === 'task' && item.providerId === requested.providerId)
      : available.find(item => item.source === 'repo' && requested.owner.toLowerCase() === item.owner.toLowerCase() && requested.repo.toLowerCase() === item.repo.toLowerCase());
    if (scope) { setSelected({ scope, number: requested.number }); useIssueWorkflowStore.getState().openIssue(null); }
  }, [requested, available]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    const timer = setTimeout(() => {
      void Promise.all(activeScopes.map(async (scope) => {
        try {
          const result = await issueClientFor(scope.providerId).searchIssues(scope.owner, scope.repo, { state, query, label, assignee, page });
          return { scope, items: result.items, total: result.total_count } as SourcePage;
        } catch (reason) {
          return { scope, items: [], total: 0, error: String((reason as Error)?.message || reason) } as SourcePage;
        }
      })).then(result => {
        if (!active) return;
        // 单来源失败不拖垮其他来源：失败的来源保留错误条，成功的照常展示。
        setPages(result.filter(page => !page.error || page.items.length || activeScopes.length === 1));
        setLoading(false);
      });
    }, 350);
    return () => { active = false; clearTimeout(timer); };
  }, [activeScopes, state, query, label, assignee, page, attempt, revision]);

  const merged = useMemo(() => mergeIssuePages(pages.map(page => ({ key: page.scope.key, items: page.items }))), [pages]);
  const total = pages.reduce((sum, page) => sum + page.total, 0);
  const failures = pages.filter(page => page.error);
  const scopeByKey = useMemo(() => new Map(available.map(scope => [scope.key, scope])), [available]);
  const refresh = () => setAttempt(value => value + 1);
  const filterUpdate = (update: () => void) => { update(); setPage(1); setSelected(null); };

  const startCreate = () => {
    if (available.length === 1) {
      rememberCreateSource(available[0].source);
      setCreating(available[0]);
      return;
    }
    setCreating('pick');
  };
  const pickCreateTarget = (scope: IssueSourceScope) => {
    rememberCreateSource(scope.source);
    setCreating(scope);
  };
  const lastCreate = readLastCreateSource();

  const row = ({ key, index, issue }: SourcedIssue) => {
    const scope = scopeByKey.get(key);
    if (!scope) return null;
    const isSelected = selected?.scope.key === key && selected.number === issue.number;
    return <div key={`${key}:${index}`} aria-current={isSelected ? 'true' : undefined} className="issues-row" onClick={() => setSelected({ scope, number: issue.number })} {...keyboardRowProps(`#${issue.number} ${issue.title}`)}>
      <div className="issues-row-title"><span className="issues-state-dot" data-state={issue.state} aria-hidden="true" />{issue.title}</div>
      <div className="issues-row-meta"><span>{issue.identifier ?? `#${issue.number}`}</span><span>· {issue.user.login}</span><span>· {t(issue.state === 'open' ? 'issues.open' : 'issues.closed')}</span>
        {available.length > 1 && <span className="issues-row-source" title={scope.label}>{scope.source === 'repo' ? t('issues.sourceRepo') : t('issues.sourceTask')}</span>}</div>
      {!!issue.labels.length && <p className="issues-row-labels">{issue.labels.map(item => item.name).join(' · ')}</p>}
    </div>;
  };

  return <div className="@container flex flex-col h-full min-h-0" data-issues-workspace>
    <header className="app-toolbar">
      <div className="app-toolbar-group">
        <Button variant="ghost" size="icon" className="issues-icon-btn" disabled={loading} aria-label={t('issues.refresh')} title={t('issues.refresh')} onClick={refresh}><RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /></Button>
        <Button size="toolbar" className="" onClick={startCreate}><Plus className="h-3.5 w-3.5" />{t('issues.create')}</Button>
        {available.length > 1 && (
          <select name="issue-source" aria-label={t('issues.source')} className="issues-select" value={filter} onChange={event => filterUpdate(() => setFilter(event.target.value as IssueSourceFilter))}>
            <option value="all">{t('issues.sourceAll')}</option>
            <option value="repo">{t('issues.sourceRepo')}</option>
            <option value="task">{t('issues.sourceTask')}</option>
          </select>
        )}
        <span className="issues-scope" title={activeScopes.map(scope => scope.label).join(' · ')}>{activeScopes.map(scope => scope.label).join(' · ')}</span>
      </div>
      <div className="issues-tools">
        <div className="issues-search"><Search aria-hidden="true" size={13} /><input type="text" name="issue-search" autoComplete="off" spellCheck={false} aria-label={t('issues.search')} placeholder={t('issues.searchHint')} value={query} onChange={event => filterUpdate(() => setQuery(event.target.value))} /></div>
        <select name="issue-state" aria-label={t('issues.state')} className="issues-select" value={state} onChange={event => filterUpdate(() => setState(event.target.value as IssueListOptions['state']))}>{(['open', 'closed', 'all'] as const).map(value => <option key={value} value={value}>{t(`issues.${value}`)}</option>)}</select>
        <input type="text" name="issue-labels" autoComplete="off" spellCheck={false} aria-label={t('issues.labels')} placeholder={t('issues.labels')} className="issues-input" value={label} onChange={event => filterUpdate(() => setLabel(event.target.value))} />
        <input type="text" name="issue-assignees" autoComplete="off" spellCheck={false} aria-label={t('issues.assignees')} placeholder={t('issues.assignees')} className="issues-input" value={assignee} onChange={event => filterUpdate(() => setAssignee(event.target.value))} />
      </div>
    </header>
    <div className="grid grid-cols-1 @[760px]:grid-cols-[280px_minmax(0,1fr)] flex-1 min-h-0">
      <section aria-label={t('issues.list')} className={`${selected ? 'hidden @[760px]:flex' : 'flex'} flex-col min-h-0 border-r border-border`}>
        <div className="flex-1 overflow-y-auto" role="list" data-keyboard-list aria-label={t('issues.list')}>
          {loading && <p role="status" className="issues-note">{t('common.loading')}</p>}
          {!loading && failures.map(page => <div key={`failure:${page.scope.key}`} role="alert" className="issues-note space-y-2"><p>{page.scope.source === 'repo' ? t('issues.sourceRepo') : t('issues.sourceTask')}: {page.error}</p><Button variant="outline" size="xs" onClick={refresh}>{t('remote.retry')}</Button></div>)}
          {!loading && !failures.length && !merged.length && <div className="issues-empty"><CircleDot aria-hidden="true" size={20} /><p>{t('issues.empty')}</p></div>}
          {merged.map(row)}
        </div>
        <footer className="issues-list-footer">
          <div><Button variant="ghost" size="xs" disabled={loading || page <= 1} onClick={() => setPage(value => value - 1)}>{t('issues.previous')}</Button><span>{page} · {total} {t('issues.results')}</span><Button variant="ghost" size="xs" disabled={loading || page * 30 >= Math.min(total, 1000)} onClick={() => setPage(value => value + 1)}>{t('issues.next')}</Button></div>
          {total > 1000 && <p>{t('issues.searchLimit')}</p>}
        </footer>
      </section>
      <section aria-label={t('issues.detail')} className={`${selected ? 'flex' : 'hidden @[760px]:flex'} flex-col min-w-0 min-h-0 overflow-y-auto`}>
        {selected ? <><Button className="@[760px]:hidden shrink-0 m-2 self-start" variant="ghost" size="xs" onClick={() => setSelected(null)}><ArrowLeft className="h-3 w-3 mr-1" />{t('issues.back')}</Button><IssueDetail key={JSON.stringify([selected.scope.key, selected.number])} scope={selected.scope} number={selected.number} onChanged={refresh} /></> : <p className="m-auto p-6 text-xs text-muted-foreground">{t('issues.select')}</p>}
      </section>
    </div>
    {creating === 'pick' && (
      <ModalSurface onDismiss={() => setCreating(null)} dismissible label={t('issues.createTargetTitle')} className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-xs p-3">
        <div className="w-full max-w-md rounded-xl border border-border bg-card p-5 space-y-4 shadow-2xl">
          <div className="space-y-1"><h2 className="text-sm font-semibold">{t('issues.createTargetTitle')}</h2><p className="text-xs text-muted-foreground">{t('issues.createTargetHint')}</p></div>
          <div className="space-y-2">
            {available.map(scope => <Button key={scope.key} variant={lastCreate === scope.source ? 'outline' : 'ghost'} size="sm" className="w-full justify-between" onClick={() => pickCreateTarget(scope)}>
              <span>{scope.source === 'repo' ? t('issues.sourceRepo') : t('issues.sourceTask')}</span>
              <span className="truncate text-[12px] text-muted-foreground">{scope.label}</span>
            </Button>)}
          </div>
          <div className="flex justify-end"><Button type="button" variant="ghost" size="sm" onClick={() => setCreating(null)}>{t('common.cancel')}</Button></div>
        </div>
      </ModalSurface>
    )}
    {creating && creating !== 'pick' && <IssueEditor scope={creating} onClose={() => setCreating(null)} onSaved={issue => { setCreating(null); setSelected({ scope: creating, number: issue.number }); refresh(); }} />}
  </div>;
}
