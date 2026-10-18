import { create } from 'zustand';
import type { Update } from '@tauri-apps/plugin-updater';
import { tNow } from '@/i18n';
import { toast } from '@/stores/toastStore';
import { getTotalPendingGitWrites } from '@/services/git/GitQueue';
import { confirmAction } from '@/stores/confirmStore';
import { flushWorkspaceSession } from '@/stores/workspaceSessionStore';

export type UpdatePhase = 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'installing' | 'installed' | 'error';
interface UpdateState {
  phase: UpdatePhase;
  visible: boolean;
  version: string;
  notes: string;
  downloaded: number;
  total: number | null;
  error: string | null;
}
export const useUpdateStore = create<UpdateState>(() => ({ phase: 'idle', visible: false, version: '', notes: '', downloaded: 0, total: null, error: null }));
let resource: Update | null = null;
let checking: Promise<void> | null = null;
let transferring: Promise<void> | null = null;
let installing = false;
const isTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
const errorText = (error: unknown) => error instanceof Error ? error.message : String(error);
export const openUpdateDialog = () => useUpdateStore.setState({ visible: true });
export const deferUpdate = () => useUpdateStore.setState({ visible: false });

/** Startup checks only discover updates. Installation always requires an explicit user action. */
export async function checkForUpdates(silent = true): Promise<void> {
  if (!isTauri()) return;
  if (!silent) openUpdateDialog();
  if (checking) return checking;
  if (transferring || installing || resource) return;
  const previousPhase = useUpdateStore.getState().phase;
  useUpdateStore.setState({ phase: 'checking', error: null });
  checking = (async () => {
    try {
      const { check } = await import('@tauri-apps/plugin-updater');
      const update = await check({ timeout: 20_000 });
      if (!update) {
        useUpdateStore.setState({ phase: 'idle' });
        if (!silent) toast.info(tNow('update.upToDate'));
        return;
      }
      resource = update;
      useUpdateStore.setState({ phase: 'available', version: update.version, notes: update.body || '', error: null });
      toast.info(tNow('update.available').replace('{v}', update.version), tNow('updates.availableHint'));
    } catch (error) {
      useUpdateStore.setState({ phase: silent ? previousPhase : 'error', error: errorText(error) });
      if (!silent) toast.error(tNow('update.checkFailed'), errorText(error));
    } finally { checking = null; }
  })();
  return checking;
}

export async function downloadUpdate(): Promise<void> {
  if (transferring) return transferring;
  if (!resource || installing || !['available', 'error'].includes(useUpdateStore.getState().phase)) return;
  const update = resource;
  useUpdateStore.setState({ phase: 'downloading', downloaded: 0, total: null, error: null });
  transferring = (async () => {
    try {
      await update.download(event => {
        if (event.event === 'Started') useUpdateStore.setState({ total: event.data.contentLength && event.data.contentLength > 0 ? event.data.contentLength : null });
        if (event.event === 'Progress') useUpdateStore.setState(state => ({ downloaded: state.downloaded + event.data.chunkLength }));
      }, { timeout: 120_000 });
      useUpdateStore.setState({ phase: 'ready' });
      toast.success(tNow('updates.downloaded'), tNow('updates.installHint'));
    } catch (error) { useUpdateStore.setState({ phase: 'error', error: errorText(error) }); }
    finally { transferring = null; }
  })();
  return transferring;
}

export async function installUpdate(): Promise<void> {
  if (installing || !resource || !['ready', 'installed'].includes(useUpdateStore.getState().phase)) return;
  installing = true;
  try {
    if (getTotalPendingGitWrites() > 0) { toast.warning(tNow('updates.gitBusy')); return; }
    const accepted = await confirmAction({ title: tNow('updates.installRestart'), description: tNow('updates.restartConfirm'), confirmLabel: tNow('updates.installRestart') });
    if (!accepted) return;
    if (getTotalPendingGitWrites() > 0) { toast.warning(tNow('updates.gitBusy')); return; }
    flushWorkspaceSession();
    const alreadyInstalled = useUpdateStore.getState().phase === 'installed';
    useUpdateStore.setState({ phase: 'installing', error: null });
    if (!alreadyInstalled) await resource.install({ restartAfterInstall: true });
    // Windows exits into its installer. On platforms where install returns, restart explicitly.
    useUpdateStore.setState({ phase: 'installed' });
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('restart_application');
  } catch (error) {
    useUpdateStore.setState(state => ({ phase: state.phase === 'installed' ? 'installed' : 'error', error: errorText(error) }));
  } finally { installing = false; }
}
