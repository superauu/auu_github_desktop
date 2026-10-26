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
    setSteps(previous => { const next = [...previous]; const [step] = next.splice(from, 1); next.splice(to, 0, step); return next; });
  };
  /** reword 预填原提交的完整信息（主题 + 正文），用户在其基础上改写。 */
  const prefillMessage = (hash: string) => {
    const commit = plan?.commits.find(item => item.hash === hash);
    return [commit?.subject, commit?.body?.trim()].filter(Boolean).join('\n\n');
  };
  const setAction = (index: number, action: HistoryStep['action']) => {
    setSteps(previous => previous.map((item, i) => i !== index ? item : {
      ...item,
      action,
      ...(action === 'reword' && !item.message ? { message: prefillMessage(item.hash) } : {}),
      ...(action !== 'reword' && item.message ? { message: undefined } : {}),
    }));
  };
  const execute = async () => {
    if (!plan) return;
    // 纯 rebase 路径（仅调整顺序/合并）仍要求首条为保留；重放路径无此限制。
    if (!steps.some(step => step.action === 'reword' || step.action === 'drop') && steps[0]?.action !== 'pick') { setError(t('flow.firstPickRequired')); return; }
    const detail = steps.map(step => `${step.action} ${step.hash.slice(0, 8)} ${plan.commits.find(commit => commit.hash === step.hash)?.subject}${step.action === 'reword' ? `\n  → ${(step.message ?? '').split('\n')[0]}` : ''}`).join('\n');
    if (!await confirmAction({ title: t('flow.rewrite'), description: t('flow.rewriteConfirm'), detail })) return;
    setBusy(true); setError('');
    try { await historyWorkflowService.rewrite(repoPath, plan, steps); toast.success(t('flow.rewriteDone')); onClose(); }
    catch (error: any) { setError(`${error.message}\n${t('flow.rewriteFailure')}`); }
    finally { if (useRepoStore.getState().currentRepo?.path === repoPath) await useRepoStore.getState().refreshAll(); setBusy(false); }
  };
  return <ModalSurface label={t('flow.historyEditor')} onDismiss={onClose} dismissible={!busy} className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4"><div className="w-full max-w-3xl max-h-[88dvh] flex flex-col gap-4 bg-card border border-border rounded-xl shadow-2xl p-5">
    <header className="flex justify-between items-center"><h2 className="font-semibold">{t('flow.historyEditor')}</h2><Button variant="ghost" size="icon" disabled={busy} aria-label={t('common.close')} onClick={onClose}><X className="w-4 h-4" /></Button></header>
    <p className="text-sm text-muted-foreground">{t('flow.historyEditorHint')}</p>
    <label className="text-sm flex gap-3 items-center">{t('flow.recentCommits')}<select disabled={busy} value={count} onChange={e => setCount(Number(e.target.value))} className="border border-input bg-background p-2 rounded">{[2, 5, 10, 20, 30].map(n => <option key={n}>{n}</option>)}</select></label>
    {plan?.published && <p role="status" className="text-sm rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-300 p-3">{t('flow.publishedWarn')}</p>}
    {error && <p role="alert" className="text-sm text-destructive whitespace-pre-wrap break-words">{error}</p>}
    <ol className="min-h-0 overflow-y-auto space-y-2">{loading ? <p role="status">{t('common.loading')}</p> : plan && steps.map((step, index) => <li key={step.hash} draggable={!busy} onDragStart={() => setDrag(index)} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); if (drag !== null) move(drag, index); setDrag(null); }} onDragEnd={() => setDrag(null)} className="border border-border rounded-lg p-2 text-sm">
      <div className="flex items-center gap-2">
        <GripVertical className="w-4 h-4 text-muted-foreground shrink-0" /><span className="text-xs text-muted-foreground">{index + 1}</span><div className="min-w-0 flex-1"><p className={step.action === 'drop' ? 'truncate line-through text-muted-foreground' : 'truncate'}>{plan.commits.find(commit => commit.hash === step.hash)?.subject}</p><code className="text-xs text-muted-foreground">{step.hash.slice(0, 8)}</code></div>
        <select aria-label={`${t('flow.action')} ${index + 1}`} disabled={busy} value={step.action} onChange={e => setAction(index, e.target.value as HistoryStep['action'])} className="border border-input bg-background rounded p-1">
          <option value="pick">{t('flow.pick')}</option>
          {/* 首条不能是合并类（没有可并入的上一条）；其余动作按路径校验在执行时把关 */}
          <option value="squash" disabled={index === 0}>{t('flow.squash')}</option>
          <option value="fixup" disabled={index === 0}>{t('flow.fixup')}</option>
          <option value="reword">{t('flow.reword')}</option>
          <option value="drop">{t('flow.drop')}</option>
        </select>
        <Button variant="ghost" size="icon" disabled={busy || index === 0} aria-label={t('flow.moveUp')} onClick={() => move(index, index - 1)}><ArrowUp className="w-4 h-4" /></Button><Button variant="ghost" size="icon" disabled={busy || index === steps.length - 1} aria-label={t('flow.moveDown')} onClick={() => move(index, index + 1)}><ArrowDown className="w-4 h-4" /></Button>
      </div>
      {step.action === 'reword' && <textarea aria-label={t('flow.rewordLabel')} rows={3} disabled={busy} value={step.message ?? ''} onChange={e => setSteps(previous => previous.map((item, i) => i === index ? { ...item, message: e.target.value } : item))} className="mt-2 w-full rounded-md border border-input bg-background p-2 text-[13px] leading-relaxed font-sans" placeholder={t('flow.rewordPlaceholder')} />}
    </li>)}</ol>
    <footer className="flex justify-end gap-2"><Button variant="outline" disabled={busy} onClick={onClose}>{t('common.close')}</Button><Button disabled={busy || loading || !plan} onClick={() => void execute()}>{busy && <Loader2 className="w-4 h-4 animate-spin" />}{t('flow.rewrite')}</Button></footer>
  </div></ModalSurface>;
}
