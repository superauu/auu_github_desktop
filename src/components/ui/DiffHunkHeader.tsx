import { useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { Copy, Info, X } from 'lucide-react';
import { useI18n } from '@/i18n';
import { formatDiffHunkLabel, parseDiffHunkHeader, type DiffHunkStats } from '@/utils/diffHunkLabel';
import { Button } from './button';
import { highlightDiff } from './DiffTools';

export function DiffHunkHeader({ header, stats, query = '' }: { header: string; stats?: DiffHunkStats; query?: string }) {
  const { t, lang } = useI18n();
  const [feedback, setFeedback] = useState<'copied' | 'copyFailed' | null>(null);
  const parsed = parseDiffHunkHeader(header), label = formatDiffHunkLabel(header, lang);
  if (!parsed) return <span data-diff-content className="min-w-0 truncate" title={header}>{highlightDiff(header, query)}</span>;
  const added = t('diffHunk.added').replace('{n}', String(stats?.added ?? 0));
  const removed = t('diffHunk.removed').replace('{n}', String(stats?.removed ?? 0));
  return <Popover.Root onOpenChange={() => setFeedback(null)}>
    <Popover.Trigger asChild><button type="button" data-diff-hunk-label aria-label={[t('diffHunk.inspect').replace('{range}', label), ...(stats ? [added, removed] : [])].join(' · ')} title={t('diffHunk.details')} className="min-w-0 max-w-full flex items-center gap-2 rounded text-left font-sans text-[12px] focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring hover:underline underline-offset-4">
      <span data-diff-content className="truncate">{highlightDiff(label, query)}</span>
      {stats && <span className="inline-flex shrink-0 gap-1.5 font-mono tabular-nums"><span className="text-git-added" aria-label={added} title={added}>+{stats.added}</span><span className="text-git-deleted" aria-label={removed} title={removed}>−{stats.removed}</span></span>}
      <Info aria-hidden="true" className="size-3 shrink-0 text-muted-foreground" />
    </button></Popover.Trigger>
    <Popover.Portal><Popover.Content side="bottom" align="start" sideOffset={6} collisionPadding={12} aria-label={t('diffHunk.details')} className="z-[80] w-96 max-w-[calc(100vw-24px)] rounded-lg border border-border bg-popover p-3 shadow-xl text-popover-foreground font-sans space-y-3">
      <div className="flex items-center justify-between gap-2"><strong className="text-sm">{t('diffHunk.details')}</strong><Popover.Close asChild><Button size="icon" variant="ghost" aria-label={t('common.close')} className="size-6"><X className="size-3.5" /></Button></Popover.Close></div>
      <p className="text-sm font-medium wrap-break-word">{label}</p>
      {stats && <p className="flex flex-wrap gap-3 text-xs"><span className="text-git-added">{added}</span><span className="text-git-deleted">{removed}</span></p>}
      <p className="text-xs text-muted-foreground">{t('diffHunk.explanation')}</p>
      {parsed.context && <div className="space-y-1 text-xs"><p className="text-muted-foreground">{t('diffHunk.context')}</p><p className="max-h-24 overflow-auto whitespace-pre-wrap wrap-break-word select-text">{parsed.context}</p></div>}
      <div className="space-y-1 text-xs"><p className="text-muted-foreground">{t('diffHunk.original')}</p><pre tabIndex={0} className="max-h-40 overflow-auto rounded bg-muted p-2 whitespace-pre-wrap wrap-break-word select-text font-mono">{header}</pre></div>
      <Button size="sm" variant="outline" onClick={async () => { try { await navigator.clipboard.writeText(header); setFeedback('copied'); } catch { setFeedback('copyFailed'); } }}><Copy aria-hidden="true" className="size-3.5" />{t('diffHunk.copy')}</Button>
      {feedback && <p role={feedback === 'copied' ? 'status' : 'alert'} className="text-xs text-muted-foreground">{t(`diffHunk.${feedback}`)}</p>}
    </Popover.Content></Popover.Portal>
  </Popover.Root>;
}
