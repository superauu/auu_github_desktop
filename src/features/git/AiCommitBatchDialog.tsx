import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronDown, Plus, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ModalSurface } from '@/components/ui/ModalSurface';
import { ErrorNotice } from '@/components/ui/ErrorNotice';
import { FilePath } from '@/components/ui/FilePath';
import { useI18n } from '@/i18n';
import { useSettingsStore } from '@/stores/settingsStore';
import { useRepoStore } from '@/stores/repoStore';
import { toast } from '@/stores/toastStore';
import { analyzeCommitBatch } from '@/services/ai/AiCommitBatchService';
import { commitBatchService, CommitBatchError, validateBatchGroups, type CommitBatchPlan, type BatchCommitGroup, type CompletedBatchCommit, type BatchCaptureProgress } from '@/services/git/CommitBatchService';
import { CommitPlanningProgress, type PlanningTiming } from './CommitPlanningProgress';
import { chooseRemoteTarget } from '@/services/git/RemoteActions';
import { gitService } from '@/services/git/GitService';
import { watchPushedCommit } from '@/services/git/PushChecks';
import { openGitSettings } from '@/utils/errorGuidance';
import { useGitOperationStatus } from '@/hooks/useGitOperationStatus';

type Phase = 'ready' | 'collecting' | 'analyzing' | 'review' | 'choosing' | 'committing' | 'done' | 'stopped';
// 分组在移动/合并/重命名间保持稳定 key，避免输入状态错绑到错误分组
let batchGroupSeq = 0;
const withBatchGroupIds = (groups: BatchCommitGroup[]) => groups.map(group => ({ ...group, id: group.id ?? `batch-g${++batchGroupSeq}` }));
type PushTarget = NonNullable<Awaited<ReturnType<typeof chooseRemoteTarget>>>;
export function AiCommitBatchDialog({ repoPath, branch, onClose, onOpenAiSettings }: { repoPath: string; branch: string; onClose: () => void; onOpenAiSettings: () => void }) {
  const { t, lang } = useI18n();
  const { activity, elapsed, operationLabel, waitHint } = useGitOperationStatus(repoPath);
  const config = useSettingsStore(state => state.aiConfig);
  const configured = config.provider === 'openai-compatible' && !!config.apiKey.trim();
  const [phase, setPhase] = useState<Phase>('ready');
  const [captureProgress, setCaptureProgress] = useState<BatchCaptureProgress>({ stage: 'waiting', completed: 0, total: 0 });
  const [timing, setTiming] = useState<PlanningTiming | null>(null);
  const [plan, setPlan] = useState<CommitBatchPlan | null>(null);
  const [groups, setGroups] = useState<BatchCommitGroup[]>([]);
  const [summary, setSummary] = useState('');
  const [model, setModel] = useState('');
  const [endpoint, setEndpoint] = useState('');
  const [errorOrigin, setErrorOrigin] = useState<'git' | 'ai'>('git');
  const [error, setError] = useState('');
  const [indexError, setIndexError] = useState('');
  const [completed, setCompleted] = useState<CompletedBatchCommit[]>([]);
  const [recoveryRef, setRecoveryRef] = useState('');
  const [pushTarget, setPushTarget] = useState<PushTarget | null>(null);
  const [pushState, setPushState] = useState<'idle' | 'pushing' | 'success' | 'failed'>('idle');
  const abort = useRef<AbortController | null>(null), generation = useRef(0), submitting = useRef(false), mounted = useRef(true);
  const latest = useRef({ config, lang }); latest.current = { config, lang };
  const current = () => { const state = useRepoStore.getState(); return state.currentRepo?.path === repoPath && (state.status?.currentBranch || state.currentRepo.currentBranch) === branch; };
  const analyzing = phase === 'collecting' || phase === 'analyzing';
  const writing = phase === 'committing' || phase === 'choosing' || pushState === 'pushing';
  const explainedError = ['batch.cancelled', 'batch.analysisTimeout', 'batch.stale', 'batch.invalid', 'batch.localBranch', 'batch.tooMany', 'batch.renameOverlap', 'batch.submodule', 'batch.noNetChanges', 'safety.operationActive', 'explain.configure'].some(key => t(key) === error);
  let valid = false;
  try { if (plan && groups.length) { validateBatchGroups(groups, plan.files.map(file => file.path)); valid = true; } } catch { /* Inline guidance is shown below. */ }

  const analyze = async () => {
    if (submitting.current) return;
    abort.current?.abort(); const controller = new AbortController(); abort.current = controller;
    const settings = latest.current;
    const id = ++generation.current;
    setTiming({ startedAt: Date.now() });
    setCaptureProgress({ stage: 'waiting', completed: 0, total: 0 });
    setPhase('collecting'); setErrorOrigin('git'); setPlan(null); setError(''); setIndexError(''); setGroups([]); setSummary(''); setCompleted([]); setRecoveryRef(''); setPushTarget(null); setPushState('idle');
    try {
      const snapshot = await commitBatchService.capture(repoPath, controller.signal, progress => {
        if (id === generation.current && mounted.current) setCaptureProgress(progress);
      });
      if (id !== generation.current || !mounted.current) return;
      if (!current() || snapshot.branch !== branch) throw new Error(t('batch.stale'));
      setTiming(previous => previous && ({ ...previous, collectedAt: Date.now() }));
      setPlan(snapshot); setPhase('analyzing'); setErrorOrigin('ai'); setModel(settings.config.model); setEndpoint(settings.config.endpoint);
      const result = await analyzeCommitBatch(snapshot, settings.config, settings.lang, controller.signal);
      if (id !== generation.current || !mounted.current) return;
      if (!current()) throw new Error(t('batch.stale'));
      setTiming(previous => previous && ({ ...previous, finishedAt: Date.now() }));
      setGroups(withBatchGroupIds(result.groups)); setSummary(result.summary); setModel(settings.config.model); setPhase('review');
    } catch (reason) {
      if (id === generation.current && mounted.current) { setTiming(previous => previous && ({ ...previous, finishedAt: Date.now() })); setError(reason instanceof Error ? reason.name === 'AbortError' ? t('batch.cancelled') : reason.message : String(reason)); setPhase('ready'); }
    }
  };
  useEffect(() => {
    mounted.current = true;
    if (latest.current.config.provider === 'openai-compatible' && latest.current.config.apiKey.trim()) void analyze();
    return () => { mounted.current = false; generation.current++; abort.current?.abort(); };
  }, [repoPath, branch]);

  const push = async (target: PushTarget, commits: CompletedBatchCommit[]) => {
    setPushState('pushing'); setErrorOrigin('git'); setError('');
    try {
      const state = await gitService.getStatus(repoPath);
      if (!current() || state.currentBranch !== branch || state.headOid !== commits.at(-1)?.hash) throw new Error(t('batch.stale'));
      const result = await gitService.push(repoPath, target.remote, branch, target);
      if (result?.preferenceError) toast.warning(t('remote.preferenceNotSaved'), result.preferenceError);
      await watchPushedCommit(repoPath, target.remote, branch, commits.at(-1)!.hash, current);
      if (mounted.current) setPushState('success');
      toast.success(t('rightPane.pushSuccess'));
    } catch (reason) { if (mounted.current) { setPushState('failed'); setError(reason instanceof Error ? reason.message : String(reason)); } }
  };
  const submit = async (andPush: boolean) => {
    if (!plan || !valid || phase !== 'review' || submitting.current) return;
    submitting.current = true; setErrorOrigin('git'); setError('');
    try {
      setPhase(andPush ? 'choosing' : 'committing');
      const target = andPush ? await chooseRemoteTarget(repoPath, branch) : null;
      if (andPush && !target) { if (mounted.current) setPhase('review'); return; }
      if (!current()) throw new Error(t('batch.stale'));
      if (mounted.current) { setPushTarget(target); setPhase('committing'); }
      const result = await commitBatchService.execute(plan, groups, { canContinue: current, onProgress: commits => { if (useRepoStore.getState().currentRepo?.path === repoPath) useRepoStore.setState({ redoStack: [] }); if (mounted.current) setCompleted(commits); } });
      if (mounted.current) { setCompleted(result.completed); setRecoveryRef(result.recoveryRef || ''); setPhase('done'); }
      if (target) await push(target, result.completed);
    } catch (reason) {
      if (mounted.current) {
        if (reason instanceof CommitBatchError) { setCompleted(reason.completed); setRecoveryRef(reason.recoveryRef || ''); setIndexError(reason.indexError || ''); }
        setError(reason instanceof Error ? reason.message : String(reason)); setPhase('stopped');
      }
    } finally {
      submitting.current = false;
      if (useRepoStore.getState().currentRepo?.path === repoPath) await useRepoStore.getState().refreshAll().catch(() => {});
    }
  };
  const move = (index: number, delta: number) => setGroups(previous => { const copy = [...previous]; [copy[index], copy[index + delta]] = [copy[index + delta], copy[index]]; return copy; });
  const moveFile = (path: string, destination: number) => setGroups(previous => previous.map((group, index) => ({ ...group, files: index === destination ? [...group.files, path] : group.files.filter(file => file !== path) })));
  const merge = (index: number) => setGroups(previous => previous.flatMap((group, i) => i === index ? [] : i === index - 1 ? [{ ...group, body: [group.body, previous[index].body].filter(Boolean).join('\n\n'), files: [...group.files, ...previous[index].files] }] : [group]));
  const cancelAnalysis = () => { generation.current++; abort.current?.abort(); setTiming(previous => previous && ({ ...previous, finishedAt: Date.now() })); setPhase('ready'); setError(t('batch.cancelled')); };

  return <ModalSurface label={t('batch.title')} onDismiss={onClose} dismissible={!writing} className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4">
    <div className="w-full max-w-4xl max-h-[90dvh] bg-card border border-border rounded-xl shadow-2xl flex flex-col">
      <header className="flex items-center justify-between gap-3 p-5 border-b border-border"><h2 className="font-semibold flex gap-2 items-center"><Sparkles className="h-4 w-4 text-primary" />{t('batch.title')}</h2><Button variant="ghost" size="icon" disabled={writing} aria-label={t('common.close')} onClick={onClose}><X className="h-4 w-4" /></Button></header>
      <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4">
        <p className="text-sm text-muted-foreground">{t('batch.scope')}</p>
        <p className="text-xs text-muted-foreground break-all">{repoPath} · {branch}</p>
        {(configured || model) && <p className="text-xs text-muted-foreground break-all">{t('batch.provider')}{model || config.model} · {endpoint || config.endpoint}</p>}
        {!configured && <div className="space-y-2"><p>{t('batch.configure')}</p><Button variant="outline" onClick={() => { onClose(); onOpenAiSettings(); }}>{t('composer.configureAi')}</Button></div>}
        {timing && <CommitPlanningProgress phase={phase} progress={captureProgress} timing={timing} />}
        {phase === 'choosing' && <p role="status">{t('batch.choosing')}</p>}
        {phase === 'committing' && <div className="space-y-2 rounded-lg bg-muted p-3"><p role="status">{t('batch.committing').replace('{n}', String(Math.min(completed.length + 1, groups.length))).replace('{total}', String(groups.length))} {groups[completed.length]?.title}</p><p className="text-xs text-muted-foreground">{t('batch.hookHint')}</p></div>}
        {(phase === 'committing' || pushState === 'pushing') && activity && <div className="space-y-1 text-sm"><p role="status">{operationLabel} · {elapsed}s</p>{waitHint && <p className="text-xs text-git-tag">{waitHint}</p>}</div>}
        {error && <div role="alert">{explainedError ? <p className="text-sm text-destructive">{error}</p> : errorOrigin === 'ai' ? <div className="space-y-2 text-sm"><p className="text-destructive">{t('batch.analysisFailed')}</p><details className="text-xs text-muted-foreground"><summary className="cursor-pointer min-h-7">{t('ui.error.details')}</summary><pre className="whitespace-pre-wrap break-words max-h-48 overflow-auto">{error}</pre></details><Button variant="outline" onClick={() => { onClose(); onOpenAiSettings(); }}>{t('composer.configureAi')}</Button></div> : <ErrorNotice error={error} onOpenSettings={() => { onClose(); openGitSettings(); }} />}</div>}
        {indexError && <div role="alert" className="text-destructive text-sm">{t('batch.indexError')}<pre className="whitespace-pre-wrap break-words text-xs">{indexError}</pre></div>}
        {phase === 'review' && <>
          <p className="font-medium">{t('batch.preview').replace('{n}', String(groups.length)).replace('{files}', String(plan?.files.length || 0))}</p>
          <p className="text-sm whitespace-pre-wrap">{summary}</p>
          {plan?.truncated && <p className="text-xs text-git-tag">{t('batch.truncated')}</p>}
          {plan?.skipped.length ? <p className="text-xs text-muted-foreground break-words">{t('batch.skipped')} {plan.skipped.join(', ')}</p> : null}
        </>}
        {(phase === 'review' || phase === 'committing' || phase === 'choosing') && groups.map((group, index) => <section key={group.id ?? index} aria-label={`${index + 1}. ${group.title}`} className="p-4 border border-border rounded-lg space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-sm">{index + 1} / {groups.length} · {group.files.length} {t('batch.files')}</strong><div className="flex flex-wrap gap-1">
            <Button size="icon" variant="ghost" disabled={writing || index === 0} aria-label={t('batch.up')} onClick={() => move(index, -1)}><ArrowUp className="h-4 w-4" /></Button>
            <Button size="icon" variant="ghost" disabled={writing || index === groups.length - 1} aria-label={t('batch.down')} onClick={() => move(index, 1)}><ArrowDown className="h-4 w-4" /></Button>
            {index > 0 && <Button variant="ghost" size="xs" disabled={writing} onClick={() => merge(index)}>{t('batch.merge')}</Button>}
            {!group.files.length && <Button variant="ghost" size="xs" disabled={writing} onClick={() => setGroups(previous => previous.filter((_, i) => i !== index))}>{t('batch.remove')}</Button>}
          </div></div>
          <label className="block text-xs space-y-1"><span>{t('batch.subject')}</span><input className="w-full h-9 px-3 border border-input bg-background rounded-md text-sm" value={group.title} disabled={writing} maxLength={120} onChange={event => setGroups(previous => previous.map((value, i) => i === index ? { ...value, title: event.target.value } : value))} /></label>
          <label className="block text-xs space-y-1"><span>{t('batch.body')}</span><textarea className="w-full min-h-20 p-3 border border-input bg-background rounded-md text-sm" value={group.body} disabled={writing} maxLength={6000} onChange={event => setGroups(previous => previous.map((value, i) => i === index ? { ...value, body: event.target.value } : value))} /></label>
          {group.reason && <p className="text-xs text-muted-foreground whitespace-pre-wrap">{t('batch.reason')}：{group.reason}</p>}
          <ul className="space-y-2">{group.files.map(path => <li key={path} className="flex flex-wrap items-center gap-2 justify-between">
            <div className="min-w-0 flex-[1_1_10rem]"><FilePath path={path} /></div>
            <div className="relative w-56 max-w-full min-w-0 shrink-0">
              <select className="w-full min-w-0 h-8 appearance-none truncate border border-input rounded-md bg-background pl-3 pr-8 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-40" disabled={writing} aria-label={`${t('batch.move')}: ${path}`} title={`${index + 1}. ${group.title}`} value={index} onChange={event => moveFile(path, Number(event.target.value))}>
                {groups.map((candidate, i) => <option key={candidate.id ?? i} value={i}>{i + 1}. {candidate.title}</option>)}
              </select>
              <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            </div>
          </li>)}</ul>
        </section>)}
        {phase === 'review' && <Button variant="outline" disabled={groups.length >= 12} onClick={() => setGroups(previous => [...previous, { id: `batch-g${++batchGroupSeq}`, title: t('batch.newTitle'), body: '', reason: '', files: [] }])}><Plus className="h-4 w-4" />{t('batch.add')}</Button>}
        {phase === 'review' && !valid && <p role="alert" className="text-sm text-git-tag">{t('batch.empty')}</p>}
        {(phase === 'done' || phase === 'stopped' || (phase === 'committing' && completed.length > 0)) && <div className="space-y-3"><p role="status" className="font-medium">{t(phase === 'stopped' ? 'batch.stopped' : 'batch.complete').replace('{n}', String(completed.length))}</p><ol className="space-y-2 text-sm">{completed.map(commit => <li key={commit.hash}><code className="text-primary mr-2">{commit.hash.slice(0, 7)}</code>{commit.title}</li>)}</ol>{recoveryRef && <p className="text-xs text-muted-foreground">{t('batch.recovery')}</p>}</div>}
        {pushTarget && <p className="text-xs text-muted-foreground break-all">{t('batch.pushTarget')}{branch} → {pushTarget.remote}/{pushTarget.targetBranch}</p>}
        {pushState !== 'idle' && <p role={pushState === 'failed' ? 'alert' : 'status'} className="text-sm">{t(pushState === 'pushing' ? 'batch.pushing' : pushState === 'failed' ? 'batch.pushFailed' : 'batch.pushed')}</p>}
        {plan && <details className="text-xs text-muted-foreground"><summary className="cursor-pointer min-h-7">{t('batch.context')}</summary><pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words select-text bg-muted p-3 rounded-md">{plan.context}</pre></details>}
      </div>
      <footer className="flex flex-wrap justify-end gap-2 p-4 border-t border-border">
        <Button variant="outline" disabled={writing} onClick={onClose}>{t('common.close')}</Button>
        {analyzing ? <Button variant="outline" onClick={cancelAnalysis}>{t('batch.cancelAnalysis')}</Button> : !writing && phase !== 'done' && configured && <Button variant="outline" onClick={() => void analyze()}>{t(groups.length || phase === 'stopped' ? 'batch.retry' : 'batch.analyze')}</Button>}
        {phase === 'review' && <><Button disabled={!valid} onClick={() => void submit(false)}>{t('batch.confirm').replace('{n}', String(groups.length))}</Button><Button variant="outline" disabled={!valid} onClick={() => void submit(true)}>{t('batch.confirmPush')}</Button></>}
        {pushState === 'failed' && pushTarget && <Button onClick={() => { if (submitting.current) return; submitting.current = true; void push(pushTarget, completed).finally(() => { submitting.current = false; }); }}>{t('batch.retryPush')}</Button>}
      </footer>
    </div>
  </ModalSurface>;
}
