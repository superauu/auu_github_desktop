import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ModalSurface } from '@/components/ui/ModalSurface';
import { useI18n } from '@/i18n';
import { useRepoStore } from '@/stores/repoStore';
import { confirmWorkingReview } from '@/features/review/confirmWorkingReview';
import { hunkCommitService, HunkCommitError, validateHunkGroups, type HunkCommitPlan, type HunkCommitGroup, type HunkCommitResult } from '@/services/git/HunkCommitService';
import { HunkAiSuggestions } from './HunkAiSuggestions';
import { formatDiffHunkLabel } from '@/utils/diffHunkLabel';
import { createHunkDraftSession, type HunkDraftResult, type HunkDraftSession } from '@/services/git/HunkPlanDraftService';
import { useCurrentBranchIssue } from '@/features/issues/useCurrentBranchIssue';
import { HunkIssueReferences } from './HunkIssueReferences';

let sequence = 0;
const emptyGroup = (): HunkCommitGroup => ({ id: `hunk-group-${++sequence}`, title: '', body: '', units: [] });
type Phase = 'reading' | 'review' | 'checking' | 'writing' | 'done' | 'stopped';
export function HunkCommitPlannerDialog({ repoPath, branch, onClose }: { repoPath: string; branch: string; onClose: () => void }) {
  const { t, lang } = useI18n();
  const currentTask = useCurrentBranchIssue();
  const [plan, setPlan] = useState<HunkCommitPlan | null>(null);
  const [groups, setGroups] = useState<HunkCommitGroup[]>([]);
  const [phase, setPhase] = useState<Phase>('reading');
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<{ title: string; diff: string } | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [completed, setCompleted] = useState<HunkCommitResult[]>([]);
  const [recovery, setRecovery] = useState('');
  const [search, setSearch] = useState(''), [limit, setLimit] = useState(50);
  const [stopping, setStopping] = useState(false);
  const [aiBlocked, setAiBlocked] = useState(false), [revision, setRevision] = useState(0);
  const [draft, setDraft] = useState<HunkDraftResult | null>(null), [draftBusy, setDraftBusy] = useState(false);
  const [draftStatus, setDraftStatus] = useState<'' | 'saved' | 'unavailable'>(''), [dirty, setDirty] = useState(false);
  const draftSession = useRef<HunkDraftSession | null>(null);
  const aiBlockedRef = useRef(false);
  const [issueBlocked, setIssueBlocked] = useState(false);
  const issueBlockedRef = useRef(false);
  const updateIssueBlocked = useCallback((value: boolean) => { issueBlockedRef.current = value; setIssueBlocked(value); }, []);
  const updateAiBlocked = useCallback((value: boolean) => { aiBlockedRef.current = value; setAiBlocked(value); }, []);
  const abort = useRef<AbortController | null>(null), generation = useRef(0), previewGeneration = useRef(0), mounted = useRef(true), submitting = useRef(false), stop = useRef(false);
  const current = () => { const state = useRepoStore.getState(); return state.currentRepo?.path === repoPath && (state.status?.currentBranch || state.currentRepo.currentBranch) === branch; };
  const writing = phase === 'writing' || phase === 'checking';
  const pendingDraft = draft?.status === 'matching' || draft?.status === 'stale';
  const editable = phase === 'review' && !previewing && !aiBlocked && !issueBlocked && !pendingDraft && !draftBusy;
  let assigned = 0, valid = false;
  if (plan) { try { assigned = validateHunkGroups(plan, groups, false).size; validateHunkGroups(plan, groups); valid = true; } catch { /* Show guidance until the groups are complete. */ } }
  const persistDraft = useEffectEvent(() => {
    if (dirty && phase === 'review' && !pendingDraft && !draftBusy) setDraftStatus(draftSession.current?.save(groups) ? 'saved' : 'unavailable');
  });
  useEffect(() => { persistDraft(); }, [groups, dirty, phase, pendingDraft, draftBusy]);
  const change = (update: (previous: HunkCommitGroup[]) => HunkCommitGroup[]) => { previewGeneration.current++; setPreview(null); setRevision(value => value + 1); setDirty(true); setGroups(update); };
  const read = async (discardDraft = false) => {
    if (submitting.current) return;
    abort.current?.abort(); const controller = new AbortController(); abort.current = controller;
    const id = ++generation.current; previewGeneration.current++;
    const cleared = !discardDraft || !draftSession.current || draftSession.current.clear();
    draftSession.current = null; setDraft(null); setDraftBusy(false); setDirty(false); setDraftStatus(cleared ? '' : 'unavailable');
    setPlan(null); setGroups([]); setCompleted([]); setRecovery(''); setError(''); setPreview(null); setPreviewing(false); setPhase('reading'); setSearch(''); setLimit(50); setStopping(false); stop.current = false;
    try {
      const snapshot = await hunkCommitService.capture(repoPath, controller.signal);
      if (!mounted.current || id !== generation.current) return;
      if (!current() || snapshot.branch !== branch) throw new Error(t('hunkPlan.stale'));
      let session: HunkDraftSession | null = null;
      try { session = await createHunkDraftSession(snapshot); } catch { /* Manual planning remains usable without local storage or hashing. */ }
      if (!mounted.current || id !== generation.current) return;
      if (!current()) throw new Error(t('hunkPlan.stale'));
      draftSession.current = session;
      if (!session) setDraftStatus('unavailable');
      else if (discardDraft) { if (!session.clear()) setDraftStatus('unavailable'); }
      else {
        const saved = session.load(); setDraft(saved);
        if (saved.status === 'unavailable' || saved.status === 'invalid') setDraftStatus('unavailable');
      }
      setPlan(snapshot); setGroups([emptyGroup()]); setPhase('review');
    } catch (reason) { if (mounted.current && id === generation.current) { setError(reason instanceof Error ? reason.name === 'AbortError' ? t('hunkPlan.cancelled') : reason.message : String(reason)); setPhase('stopped'); } }
  };
  const start = useEffectEvent(() => { void read(); });
  const invalidate = useCallback(() => { mounted.current = false; generation.current++; previewGeneration.current++; abort.current?.abort(); stop.current = true; }, []);
  useEffect(() => {
    mounted.current = true; start();
    return invalidate;
  }, [repoPath, branch, invalidate]);
  const restoreDraft = async () => {
    if (!plan || draft?.status !== 'matching' || draftBusy || submitting.current) return;
    const id = generation.current; setDraftBusy(true); setError('');
    try {
      await hunkCommitService.verify(plan);
      if (!mounted.current || id !== generation.current) return;
      if (!current()) throw new Error(t('hunkPlan.stale'));
      setGroups(draft.groups.map(group => ({ ...group, id: `hunk-group-${++sequence}`, units: [...group.units] })));
      setDraft(null); setDirty(true); setRevision(value => value + 1);
    } catch (reason) { if (mounted.current && id === generation.current) { setError(reason instanceof Error ? reason.message : String(reason)); setPhase('stopped'); } }
    finally { if (mounted.current && id === generation.current) setDraftBusy(false); }
  };
  const inspect = async (index: number) => {
    if (!plan || !editable || submitting.current) return;
    const id = ++previewGeneration.current; setPreviewing(true); setError(''); setPreview(null);
    try {
      const diff = await hunkCommitService.preview(plan, groups.map(group => ({ ...group, units: [...group.units] })), index);
      if (mounted.current && current() && id === previewGeneration.current) setPreview({ title: `${index + 1}. ${groups[index].title}`, diff });
    } catch (reason) { if (mounted.current && id === previewGeneration.current) setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { if (mounted.current && id === previewGeneration.current) setPreviewing(false); }
  };
  const submit = async () => {
    if (!plan || !valid || !editable || submitting.current || aiBlockedRef.current || issueBlockedRef.current || pendingDraft || draftBusy) return;
    submitting.current = true; setPhase('checking'); setError(''); setPreview(null);
    const reviewed = groups.map(group => ({ ...group, units: [...group.units] }));
    try {
      if (!current()) throw new Error(t('hunkPlan.stale'));
      const paths = new Set(plan.units.filter(unit => reviewed.some(group => group.units.includes(unit.id))).map(unit => unit.path));
      if (!await confirmWorkingReview(repoPath, branch, plan.files.filter(file => paths.has(file.path)), false, plan.head)) { if (mounted.current) { setPhase('review'); onClose(); } return; }
      if (!mounted.current || !current()) throw new Error(t('hunkPlan.stale'));
      // A crash or lost response during commit creation must not resurrect a
      // pre-execution plan on the next launch. Git state is always reread.
      setDirty(false); setDraftStatus(draftSession.current?.clear() ? '' : 'unavailable');
      setPhase('writing');
      const result = await hunkCommitService.execute(plan, reviewed, { canContinue: () => mounted.current && current() && !stop.current, onProgress: commits => {
        if (useRepoStore.getState().currentRepo?.path === repoPath) useRepoStore.setState({ redoStack: [] });
        if (mounted.current) setCompleted(commits);
      } });
      if (mounted.current) { setCompleted(result.completed); setRecovery(result.recoveryRef || ''); setPhase('done'); }
    } catch (reason) { if (mounted.current) { if (reason instanceof HunkCommitError) { setCompleted(reason.completed); setRecovery(reason.recoveryRef || ''); } setError(reason instanceof Error ? reason.message : String(reason)); setPhase('stopped'); } }
    finally { submitting.current = false; if (useRepoStore.getState().currentRepo?.path === repoPath) await useRepoStore.getState().refreshAll().catch(() => {}); }
  };
  const move = (index: number, delta: number) => change(previous => { const copy = [...previous]; [copy[index], copy[index + delta]] = [copy[index + delta], copy[index]]; return copy; });
  const units = plan?.units.filter(unit => unit.path.toLowerCase().includes(search.toLowerCase())) || [];
  return <ModalSurface label={t('hunkPlan.title')} onDismiss={onClose} dismissible={!writing} className="fixed inset-0 z-60 bg-black/50 flex items-center justify-center p-3">
    <div className="w-full max-w-5xl max-h-[92dvh] bg-card border border-border rounded-xl shadow-2xl flex flex-col">
      <header className="flex items-center justify-between gap-3 p-4 border-b border-border"><h2 className="font-semibold">{t('hunkPlan.title')}</h2><Button variant="ghost" size="icon" disabled={writing} aria-label={t('common.close')} onClick={onClose}><X className="h-4 w-4" /></Button></header>
      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
        <p className="text-sm text-muted-foreground">{t('hunkPlan.scope')}</p>
        <p className="text-xs text-muted-foreground break-all">{repoPath} · {branch}</p>
        {phase === 'reading' && <p role="status">{t('common.loading')}</p>}
        {phase === 'checking' && <p role="status">{t('workingReview.checking')}</p>}
        {phase === 'writing' && <p role="status">{t('hunkPlan.writing').replace('{n}', String(Math.min(completed.length + 1, groups.length))).replace('{total}', String(groups.length))}{stopping && ` · ${t('hunkPlan.stopRequested')}`}</p>}
        {error && <p role="alert" className="text-sm text-destructive whitespace-pre-wrap wrap-break-word">{error}</p>}
        {draftStatus && <p role="status" className="text-xs text-muted-foreground">{t(draftStatus === 'saved' ? 'hunkDraft.saved' : 'hunkDraft.unavailable')}</p>}
        {plan && (phase === 'review' || writing) && <>
          {pendingDraft && <section aria-label={t('hunkDraft.title')} className="border border-border rounded-lg p-3 space-y-3">
            <h3 className="font-medium text-sm">{t('hunkDraft.title')}</h3>
            <p className="text-sm">{t(draft.status === 'matching' ? 'hunkDraft.matching' : 'hunkDraft.stale')}</p>
            <ol className="list-decimal pl-5 text-xs space-y-1">{draft.groups.map((group, index) => <li key={index} className="break-all">{group.title || t('hunkPlan.subject')} · {t('hunkPlan.count').replace('{n}', String(group.units.length))}</li>)}</ol>
            <div className="flex flex-wrap gap-2">{draft.status === 'matching' && <Button size="sm" disabled={draftBusy} onClick={() => void restoreDraft()}>{t('hunkDraft.restore')}</Button>}<Button size="sm" variant="outline" disabled={draftBusy} onClick={() => { const cleared = draftSession.current?.clear(); setDraft(null); setDraftStatus(cleared ? '' : 'unavailable'); }}>{t('hunkDraft.discard')}</Button></div>
            {draftBusy && <p role="status" className="text-xs">{t('hunkAi.applying')}</p>}
          </section>}
          {phase === 'review' && <HunkAiSuggestions plan={plan} blocked={writing || previewing || issueBlocked || pendingDraft || draftBusy} revision={revision} onBlockedChange={updateAiBlocked} onApply={suggested => {
            previewGeneration.current++; setPreview(null); setDirty(true); setGroups(suggested.map(group => ({ ...group, id: `hunk-group-${++sequence}`, units: [...group.units] })));
          }} />}
          {phase === 'review' && <HunkIssueReferences plan={plan} groups={groups} task={currentTask} blocked={writing || previewing || aiBlocked || pendingDraft || draftBusy} onBlockedChange={updateIssueBlocked} onApply={suggested => change(() => suggested)} onNavigate={onClose} />}
          <div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-sm">{t('hunkPlan.count').replace('{n}', String(plan.units.length))}</strong><span className="text-xs text-muted-foreground">{t('hunkPlan.remaining').replace('{n}', String(plan.units.length - assigned))}</span></div>
          <section aria-label={t('hunkPlan.pool')} className="space-y-2">
            <input type="search" aria-label={t('hunkPlan.search')} placeholder={t('hunkPlan.search')} value={search} onChange={event => { setSearch(event.target.value); setLimit(50); }} className="w-full h-9 px-3 border border-input bg-background rounded-md text-sm" />
            <ul className="max-h-80 overflow-auto space-y-2">{units.slice(0, limit).map(unit => <li key={unit.id} className="border border-border rounded-md p-3 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-sm min-w-0 break-all font-mono">{unit.path}</span><select disabled={!editable} aria-label={`${t('hunkPlan.assign')}: ${unit.path} ${unit.kind === 'file' ? t('hunkPlan.wholeFile') : formatDiffHunkLabel(unit.label, lang)}`} value={groups.find(group => group.units.includes(unit.id))?.id || ''} onChange={event => change(previous => previous.map(group => ({ ...group, units: group.id === event.target.value ? [...group.units, unit.id] : group.units.filter(id => id !== unit.id) })))} className="h-8 max-w-full min-w-0 border border-input bg-background rounded-md px-2 text-xs"><option value="">{t('hunkPlan.unassigned')}</option>{groups.map((group, index) => <option key={group.id} value={group.id}>{index + 1}. {group.title || t('hunkPlan.group')}</option>)}</select></div>
              <details className="text-xs"><summary className="cursor-pointer min-h-7 break-all" title={unit.label}>{unit.kind === 'file' ? t('hunkPlan.wholeFile') : formatDiffHunkLabel(unit.label, lang)}</summary><pre className="max-h-60 overflow-auto bg-muted p-2 rounded select-text">{unit.patch}</pre></details>
            </li>)}</ul>
            {units.length > limit && <Button variant="outline" onClick={() => setLimit(value => value + 50)}>{t('hunkPlan.showMore')}</Button>}
          </section>
          {groups.map((group, index) => <section key={group.id} aria-label={`${t('hunkPlan.group')} ${index + 1}`} className="border border-border rounded-lg p-3 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-sm">{index + 1} / {groups.length} · {t('hunkPlan.count').replace('{n}', String(group.units.length))}</strong><div className="flex flex-wrap gap-1">
              <Button size="icon" variant="ghost" aria-label={t('batch.up')} disabled={!editable || !index} onClick={() => move(index, -1)}><ArrowUp className="h-4 w-4" /></Button>
              <Button size="icon" variant="ghost" aria-label={t('batch.down')} disabled={!editable || index === groups.length - 1} onClick={() => move(index, 1)}><ArrowDown className="h-4 w-4" /></Button>
              {index > 0 && <Button size="xs" variant="ghost" disabled={!editable} onClick={() => change(previous => previous.flatMap((value, i) => i === index ? [] : i === index - 1 ? [{ ...value, units: [...value.units, ...previous[index].units], body: [value.body, previous[index].body].filter(Boolean).join('\n\n') }] : [value]))}>{t('hunkPlan.merge')}</Button>}
              {!group.units.length && groups.length > 1 && <Button size="xs" variant="ghost" disabled={!editable} onClick={() => change(previous => previous.filter(value => value.id !== group.id))}>{t('hunkPlan.remove')}</Button>}
            </div></div>
            <label className="block text-xs space-y-1"><span>{t('hunkPlan.subject')}</span><input disabled={!editable} value={group.title} maxLength={120} onChange={event => change(previous => previous.map(value => value.id === group.id ? { ...value, title: event.target.value } : value))} className="w-full h-9 px-3 border border-input bg-background rounded-md text-sm" /></label>
            <label className="block text-xs space-y-1"><span>{t('hunkPlan.body')}</span><textarea disabled={!editable} value={group.body} maxLength={6000} onChange={event => change(previous => previous.map(value => value.id === group.id ? { ...value, body: event.target.value } : value))} className="w-full min-h-16 p-3 border border-input bg-background rounded-md text-sm" /></label>
            <p className="text-xs text-muted-foreground break-all">{[...new Set(plan.units.filter(unit => group.units.includes(unit.id)).map(unit => unit.path))].join(' · ')}</p>
            {group.reason && <p className="text-xs text-muted-foreground whitespace-pre-wrap wrap-break-word">{t('hunkAi.reason')}：{group.reason}</p>}
            <Button size="sm" variant="outline" disabled={!editable || !group.units.length} onClick={() => void inspect(index)}>{t('hunkPlan.preview')}</Button>
          </section>)}
          <Button variant="outline" disabled={!editable || groups.length >= 12} onClick={() => change(previous => [...previous, emptyGroup()])}><Plus className="h-4 w-4" />{t('hunkPlan.newGroup')}</Button>
          {!valid && <p className="text-xs text-muted-foreground">{t('hunkPlan.invalidGroups')}</p>}
          {previewing && <p role="status">{t('common.loading')}</p>}
          {preview && <section aria-label={t('hunkPlan.previewTitle')} className="space-y-2"><h3 className="font-semibold text-sm">{preview.title}</h3><p className="text-xs text-muted-foreground">{t('hunkPlan.previewHint')}</p><pre className="max-h-80 overflow-auto bg-muted border border-border p-3 rounded-md text-xs select-text">{preview.diff}</pre></section>}
          <p className="text-xs text-muted-foreground">{t('hunkPlan.hooks')}</p>
        </>}
        {(completed.length > 0 || phase === 'done') && <section className="space-y-2"><p role="status" className="font-medium">{t('hunkPlan.completed').replace('{n}', String(completed.length))}</p><ol className="text-sm space-y-2">{completed.map(commit => <li key={commit.hash}><code className="mr-2 text-primary">{commit.hash.slice(0, 7)}</code>{commit.title}</li>)}</ol><p className="text-xs text-muted-foreground">{t('hunkPlan.indexPreserved')}</p>{recovery && <p className="text-xs text-muted-foreground break-all">{t('batch.recovery')} <code>{recovery}</code></p>}</section>}
      </div>
      <footer className="flex flex-wrap justify-end gap-2 p-4 border-t border-border">
        <Button variant="outline" disabled={writing} onClick={onClose}>{t('common.close')}</Button>
        {phase === 'reading' ? <Button variant="outline" onClick={() => { generation.current++; abort.current?.abort(); setError(t('hunkPlan.cancelled')); setPhase('stopped'); }}>{t('hunkPlan.cancelRead')}</Button> : !writing && <Button variant="outline" disabled={previewing || draftBusy} onClick={() => void read(true)}>{t(completed.length ? 'hunkPlan.retryRemaining' : 'hunkPlan.reload')}</Button>}
        {phase === 'review' && <Button disabled={!valid || !editable} onClick={() => void submit()}>{t('hunkPlan.confirm').replace('{n}', String(groups.length))}</Button>}
        {phase === 'writing' && <Button variant="outline" disabled={stopping} onClick={() => { stop.current = true; setStopping(true); }}>{t('hunkPlan.stop')}</Button>}
      </footer>
    </div>
  </ModalSurface>;
}
