import { useEffect, useState } from 'react';
import { listRepositoryPermissions, revokeRepositoryPermission } from '@/services/fs/RepositoryAccess';
import { useRepoStore } from '@/stores/repoStore';
import { useI18n } from '@/i18n';
import { toast } from '@/stores/toastStore';
import { Button } from '@/components/ui/button';
import { OPEN_TABS_KEY, saveRepositoryState } from '@/stores/repositoryStorage';

export function RepositoryPermissions() {
  const { t } = useI18n();
  const [paths, setPaths] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const desktop = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
  useEffect(() => {
    let active = true;
    void listRepositoryPermissions().then(value => { if (active) setPaths(value); }, error => { if (active) setError(String(error)); });
    return () => { active = false; };
  }, []);
  if (!desktop) return null;
  const revoke = async (path: string) => {
    setBusy(path);
    try {
      const store = useRepoStore.getState();
      const candidates = Array.from(new Set([...store.openTabs.map(tab => tab.path), ...(store.currentRepo ? [store.currentRepo.path] : [])]));
      const revoked = new Set(await revokeRepositoryPermission(path, candidates));
      // Native resolution also recognizes symlink aliases. Remove every matching tab together.
      const current = useRepoStore.getState();
      const remaining = current.openTabs.filter(tab => !revoked.has(tab.path));
      saveRepositoryState(OPEN_TABS_KEY, remaining);
      useRepoStore.setState({ openTabs: remaining });
      if (current.currentRepo && revoked.has(current.currentRepo.path)) current.setCurrentRepo(remaining[0] || null);
      setPaths(previous => previous.filter(value => value !== path));
      toast.success(t('permissions.revoked'));
    } catch (error) { toast.error(t('permissions.failed'), String(error)); }
    finally { setBusy(null); }
  };
  return <section className="space-y-2 border-t border-border pt-3">
    <h3 className="text-xs font-medium">{t('permissions.title')}</h3>
    <p className="text-[12px] text-muted-foreground">{t('permissions.description')}</p>
    {error && <p role="alert" className="text-destructive">{error}</p>}
    {!error && !paths.length && <p className="text-muted-foreground">{t('permissions.empty')}</p>}
    {paths.map(path => <div key={path} className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5">
      <span title={path} className="min-w-0 flex-1 truncate font-mono text-[12px]">{path}</span>
      <Button variant="outline" size="xs" disabled={busy !== null} onClick={() => void revoke(path)} aria-label={`${t('permissions.revoke')}: ${path}`}>{t('permissions.revoke')}</Button>
    </div>)}
  </section>;
}
