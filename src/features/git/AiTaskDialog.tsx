import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ModalSurface } from '@/components/ui/ModalSurface';
import { useI18n } from '@/i18n';
import { useSettingsStore } from '@/stores/settingsStore';
import { explainChanges } from '@/services/ai/AiExplanationService';

export function AiTaskDialog({ title, context, task, onClose, children }: { title: string; context: string; task: 'group' | 'conflict'; onClose: () => void; children: (raw: string) => ReactNode }) {
  const { t, lang } = useI18n();
  const config = useSettingsStore(state => state.aiConfig);
  const configured = config.provider === 'openai-compatible' && !!config.apiKey.trim();
  const [result, setResult] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const generation = useRef(0);
  useEffect(() => () => { generation.current++; abort.current?.abort(); }, []);
  const run = async () => {
    const id = ++generation.current; abort.current = new AbortController(); setBusy(true); setError(''); setResult('');
    try { const raw = await explainChanges({ text: context.slice(0, 16000), truncated: context.length > 16000 }, config, lang, abort.current.signal, task); if (id === generation.current) setResult(raw); }
    catch (error: any) { if (id === generation.current) setError(error.name === 'AbortError' ? t('explain.cancelled') : error.message); }
    finally { if (id === generation.current) setBusy(false); }
  };
  return <ModalSurface label={title} onDismiss={onClose} className="fixed inset-0 z-70 bg-background/80 backdrop-blur-xs flex items-center justify-center p-4"><div className="w-full max-w-3xl max-h-[88dvh] flex flex-col gap-4 bg-card border border-border rounded-xl shadow-2xl p-5">
    <header className="flex items-center justify-between"><h2 className="font-semibold flex gap-2 items-center"><Sparkles className="w-4 h-4 text-primary" />{title}</h2><Button variant="ghost" size="icon" aria-label={t('common.close')} onClick={onClose}><X className="w-4 h-4" /></Button></header>
    <div className="min-h-0 overflow-y-auto space-y-4"><p className="text-xs text-muted-foreground">{t('explain.consent')} {config.model} · {config.endpoint}</p><details open={!result}><summary className="cursor-pointer text-sm">{t('explain.context')}</summary><pre className="text-xs select-text whitespace-pre-wrap wrap-break-word max-h-48 overflow-auto bg-muted rounded p-3">{context.slice(0, 16000)}</pre>{context.length > 16000 && <p className="text-xs text-amber-500">{t('explain.truncated')}</p>}</details>
      {!configured && <p className="text-sm text-muted-foreground">{t('explain.configure')}</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}{busy && <p role="status">{t('common.loading')}</p>}{result && children(result)}
    </div><footer className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>{t('common.close')}</Button><Button disabled={busy || config.provider !== 'openai-compatible' || !config.apiKey.trim()} onClick={() => void run()}>{t('explain.generate')}</Button></footer>
  </div></ModalSurface>;
}
