import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/i18n';
import { useRepoStore, type MainNavTab } from '@/stores/repoStore';
import { useGitHubStore } from '@/stores/githubStore';
import { authorizeRepository, isRepositoryAccessCancelled } from '@/services/fs/RepositoryAccess';
import type { RepositoryInfo } from '@/services/git/types';
import { overviewService, OverviewPermissionError, type OverviewLocal, type OverviewCI } from './OverviewService';
import { mapOverview, overviewCounts, overviewRepositories } from './overviewLogic';

interface Row { phase: 'pending' | 'reading' | 'ready' | 'error' | 'permission'; local?: OverviewLocal; ci?: OverviewCI; error?: string; account?: object }
export function RepositoryOverview() {
  const { t, lang } = useI18n();
  const { open, recent } = useRepoStore(useShallow(state => ({ open: state.openTabs, recent: state.recentRepos })));
  const { token, profile, authenticated } = useGitHubStore(useShallow(state => ({ token: state.token, profile: state.activeProfileId, authenticated: state.isAuthenticated })));
  const account = useMemo(() => ({ token, profile, authenticated }), [token, profile, authenticated]);
  const repos = useMemo(() => overviewRepositories(open, recent), [open, recent]);
  const [rows, setRows] = useState<Record<string, Row>>({}), [busy, setBusy] = useState(false), [notice, setNotice] = useState('');
  const [query, setQuery] = useState(''), [filter, setFilter] = useState('all'), [limit, setLimit] = useState(24), [opening, setOpening] = useState('');
  const generation = useRef(0), controller = useRef<AbortController | null>(null), openingRef = useRef(false);
  const invalidate = useCallback(() => { generation.current++; controller.current?.abort(); }, []);
  const key = JSON.stringify(repos.map(repo => repo.path));
  const matching = repos.filter(repo => `${repo.name} ${repo.path}`.toLowerCase().includes(query.toLowerCase()));
  const refresh = async (targets = matching.slice(0, limit), authorized = false) => {
    controller.current?.abort(); const abort = new AbortController(); controller.current = abort;
    const id = ++generation.current; setBusy(true); setNotice('');
    setRows(previous => ({ ...previous, ...Object.fromEntries(targets.map(repo => [repo.path, { phase: 'reading' }])) }));
    const active = () => { const github = useGitHubStore.getState(); return !abort.signal.aborted && generation.current === id && github.token === token && github.activeProfileId === profile && github.isAuthenticated === authenticated; };
    const update = (path: string, row: Row) => { if (active()) setRows(previous => ({ ...previous, [path]: row })); };
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
  const visible = matching.slice(0, limit).filter(repo => {
    const row = rows[repo.path];
    if (filter === 'all' || !row?.local) return true;
    const { changed, conflicts } = overviewCounts(row.local.status);
    return changed > 0 || conflicts > 0 || row.local.status.ahead > 0 || row.local.status.behind > 0 || row.local.operation.type !== 'none' || (row.account === account && ['failed', 'unknown'].includes(row.ci?.state || ''));
  });
  return <section aria-label={t('overview.title')} className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
    <header className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-lg font-semibold">{t('overview.title')}</h1><div className="flex gap-2"><Button variant="outline" disabled={busy} onClick={() => void refresh()}>{t('overview.refresh')}</Button>{busy && <Button variant="outline" onClick={() => { controller.current?.abort(); generation.current++; setBusy(false); setNotice(t('overview.stopped')); setRows(previous => Object.fromEntries(Object.entries(previous).map(([path, row]) => [path, row.phase === 'reading' ? { phase: 'pending' } : row]))); }}>{t('overview.stop')}</Button>}</div></header>
    <p className="text-xs text-muted-foreground">{t('overview.scope')}</p>
    {busy && <p role="status" className="text-xs">{t('overview.reading')}</p>}
    {notice && <p role="status" className="text-sm wrap-break-word">{notice}</p>}
    <div className="flex flex-wrap gap-2"><input type="search" aria-label={t('overview.search')} placeholder={t('overview.search')} value={query} onChange={event => setQuery(event.target.value)} className="h-9 flex-1 min-w-0 border border-input rounded-md bg-background px-3 text-sm" /><select aria-label={t('overview.filter')} value={filter} onChange={event => setFilter(event.target.value)} className="h-9 border border-input rounded-md bg-background px-2 text-sm"><option value="all">{t('overview.all')}</option><option value="attention">{t('overview.attention')}</option></select></div>
    {!visible.length && <p className="text-sm text-muted-foreground">{t('overview.empty')}</p>}
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">{visible.map(repo => {
      const row = rows[repo.path] || { phase: 'pending' }, local = row.local, counts = local && overviewCounts(local.status), ci = row.account === account ? row.ci : undefined;
      return <article key={repo.path} aria-label={repo.name} className="min-w-0 rounded-xl border border-border bg-card p-4 space-y-3">
        <h2 className="font-semibold break-all">{repo.name}</h2><p className="text-xs text-muted-foreground break-all select-text">{repo.path}</p>
        {row.phase === 'reading' && <p role="status" className="text-sm">{t('overview.reading')}</p>}
        {row.phase === 'pending' && <p className="text-sm">{t('overview.pending')}</p>}
        {row.phase === 'permission' && <p className="text-sm">{t('overview.permission')}</p>}
        {row.phase === 'error' && <p role="alert" className="text-xs text-destructive wrap-break-word">{row.error}</p>}
        {local && counts && <>
          <p className="font-mono text-sm break-all">{local.status.currentBranch}</p>
          <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm"><span>{t(counts.changed ? 'overview.changed' : 'overview.clean').replace('{n}', String(counts.changed))}</span>{counts.conflicts > 0 && <strong className="text-destructive">{t('overview.conflicts').replace('{n}', String(counts.conflicts))}</strong>}</div>
          <p className="text-xs">{local.status.trackingBranch ? `${t('overview.ahead').replace('{n}', String(local.status.ahead))} · ${t('overview.behind').replace('{n}', String(local.status.behind))}` : t('overview.noTracking')}</p>
          <p className="text-xs">{local.operation.type === 'none' ? t('overview.operation.none') : `${t('overview.operation')}${t(`activity.command.${local.operation.type}`)}`}</p>
          <section aria-label="CI" className="bg-muted/40 rounded-md p-2 space-y-1 text-xs"><p>CI · {t(`overview.ci.${ci?.state || (busy ? 'loading' : 'unknown')}`)}</p>{ci?.sha && <><p className="font-mono break-all">{ci.ref} · {ci.sha.slice(0, 12)}</p><p className="text-muted-foreground">{t('overview.ciHint')}</p></>}{ci?.error && <details><summary>{t('operationLog.details')}</summary><pre className="max-h-32 overflow-auto whitespace-pre-wrap wrap-break-word select-text">{ci.error}</pre></details>}</section>
          <p className="text-[11px] text-muted-foreground">{t('overview.localTime')} {new Date(local.checkedAt).toLocaleString(lang === 'zh' ? 'zh-CN' : 'en')}</p>
        </>}
        <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={busy} onClick={() => { if (row.phase !== 'permission') void refresh([repo]); else { const id = generation.current; void (async () => { try { await authorizeRepository(repo.path); if (id === generation.current) await refresh([repo], true); } catch (error) { if (id === generation.current && !isRepositoryAccessCancelled(error)) setNotice(String(error)); } })(); } }}>{t(row.phase === 'permission' ? 'overview.authorize' : 'overview.retry')}</Button><Button size="sm" variant="outline" disabled={!!opening} onClick={() => void navigate(repo, 'changes')}>{t('overview.openChanges')}</Button><Button size="sm" variant="ghost" disabled={!!opening} onClick={() => void navigate(repo, 'history')}>{t('overview.openHistory')}</Button>{ci?.url && <a href={ci.url} target="_blank" rel="noreferrer" className="inline-flex items-center px-2 text-xs text-primary underline">{t('overview.openCI')} ↗</a>}</div>
      </article>;
    })}</div>
    {matching.length > limit && <Button variant="outline" disabled={busy} onClick={() => setLimit(value => value + 24)}>{t('overview.more')}</Button>}
  </section>;
}
