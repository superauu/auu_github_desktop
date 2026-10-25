import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Copy, RefreshCw, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ModalSurface } from '@/components/ui/ModalSurface';
import { useI18n } from '@/i18n';
import { useSettingsStore } from '@/stores/settingsStore';
import { toast } from '@/stores/toastStore';
import { generateReleaseNotes, listTagsNewestFirst, type ReleaseNotesResult, type ReleaseNotesTag } from '@/services/ai/AiReleaseNotesService';

/** select 的哨兵值：选中时显示自定义 rev 输入框，输入为空则由服务端自动选最新 tag。 */
const CUSTOM_REF = '__custom__';

/** 仅这些可读错误直接展示原文；其余（HTTP/网络等）折叠为详情。 */
const EXPLAINED_ERRORS = [
  'releaseNotes.configureAi',
  'releaseNotes.noBaseline',
  'releaseNotes.emptyRange',
  'releaseNotes.invalidRef',
  'releaseNotes.timeout',
  'releaseNotes.cancelled',
] as const;

export function ReleaseNotesDialog({ repoPath, onClose, onOpenSettings }: { repoPath: string; onClose: () => void; onOpenSettings?: () => void }) {
  const { t, lang } = useI18n();
  const config = useSettingsStore(state => state.aiConfig);
  const configured = config.provider === 'openai-compatible' && !!config.apiKey.trim();
  const [tags, setTags] = useState<ReleaseNotesTag[]>([]);
  const [fromChoice, setFromChoice] = useState<string>(CUSTOM_REF);
  const [customFrom, setCustomFrom] = useState('');
  const [toRef, setToRef] = useState('HEAD');
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<ReleaseNotesResult | null>(null);
  const [error, setError] = useState('');
  const abort = useRef<AbortController | null>(null), generation = useRef(0), mounted = useRef(true), touched = useRef(false);
  const latest = useRef({ config, lang }); latest.current = { config, lang };
  const explained = EXPLAINED_ERRORS.some(key => t(key) === error);

  useEffect(() => {
    mounted.current = true;
    let cancelled = false;
    // 下拉候选只是便利项：加载失败不打断对话框，生成时会有可读错误兜底。
    listTagsNewestFirst(repoPath)
      .then(list => { if (!cancelled && mounted.current) { setTags(list); if (list.length && !touched.current) setFromChoice(list[0].name); } })
      .catch(() => {});
    return () => { cancelled = true; mounted.current = false; generation.current++; abort.current?.abort(); };
  }, [repoPath]);

  const generate = async () => {
    if (generating || !configured) return;
    abort.current?.abort();
    const controller = new AbortController(); abort.current = controller;
    const id = ++generation.current;
    setGenerating(true); setError(''); setResult(null);
    const settings = latest.current;
    try {
      const outcome = await generateReleaseNotes(repoPath, {
        fromRef: fromChoice === CUSTOM_REF ? customFrom : fromChoice,
        toRef: toRef.trim() && toRef.trim().toLowerCase() !== 'head' ? toRef : undefined,
      }, settings.config, settings.lang, controller.signal);
      if (id !== generation.current || !mounted.current) return;
      setResult(outcome);
    } catch (reason) {
      if (id !== generation.current || !mounted.current) return;
      const aborted = reason instanceof Error && reason.name === 'AbortError';
      setError(aborted ? t('releaseNotes.cancelled') : reason instanceof Error ? reason.message : String(reason));
    } finally {
      if (id === generation.current && mounted.current) setGenerating(false);
    }
  };

  const copy = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.markdown);
      toast.success(t('releaseNotes.copied'));
    } catch (reason) {
      toast.error(t('releaseNotes.copyFailed'), reason instanceof Error ? reason.message : String(reason));
    }
  };

  return <ModalSurface label={t('releaseNotes.title')} onDismiss={onClose} dismissible={!generating} className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4">
    <div className="w-full max-w-3xl max-h-[90dvh] bg-card border border-border rounded-xl shadow-2xl flex flex-col">
      <header className="flex items-center justify-between gap-3 p-5 border-b border-border">
        <h2 className="font-semibold flex gap-2 items-center"><Sparkles className="h-4 w-4 text-primary" />{t('releaseNotes.title')}</h2>
        <Button variant="ghost" size="icon" disabled={generating} aria-label={t('common.close')} onClick={onClose}><X className="h-4 w-4" /></Button>
      </header>
      <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4">
        <p className="text-sm text-muted-foreground">{t('releaseNotes.scope')}</p>
        {!configured && <div className="space-y-2 rounded-lg border border-border bg-muted/40 p-3">
          <p className="text-sm">{t('releaseNotes.configureAi')}</p>
          {onOpenSettings && <Button variant="outline" onClick={() => { onClose(); onOpenSettings(); }}>{t('releaseNotes.openSettings')}</Button>}
        </div>}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1 text-xs">
            <span className="text-muted-foreground">{t('releaseNotes.from')}</span>
            <span className="relative block">
              <select
                className="w-full h-9 appearance-none truncate border border-input rounded-md bg-background pl-3 pr-8 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                value={fromChoice}
                disabled={generating}
                onChange={event => { touched.current = true; setFromChoice(event.target.value); }}
              >
                {tags.map(tag => <option key={tag.hash} value={tag.name}>{tag.name}</option>)}
                <option value={CUSTOM_REF}>{t('releaseNotes.customRef')}</option>
              </select>
              <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            </span>
          </label>
          <label className="block space-y-1 text-xs">
            <span className="text-muted-foreground">{t('releaseNotes.to')}</span>
            <input
              className="w-full h-9 px-3 border border-input bg-background rounded-md text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-40"
              value={toRef}
              placeholder={t('releaseNotes.toPlaceholder')}
              disabled={generating}
              onChange={event => { touched.current = true; setToRef(event.target.value); }}
            />
          </label>
        </div>
        {fromChoice === CUSTOM_REF && <label className="block space-y-1 text-xs">
          <span className="text-muted-foreground">{t('releaseNotes.customRef')}</span>
          <input
            className="w-full h-9 px-3 border border-input bg-background rounded-md font-mono text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-40"
            value={customFrom}
            placeholder={t('releaseNotes.customRefPlaceholder')}
            disabled={generating}
            onChange={event => { touched.current = true; setCustomFrom(event.target.value); }}
          />
        </label>}
        {generating && <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><RefreshCw className="h-3.5 w-3.5 animate-spin" />{t('releaseNotes.generating')}</p>}
        {error && <div role="alert" className="space-y-2">
          {explained
            ? <p className="text-sm text-destructive">{error}</p>
            : <div className="space-y-2 text-sm">
                <p className="text-destructive">{t('releaseNotes.aiFailed')}</p>
                <details className="text-xs text-muted-foreground">
                  <summary className="cursor-pointer min-h-7">{t('ui.error.details')}</summary>
                  <pre className="whitespace-pre-wrap break-words max-h-48 overflow-auto">{error}</pre>
                </details>
              </div>}
          {error === t('releaseNotes.configureAi') && onOpenSettings && <Button variant="outline" onClick={() => { onClose(); onOpenSettings(); }}>{t('releaseNotes.openSettings')}</Button>}
        </div>}
        {result && <section className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium">
              {t('releaseNotes.resultMeta').replace('{n}', String(result.commitCount))}
              {result.truncated && <span className="ml-2 rounded bg-accent px-1.5 py-0.5 text-[11px] font-normal text-git-tag">{t('releaseNotes.truncated')}</span>}
            </p>
            <Button size="sm" variant="outline" onClick={() => void copy()}><Copy className="h-3.5 w-3.5" />{t('releaseNotes.copy')}</Button>
          </div>
          <pre className="max-h-[46dvh] overflow-y-auto whitespace-pre-wrap break-words rounded-md bg-muted p-3 font-mono text-xs leading-5 select-text">{result.markdown}</pre>
        </section>}
      </div>
      <footer className="flex flex-wrap items-center justify-end gap-2 p-4 border-t border-border">
        <Button variant="outline" disabled={generating} onClick={onClose}>{t('common.close')}</Button>
        {generating
          ? <Button variant="outline" onClick={() => abort.current?.abort()}>{t('releaseNotes.cancel')}</Button>
          : <Button disabled={!configured} onClick={() => void generate()}>
              {result ? <><RefreshCw className="h-3.5 w-3.5" />{t('releaseNotes.regenerate')}</> : <><Sparkles className="h-3.5 w-3.5" />{t('releaseNotes.generate')}</>}
            </Button>}
      </footer>
    </div>
  </ModalSurface>;
}
