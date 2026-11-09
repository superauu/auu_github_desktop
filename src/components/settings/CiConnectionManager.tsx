import { useEffect, useState } from 'react';
import { Plus, Power, RefreshCw, Trash2, Link2 } from 'lucide-react';
import { useCiStore, type CiConnection } from '@/stores/ciStore';
import { useRepoStore } from '@/stores/repoStore';
import { useI18n } from '@/i18n';
import { ModalSurface } from '@/components/ui/ModalSurface';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { confirmAction } from '@/stores/confirmStore';
import { toast } from '@/stores/toastStore';

export function CiConnectionManager({ providerId }: { providerId: string }) {
  const { t } = useI18n();
  const ci = useCiStore();
  const [editing, setEditing] = useState<CiConnection | 'new' | null>(null);
  const [busyId, setBusyId] = useState('');
  useEffect(() => { useCiStore.getState().restoreConnections(); }, []);
  return <div className="space-y-2">
    {ci.connections.filter(item => item.providerId === providerId).map(connection => <div key={connection.id} className="flex flex-wrap items-center gap-2 rounded-md border border-border p-2 text-xs">
      <span className="font-medium">{connection.displayName}</span>
      <span className="min-w-0 flex-1 truncate text-muted-foreground">{connection.username} · {connection.baseUrl}</span>
      <Badge variant="outline">{t(`errors.settings.health.${ci.runtime[connection.id]?.health ?? 'unverified'}`)}</Badge>
      <Button size="xs" variant="ghost" aria-label={t('errors.settings.toggleConnection')} aria-pressed={connection.enabled} onClick={() => ci.updateConnection(connection.id, !connection.enabled)}><Power className={connection.enabled ? 'h-3 w-3 text-primary' : 'h-3 w-3'} /></Button>
      <Button size="xs" variant="ghost" aria-label={t('ciDomain.mapRepository')} onClick={() => setEditing(connection)}><Link2 className="h-3 w-3" /></Button>
      <Button size="xs" variant="ghost" aria-label={t('errors.settings.test')} disabled={busyId === connection.id} onClick={async () => {
        setBusyId(connection.id);
        try { await ci.retestConnection(connection.id); const result = useCiStore.getState().runtime[connection.id];
          if (result?.health === 'connected') toast.success(t('errors.settings.testOk'));
          else toast.error(t('errors.settings.testFailed'), result?.statusMessage);
        } finally { setBusyId(''); }
      }}><RefreshCw className="h-3 w-3" /></Button>
      <Button size="xs" variant="ghost" aria-label={t('errors.settings.deleteTitle').replace('{name}', connection.displayName)} onClick={async () => {
        if (!await confirmAction({ title: t('errors.settings.deleteTitle').replace('{name}', connection.displayName), description: t('errors.settings.deleteDesc') })) return;
        try { await ci.removeConnection(connection.id); } catch (error) { toast.error(t('errors.settings.deleteFailed'), String(error)); }
      }}><Trash2 className="h-3 w-3" /></Button>
    </div>)}
    <Button size="xs" variant="ghost" className="w-full justify-start" onClick={() => setEditing('new')}><Plus className="h-3 w-3" />{t('errors.settings.addConnection')}</Button>
    {editing && <CiConnectionForm key={typeof editing === 'string' ? 'new' : editing.id} providerId={providerId} connection={typeof editing === 'string' ? undefined : editing} onClose={() => setEditing(null)} />}
  </div>;
}

function CiConnectionForm({ providerId, connection, onClose }: { providerId: string; connection?: CiConnection; onClose(): void }) {
  const { t } = useI18n();
  const repo = useRepoStore(state => state.currentRepo);
  const [displayName, setDisplayName] = useState(connection?.displayName ?? '');
  const [baseUrl, setBaseUrl] = useState(connection?.baseUrl ?? '');
  const [username, setUsername] = useState(connection?.username ?? '');
  const [token, setToken] = useState('');
  const [jobs, setJobs] = useState(() => repo && connection ? (useCiStore.getState().bindings[repo.path]?.find(item => item.connectionId === connection.id)?.jobPaths ?? []).join('\n') : '');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  return <ModalSurface label={t(connection ? 'ciDomain.mapRepository' : 'errors.settings.addConnection')} dismissible={!busy} onDismiss={onClose}
    className="fixed inset-0 z-[60] flex items-center justify-center bg-background/80 p-4 backdrop-blur-xs">
    <form className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-xl border border-border bg-card p-5 space-y-3 text-xs" onSubmit={async event => {
      event.preventDefault(); if (busy) return;
      setBusy(true); setError('');
      try {
        const jobPaths = jobs.split(/\r?\n/).map(path => path.trim()).filter(Boolean);
        if (!repo?.path) throw new Error(t('ciDomain.mappingRequired'));
        if (connection) await useCiStore.getState().bindRepository(repo.path, connection.id, jobPaths);
        else await useCiStore.getState().connect({ providerId, displayName, baseUrl, username, token, repoPath: repo.path, jobPaths });
        setToken(''); toast.success(t('ciDomain.saved')); onClose();
      } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
      finally { setBusy(false); }
    }}>
      <h2 className="text-sm font-semibold">{t(connection ? 'ciDomain.mapRepository' : 'errors.settings.addConnection')}</h2>
      {!connection && <>
        <label className="block space-y-1"><span>{t('errors.connect.displayName')}</span><Input value={displayName} disabled={busy} onChange={event => setDisplayName(event.target.value)} /></label>
        <label className="block space-y-1"><span>{t('ciDomain.server')}</span><Input type="url" required placeholder="http://localhost:8080" value={baseUrl} disabled={busy} onChange={event => setBaseUrl(event.target.value)} /></label>
        <label className="block space-y-1"><span>{t('ciDomain.username')}</span><Input required autoComplete="username" value={username} disabled={busy} onChange={event => setUsername(event.target.value)} /></label>
        <label className="block space-y-1"><span>{t('connections.token')}</span><Input required type="password" autoComplete="off" value={token} disabled={busy} onChange={event => setToken(event.target.value)} /></label>
        <p className="text-muted-foreground">{t('ciDomain.tokenHint')}</p>
      </>}
      <p className="break-all text-muted-foreground">{t('ciDomain.repository')}: {repo?.path ?? t('ciDomain.mappingRequired')}</p>
      <label className="block space-y-1"><span>{t('ciDomain.jobs')}</span><textarea required rows={3} value={jobs} disabled={busy} onChange={event => setJobs(event.target.value)} className="w-full resize-y rounded-md border border-input bg-background p-2 font-mono" /></label>
      <p className="text-muted-foreground">{t('ciDomain.jobsHint')}</p>
      {error && <p role="alert" className="text-destructive whitespace-pre-wrap">{error}</p>}
      <div className="flex justify-end gap-2"><Button type="button" variant="ghost" size="xs" disabled={busy} onClick={onClose}>{t('common.cancel')}</Button><Button size="xs" disabled={busy || !repo}>{t(busy ? 'errors.connect.saving' : 'errors.connect.save')}</Button></div>
    </form>
  </ModalSurface>;
}
