import { useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { Braces, Copy, Info, X } from 'lucide-react';
import { useI18n } from '@/i18n';
import { formatDiffHunkLabel, parseDiffHunkHeader, type DiffHunkStats } from '@/utils/diffHunkLabel';
import { matchDeclaration, type CodeScope } from '@/utils/codeScope';
import { Button } from './button';
import { highlightDiff } from './DiffTools';

export function DiffHunkHeader({ header, stats, scope, query = '' }: { header: string; stats?: DiffHunkStats; scope?: CodeScope | null; query?: string }) {
  const { t, lang } = useI18n();
  const [feedback, setFeedback] = useState<'copied' | 'copyFailed' | null>(null);
  const parsed = parseDiffHunkHeader(header), label = formatDiffHunkLabel(header, lang);
  if (!parsed) return <span data-diff-content className="min-w-0 truncate" title={header}>{highlightDiff(header, query)}</span>;
  // 整文件分析拿不到时，退回 Git 自动提取的块头上下文——但只接受确实像声明的文本。
  const resolvedScope = scope ?? matchDeclaration(parsed.context);
  const scopeTitle = resolvedScope
    ? `${t('diffHunk.scopeLabel').replace('{name}', resolvedScope.name)}${resolvedScope.line > 0 ? ` · ${t('diffHunk.scopeDefined').replace('{n}', String(resolvedScope.line))}` : ''}`
    : '';
  const added = t('diffHunk.added').replace('{n}', String(stats?.added ?? 0));
  const removed = t('diffHunk.removed').replace('{n}', String(stats?.removed ?? 0));
  return <Popover.Root onOpenChange={() => setFeedback(null)}>
    <Popover.Trigger asChild><button type="button" data-diff-hunk-label aria-label={[t('diffHunk.inspect').replace('{range}', label), ...(resolvedScope ? [scopeTitle] : []), ...(stats ? [added, removed] : [])].join(' · ')} title={t('diffHunk.details')} className="min-w-0 max-w-full flex items-center gap-2 rounded text-left font-sans text-[12px] focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring hover:underline underline-offset-4">
      {resolvedScope && <span data-diff-scope title={scopeTitle} className="inline-flex min-w-0 max-w-[45%] shrink items-center gap-1 rounded bg-muted/70 px-1.5 py-0.5 font-mono text-[11px] font-medium text-foreground/85">
        <Braces aria-hidden="true" className="size-3 shrink-0 text-muted-foreground" />
        <span className="truncate">{resolvedScope.name}</span>
      </span>}
      <span data-diff-content className="truncate">{highlightDiff(label, query)}</span>
      {stats && <span className="inline-flex shrink-0 gap-1.5 font-mono tabular-nums"><span className="text-git-added" aria-label={added} title={added}>+{stats.added}</span><span className="text-git-deleted" aria-label={removed} title={removed}>−{stats.removed}</span></span>}
      <Info aria-hidden="true" className="size-3 shrink-0 text-muted-foreground" />
    </button></Popover.Trigger>
    <Popover.Portal><Popover.Content side="bottom" align="start" sideOffset={6} collisionPadding={12} aria-label={t('diffHunk.details')} className="z-[80] w-96 max-w-[calc(100vw-24px)] rounded-lg border border-border bg-popover p-3 shadow-xl text-popover-foreground font-sans space-y-3">
      <div className="flex items-center justify-between gap-2"><strong className="text-sm">{t('diffHunk.details')}</strong><Popover.Close asChild><Button size="icon" variant="ghost" aria-label={t('common.close')} className="size-6"><X className="size-3.5" /></Button></Popover.Close></div>
      <p className="text-sm font-medium wrap-break-word">{label}</p>
      {resolvedScope && <p className="flex flex-wrap items-baseline gap-1.5 text-xs"><span className="text-muted-foreground">{t('diffHunk.scope')}</span><span className="font-mono text-foreground">{resolvedScope.name}</span>{resolvedScope.line > 0 && <span className="text-muted-foreground">· {t('diffHunk.scopeDefined').replace('{n}', String(resolvedScope.line))}</span>}</p>}
      {stats && <p className="flex flex-wrap gap-3 text-xs"><span className="text-git-added">{added}</span><span className="text-git-deleted">{removed}</span></p>}
      <p className="text-xs text-muted-foreground">{t('diffHunk.explanation')}</p>
      {parsed.context && <div className="space-y-1 text-xs"><p className="text-muted-foreground">{t('diffHunk.context')}</p><p className="max-h-24 overflow-auto whitespace-pre-wrap wrap-break-word select-text">{parsed.context}</p></div>}
      <div className="space-y-1 text-xs"><p className="text-muted-foreground">{t('diffHunk.original')}</p><pre tabIndex={0} className="max-h-40 overflow-auto rounded bg-muted p-2 whitespace-pre-wrap wrap-break-word select-text font-mono">{header}</pre></div>
      <Button size="sm" variant="outline" onClick={async () => { try { await navigator.clipboard.writeText(header); setFeedback('copied'); } catch { setFeedback('copyFailed'); } }}><Copy aria-hidden="true" className="size-3.5" />{t('diffHunk.copy')}</Button>
      {feedback && <p role={feedback === 'copied' ? 'status' : 'alert'} className="text-xs text-muted-foreground">{t(`diffHunk.${feedback}`)}</p>}
    </Popover.Content></Popover.Portal>
  </Popover.Root>;
}
