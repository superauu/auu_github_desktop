import { useEffect, useState } from 'react';
import { GitMerge, Loader2, RefreshCw, X } from 'lucide-react';
import { ModalSurface } from '@/components/ui/ModalSurface';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/i18n';
import { useRepoStore } from '@/stores/repoStore';
import type { GitBranch } from '@/services/git/types';
import { branchSafetyService, type BranchAction, type BranchPreview } from '@/services/git/BranchSafetyService';
import { AiExplanationButton } from './AiExplanationButton';
import { toast } from '@/stores/toastStore';

interface DragDropActionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceBranch: GitBranch | null;
  targetBranch: GitBranch | null;
  initialAction?: BranchAction;
  fixedAction?: boolean;
}

export function DragDropActionModal({ open, onOpenChange, sourceBranch: source, targetBranch: target, initialAction = 'merge', fixedAction = false }: DragDropActionModalProps) {
  const { t } = useI18n();
  const repoPath = useRepoStore(state => state.currentRepo?.path);
  const [action, setAction] = useState<BranchAction>('merge');
  const [preview, setPreview] = useState<BranchPreview | null>(null);
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const previewKey = JSON.stringify([repoPath, source?.name, source?.isRemote, target?.name, target?.isRemote]);
  const [loadedKey, setLoadedKey] = useState('');
  const [noFf, setNoFf] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => { setAction(initialAction); setNoFf(false); setMessage(''); }, [open, previewKey, initialAction]);
  useEffect(() => {
    let active = true; setPreview(null); setLoadedKey(''); setError('');
    if (!open || !repoPath || !source || !target) return;
    setChecking(true);
    branchSafetyService.preview(repoPath, source, target).then(result => { if (active) { setPreview(result); setLoadedKey(previewKey); } })
      .catch(error => { if (active) setError(error.message); }).finally(() => { if (active) setChecking(false); });
    return () => { active = false; };
  }, [open, previewKey, revision]);
  if (!open || !source || !target || !repoPath) return null;
  const affected = action === 'rebase-source' ? source : target;
  const upstream = action === 'rebase-source' ? target : source;
  const ready = preview && loadedKey === previewKey && !checking;
  const execute = async () => {
    if (!ready || busy) return;
    setBusy(true); setError('');
    try {
      await branchSafetyService.execute(preview, action, { noFf, message });
      toast.success(t(action === 'merge' ? 'drag.mergeDone' : 'drag.rebaseDone'));
      onOpenChange(false);
    } catch (error: any) {
      setError(error.message); setPreview(null);
      toast.error(t('drag.opIncomplete'), error.message);
    } finally {
      if (useRepoStore.getState().currentRepo?.path === repoPath) await useRepoStore.getState().refreshAll();
      setBusy(false);
    }
  };
  return <ModalSurface onDismiss={() => onOpenChange(false)} dismissible={!busy} label={t('drag.title')} className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-xs p-4">
    <div className="w-full max-w-2xl max-h-[90dvh] rounded-xl border border-border bg-card shadow-2xl p-5 flex flex-col gap-4">
      <header className="flex items-center justify-between gap-2"><h2 className="font-semibold flex items-center gap-2"><GitMerge className="w-5 h-5 text-primary" />{t('drag.title')}</h2><Button variant="ghost" size="icon" disabled={busy} aria-label={t('common.close')} onClick={() => onOpenChange(false)}><X className="w-4 h-4" /></Button></header>
      <div className="min-h-0 overflow-y-auto space-y-4">
        <fieldset disabled={busy} className="space-y-2"><legend className="text-sm text-muted-foreground mb-2">{t('drag.pickOp')}</legend>{(fixedAction ? [initialAction] : ['merge', 'rebase-target', 'rebase-source'] as BranchAction[]).map(value => <label key={value} className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer ${action === value ? 'border-primary bg-primary/5' : 'border-border hover:bg-accent/40'}`}>
          <input type="radio" name="branch-action" value={value} checked={action === value} onChange={() => setAction(value)} className="mt-1 accent-primary" />
          <span className="min-w-0 text-sm"><span className="block font-medium">{t(value === 'merge' ? 'drag.merge' : value === 'rebase-target' ? 'drag.rebaseTarget' : 'drag.rebaseSource')}</span><span className="block text-xs text-muted-foreground break-all">{value === 'merge' ? `${source.name} → ${target.name}` : `${value === 'rebase-source' ? source.name : target.name} → ${t('safety.onto')} ${value === 'rebase-source' ? target.name : source.name}`}</span></span>
        </label>)}</fieldset>
        {action === 'merge' && <fieldset disabled={busy} className="space-y-2 text-sm"><label className="flex items-center gap-2"><input type="checkbox" checked={noFf} onChange={e => setNoFf(e.target.checked)} />{t('merge.noFf')}</label>{noFf && <input aria-label={t('merge.customMsg')} placeholder={t('merge.customMsg')} value={message} onChange={e => setMessage(e.target.value)} className="w-full rounded border border-input bg-background p-2" />}</fieldset>}
        <section className="rounded-lg border border-border p-3 space-y-3">
          <div className="flex items-center justify-between"><h3 className="font-medium text-sm">{t('safety.preview')}</h3><Button variant="ghost" size="sm" disabled={busy || checking} onClick={() => setRevision(value => value + 1)}><RefreshCw className="w-3.5 h-3.5" />{t('worktree.refresh')}</Button></div>
          {checking && <p role="status" className="text-sm flex gap-2 items-center text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" />{t('safety.checking')}</p>}
          {ready && <>
            <div className="grid grid-cols-2 gap-2 text-xs"><p className="rounded bg-muted p-2 break-all">{source.name}: <strong>{preview.sourceOnly}</strong> {t('safety.uniqueCommits')}</p><p className="rounded bg-muted p-2 break-all">{target.name}: <strong>{preview.targetOnly}</strong> {t('safety.uniqueCommits')}</p></div>
            <div className="rounded bg-muted/50 p-3 space-y-2 text-xs">
              <p className="font-medium">{t('safety.historyResult')}</p>
              <svg viewBox="0 0 280 48" className="w-full h-12 text-primary" aria-hidden="true">
                {action !== 'merge' || (preview.targetOnly === 0 && !noFf) || preview.sourceOnly === 0 ? <><path d="M12 24 H264" fill="none" stroke="currentColor" strokeWidth="2" />{[18, 76, 134, 192, 256].map((x, i) => <circle key={x} cx={x} cy="24" r="5" fill={i > 2 ? 'currentColor' : 'hsl(var(--background))'} stroke="currentColor" strokeWidth="2" />)}</> : <><path d="M18 32 H256 M76 32 C94 32 90 10 116 10 H190 C218 10 218 32 240 32" fill="none" stroke="currentColor" strokeWidth="2" />{[[18,32],[76,32],[140,10],[190,10],[190,32],[240,32]].map(([x,y]) => <circle key={`${x}-${y}`} cx={x} cy={y} r="4" fill="currentColor" />)}</>}
              </svg>
              <p className="wrap-break-word">{t(action !== 'merge' ? 'safety.rebaseHistory' : preview.sourceOnly === 0 ? 'safety.upToDate' : preview.targetOnly === 0 && !noFf ? 'safety.fastForward' : 'safety.mergeHistory')}</p>
              <p className="text-muted-foreground">{t('safety.diagramHint')}</p>
            </div>
            <p className={`text-sm ${preview.conflictCheck === 'conflicts' ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'}`}>{t(`safety.conflict.${preview.conflictCheck}`)}</p>
            {preview.conflicts.length > 0 && <ul className="text-xs font-mono max-h-24 overflow-auto select-text">{preview.conflicts.map(path => <li key={path} className="break-all">{path}</li>)}</ul>}
            {action !== 'merge' && <p className="text-xs text-amber-600 dark:text-amber-400">{t('safety.rebaseConflictHint')}</p>}
            <details><summary className="text-sm cursor-pointer">{t('safety.incomingFiles')} ({preview.files.length})</summary><ul className="text-xs font-mono mt-2 max-h-28 overflow-auto select-text">{preview.files.map(path => <li key={path} className="break-all py-0.5">{path}</li>)}</ul></details>
            <AiExplanationButton repoPath={repoPath} scope={{ kind: 'branch', base: action === 'rebase-target' ? preview.sourceHash : preview.targetHash, head: action === 'rebase-target' ? preview.targetHash : preview.sourceHash }} />
          </>}
        </section>
        <p className="text-xs text-muted-foreground">{t('safety.recoveryHint')}</p>
        {affected.isRemote && <p role="alert" className="text-sm text-destructive">{t('safety.localRequired')}</p>}
        {error && <p role="alert" className="text-sm text-destructive whitespace-pre-wrap wrap-break-word">{error}</p>}
        {error && <AiExplanationButton repoPath={repoPath} scope={{ kind: 'error', message: error }} />}
      </div>
      <footer className="flex items-center justify-between gap-3 border-t border-border pt-3"><p className="text-xs text-muted-foreground break-all">{action === 'merge' ? `${upstream.name} → ${affected.name}` : `${affected.name} → ${t('safety.onto')} ${upstream.name}`}</p><Button disabled={busy || !ready || affected.isRemote} onClick={() => void execute()}>{busy && <Loader2 className="w-4 h-4 animate-spin" />}{t('drag.confirm')}</Button></footer>
    </div>
  </ModalSurface>;
}
