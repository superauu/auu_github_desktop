import { useCallback, useEffect, useRef, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/i18n';
import { useSettingsStore } from '@/stores/settingsStore';
import type { AiApiConfig, Language } from '@/stores/settingsStore';
import { useRepoStore } from '@/stores/repoStore';
import { aiHunkCommitService, buildHunkAiContext, type AiHunkGroup, type AiHunkSuggestion } from '@/services/ai/AiHunkCommitService';
import { hunkCommitService, type HunkCommitPlan } from '@/services/git/HunkCommitService';
import { formatDiffHunkLabel } from '@/utils/diffHunkLabel';

export function HunkAiSuggestions({ plan, blocked, revision, onApply, onBlockedChange }: {
  plan: HunkCommitPlan; blocked: boolean; revision: number;
  onApply: (groups: AiHunkGroup[]) => void; onBlockedChange: (blocked: boolean) => void;
}) {
  const { t, lang } = useI18n();
  const config = useSettingsStore(state => state.aiConfig);
  const configured = config.provider === 'openai-compatible' && !!config.apiKey.trim() && !!config.model.trim();
  const [phase, setPhase] = useState<'idle' | 'analyzing' | 'applying'>('idle');
  const [proposal, setProposal] = useState<AiHunkSuggestion | null>(null);
  const [applied, setApplied] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [input, setInput] = useState<ReturnType<typeof buildHunkAiContext> | null>(null);
  const [provider, setProvider] = useState('');
  const generation = useRef(0), controller = useRef<AbortController | null>(null), mounted = useRef(true), busy = useRef(false), hasProposal = useRef(false);
  const origin = useRef<{ config: AiApiConfig; lang: Language } | null>(null);
  const current = () => { const state = useRepoStore.getState(); return state.currentRepo?.path === plan.repoPath && (state.status?.currentBranch || state.currentRepo.currentBranch) === plan.branch; };
  const invalidate = useCallback(() => {
    generation.current++; controller.current?.abort(); busy.current = false; hasProposal.current = false; origin.current = null;
    onBlockedChange(false);
  }, [onBlockedChange]);
  const cleanup = useCallback(() => { mounted.current = false; invalidate(); }, [invalidate]);
  useEffect(() => { mounted.current = true; return cleanup; }, [plan, cleanup]);
  // A response from an old snapshot, settings, language or edits must never replace
  // the current review. Credentials only live in the request's memory.
  useEffect(() => {
    const interrupted = busy.current || hasProposal.current;
    invalidate(); setPhase('idle'); setProposal(null); setApplied(false); setInput(null); setProvider('');
    setError(''); setNotice(interrupted ? t('hunkAi.configChanged') : '');
  }, [plan, config, lang, revision, invalidate, t]);
  const active = (id: number, signal: AbortSignal) => mounted.current && generation.current === id && !signal.aborted;
  const analyze = async () => {
    if (blocked || busy.current || !configured) return;
    invalidate(); const id = ++generation.current, abort = new AbortController(); controller.current = abort;
    busy.current = true; onBlockedChange(true); setPhase('analyzing'); setProposal(null); setApplied(false); setError(''); setNotice('');
    const settings = config, language = lang;
    const sameSettings = () => useSettingsStore.getState().aiConfig === settings && useSettingsStore.getState().language === language;
    try {
      const context = buildHunkAiContext(plan); setInput(context);
      let host = ''; try { host = new URL(settings.endpoint).host; } catch { /* The shared adapter explains invalid endpoints. */ }
      setProvider([settings.model, host].filter(Boolean).join(' · '));
      await hunkCommitService.verify(plan);
      if (!active(id, abort.signal)) return;
      if (!current() || !sameSettings()) throw new Error(t('hunkPlan.stale'));
      const result = await aiHunkCommitService.analyze(plan, settings, language, abort.signal);
      if (!active(id, abort.signal)) return;
      await hunkCommitService.verify(plan);
      if (!active(id, abort.signal)) return;
      if (!current() || !sameSettings()) throw new Error(t('hunkPlan.stale'));
      origin.current = { config: settings, lang: language }; hasProposal.current = true; setProposal(result);
    } catch (reason) { if (active(id, abort.signal)) setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { if (mounted.current && generation.current === id) { busy.current = false; setPhase('idle'); onBlockedChange(hasProposal.current); } }
  };
  const apply = async () => {
    if (!proposal || !origin.current || blocked || busy.current) return;
    const source = origin.current;
    const id = ++generation.current, abort = new AbortController(); controller.current = abort;
    busy.current = true; onBlockedChange(true); setPhase('applying'); setError('');
    try {
      await hunkCommitService.verify(plan);
      if (!active(id, abort.signal)) return;
      if (!current()) throw new Error(t('hunkPlan.stale'));
      const settings = useSettingsStore.getState();
      if (settings.aiConfig !== source.config || settings.language !== source.lang) throw new Error(t('hunkAi.configChanged'));
      onApply(proposal.groups.map(group => ({ ...group, units: [...group.units] })));
      hasProposal.current = false; origin.current = null; setProposal(null); setApplied(true);
    } catch (reason) { if (active(id, abort.signal)) { hasProposal.current = false; setProposal(null); setError(reason instanceof Error ? reason.message : String(reason)); } }
    finally { if (mounted.current && generation.current === id) { busy.current = false; setPhase('idle'); onBlockedChange(hasProposal.current); } }
  };
  return <section aria-label={t('hunkAi.title')} className="border border-border rounded-lg bg-muted/20 p-3 space-y-3">
    <h3 className="font-medium text-sm flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" />{t('hunkAi.title')}</h3>
    <p className="text-xs text-muted-foreground">{t('hunkAi.scope')}</p>
    {!configured && <p className="text-xs text-muted-foreground">{t('hunkAi.configure')}</p>}
    {configured && <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={blocked || phase !== 'idle'} onClick={() => void analyze()}>{t('hunkAi.analyze')}</Button>{phase === 'analyzing' && <Button size="sm" variant="outline" onClick={() => { invalidate(); setPhase('idle'); setProposal(null); setError(''); setNotice(t('hunkAi.cancelled')); }}>{t('hunkAi.cancel')}</Button>}</div>}
    {provider && <p className="text-xs text-muted-foreground break-all">AI · {provider}</p>}
    {phase !== 'idle' && <p role="status" className="text-sm">{t(phase === 'applying' ? 'hunkAi.applying' : 'hunkAi.analyzing')}</p>}
    {notice && <p role="status" className="text-xs text-muted-foreground">{notice}</p>}
    {error && <div role="alert" className="space-y-1 text-xs"><p className="text-destructive">{t('hunkAi.failed')}</p><pre className="whitespace-pre-wrap wrap-break-word max-h-36 overflow-auto text-muted-foreground">{error}</pre></div>}
    {proposal && <section aria-label={t('hunkAi.proposal').replace('{n}', String(proposal.groups.length))} className="space-y-3">
      <p className="text-sm font-medium">{t('hunkAi.proposal').replace('{n}', String(proposal.groups.length))}</p><p className="text-sm whitespace-pre-wrap wrap-break-word">{proposal.summary}</p>
      <ol className="space-y-3">{proposal.groups.map((group, index) => <li key={index} className="border border-border rounded-md p-3 space-y-2 text-xs">
        <strong className="block break-all">{index + 1}. {group.title}</strong><p className="whitespace-pre-wrap wrap-break-word">{group.body}</p><p className="text-muted-foreground whitespace-pre-wrap wrap-break-word">{t('hunkAi.reason')}：{group.reason}</p>
        <ul className="space-y-1 text-muted-foreground">{plan.units.filter(unit => group.units.includes(unit.id)).map(unit => <li key={unit.id} className="break-all">{unit.path} · {unit.kind === 'file' ? t('hunkPlan.wholeFile') : formatDiffHunkLabel(unit.label, lang)}</li>)}</ul>
      </li>)}</ol>
      <p className="text-xs text-muted-foreground">{t('hunkAi.replaceHint')}</p>
      <div className="flex flex-wrap gap-2"><Button size="sm" disabled={blocked || phase !== 'idle'} onClick={() => void apply()}>{t('hunkAi.apply')}</Button><Button size="sm" variant="outline" disabled={phase !== 'idle'} onClick={() => { invalidate(); setProposal(null); }}>{t('hunkAi.discard')}</Button></div>
    </section>}
    {applied && <p role="status" className="text-xs text-primary">{t('hunkAi.applied')}</p>}
    {input && <>{input.truncated && <p className="text-xs text-git-tag">{t('hunkAi.truncated')}</p>}<details className="text-xs text-muted-foreground"><summary className="cursor-pointer min-h-7">{t('hunkAi.context')}</summary><pre className="max-h-52 overflow-auto whitespace-pre-wrap wrap-break-word select-text rounded-md bg-muted p-2">{input.context}</pre></details></>}
  </section>;
}
