import { useEffect, useState } from 'react';
import { FolderGit2, Loader2, RefreshCw, X } from 'lucide-react';
import { ModalSurface } from '@/components/ui/ModalSurface';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/i18n';
import { gitService } from '@/services/git/GitService';
import { sameWorktreePath } from '@/services/git/worktrees';
import type { GitWorktree } from '@/services/git/types';
import { useRepoStore } from '@/stores/repoStore';
import { toast } from '@/stores/toastStore';

export function WorktreesDialog({ repoPath, onClose }: { repoPath: string; onClose: () => void }) {
  const { t } = useI18n();
  const branches = useRepoStore(state => state.branches);
  const [trees, setTrees] = useState<GitWorktree[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [newMode, setNewMode] = useState(true);
  const [newBranch, setNewBranch] = useState('');
  const [base, setBase] = useState('HEAD');
  const [existingBranch, setExistingBranch] = useState('');
  const [manualPath, setManualPath] = useState<string | null>(null);
  const [openAfter, setOpenAfter] = useState(true);
  const name = newMode ? newBranch : existingBranch;
  const targetPath = manualPath ?? `${repoPath.replace(/[/\\]$/, '')}-${name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '-') || 'worktree'}`;
  const freeBranches = branches.filter(branch => !branch.isRemote && !trees.some(tree => tree.branch === `refs/heads/${branch.name}`));

  useEffect(() => {
    let active = true; setLoading(true); setError('');
    gitService.getWorktrees(repoPath).then(value => { if (active) setTrees(value); })
      .catch(error => { if (active) setError(String(error?.message || error)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [repoPath, revision]);

  const openTree = async (path: string) => {
    const repo = await gitService.openRepository(path);
    if (useRepoStore.getState().currentRepo?.path !== repoPath) return;
    useRepoStore.getState().addRecentRepo(repo);
    useRepoStore.getState().setCurrentRepo(repo);
    onClose();
  };
  const create = async () => {
    setBusy(true); setError('');
    try {
      await gitService.createWorktree(repoPath, targetPath, newMode ? base : existingBranch, newMode ? newBranch : undefined);
      toast.success(t('worktree.created'), targetPath);
      if (openAfter) await openTree(targetPath);
      else { setRevision(value => value + 1); await useRepoStore.getState().refreshAll(); }
    } catch (error: any) { setError(String(error?.message || error)); }
    finally { setBusy(false); }
  };
  const fieldClass = 'w-full rounded-md border border-input bg-background px-3 py-2 text-sm';
  return <ModalSurface label={t('worktree.title')} onDismiss={onClose} dismissible={!busy}
    className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
    <div className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-xl border border-border bg-card shadow-2xl p-5 gap-4">
      <div className="flex items-center justify-between shrink-0"><h2 className="font-semibold flex items-center gap-2"><FolderGit2 className="h-4 w-4" />{t('worktree.title')}</h2><Button size="icon" variant="ghost" disabled={busy} onClick={onClose} aria-label={t('common.close')}><X className="h-4 w-4" /></Button></div>
      <div className="overflow-y-auto min-h-0 space-y-4 pr-1">
        <p className="text-xs text-muted-foreground">{t('worktree.description')}</p>
        <div className="flex items-center justify-between"><h3 className="text-sm font-medium">{t('worktree.existing')}</h3><Button size="xs" variant="outline" disabled={busy || loading} onClick={() => setRevision(value => value + 1)}><RefreshCw className="h-3 w-3" />{t('worktree.refresh')}</Button></div>
        {loading && <p className="text-xs text-muted-foreground" role="status">{t('worktree.loading')}</p>}
        <ul className="space-y-2 max-h-56 overflow-y-auto">{trees.map((tree, index) => <li key={tree.path} className="rounded-md border border-border p-3 flex items-center justify-between gap-3">
          <div className="min-w-0 text-xs space-y-1"><p className="font-semibold">{tree.branch?.replace(/^refs\/heads\//, '') || (tree.bare ? t('worktree.bare') : t('worktree.detached'))} {index === 0 && <span className="text-muted-foreground">· {t('worktree.main')}</span>} {sameWorktreePath(tree.path, repoPath) && <span className="text-primary">· {t('worktree.current')}</span>}</p>
            <p className="font-mono break-all text-muted-foreground select-text">{tree.path}</p>
            {tree.locked && <p className="text-amber-500">{t('worktree.locked')}{typeof tree.locked === 'string' ? `: ${tree.locked}` : ''}</p>}
            {tree.prunable && <p className="text-amber-500">{t('worktree.unavailable')}</p>}
          </div>
          <Button size="sm" variant="outline" disabled={busy || !!tree.bare || !!tree.prunable || sameWorktreePath(tree.path, repoPath)} onClick={async () => { setBusy(true); setError(''); try { await openTree(tree.path); } catch (error: any) { setError(String(error?.message || error)); } finally { setBusy(false); } }}>{t('worktree.open')}</Button>
        </li>)}</ul>
        <h3 className="text-sm font-medium border-t border-border pt-4">{t('worktree.create')}</h3>
        <label className="block text-sm space-y-1"><span>{t('worktree.branchMode')}</span><select className={fieldClass} disabled={busy} value={newMode ? 'new' : 'existing'} onChange={event => { setNewMode(event.target.value === 'new'); if (!existingBranch) setExistingBranch(freeBranches[0]?.name || ''); }}><option value="new">{t('worktree.newBranch')}</option><option value="existing">{t('worktree.useExisting')}</option></select></label>
        {newMode ? <>
          <label className="block text-sm space-y-1"><span>{t('worktree.branchName')}</span><input className={fieldClass} value={newBranch} disabled={busy} onChange={event => setNewBranch(event.target.value)} placeholder="feature/my-task" /></label>
          <label className="block text-sm space-y-1"><span>{t('worktree.base')}</span><select className={fieldClass} value={base} disabled={busy} onChange={event => setBase(event.target.value)}><option value="HEAD">HEAD</option>{branches.map(branch => <option key={`${branch.isRemote}-${branch.name}`} value={branch.isRemote ? `refs/remotes/${branch.name}` : `refs/heads/${branch.name}`}>{branch.name}</option>)}</select></label>
        </> : <label className="block text-sm space-y-1"><span>{t('worktree.branchName')}</span><select className={fieldClass} value={existingBranch} disabled={busy} onChange={event => setExistingBranch(event.target.value)}><option value="" disabled>{t('worktree.pickFree')}</option>{freeBranches.map(branch => <option key={branch.name} value={branch.name}>{branch.name}</option>)}</select></label>}
        <label className="block text-sm space-y-1"><span>{t('worktree.path')}</span><input className={`${fieldClass} font-mono`} disabled={busy} value={targetPath} onChange={event => setManualPath(event.target.value)} /></label>
        <label className="text-xs flex items-center gap-2"><input type="checkbox" checked={openAfter} disabled={busy} onChange={event => setOpenAfter(event.target.checked)} />{t('worktree.openAfter')}</label>
        {error && <p role="alert" className="text-sm text-destructive break-words">{error}</p>}
      </div>
      <div className="flex justify-end gap-2 border-t border-border pt-3 shrink-0"><Button variant="outline" disabled={busy} onClick={onClose}>{t('common.close')}</Button><Button disabled={busy || loading || !name || !targetPath || (!newMode && !freeBranches.some(branch => branch.name === existingBranch))} onClick={() => void create()}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}{t('worktree.create')}</Button></div>
    </div>
  </ModalSurface>;
}
