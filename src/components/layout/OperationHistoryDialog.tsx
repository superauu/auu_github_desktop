import { useState } from 'react';
import { X, Copy, History } from 'lucide-react';
import { useToastStore, type OperationEntry } from '@/stores/toastStore';
import { useRepoStore } from '@/stores/repoStore';
import { useI18n } from '@/i18n';
import { ModalSurface } from '@/components/ui/ModalSurface';
import { Button } from '@/components/ui/button';

export function OperationHistoryDialog({ onClose, onRecovery }: { onClose: () => void; onRecovery: (path: string) => void }) {
  const history = useToastStore(state => state.history);
  const storageFailed = useToastStore(state => state.historyStorageFailed);
  const clear = useToastStore(state => state.clearHistory);
  const currentPath = useRepoStore(state => state.currentRepo?.path);
  const { t, lang } = useI18n();
  const [filter, setFilter] = useState('all');
  const [repoFilter, setRepoFilter] = useState('all'), [query, setQuery] = useState('');
  const entries = history.filter(entry => (filter !== 'errors' || entry.type === 'error' || entry.type === 'warning') && (repoFilter === 'all' || entry.repoPath === repoFilter)
    && `${entry.title} ${entry.description || ''} ${entry.repoPath || ''}`.toLowerCase().includes(query.toLowerCase()));
  return <ModalSurface label={t('operationLog.title')} onDismiss={onClose} className="fixed inset-0 z-50 p-4 bg-black/40 flex items-center justify-center">
    <div className="bg-card text-foreground border border-border rounded-xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col">
      <div className="p-4 flex items-center justify-between border-b border-border gap-3"><h2 className="font-semibold text-sm flex items-center gap-2"><History className="w-4 h-4" />{t('operationLog.title')}</h2>
        <Button size="xs" variant="ghost" onClick={onClose} aria-label={t('common.close')}><X className="w-4 h-4" /></Button></div>
      <div className="p-4 space-y-2 border-b border-border"><p className="text-xs text-muted-foreground">{t('operationLog.hint')}</p>
        {storageFailed && <p role="status" className="text-xs text-destructive">{t('operationLog.storageFailed')}</p>}
        <input type="search" aria-label={t('operationLog.search')} placeholder={t('operationLog.search')} value={query} onChange={event => setQuery(event.target.value)} className="h-8 w-full rounded border border-input bg-background px-2 text-xs" />
        <div className="flex flex-wrap gap-2">
          <select aria-label={t('operationLog.repoFilter')} value={repoFilter} onChange={event => setRepoFilter(event.target.value)} className="min-w-0 max-w-full text-xs border border-border rounded bg-background px-2 py-1"><option value="all">{t('operationLog.allRepos')}</option>{[...new Set(history.flatMap(entry => entry.repoPath ? [entry.repoPath] : []))].map(path => <option key={path} value={path}>{path}</option>)}</select>
          <select aria-label={t('operationLog.filter')} value={filter} onChange={e => setFilter(e.target.value)} className="text-xs border border-border rounded bg-background px-2 py-1">
            <option value="all">{t('operationLog.all')}</option><option value="errors">{t('operationLog.errors')}</option>
          </select>
          <Button size="xs" variant="outline" disabled={!history.length} onClick={clear}>{t('operationLog.clear')}</Button>
          {currentPath && <Button size="xs" variant="outline" onClick={() => onRecovery(currentPath)}>{t('operationLog.currentRecovery')}</Button>}
        </div>
      </div>
      <div className="min-h-0 overflow-y-auto p-4 space-y-3 select-text">
        {!entries.length && <p className="text-sm text-muted-foreground">{t('operationLog.empty')}</p>}
        {entries.map(entry => <HistoryRow key={entry.id} entry={entry} lang={lang} onRecovery={onRecovery} />)}
      </div>
    </div>
  </ModalSurface>;
}

function HistoryRow({ entry, lang, onRecovery }: { entry: OperationEntry; lang: string; onRecovery: (path: string) => void }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  return <article className="border border-border rounded-lg p-3 space-y-2 text-xs">
    <div className="flex flex-wrap justify-between gap-2"><strong className={`min-w-0 break-all ${entry.type === 'error' ? 'text-destructive' : ''}`}>{entry.title}</strong>
      <span className="text-muted-foreground">{new Date(entry.createdAt).toLocaleString(lang === 'zh' ? 'zh-CN' : 'en')} · {t(`operationLog.${entry.type}`)}{entry.elapsedMs != null && ` · ${(entry.elapsedMs / 1000).toFixed(1)}s`}</span></div>
    {entry.repoPath && <p className="text-muted-foreground break-all">{entry.repoPath}</p>}
    {entry.description && <details open={entry.type === 'error'}><summary className="cursor-pointer text-muted-foreground">{t('operationLog.details')}</summary><pre className="mt-2 whitespace-pre-wrap wrap-break-word max-h-48 overflow-auto font-mono">{entry.description}</pre></details>}
    <div className="flex flex-wrap gap-2">
      <Button size="xs" variant="ghost" onClick={async () => {
        try { await navigator.clipboard.writeText([entry.title, entry.repoPath, entry.description].filter(Boolean).join('\n')); setFeedback(t('resilience.copied')); }
        catch { setFeedback(t('resilience.copyFailed')); }
      }}><Copy className="h-3 w-3" />{t('resilience.copy')}</Button>
      {entry.action && <Button size="xs" variant="outline" disabled={busy} onClick={async () => {
        setBusy(true); setFeedback('');
        try { await entry.action!.onClick(); useToastStore.getState().consumeAction(entry.id); setFeedback(t('operationLog.completed')); }
        catch (error) { setFeedback(error instanceof Error ? error.message : String(error)); }
        finally { setBusy(false); }
      }}>{entry.action.label}</Button>}
      {entry.repoPath && <Button size="xs" variant="outline" onClick={() => onRecovery(entry.repoPath!)}>{t('operationLog.recovery')}</Button>}
    </div>
    {feedback && <p role="status" className="wrap-break-word">{feedback}</p>}
  </article>;
}
