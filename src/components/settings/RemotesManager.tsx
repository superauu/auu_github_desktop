import { useShallow } from 'zustand/react/shallow';
import { confirmAction } from '@/stores/confirmStore';
import React, { useEffect, useState } from 'react';
import { Plus, Trash2, RefreshCw, Check, X } from 'lucide-react';
import { useI18n } from '@/i18n';
import { useRepoStore } from '@/stores/repoStore';
import { gitService } from '@/services/git/GitService';
import { parseGitHubRemote } from '@/services/git/remoteIdentity';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/stores/toastStore';

interface RemoteEntry {
  name: string;
  fetchUrl: string;
  pushUrl: string;
}

export const RemotesManager: React.FC = () => {
  const { t } = useI18n();
  const { currentRepo, refreshAll } = useRepoStore(useShallow(state => ({ currentRepo: state.currentRepo, refreshAll: state.refreshAll })));

  const [remotes, setRemotes] = useState<RemoteEntry[]>([]);
  const [githubRemote, setGithubRemote] = useState('auto');
  const [loadError, setLoadError] = useState('');
  const [savingBinding, setSavingBinding] = useState(false);
  const loadGeneration = React.useRef(0);
  const [isLoading, setIsLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [editingName, setEditingName] = useState<string | null>(null);
  const [editingUrl, setEditingUrl] = useState('');

  const repoPath = currentRepo?.path;

  const load = React.useCallback(async () => {
    if (!repoPath) return;
    const generation = ++loadGeneration.current;
    setIsLoading(true);
    setLoadError('');
    try {
      const [list, preference] = await Promise.all([gitService.listRemotes(repoPath), gitService.getGitHubRemotePreference(repoPath)]);
      if (generation !== loadGeneration.current) return;
      setRemotes(list);
      setGithubRemote(preference);
    } catch (error: any) {
      if (generation !== loadGeneration.current) return;
      setLoadError(error?.message || t('remote.loadFailed'));
    } finally {
      if (generation === loadGeneration.current) setIsLoading(false);
    }
  }, [repoPath, t]);

  useEffect(() => {
    setRemotes([]); setLoadError('');
    load();
    return () => { loadGeneration.current++; };
  }, [load]);

  if (!repoPath) return null;

  const handleAdd = async () => {
    const name = newName.trim();
    const url = newUrl.trim();
    if (!name || !url) {
      toast.warning(t('settings.remotes.missingFields'));
      return;
    }
    try {
      await gitService.addRemote(repoPath, name, url);
      toast.success(t('settings.remotes.added'), `${name} → ${url}`);
      setNewName('');
      setNewUrl('');
      setAdding(false);
      await load();
      await refreshAll();
    } catch (err: any) {
      toast.error(t('settings.remotes.addFailed'), err?.message);
    }
  };

  const handleRemove = async (name: string) => {
    if (!await confirmAction({ title: t('composer.removeRemote'), description: t('settings.remotes.removeConfirm').replace('{name}', name), detail: name })) return;
    try {
      await gitService.removeRemote(repoPath, name);
      toast.success(t('settings.remotes.removed').replace('{name}', name));
      await load();
      await refreshAll();
    } catch (err: any) {
      toast.error(t('settings.remotes.removeFailed'), err?.message);
    }
  };

  const handleSaveUrl = async (name: string) => {
    const url = editingUrl.trim();
    if (!url) return;
    try {
      await gitService.setRemoteUrl(repoPath, name, url);
      toast.success(t('settings.remotes.urlSaved'), `${name} → ${url}`);
      setEditingName(null);
      await load();
      await refreshAll();
    } catch (err: any) {
      toast.error(t('settings.remotes.urlSaveFailed'), err?.message);
    }
  };

  return (
    <div className="pt-2 border-t border-border space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-foreground">
          {t('settings.remotes.title')}
        </label>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="xs"
            onClick={load}
            disabled={isLoading}
            className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
            title={t('ui.remotes.refresh')}
          >
            <RefreshCw className={isLoading ? 'h-3 w-3 animate-spin' : 'h-3 w-3'} />
          </Button>
          <Button
            variant="ghost"
            size="xs"
            onClick={() => setAdding(!adding)}
            className="h-6 px-1.5 text-[11px] gap-0.5 text-muted-foreground hover:text-foreground"
          >
            <Plus className="h-3 w-3" />
            <span>{t('settings.remotes.add')}</span>
          </Button>
        </div>
      </div>

      {loadError && <p role="alert" className="text-xs text-destructive break-all">{loadError}</p>}
      <label className="block text-xs space-y-1">
        <span>{t('remote.github')}</span>
        <select className="w-full rounded-md border border-input bg-background p-2" value={githubRemote} disabled={isLoading || savingBinding || !!loadError} onChange={async event => {
          const remote = event.target.value;
          const path = repoPath;
          setSavingBinding(true);
          try {
            await gitService.setGitHubRemote(path, remote);
            if (useRepoStore.getState().currentRepo?.path !== path) return;
            setGithubRemote(remote);
            await refreshAll();
            toast.success(t('remote.githubSaved'));
          } catch (error: any) { toast.error(t('remote.loadFailed'), error?.message); }
          finally { setSavingBinding(false); }
        }}>
          <option value="auto">{t('remote.automatic')}</option>
          {githubRemote !== 'auto' && !remotes.some(remote => remote.name === githubRemote && parseGitHubRemote(remote.fetchUrl)) && <option value={githubRemote} disabled>{githubRemote} — {t('remote.invalid')}</option>}
          {remotes.filter(remote => parseGitHubRemote(remote.fetchUrl)).map(remote => <option key={remote.name} value={remote.name}>{remote.name} — {remote.fetchUrl}</option>)}
        </select>
      </label>

      {/* Add form */}
      {adding && (
        <div className="p-2 rounded-lg border border-border/70 bg-accent/40 space-y-1.5">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            aria-label={t('settings.remotes.namePlaceholder')} placeholder={t('settings.remotes.namePlaceholder')}
            className="h-7 text-[12px] font-mono"
            autoFocus
          />
          <Input
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
            aria-label={t('settings.remotes.urlPlaceholder')} placeholder={t('settings.remotes.urlPlaceholder')}
            className="h-7 text-[12px] font-mono"
          />
          <div className="flex items-center justify-end gap-1.5">
            <Button
              variant="ghost"
              size="xs"
              onClick={() => setAdding(false)}
              className="h-6 text-[12px] text-muted-foreground hover:text-foreground"
            >
              {t('common.cancel')}
            </Button>
            <Button variant="outline" size="xs" onClick={handleAdd} className="h-6 text-[12px] gap-1">
              <Check className="h-3 w-3" />
              <span>{t('settings.remotes.add')}</span>
            </Button>
          </div>
        </div>
      )}

      {/* Remote list */}
      {remotes.length === 0 && !isLoading && !loadError ? (
        <div className="text-[12px] text-muted-foreground/60 italic">
          {t('settings.remotes.empty')}
        </div>
      ) : (
        <div className="space-y-1">
          {remotes.map((r) => (
            <div
              key={r.name}
              className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg border border-border/60 bg-card/50 text-[12px] group"
            >
              {editingName === r.name ? (
                <>
                  <Input
                    value={editingUrl}
                    onChange={(e) => setEditingUrl(e.target.value)}
                    className="h-6 flex-1 text-[12px] font-mono"
                    autoFocus
                  />
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => handleSaveUrl(r.name)}
                    className="h-6 w-6 p-0 hover:text-git-added shrink-0"
                    title={t('settings.remotes.save')}
                  >
                    <Check className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => setEditingName(null)}
                    className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground shrink-0"
                    title={t('common.cancel')}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </>
              ) : (
                <>
                  <div className="min-w-0 flex-1">
                    <span className="font-mono font-semibold text-foreground">{r.name}</span>
                    <div className="font-mono text-[11px] text-muted-foreground truncate" title={r.fetchUrl}>{t('remote.pullFrom')}: {r.fetchUrl}</div>
                    <div className="font-mono text-[11px] text-muted-foreground truncate" title={r.pushUrl}>{t('remote.pushTo')}: {r.pushUrl || r.fetchUrl}</div>
                  </div>
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 shrink-0">
                    <Button variant="ghost" size="xs" title={t('remote.prune')} onClick={async () => {
                      const path = repoPath;
                      try {
                        await gitService.fetch(path, r.name, true);
                        if (useRepoStore.getState().currentRepo?.path === path) await refreshAll();
                        toast.success(t('remote.pruneDone'), r.name);
                      } catch (error: any) { toast.error(t('header.fetchFailed'), error?.message); }
                    }}><RefreshCw className="h-3 w-3" /></Button>
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => {
                        setEditingName(r.name);
                        setEditingUrl(r.fetchUrl || r.pushUrl);
                      }}
                      className="h-6 px-1.5 text-[11px] text-muted-foreground hover:text-foreground"
                      title={t('settings.remotes.edit')}
                    >
                      {t('settings.remotes.edit')}
                    </Button>
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => handleRemove(r.name)}
                      className="h-6 w-6 p-0 hover:text-git-deleted"
                      title={t('settings.remotes.remove')}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
