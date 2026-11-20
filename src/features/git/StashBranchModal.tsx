import { useShallow } from 'zustand/react/shallow';
import { ModalSurface } from '@/components/ui/ModalSurface';
import React, { useEffect, useState } from 'react';
import { GitBranch, X, Loader2 } from 'lucide-react';
import { useI18n } from '@/i18n';
import { useRepoStore } from '@/stores/repoStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/stores/toastStore';
import type { GitStash } from '@/services/git/types';

/** 从贮藏建分支：输入新分支名，在新分支上恢复该贮藏（原贮藏保留）。 */
export const StashBranchModal: React.FC<{ stash: GitStash | null; onClose: () => void }> = ({ stash, onClose }) => {
  const { t } = useI18n();
  const { currentRepo, stashBranch } = useRepoStore(useShallow(state => ({ currentRepo: state.currentRepo, stashBranch: state.stashBranch })));
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { setName(''); setBusy(false); setError(''); }, [stash]);
  if (!stash || !currentRepo) return null;
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy || !name.trim()) return;
    setBusy(true); setError('');
    try {
      await stashBranch(name.trim(), stash.index);
      toast.success(t('sidebar.ctx.stashBranched'), name.trim());
      onClose();
    } catch (reason: any) {
      setError(String(reason?.message || reason));
      setBusy(false);
    }
  };
  return <ModalSurface onDismiss={onClose} dismissible={!busy} label={t('sidebar.ctx.stashBranch')}
    className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-xs p-3">
    <form onSubmit={submit} className="w-full max-w-md rounded-xl border border-border bg-card p-5 space-y-4 shadow-2xl">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold flex items-center gap-2"><GitBranch className="h-4 w-4 text-primary" />{t('sidebar.ctx.stashBranch')}</h2>
        <Button type="button" variant="ghost" size="icon" aria-label={t('common.close')} onClick={onClose} disabled={busy}><X className="h-4 w-4" /></Button>
      </div>
      <p className="text-xs text-muted-foreground break-all">stash@{`{${stash.index}}`} · {stash.message}</p>
      <label className="block space-y-1 text-xs" htmlFor="stash-branch-name">
        <span>{t('worktree.branchName')}</span>
        <Input id="stash-branch-name" value={name} onChange={event => setName(event.target.value)} required autoFocus placeholder="from-stash/main" disabled={busy} />
      </label>
      {error && <p role="alert" className="text-sm text-destructive wrap-break-word">{error}</p>}
      <div className="flex justify-end gap-2 border-t border-border pt-3">
        <Button type="button" variant="outline" onClick={onClose} disabled={busy}>{t('common.cancel')}</Button>
        <Button type="submit" disabled={busy || !name.trim()}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}{t('common.confirm')}</Button>
      </div>
    </form>
  </ModalSurface>;
};
