import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, GripVertical, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ModalSurface } from '@/components/ui/ModalSurface';
import { useI18n } from '@/i18n';
import { historyWorkflowService, type HistoryPlan, type HistoryStep } from '@/services/git/HistoryWorkflowService';
import { confirmAction } from '@/stores/confirmStore';
import { useRepoStore } from '@/stores/repoStore';
import { toast } from '@/stores/toastStore';

export function HistoryEditorDialog({ repoPath, onClose }: { repoPath: string; onClose: () => void }) {
  const { t } = useI18n();
  const [count, setCount] = useState(10);
  const [plan, setPlan] = useState<HistoryPlan | null>(null);
  const [steps, setSteps] = useState<HistoryStep[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [drag, setDrag] = useState<number | null>(null);
  useEffect(() => {
    let active = true; setLoading(true); setError(''); setPlan(null);
    historyWorkflowService.plan(repoPath, count).then(value => { if (active) { setPlan(value); setSteps(value.commits.map(commit => ({ hash: commit.hash, action: 'pick' }))); } }).catch(error => { if (active) setError(error.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [repoPath, count]);
  const move = (from: number, to: number) => {
    if (busy || to < 0 || to >= steps.length) return;
    setSteps(previous => { const next = [...previous]; const [step] = next.splice(from, 1); next.splice(to, 0, step); next[0] = { ...next[0], action: 'pick' }; return next; });
  };
  const execute = async () => {
    if (!plan || !await confirmAction({ title: t('flow.rewrite'), description: t('flow.rewriteConfirm'), detail: steps.map(step => `${step.action} ${step.hash.slice(0, 8)} ${plan.commits.find(commit => commit.hash === step.hash)?.subject}`).join('\n') })) return;
    setBusy(true); setError('');
    try { await historyWorkflowService.rewrite(repoPath, plan, steps); toast.success(t('flow.rewriteDone')); onClose(); }
    catch (error: any) { setError(`${error.message}\n${t('flow.rewriteFailure')}`); }
    finally { if (useRepoStore.getState().currentRepo?.path === repoPath) await useRepoStore.getState().refreshAll(); setBusy(false); }
  };
  return <ModalSurface label={t('flow.historyEditor')} onDismiss={onClose} dismissible={!busy} className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4"><div className="w-full max-w-3xl max-h-[88dvh] flex flex-col gap-4 bg-card border border-border rounded-xl shadow-2xl p-5">
    <header className="flex justify-between items-center"><h2 className="font-semibold">{t('flow.historyEditor')}</h2><Button variant="ghost" size="icon" disabled={busy} aria-label={t('common.close')} onClick={onClose}><X className="w-4 h-4" /></Button></header>
    <p className="text-sm text-muted-foreground">{t('flow.historyEditorHint')}</p>
    <label className="text-sm flex gap-3 items-center">{t('flow.recentCommits')}<select disabled={busy} value={count} onChange={e => setCount(Number(e.target.value))} className="border border-input bg-background p-2 rounded">{[2, 5, 10, 20, 30].map(n => <option key={n}>{n}</option>)}</select></label>
    {error && <p role="alert" className="text-sm text-destructive whitespace-pre-wrap break-words">{error}</p>}
    <ol className="min-h-0 overflow-y-auto space-y-2">{loading ? <p role="status">{t('common.loading')}</p> : plan && steps.map((step, index) => <li key={step.hash} draggable={!busy} onDragStart={() => setDrag(index)} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); if (drag !== null) move(drag, index); setDrag(null); }} onDragEnd={() => setDrag(null)} className="flex items-center gap-2 border border-border rounded-lg p-2 text-sm">
      <GripVertical className="w-4 h-4 text-muted-foreground shrink-0" /><span className="text-xs text-muted-foreground">{index + 1}</span><div className="min-w-0 flex-1"><p className="truncate">{plan.commits.find(commit => commit.hash === step.hash)?.subject}</p><code className="text-xs text-muted-foreground">{step.hash.slice(0, 8)}</code></div>
      <select aria-label={`${t('flow.action')} ${index + 1}`} disabled={busy || index === 0} value={step.action} onChange={e => setSteps(previous => previous.map((item, i) => i === index ? { ...item, action: e.target.value as HistoryStep['action'] } : item))} className="border border-input bg-background rounded p-1"><option value="pick">{t('flow.pick')}</option><option value="squash">{t('flow.squash')}</option><option value="fixup">{t('flow.fixup')}</option></select>
      <Button variant="ghost" size="icon" disabled={busy || index === 0} aria-label={t('flow.moveUp')} onClick={() => move(index, index - 1)}><ArrowUp className="w-4 h-4" /></Button><Button variant="ghost" size="icon" disabled={busy || index === steps.length - 1} aria-label={t('flow.moveDown')} onClick={() => move(index, index + 1)}><ArrowDown className="w-4 h-4" /></Button>
    </li>)}</ol>
    <footer className="flex justify-end gap-2"><Button variant="outline" disabled={busy} onClick={onClose}>{t('common.close')}</Button><Button disabled={busy || loading || !plan} onClick={() => void execute()}>{busy && <Loader2 className="w-4 h-4 animate-spin" />}{t('flow.rewrite')}</Button></footer>
  </div></ModalSurface>;
}
