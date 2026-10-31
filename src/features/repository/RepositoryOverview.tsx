import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { AlertCircle, ArrowUp, FolderGit2, GitMerge, Info, LoaderCircle, RefreshCw, Search, Square } from 'lucide-react';
import { OverviewRepositoryRow, type OverviewRowState } from './OverviewRepositoryRow';
import './RepositoryOverview.css';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/i18n';
import { useRepoStore, type MainNavTab } from '@/stores/repoStore';
import { useGitHubStore } from '@/stores/githubStore';
import { authorizeRepository, isRepositoryAccessCancelled } from '@/services/fs/RepositoryAccess';
import type { RepositoryInfo } from '@/services/git/types';
import { overviewService, OverviewPermissionError } from './OverviewService';
import { mapOverview, overviewCounts, overviewRepositories } from './overviewLogic';

export function RepositoryOverview({ onOpenGitHubAuth }: { onOpenGitHubAuth?: () => void }) {
  const { t, lang } = useI18n();
  const { open, recent, currentPath } = useRepoStore(useShallow(state => ({ open: state.openTabs, recent: state.recentRepos, currentPath: state.currentRepo?.path })));
  const { token, profile, authenticated } = useGitHubStore(useShallow(state => ({ token: state.token, profile: state.activeProfileId, authenticated: state.isAuthenticated })));
  const account = useMemo(() => ({ token, profile, authenticated }), [token, profile, authenticated]);
  const repos = useMemo(() => overviewRepositories(open, recent), [open, recent]);
  const [rows, setRows] = useState<Record<string, OverviewRowState>>({}), [busy, setBusy] = useState(false), [notice, setNotice] = useState('');
  const [query, setQuery] = useState(''), [filter, setFilter] = useState('all'), [limit, setLimit] = useState(24), [opening, setOpening] = useState('');
  const [expanded, setExpanded] = useState<string | null | undefined>(undefined);
  const expandedPath = expanded === undefined ? repos.length === 1 ? repos[0].path : null : expanded;
  const generation = useRef(0), controller = useRef<AbortController | null>(null), openingRef = useRef(false);
  const invalidate = useCallback(() => { generation.current++; controller.current?.abort(); }, []);
  const key = JSON.stringify(repos.map(repo => repo.path));
  const matching = repos.filter(repo => `${repo.name} ${repo.path}`.toLowerCase().includes(query.toLowerCase()));
  const refresh = async (targets = matching.slice(0, limit), authorized = false) => {
    controller.current?.abort(); const abort = new AbortController(); controller.current = abort;
    const id = ++generation.current; setBusy(true); setNotice('');
    setRows(previous => ({ ...previous, ...Object.fromEntries(targets.map(repo => [repo.path, { phase: 'reading' }])) }));
    const active = () => { const github = useGitHubStore.getState(); return !abort.signal.aborted && generation.current === id && github.token === token && github.activeProfileId === profile && github.isAuthenticated === authenticated; };
    const update = (path: string, row: OverviewRowState) => { if (active()) setRows(previous => ({ ...previous, [path]: row })); };
    try {
      await mapOverview(targets, async repo => {
        try {
          const local = await overviewService.local(repo, authorized);
          if (!active()) return;
          update(repo.path, { phase: 'ready', local, account });
          try { const ci = await overviewService.ci(repo, local.status, token, authenticated); update(repo.path, { phase: 'ready', local, ci, account }); }
          catch (error) { update(repo.path, { phase: 'ready', local, ci: { state: 'unknown', error: error instanceof Error ? error.message : String(error) }, account }); }
        } catch (error) { update(repo.path, { phase: error instanceof OverviewPermissionError ? 'permission' : 'error', error: error instanceof Error ? error.message : String(error) }); }
      }, abort.signal);
    } finally { if (active()) setBusy(false); }
  };
  const start = useEffectEvent(() => { void refresh(); });
  useEffect(() => {
    start();
    return invalidate;
  }, [key, limit, token, profile, authenticated, invalidate]);
  const navigate = async (repo: RepositoryInfo, tab: MainNavTab) => {
    if (openingRef.current) return;
    openingRef.current = true; setOpening(repo.path); setNotice('');
    try {
      if (await useRepoStore.getState().setCurrentRepo(repo) && useRepoStore.getState().activeTab === 'overview' && useRepoStore.getState().currentRepo?.path === repo.path) useRepoStore.getState().setActiveTab(tab);
    } catch (error) { if (!isRepositoryAccessCancelled(error)) setNotice(error instanceof Error ? error.message : String(error)); }
    finally { openingRef.current = false; setOpening(''); }
  };
  const needsAttention = (row?: OverviewRowState) => {
    if (!row?.local) return true;
    const { changed, conflicts } = overviewCounts(row.local.status);
    return changed > 0 || conflicts > 0 || row.local.status.ahead > 0 || row.local.status.behind > 0 || row.local.operation.type !== 'none' || (row.account === account && ['failed', 'unknown'].includes(row.ci?.state || ''));
  };
  const visible = matching.slice(0, limit).filter(repo => {
    const row = rows[repo.path];
    if (filter === 'all') return true;
    if (filter === 'attention') return needsAttention(row);
    if (!row?.local) return false;
    return filter === 'unpushed' ? row.local.status.ahead > 0 : overviewCounts(row.local.status).conflicts > 0;
  });
  const known = repos.map(repo => rows[repo.path]).filter(row => row?.local);
  const evaluated = repos.map(repo => rows[repo.path]).filter(row => row && ['ready', 'error', 'permission'].includes(row.phase));
  const attentionCount = evaluated.filter(needsAttention).length;
  const pushCount = known.reduce((total, row) => total + (row.local?.status.trackingBranch ? row.local.status.ahead : 0), 0);
  const conflictCount = known.reduce((total, row) => total + (row.local ? overviewCounts(row.local.status).conflicts : 0), 0);
  const number = new Intl.NumberFormat(lang === 'zh' ? 'zh-CN' : 'en');
  const metrics = [
    { label: 'overview.attention', value: attentionCount, icon: AlertCircle, filter: 'attention', ready: evaluated.length > 0 || !repos.length },
    { label: 'overview.pushCount', value: pushCount, icon: ArrowUp, filter: 'unpushed', ready: known.length > 0 || !repos.length },
    { label: 'overview.conflictCount', value: conflictCount, icon: GitMerge, filter: 'conflicts', ready: known.length > 0 || !repos.length },
  ];
  const retry = (repo: RepositoryInfo, row: OverviewRowState) => {
    if (row.phase !== 'permission') { void refresh([repo]); return; }
    const id = generation.current;
    void (async () => {
      try { await authorizeRepository(repo.path); if (id === generation.current) await refresh([repo], true); }
      catch (error) { if (id === generation.current && !isRepositoryAccessCancelled(error)) setNotice(String(error)); }
    })();
  };
  const stopRead = () => {
    controller.current?.abort(); generation.current++; setBusy(false); setNotice(t('overview.stopped'));
    setRows(previous => Object.fromEntries(Object.entries(previous).map(([path, row]) => [path, row.phase === 'reading' ? { phase: 'pending' } : row])));
  };
  return <section aria-label={t('overview.title')} className="repository-overview">
    <header className="app-toolbar">
      <div className="app-toolbar-group">
        {busy ? <Button size="xs" variant="ghost" onClick={stopRead}><Square aria-hidden="true" size={11} />{t('overview.stop')}</Button> : <Button size="xs" variant="ghost" onClick={() => void refresh()}><RefreshCw aria-hidden="true" size={12} />{t('overview.refresh')}</Button>}
        <span className="overview-read-count">{busy && <LoaderCircle aria-hidden="true" size={11} className="overview-spinner" />}{t('overview.readCount').replace('{read}', number.format(known.length)).replace('{total}', number.format(repos.length))}</span>
      </div>
      <section aria-label={t('overview.summary')} className="overview-chips">{metrics.map(metric => <button type="button" key={metric.filter} className="overview-chip" aria-pressed={filter === metric.filter} data-tone={metric.value > 0 && metric.filter === 'conflicts' ? 'danger' : metric.value > 0 && metric.filter === 'unpushed' ? 'active' : undefined} onClick={() => setFilter(filter === metric.filter ? 'all' : metric.filter)}>
        <span className="overview-chip-label"><metric.icon aria-hidden="true" size={12} />{t(metric.label)}</span><span className="overview-chip-count">{metric.ready ? number.format(metric.value) : '—'}</span>
      </button>)}</section>
      <div className="overview-tools">
        <div className="overview-search"><Search aria-hidden="true" size={13} /><input type="search" name="repository-search" autoComplete="off" spellCheck={false} aria-label={t('overview.search')} placeholder={t('overview.search') + '…'} value={query} onChange={event => setQuery(event.target.value)} /></div>
        <select aria-label={t('overview.filter')} value={filter} onChange={event => setFilter(event.target.value)}><option value="all">{t('overview.all')}</option><option value="attention">{t('overview.attention')}</option><option value="unpushed">{t('overview.pushFilter')}</option><option value="conflicts">{t('overview.conflictFilter')}</option></select>
      </div>
    </header>
    {notice && <p role="status" className="overview-notice wrap-break-word">{notice}</p>}
    <div className="overview-body">
      {visible.length > 0 ? <>
        <div className="overview-column-head" aria-hidden="true"><span>{t('overview.repositories')}</span><span>{t('overview.workspace')}</span><span>{t('overview.sync')}</span><span>{t('overview.checks')}</span><span /></div>
        <div className="overview-repository-list">{visible.map(repo => {
          const row = rows[repo.path] || { phase: 'pending' };
          return <OverviewRepositoryRow key={repo.path} repo={repo} row={row} ci={row.account === account ? row.ci : undefined} current={repo.path === currentPath} expanded={expandedPath === repo.path} busy={busy} opening={!!opening} onToggle={() => setExpanded(expandedPath === repo.path ? null : repo.path)} onRetry={() => retry(repo, row)} onChanges={() => void navigate(repo, 'changes')} onHistory={() => void navigate(repo, 'history')} onConnect={onOpenGitHubAuth} />;
        })}</div>
      </> : <div className="overview-empty"><FolderGit2 aria-hidden="true" size={24} /><h3>{t(query ? 'overview.noResults' : 'overview.noAttention')}</h3><Button variant="outline" size="sm" onClick={() => { setQuery(''); setFilter('all'); }}>{t('overview.reset')}</Button></div>}
      {matching.length > limit && <Button className="overview-more" variant="outline" size="sm" disabled={busy} onClick={() => setLimit(value => value + 24)}>{t('overview.more')}</Button>}
      <details className="overview-data-info"><summary><Info aria-hidden="true" size={12} />{t('overview.dataInfo')}</summary><p>{t('overview.scope')}</p><p>{t('overview.knownCounts')}</p></details>
    </div>
  </section>;
}
