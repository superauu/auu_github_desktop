import { useEffect, useRef, useState } from 'react';
import { History, Loader2, RefreshCw, X, Pencil, Trash2 } from 'lucide-react';
import { ModalSurface } from '@/components/ui/ModalSurface';
import { Button } from '@/components/ui/button';
import { branchSafetyService, type RecoveryPoint } from '@/services/git/BranchSafetyService';
import { historyWorkflowService, type ReflogEntry } from '@/services/git/HistoryWorkflowService';
import { gitService } from '@/services/git/GitService';
import { useRepoStore } from '@/stores/repoStore';
import { confirmAction } from '@/stores/confirmStore';
import { useI18n } from '@/i18n';
import { toast } from '@/stores/toastStore';

export function RecoveryCenterDialog({ repoPath, onClose }: { repoPath: string; onClose: () => void }) {
  const { t, lang } = useI18n();
  const [entries, setEntries] = useState<ReflogEntry[]>([]);
  const [tab, setTab] = useState<'points' | 'reflog'>('points');
  const [comparison, setComparison] = useState<{ head: string; text: string; hash: string } | null>(null);
  const [recoverName, setRecoverName] = useState('');
  const [pointName, setPointName] = useState('');
  const [editingRef, setEditingRef] = useState<string | null>(null);
  const [editedName, setEditedName] = useState('');
  const comparisonRef = useRef<HTMLElement | null>(null);
  useEffect(() => { comparisonRef.current?.scrollIntoView({ block: 'nearest' }); }, [comparison]);
  const [points, setPoints] = useState<RecoveryPoint[]>([]);
  const [branch, setBranch] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true; setLoading(true); setError('');
    Promise.all([branchSafetyService.list(repoPath), gitService.getStatus(repoPath), historyWorkflowService.reflog(repoPath)]).then(([result, status, log]) => {
      if (active) { setPoints(result); setBranch(status.currentBranch); setEntries(log); }
    }).catch(error => { if (active) setError(error.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [repoPath, revision]);
  const run = async (point?: RecoveryPoint) => {
    setBusy(true); setError('');
    try {
      if (point) {
        const diff = await historyWorkflowService.compare(repoPath, point.hash);
        const head = diff.head;
        if (!head) throw new Error(t('safety.stale'));
        if (!await confirmAction({ title: t('recovery.restore'), description: t('recovery.confirm').replace('{branch}', point.branch).replace('{from}', head.slice(0, 8)).replace('{to}', point.hash.slice(0, 8)), danger: true, detail: diff.text || t('flow.noDiff') })) return;
        await branchSafetyService.restore(repoPath, point, head);
        if (useRepoStore.getState().currentRepo?.path === repoPath) await useRepoStore.getState().refreshAll();
        toast.success(t('recovery.restored'));
      } else {
        await branchSafetyService.create(repoPath, pointName);
        setPointName('');
        toast.success(t('recovery.created'));
      }
      setRevision(value => value + 1);
    } catch (error: any) { setError(error.message); }
    finally { setBusy(false); }
  };
  const inspect = async (hash: string) => {
    setBusy(true); setError('');
    try { const result = await historyWorkflowService.compare(repoPath, hash); setComparison({ ...result, hash }); setRecoverName(`recovered/${hash.slice(0, 8)}`); }
    catch (error: any) { setError(error.message); } finally { setBusy(false); }
  };
  const recover = async () => {
    if (!comparison) return; setBusy(true); setError('');
    try { await historyWorkflowService.recoverBranch(repoPath, comparison.hash, recoverName); toast.success(t('flow.branchRecovered')); if (useRepoStore.getState().currentRepo?.path === repoPath) await useRepoStore.getState().refreshAll(); setRevision(value => value + 1); }
    catch (error: any) { setError(error.message); } finally { setBusy(false); }
  };
  const renamePoint = async (point: RecoveryPoint) => {
    setBusy(true); setError('');
    try {
      await branchSafetyService.rename(repoPath, point, editedName);
      setEditingRef(null); setRevision(value => value + 1);
      toast.success(t('recoveryManage.renamed'));
    } catch (error: any) { setError(error.message); }
    finally { setBusy(false); }
  };
  const deletePoint = async (point: RecoveryPoint) => {
    setBusy(true); setError('');
    try {
      if (!await confirmAction({ title: t('recoveryManage.delete'), confirmLabel: t('recoveryManage.delete'), danger: true,
        description: t('recoveryManage.deleteConfirm').replace('{name}', point.name || t(`recovery.op.${point.operation}`)),
        detail: `${point.branch} · ${point.hash.slice(0, 12)} · ${new Date(point.timestamp).toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US')}` })) return;
      await branchSafetyService.remove(repoPath, point);
      if (editingRef === point.ref) setEditingRef(null);
      if (comparison?.hash === point.hash) setComparison(null);
      setPoints(previous => previous.filter(item => item.ref !== point.ref));
      setRevision(value => value + 1); toast.success(t('recoveryManage.deleted'));
    } catch (error: any) { setError(error.message); }
    finally { setBusy(false); }
  };
  return <ModalSurface label={t('recovery.title')} onDismiss={onClose} dismissible={!busy} className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
    <div className="w-full max-w-2xl max-h-[85dvh] bg-card border border-border rounded-xl shadow-2xl p-5 flex flex-col gap-4">
      <header className="flex items-center justify-between gap-3"><h2 className="font-semibold flex items-center gap-2"><History className="w-5 h-5 text-primary" />{t('recovery.title')}</h2><Button variant="ghost" size="icon" disabled={busy} aria-label={t('common.close')} onClick={onClose}><X className="w-4 h-4" /></Button></header>
      <p className="text-sm text-muted-foreground">{t('recovery.description')}</p>
      <form className="space-y-2" onSubmit={event => { event.preventDefault(); if (!busy && !loading) void run(); }}>
        <label className="block text-sm space-y-1"><span>{t('recoveryManage.name')}</span><input value={pointName} maxLength={80} disabled={busy || loading} onChange={event => setPointName(event.target.value)} placeholder={t('recoveryManage.namePlaceholder')} className="w-full rounded border border-input bg-background p-2 text-sm" /></label>
        <div className="flex gap-2"><Button type="submit" variant="outline" disabled={busy || loading}>{busy && <Loader2 className="w-4 h-4 animate-spin" />}{t('recovery.create')}</Button><Button type="button" variant="ghost" disabled={busy || loading} onClick={() => setRevision(value => value + 1)}><RefreshCw className="w-4 h-4" />{t('worktree.refresh')}</Button></div>
      </form>
      {error && <p role="alert" className="text-sm text-destructive break-words">{error}</p>}
      <div className="flex gap-2"><Button variant={tab === 'points' ? 'secondary' : 'ghost'} onClick={() => setTab('points')}>{t('flow.savedPoints')}</Button><Button variant={tab === 'reflog' ? 'secondary' : 'ghost'} onClick={() => setTab('reflog')}>{t('flow.reflog')}</Button></div>
      <div className="min-h-0 overflow-y-auto space-y-2">
        {tab === 'reflog' && <><p className="text-xs text-muted-foreground">{t('flow.reflogHint')}</p>{entries.slice(0, 150).map((entry, index) => <div key={`${entry.selector}-${index}`} className="border border-border rounded-lg p-3 flex justify-between gap-2 text-sm"><div className="min-w-0"><p className="break-words">{entry.subject}</p><p className="text-xs text-muted-foreground break-all">{entry.hash.slice(0, 8)} · {entry.selector.split('@{')[0].replace('refs/heads/', '')} · {new Date(entry.timestamp).toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US')}</p></div><Button disabled={busy} variant="outline" size="sm" onClick={() => void inspect(entry.hash)}>{t('flow.inspectRecover')}</Button></div>)}</>}
        {tab === 'points' && <>
        {loading ? <p role="status" className="text-sm text-muted-foreground">{t('common.loading')}</p> : !points.length ? <p className="py-8 text-center text-sm text-muted-foreground">{t('recovery.empty')}</p> : points.map(point => <div key={point.ref} className="rounded-lg border border-border p-3 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0 text-sm space-y-1"><p className="font-medium break-all">{point.name || t(`recovery.op.${point.operation}`)}</p><p className="text-xs text-muted-foreground break-all">{point.branch} · {t(`recovery.op.${point.operation}`)} · {new Date(point.timestamp).toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US')}</p><code className="text-xs select-text">{point.hash.slice(0, 12)}</code></div>
            <div className="flex flex-wrap gap-1">
              <Button variant="ghost" size="sm" disabled={busy || loading} onClick={() => { setEditingRef(point.ref); setEditedName(point.name || ''); }}>{t('recoveryManage.rename')}<Pencil className="w-3 h-3 ml-1" /></Button>
              <Button variant="ghost" size="sm" className="text-destructive" disabled={busy || loading} onClick={() => void deletePoint(point)}>{t('recoveryManage.delete')}<Trash2 className="w-3 h-3 ml-1" /></Button>
              <Button variant="ghost" size="sm" disabled={busy || loading} onClick={() => void inspect(point.hash)}>{t('flow.compare')}</Button><Button variant="outline" size="sm" disabled={busy || loading || point.branch !== branch} title={point.branch !== branch ? t('safety.sameBranch') : t('recovery.restore')} onClick={() => void run(point)}>{t('recovery.restore')}</Button>
            </div>
          </div>
          {editingRef === point.ref && <form className="space-y-2" onSubmit={event => { event.preventDefault(); if (!busy) void renamePoint(point); }}>
            <label className="block text-sm space-y-1"><span>{t('recoveryManage.renameLabel')}</span><input autoFocus value={editedName} maxLength={80} disabled={busy} onChange={event => setEditedName(event.target.value)} placeholder={t('recoveryManage.clearNameHint')} className="w-full rounded border border-input bg-background p-2 text-sm" /></label>
            <div className="flex gap-2"><Button type="submit" size="sm" disabled={busy}>{t('recoveryManage.saveName')}</Button><Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => setEditingRef(null)}>{t('common.cancel')}</Button></div>
          </form>}
        </div>)}</>}
        {comparison && <section ref={comparisonRef} className="rounded-lg border border-primary/30 p-3 space-y-3"><h3 className="text-sm font-medium">HEAD → {comparison.hash.slice(0, 8)}</h3><pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words text-xs select-text">{comparison.text || t('flow.noDiff')}</pre><label className="text-sm block space-y-1"><span>{t('flow.recoverName')}</span><input value={recoverName} disabled={busy} onChange={e => setRecoverName(e.target.value)} className="w-full rounded border border-input bg-background p-2" /></label><Button disabled={busy || !recoverName.trim()} onClick={() => void recover()}>{t('flow.recoverBranch')}</Button></section>}
      </div>
    </div>
  </ModalSurface>;
}
