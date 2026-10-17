import { useEffect, useRef, useState } from 'react';
import { Sparkles, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ModalSurface } from '@/components/ui/ModalSurface';
import { useSettingsStore } from '@/stores/settingsStore';
import { useI18n } from '@/i18n';
import { diagnoseGitError } from '@/services/ai/GitAssistantValidation';
import { collectExplanation, explainChanges, type ExplanationContext, type ExplanationScope } from '@/services/ai/AiExplanationService';

export function AiExplanationButton({ repoPath, scope, onOpenSettings }: { repoPath: string; scope: ExplanationScope; onOpenSettings?: () => void }) {
  const { t, lang } = useI18n();
  const heading = t(scope.kind === 'error' ? 'flow.diagnoseError' : 'explain.title');
  const config = useSettingsStore(state => state.aiConfig);
  const [open, setOpen] = useState(false);
  const [context, setContext] = useState<ExplanationContext | null>(null);
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState('');
  const [error, setError] = useState('');
  const request = useRef(0);
  const abort = useRef<AbortController | null>(null);
  const scopeKey = JSON.stringify(scope);
  const configured = config.provider === 'openai-compatible' && !!config.apiKey.trim();
  useEffect(() => {
    request.current++; abort.current?.abort(); setOpen(false); setContext(null); setAnswer(''); setError(''); setBusy(false);
    return () => { request.current++; abort.current?.abort(); };
  }, [repoPath, scopeKey]);
  const close = () => { request.current++; abort.current?.abort(); setBusy(false); setOpen(false); };
  const inspect = async () => {
    const id = ++request.current; setOpen(true); setBusy(true); setError(''); setAnswer(''); setContext(null);
    try { const result = await collectExplanation(repoPath, scope); if (id === request.current) setContext(result); }
    catch (error: any) { if (id === request.current) setError(error.message); }
    finally { if (id === request.current) setBusy(false); }
  };
  const generate = async () => {
    if (!context) return;
    const id = ++request.current; abort.current = new AbortController(); setBusy(true); setError(''); setAnswer('');
    try { const result = await explainChanges(context, config, lang, abort.current.signal, scope.kind === 'error' ? 'diagnose' : 'explain'); if (id === request.current) setAnswer(result); }
    catch (error: any) { if (id === request.current) setError(error.name === 'AbortError' ? t('explain.cancelled') : error.message); }
    finally { if (id === request.current) setBusy(false); }
  };
  return <>
    <Button variant="outline" size="sm" onClick={() => void inspect()}><Sparkles className="w-3.5 h-3.5" />{heading}</Button>
    {open && <ModalSurface label={heading} onDismiss={close} className="fixed inset-0 z-[60] bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-2xl max-h-[85dvh] flex flex-col gap-4 rounded-xl border border-border bg-card p-5 shadow-2xl">
        <header className="flex items-center justify-between"><h2 className="font-semibold flex gap-2 items-center"><Sparkles className="w-5 h-5 text-primary" />{heading}</h2><Button variant="ghost" size="icon" aria-label={t('common.close')} onClick={close}><X className="w-4 h-4" /></Button></header>
        <div className="min-h-0 overflow-y-auto space-y-4">
          <p className="text-sm text-muted-foreground">{t('explain.consent')} <span className="font-mono break-all">{config.model} · {config.endpoint}</span></p>
          {!configured && <div className="text-sm space-y-2"><p>{t('explain.configure')}</p>{onOpenSettings && <Button variant="outline" onClick={() => { close(); onOpenSettings(); }}>{t('explain.settings')}</Button>}</div>}
          {scope.kind === 'error' && <div className="rounded-lg border border-border p-3 text-sm whitespace-pre-wrap"><h3 className="font-medium mb-2">{t('flow.localDiagnosis')}</h3>{diagnoseGitError(scope.message)}</div>}
          {context && <details open={!answer}><summary className="text-sm cursor-pointer">{t('explain.context')} · {context.text.length.toLocaleString()} {t('explain.characters')}</summary>{context.truncated && <p className="text-xs text-amber-600 dark:text-amber-400 my-2">{t('explain.truncated')}</p>}<pre className="mt-2 text-xs whitespace-pre-wrap break-words max-h-56 overflow-y-auto rounded-lg bg-muted p-3 select-text">{context.text}</pre></details>}
          {busy && <p role="status" className="text-sm flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />{t('common.loading')}</p>}
          {error && <p role="alert" className="text-sm text-destructive break-words">{error}</p>}
          {answer && <div className="text-sm whitespace-pre-wrap break-words leading-relaxed select-text" aria-live="polite">{answer}</div>}
        </div>
        <footer className="flex justify-end gap-2"><Button variant="ghost" onClick={close}>{t('common.close')}</Button><Button disabled={busy || !context || !configured} onClick={() => void generate()}>{t(answer ? 'explain.again' : 'explain.generate')}</Button></footer>
      </div>
    </ModalSurface>}
  </>;
}
