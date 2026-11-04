import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, CircleCheck, CircleDot, MessageSquare, Plus, RefreshCw, RotateCcw, Search, SlidersHorizontal } from 'lucide-react';
import { useI18n } from '@/i18n';
import { Button } from '@/components/ui/button';
import { ModalSurface } from '@/components/ui/ModalSurface';
import './IssuesView.css';
import type { IssueListOptions } from '@/services/collaboration/issueTypes';
import { usesTaskProvider } from '@/services/integrations/taskService';
import { useCollaborationStore } from '@/stores/collaborationStore';
import { useIssueWorkflowStore } from '@/stores/issueWorkflowStore';
import { issueKey, mergeIssuePages, type SourcedIssue } from './issueLogic';
import { IssueDetail } from './IssueDetail';
import { IssueEditor } from './IssueEditor';
import { handleRowKeyDown } from '@/utils/keyboardNavigation';
import { useIssueSources, readLastCreateSource, rememberCreateSource, type IssueSourceFilter, type IssueSourceScope } from './useIssueSource';
import { useIssueList } from './useIssueList';


export function IssuesView({ onOpenAuthDialog }: { onOpenAuthDialog?: () => void }) {
  const { t } = useI18n();
  const sources = useIssueSources();
  // 必须 useMemo：外部变更轮询（约 10s）会让整棵树重渲染，新建数组会击穿
  // activeScopes 的依赖并把「拉取效应」变成每轮询一次的定时刷新。
  const available = useMemo(() => [sources.repo, sources.task].filter((scope): scope is IssueSourceScope => !!scope), [sources.repo, sources.task]);
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

type SelectedIssue = { scope: IssueSourceScope; number: number };
type CreateTarget = 'pick' | IssueSourceScope | null;

function IssueWorkspace({ available }: { available: IssueSourceScope[] }) {
  const { t, lang } = useI18n();
  const [showFilters, setShowFilters] = useState(false);
  const [filter, setFilter] = useState<IssueSourceFilter>('all');
  const [state, setState] = useState<IssueListOptions['state']>('open'), [query, setQuery] = useState('');
  const [label, setLabel] = useState(''), [assignee, setAssignee] = useState('');
  const [selected, setSelected] = useState<SelectedIssue | null>(null), [creating, setCreating] = useState<CreateTarget>(null);
  const [attempt, setAttempt] = useState(0);
  // 列表列宽可拖拽（持久化）；与根组件的分栏一致使用指针捕获，拖拽中不写存储。
  const [listWidth, setListWidth] = useState<number>(() => {
    try {
      const raw = Number(localStorage.getItem('auugit_issue_list_width'));
      return Number.isFinite(raw) && raw >= 220 && raw <= 640 ? raw : 320;
    } catch { return 320; }
  });
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const beginResize = (event: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = { startX: event.clientX, startWidth: listWidth };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const moveResize = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    setListWidth(Math.min(640, Math.max(220, drag.startWidth + (event.clientX - drag.startX))));
  };
  const endResize = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    try { localStorage.setItem('auugit_issue_list_width', String(listWidth)); } catch { /* storage unavailable */ }
    try { event.currentTarget.releasePointerCapture(event.pointerId); } catch { /* pointer already released */ }
  };
  const requested = useIssueWorkflowStore(store => store.requestedIssue);
  const activeScopes = useMemo(() => filter === 'all' ? available : available.filter(scope => scope.source === filter), [available, filter]);

  // 修订号：两个来源各自的前缀都纳入（详情页改单后列表即时刷新）。
  const revision = useIssueWorkflowStore(store => Object.entries(store.revisions)
    .filter(([key]) => available.some(scope => key.startsWith(issueKey(scope.source === 'task'
      ? { owner: scope.owner, repo: scope.repo, number: 0, providerId: scope.providerId, server: scope.server }
      : { owner: scope.owner, repo: scope.repo, number: 0 }).replace(/0$/, '')))).reduce((sum, [, value]) => sum + value, 0));
  const { pages, loading, hasMore, incomplete, loadMore, retryFailed } = useIssueList(activeScopes, { state, query, label, assignee }, attempt + revision);
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (listRef.current) listRef.current.scrollTop = 0; }, [activeScopes, state, query, label, assignee]);

  useEffect(() => {
    if (!requested) return;
    // 引用跳转：任务引用按平台匹配，托管引用按 owner/repo 匹配；选中的行带上对应来源作用域。
    const scope = usesTaskProvider(requested.providerId)
      ? available.find(item => item.source === 'task' && item.providerId === requested.providerId)
      : available.find(item => item.source === 'repo' && requested.owner.toLowerCase() === item.owner.toLowerCase() && requested.repo.toLowerCase() === item.repo.toLowerCase());
    if (scope) { setSelected({ scope, number: requested.number }); useIssueWorkflowStore.getState().openIssue(null); }
  }, [requested, available]);

  const merged = useMemo(() => mergeIssuePages(pages.map(page => ({ key: page.scope.key, items: page.items }))), [pages]);
  const total = pages.reduce((sum, page) => sum + page.total, 0);
  const failures = pages.filter(page => page.error);
  const scopeByKey = useMemo(() => new Map(available.map(scope => [scope.key, scope])), [available]);
  const refresh = () => setAttempt(value => value + 1);
  const filterUpdate = (update: () => void) => { update(); setSelected(null); };
  const hasFilters = !!(query || label || assignee || filter !== 'all' || state !== 'open');
  const clearFilters = () => filterUpdate(() => { setQuery(''); setLabel(''); setAssignee(''); setFilter('all'); setState('open'); });
  const dateFormat = useMemo(() => new Intl.DateTimeFormat(lang === 'zh' ? 'zh-CN' : 'en', { month: 'short', day: 'numeric' }), [lang]);
  const formatDate = (value: string) => Number.isNaN(Date.parse(value)) ? '—' : dateFormat.format(new Date(value));

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

  const row = ({ key, issue }: SourcedIssue) => {
    const scope = scopeByKey.get(key);
    if (!scope) return null;
    const isSelected = selected?.scope.key === key && selected.number === issue.number;
    const StateIcon = issue.state === 'open' ? CircleDot : CircleCheck;
    const accessibleName = `${issue.identifier ?? `#${issue.number}`} ${issue.title}`;
    return <div key={`${key}:${issue.number}`} role="listitem" aria-label={accessibleName}><button type="button" aria-label={accessibleName} aria-current={isSelected ? 'true' : undefined} className="issues-row" onClick={() => setSelected({ scope, number: issue.number })} data-keyboard-row onKeyDown={handleRowKeyDown}>
      <span className="issues-row-heading">
        <span className="issues-row-title"><StateIcon className="issues-row-state" data-state={issue.state} size={14} aria-label={t(issue.state === 'open' ? 'issues.open' : 'issues.closed')} /><span className="issues-row-title-text" title={issue.title}>{issue.title}</span></span>
        {(issue.comments > 0 || issue.assignees.length > 0) && <span className="issues-row-activity">
          {issue.comments > 0 && <span className="issues-row-comments" title={t('issues.comments')}><MessageSquare size={12} aria-hidden="true" />{issue.comments}</span>}
          {issue.assignees.length > 0 && <span className="issues-row-avatar" title={`${t('issues.assignees')}: ${issue.assignees.map(user => user.login).join(', ')}`}>{issue.assignees[0].login.slice(0, 2).toUpperCase()}</span>}
        </span>}
      </span>
      <span className="issues-row-meta"><span className="issues-row-id">{issue.identifier ?? `#${issue.number}`}</span>
        {available.length > 1 && <span className="issues-row-source" title={scope.label}>{scope.source === 'repo' ? t('issues.sourceRepo') : t('issues.sourceTask')}</span>}
        {issue.labels.length > 0 && <span className="issues-row-labels"><span className="issues-label-chip" title={issue.labels[0].name}><span className="issues-label-dot" style={{ backgroundColor: /^[a-f\d]{6}$/i.test(issue.labels[0].color) ? `#${issue.labels[0].color}` : undefined }} />{issue.labels[0].name}</span>{issue.labels.length > 1 && <span className="issues-row-label-overflow" title={issue.labels.slice(1).map(label => label.name).join(', ')}>+{issue.labels.length - 1}</span>}</span>}
        <time className="issues-row-date" dateTime={issue.updated_at} title={`${t('issues.updated')} ${issue.updated_at}`}>{formatDate(issue.updated_at)}</time>
      </span>
    </button></div>;
  };

  return <div className="@container flex flex-col h-full min-h-0" data-issues-workspace>
    <header className="issues-toolbar">
      <div className="issues-toolbar-context"><CircleDot size={18} aria-hidden="true" /><span className="issues-toolbar-title">{t('issues.nav')}</span>
        <span className="issues-scope" title={activeScopes.map(scope => scope.label).join(' · ')}>{activeScopes.map(scope => scope.label).join(' · ')}</span>
      </div>
      <Button size="toolbar" onClick={startCreate}><Plus className="h-3.5 w-3.5" aria-hidden="true" />{t('issues.create')}</Button>
    </header>
    <div className="issues-columns grid grid-cols-1 flex-1 min-h-0" style={{ '--issue-list-w': `${listWidth}px` } as React.CSSProperties}>
      <section aria-label={t('issues.list')} className={`issues-list-panel ${selected ? 'hidden @[760px]:flex' : 'flex'} flex-col min-h-0 min-w-0`}>
        <div className="issues-list-head">
          <div className="issues-list-heading"><h2>{t('issues.list')}</h2><span className="issues-count">{total}</span><Button variant="ghost" size="icon" className="issues-icon-btn" disabled={loading} aria-label={t('issues.refresh')} title={t('issues.refresh')} onClick={refresh}><RefreshCw className={`h-3.5 w-3.5 ${loading ? 'issues-refreshing' : ''}`} aria-hidden="true" /></Button></div>
        <div className="issues-search"><Search aria-hidden="true" size={13} /><input type="text" name="issue-search" autoComplete="off" spellCheck={false} aria-label={t('issues.search')} placeholder={t('issues.searchHint')} value={query} onChange={event => filterUpdate(() => setQuery(event.target.value))} /></div>
        <div className="issues-tools">
        <select name="issue-state" aria-label={t('issues.state')} className="issues-select" value={state} onChange={event => filterUpdate(() => setState(event.target.value as IssueListOptions['state']))}>{(['open', 'closed', 'all'] as const).map(value => <option key={value} value={value}>{t(value === 'all' ? 'issues.allStates' : `issues.${value}`)}</option>)}</select>
        {available.length > 1 && <select name="issue-source" aria-label={t('issues.source')} className="issues-select" value={filter} onChange={event => filterUpdate(() => setFilter(event.target.value as IssueSourceFilter))}><option value="all">{t('issues.sourceAll')}</option><option value="repo">{t('issues.sourceRepo')}</option><option value="task">{t('issues.sourceTask')}</option></select>}
        <Button variant={showFilters || label || assignee ? 'secondary' : 'ghost'} size="icon-xs" className="issues-filter-button" aria-label={t('issues.filters')} title={t('issues.filters')} aria-expanded={showFilters} aria-controls="issue-extra-filters" onClick={() => setShowFilters(value => !value)}><SlidersHorizontal size={13} aria-hidden="true" />{(label || assignee) && <span className="issues-filter-dot" aria-hidden="true" />}</Button>
        {hasFilters && <Button variant="ghost" size="icon-xs" className="issues-clear-filters" aria-label={t('issues.clearFilters')} title={t('issues.clearFilters')} onClick={clearFilters}><RotateCcw size={13} aria-hidden="true" /></Button>}
        </div>
        <div id="issue-extra-filters" className="issues-extra-filters" hidden={!showFilters}>
        <label><span>{t('issues.labels')}</span>
        <input type="text" name="issue-labels" autoComplete="off" spellCheck={false} aria-label={t('issues.labels')} placeholder={t('issues.labels')} className="issues-input" value={label} onChange={event => filterUpdate(() => setLabel(event.target.value))} />
        </label><label><span>{t('issues.assignees')}</span>
        <input type="text" name="issue-assignees" autoComplete="off" spellCheck={false} aria-label={t('issues.assignees')} placeholder={t('issues.assignees')} className="issues-input" value={assignee} onChange={event => filterUpdate(() => setAssignee(event.target.value))} />
        </label></div>
        </div>
        <div ref={listRef} className="issues-list-content flex-1 overflow-y-auto" role="list" data-keyboard-list aria-busy={loading} aria-label={t('issues.list')}>
          {loading && !merged.length && <p role="status" className="issues-note">{t('common.loading')}</p>}
          {failures.map(page => <div key={`failure:${page.scope.key}`} role="alert" className="issues-note space-y-2"><p>{page.scope.source === 'repo' ? t('issues.sourceRepo') : t('issues.sourceTask')}: {page.error}</p><Button variant="outline" size="xs" disabled={loading} onClick={() => void retryFailed()}>{t('remote.retry')}</Button></div>)}
          {!loading && !failures.length && !merged.length && <div className="issues-empty"><Search aria-hidden="true" size={24} /><strong>{t('issues.empty')}</strong><p>{t('issues.emptyHint')}</p>{hasFilters && <Button variant="outline" size="xs" onClick={clearFilters}>{t('issues.clearFilters')}</Button>}</div>}
          {merged.map(row)}
          {merged.length > 0 && <div className="issues-list-footer">
            {hasMore && <Button variant="outline" size="xs" className="w-full" disabled={loading} onClick={() => void loadMore()}>{t(loading ? 'common.loading' : 'issues.loadMore')}</Button>}
            <p role="status">{t(hasMore || incomplete || failures.length ? 'issues.loaded' : 'issues.allLoaded').replace('{count}', new Intl.NumberFormat(lang === 'zh' ? 'zh-CN' : 'en').format(merged.length))}</p>
            {incomplete && <p>{t('issues.searchLimit')}</p>}
          </div>}
        </div>
      </section>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={t('issues.resizeList')}
        aria-valuemin={220}
        aria-valuemax={640}
        aria-valuenow={listWidth}
        tabIndex={0}
        className="issues-resizer hidden @[760px]:flex items-center justify-center cursor-col-resize select-none"
        onKeyDown={event => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault();
          const width = event.key === 'Home' ? 220 : event.key === 'End' ? 640 : Math.min(640, Math.max(220, listWidth + (event.key === 'ArrowLeft' ? -20 : 20)));
          setListWidth(width); try { localStorage.setItem('auugit_issue_list_width', String(width)); } catch { /* storage unavailable */ }
        }}
        onPointerDown={beginResize}
        onPointerMove={moveResize}
        onPointerUp={endResize}
        onPointerCancel={endResize}
        onDoubleClick={() => { setListWidth(320); try { localStorage.setItem('auugit_issue_list_width', '320'); } catch { /* storage unavailable */ } }}
      />
      <section aria-label={t('issues.detail')} className={`issues-detail-panel ${selected ? 'flex' : 'hidden @[760px]:flex'} flex-col min-w-0 min-h-0 overflow-y-auto`}>
        {selected ? <><Button className="@[760px]:hidden shrink-0 m-2 self-start" variant="ghost" size="xs" onClick={() => setSelected(null)}><ArrowLeft className="h-3 w-3 mr-1" />{t('issues.back')}</Button><IssueDetail key={JSON.stringify([selected.scope.key, selected.number])} scope={selected.scope} number={selected.number} onChanged={refresh} /></> : <div className="issues-detail-empty"><CircleDot size={32} aria-hidden="true" /><h2>{t('issues.selectTitle')}</h2><p>{t('issues.select')}</p></div>}
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
