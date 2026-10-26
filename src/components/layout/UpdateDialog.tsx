import { useSyncExternalStore } from 'react';
import { Download, X } from 'lucide-react';
import { useUpdateStore, checkForUpdates, downloadUpdate, installUpdate, deferUpdate } from '@/services/updater/UpdateService';
import { subscribeGitWrites, getTotalPendingGitWrites } from '@/services/git/GitQueue';
import { useI18n } from '@/i18n';
import { ModalSurface } from '@/components/ui/ModalSurface';
import { Button } from '@/components/ui/button';

export function UpdateDialog() {
  const state = useUpdateStore();
  const { t } = useI18n();
  const pending = useSyncExternalStore(subscribeGitWrites, getTotalPendingGitWrites, () => 0);
  if (!state.visible) return null;
  const desktop = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
  const percent = state.total ? Math.min(100, Math.floor(state.downloaded / state.total * 100)) : undefined;
  const busy = state.phase === 'checking' || state.phase === 'downloading' || state.phase === 'installing';
  const size = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
  return <ModalSurface label={t('updates.title')} onDismiss={deferUpdate} dismissible={state.phase !== 'installing'} className="fixed inset-0 z-70 p-4 bg-black/40 flex items-center justify-center">
    <div className="bg-card text-foreground border border-border rounded-xl shadow-xl w-full max-w-lg p-5 space-y-4 max-h-[85vh] overflow-y-auto">
      <div className="flex items-center justify-between"><h2 className="text-sm font-semibold">{t('updates.title')}</h2>
        <Button size="xs" variant="ghost" disabled={state.phase === 'installing'} onClick={deferUpdate} aria-label={t('common.close')}><X className="h-4 w-4" /></Button></div>
      {!desktop ? <p className="text-sm text-muted-foreground">{t('updates.desktopOnly')}</p> : <>
        <p role="status" className="text-sm">{state.version && `v${state.version} · `}{t(`updates.phase.${state.phase}`)}</p>
        {state.notes && <details open><summary className="text-xs cursor-pointer">{t('updates.notes')}</summary><pre className="whitespace-pre-wrap wrap-break-word max-h-48 overflow-auto mt-2 text-xs font-sans select-text">{state.notes}</pre></details>}
        {state.phase === 'downloading' && <div className="space-y-2"><progress aria-label={t('updates.progress')} className="w-full h-2 accent-primary" max={100} value={percent} />
          <p className="text-xs text-muted-foreground tabular-nums">{percent != null ? `${percent}% · ` : ''}{size(state.downloaded)}{state.total && ` / ${size(state.total)}`}</p></div>}
        {state.error && <p role="alert" className="text-xs text-destructive wrap-break-word select-text">{state.error}</p>}
        {['ready', 'installed'].includes(state.phase) && <p className="text-xs text-muted-foreground">{t(pending ? 'updates.gitBusy' : 'updates.installHint')}</p>}
        <div className="flex flex-wrap gap-2 justify-end">
          <Button size="xs" variant="outline" disabled={state.phase === 'installing'} onClick={deferUpdate}>{t('updates.later')}</Button>
          {['idle', 'error'].includes(state.phase) && !state.version && <Button size="xs" disabled={busy} onClick={() => void checkForUpdates(false)}>{t('updates.check')}</Button>}
          {['available', 'error'].includes(state.phase) && state.version && <Button size="xs" disabled={busy} onClick={() => void downloadUpdate()}><Download className="h-3 w-3" />{t(state.phase === 'error' ? 'updates.retryDownload' : 'updates.download')}</Button>}
          {['ready', 'installed'].includes(state.phase) && <Button size="xs" disabled={pending > 0} onClick={() => void installUpdate()}>{t(state.phase === 'installed' ? 'updates.restart' : 'updates.installRestart')}</Button>}
        </div>
      </>}
    </div>
  </ModalSurface>;
}
