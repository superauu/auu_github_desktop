import { useId } from 'react';
import { ArrowDown, ArrowUp, ArrowUpRight, CheckCircle2, ChevronDown, CircleAlert, CircleHelp, Clock3, FolderGit2, GitBranch, GitMerge, History, LoaderCircle, RefreshCw, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/i18n';
import type { RepositoryInfo } from '@/services/git/types';
import type { OverviewLocal, OverviewCI } from './OverviewService';
import { overviewCounts } from './overviewLogic';

export interface OverviewRowState {
  phase: 'pending' | 'reading' | 'ready' | 'error' | 'permission';
  local?: OverviewLocal; ci?: OverviewCI; error?: string; account?: object;
}
export function OverviewRepositoryRow({ repo, row, ci, current, expanded, busy, opening, onToggle, onRetry, onChanges, onHistory, onConnect }: {
  repo: RepositoryInfo; row: OverviewRowState; ci?: OverviewCI; current: boolean; expanded: boolean; busy: boolean; opening: boolean;
  onToggle: () => void; onRetry: () => void; onChanges: () => void; onHistory: () => void; onConnect?: () => void;
}) {
  const { t, lang } = useI18n(), detailsId = useId();
  const local = row.local, counts = local && overviewCounts(local.status);
  const state = ci?.state || (busy ? 'loading' : 'unknown');
  const ciTone = state === 'passing' ? 'good' : state === 'failed' ? 'danger' : state === 'running' || state === 'loading' ? 'active' : 'muted';
  const CiIcon = state === 'passing' ? CheckCircle2 : state === 'failed' ? CircleAlert : state === 'running' || state === 'loading' ? LoaderCircle : CircleHelp;
  const ciLabel = t(state === 'auth' ? 'overview.ci.disconnected' : `overview.ci.${state}`);
  return <article aria-label={repo.name} className="overview-repository" data-current={current || undefined} data-expanded={expanded || undefined}>
    <div className="overview-repo-main">
      <div className="overview-repo-identity">
        <span className="overview-repo-tile"><FolderGit2 aria-hidden="true" size={13} /></span>
        <div className="overview-repo-titles">
          <div className="overview-repo-name"><h3><button type="button" onClick={onToggle} aria-expanded={expanded} aria-controls={detailsId} title={repo.name}>{repo.name}</button></h3>{current && <span className="overview-current">{t('overview.current')}</span>}</div>
          <p className="overview-repo-sub">
            {local && <><span className="overview-repo-branch" title={local.status.currentBranch}><GitBranch aria-hidden="true" size={11} /><span>{local.status.currentBranch}</span></span><span className="overview-sub-dot" aria-hidden="true">·</span></>}
            <span className="overview-repo-path" title={repo.path}>{repo.path}</span>
          </p>
        </div>
      </div>
      <div className="overview-work-cell" role="group" aria-label={t('overview.workspace')}>
        <span className="overview-cell-label">{t('overview.workspace')}</span>
        {counts ? <>
          <span className="overview-status" data-tone={counts.conflicts ? 'danger' : counts.changed ? 'normal' : 'good'}>{counts.conflicts ? <GitMerge aria-hidden="true" size={13} /> : counts.changed ? <span className="overview-status-dot" /> : <CheckCircle2 aria-hidden="true" size={13} />}{t(counts.conflicts ? 'overview.conflicts' : counts.changed ? 'overview.changed' : 'overview.clean').replace('{n}', String(counts.conflicts || counts.changed))}</span>
          {local?.operation.type !== 'none' && <span className="overview-secondary">{t(`activity.command.${local?.operation.type}`)}</span>}
        </> : <span className="overview-status" data-tone={row.phase === 'error' ? 'danger' : row.phase === 'permission' ? 'muted' : 'normal'}>{row.phase === 'reading' ? <LoaderCircle aria-hidden="true" size={13} className="overview-spinner" /> : row.phase === 'permission' ? <ShieldAlert aria-hidden="true" size={13} /> : row.phase === 'error' ? <CircleAlert aria-hidden="true" size={13} /> : <Clock3 aria-hidden="true" size={13} />}{t(row.phase === 'reading' ? 'overview.reading' : row.phase === 'permission' ? 'overview.needsPermission' : row.phase === 'error' ? 'overview.unavailable' : 'overview.pending')}</span>}
      </div>
      <div className="overview-sync-cell" role="group" aria-label={t('overview.sync')}>
        <span className="overview-cell-label">{t('overview.sync')}</span>
        {!local ? <span className="overview-secondary">—</span> : !local.status.trackingBranch ? <span className="overview-secondary">{t('overview.noTracking')}</span> : !local.status.ahead && !local.status.behind ? <span className="overview-status" data-tone="muted"><CheckCircle2 aria-hidden="true" size={13} />{t('overview.synced')}</span> : <>
          {local.status.ahead > 0 && <span className="overview-sync-count"><ArrowUp aria-hidden="true" size={12} />{t('overview.ahead').replace('{n}', String(local.status.ahead))}</span>}
          {local.status.behind > 0 && <span className="overview-secondary overview-sync-count"><ArrowDown aria-hidden="true" size={11} />{t('overview.behind').replace('{n}', String(local.status.behind))}</span>}
        </>}
      </div>
      <section aria-label="CI" className="overview-ci-cell">
        <span className="overview-cell-label">CI</span>
        {local ? <span className="overview-ci-badge" data-tone={ciTone} title={ciLabel}><CiIcon aria-hidden="true" size={12} className={state === 'running' || state === 'loading' ? 'overview-spinner' : undefined} /><span>{ciLabel}</span></span> : <span className="overview-secondary">—</span>}
      </section>
      <div className="overview-row-actions">
        {local ? <>
          <Button size="xs" variant="ghost" disabled={opening} onClick={onChanges} aria-label={t('overview.openChanges')} title={t('overview.openChanges')} className="overview-open"><span className="overview-open-label">{t('overview.openChanges')}</span><ArrowUpRight aria-hidden="true" size={13} /></Button>
          <Button size="icon" variant="ghost" disabled={opening} onClick={onHistory} aria-label={t('overview.openHistory')} title={t('overview.openHistory')} className="overview-icon-btn"><History aria-hidden="true" size={14} /></Button>
        </> : <Button size="xs" variant="outline" disabled={busy} onClick={onRetry}>{t(row.phase === 'permission' ? 'overview.authorize' : 'overview.retry')}</Button>}
        <Button size="icon" variant="ghost" onClick={onToggle} aria-expanded={expanded} aria-controls={detailsId} aria-label={t('overview.detailsFor').replace('{name}', repo.name)} title={t('overview.details')} className="overview-icon-btn"><ChevronDown aria-hidden="true" size={14} className={expanded ? 'rotate-180' : ''} /></Button>
      </div>
    </div>
    {row.phase === 'error' && <p role="alert" className="overview-row-message" data-tone="danger"><CircleAlert aria-hidden="true" size={13} /><span>{row.error}</span></p>}
    {row.phase === 'permission' && <p className="overview-row-message"><ShieldAlert aria-hidden="true" size={13} /><span>{t('overview.permission')}</span></p>}
    <div id={detailsId} hidden={!expanded} className="overview-repo-details">
      {local && counts ? <>
        <div className="overview-detail-columns">
          <section><h4>{t('overview.workspace')}</h4><dl className="overview-file-counts">{[[t('overview.stagedCount'), local.status.staged.length], [t('overview.unstagedCount'), local.status.unstaged.length], [t('overview.untrackedCount'), local.status.untracked.length]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></section>
          <section><h4>{t('overview.sync')}</h4><dl className="overview-ref-details"><div><dt>{t('overview.branch')}</dt><dd title={local.status.currentBranch}>{local.status.currentBranch}</dd></div><div><dt>{t('overview.tracking')}</dt><dd title={local.status.trackingBranch}>{local.status.trackingBranch || t('overview.noTracking')}</dd></div></dl></section>
          <section><h4>{t('overview.checks')}</h4><p className="overview-detail-status">{t(`overview.ci.${state}`)}</p>{ci?.sha && <><p className="overview-ci-source"><span>{ci.ref}</span><code>{ci.sha.slice(0, 12)}</code></p><p className="overview-secondary">{t('overview.ciHint')}</p></>}{state === 'auth' && onConnect && <Button size="xs" variant="outline" onClick={onConnect} className="mt-2">{t('overview.connect')}</Button>}{ci?.error && <details className="overview-ci-error"><summary>{t('operationLog.details')}</summary><pre>{ci.error}</pre></details>}</section>
        </div>
        <footer className="overview-detail-footer"><span><Clock3 aria-hidden="true" size={11} /><time dateTime={new Date(local.checkedAt).toISOString()}>{t('overview.localTime')} {new Date(local.checkedAt).toLocaleString(lang === 'zh' ? 'zh-CN' : 'en')}</time></span><div><Button size="xs" variant="ghost" disabled={busy} onClick={onRetry}><RefreshCw aria-hidden="true" size={11} />{t('overview.retry')}</Button>{ci?.url && <a href={ci.url} target="_blank" rel="noreferrer">{t('overview.openCI')}<ArrowUpRight aria-hidden="true" size={12} /></a>}</div></footer>
      </> : <p className="overview-secondary select-text break-all">{repo.path}</p>}
    </div>
  </article>;
}
