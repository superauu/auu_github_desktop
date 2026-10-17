import { ImageDiffView } from '@/features/git/ImageDiffView';
import { isImagePath } from '@/services/git/ImageDiffService';
import { DiffFontControl } from '@/components/ui/DiffFontControl';
import { VirtualRows } from '@/components/ui/VirtualRows';
import { useSettingsStore } from '@/stores/settingsStore';
import { useId, useMemo, useState } from 'react';
import { DiffTools, highlightDiff } from '@/components/ui/DiffTools';
import { X } from 'lucide-react';
import type { ParsedDiffLine } from '@/services/git/PorcelainParser';
import { computeSplitRows } from '@/utils/diffRows';
import { useI18n } from '@/i18n';
import { ModalSurface } from '@/components/ui/ModalSurface';
import { Button } from '@/components/ui/button';
import { cn } from '@/utils/cn';

export function CommitDiffDialog({ path, hash, lines, loading, error, onClose, onReload, image }: {
  image?: { repoPath: string; before: string; after: string; beforePath?: string };
  path: string; hash: string; lines: ParsedDiffLine[]; loading: boolean; error: string | null; onClose: () => void; onReload: () => void;
}) {
  const { t } = useI18n();
  const diffFontSize = useSettingsStore(state => state.diffFontSize);
  const wrap = useSettingsStore(state => state.diffWrapLines);
  const [query, setQuery] = useState('');
  const diffId = useId();
  const [split, setSplit] = useState(false);
  const rows = useMemo(() => split ? computeSplitRows(lines) : [], [split, lines]);
  const contents = useMemo(() => split ? rows.map(row => row.headerContent || `${row.left?.content || ''}\n${row.right?.content || ''}`) : lines.map(line => line.content), [split, rows, lines]);
  const lineClass = (type?: string) => type === 'add' ? 'diff-line-add' : type === 'delete' ? 'diff-line-del' : type === 'header' ? 'diff-line-header' : '';
  if (image && isImagePath(path)) return <ModalSurface label={`${t('changes.viewDiff')} · ${path}`} onDismiss={onClose} className="fixed inset-0 z-[60] bg-black/45 flex items-center justify-center p-6"><div className="w-full h-[85vh] max-w-6xl flex flex-col rounded-xl border border-border bg-background shadow-2xl overflow-hidden"><header className="flex justify-between items-center p-4 border-b border-border"><h2 className="text-sm font-semibold truncate">{path}</h2><Button variant="ghost" size="icon" aria-label={t('common.close')} onClick={onClose}><X className="w-4 h-4" /></Button></header><ImageDiffView path={path} {...image} /></div></ModalSurface>;
  return <ModalSurface label={`${t('changes.viewDiff')} · ${path}`} onDismiss={onClose} className="fixed inset-0 z-[60] bg-black/45 flex items-center justify-center p-6">
    <div className="w-full h-[90vh] max-w-[1600px] flex flex-col rounded-xl border border-border bg-background shadow-2xl overflow-hidden">
      <header className="flex items-center gap-3 p-4 border-b border-border shrink-0">
        <div className="flex-1 min-w-0"><h2 className="text-[14px] font-semibold truncate" title={path}>{path}</h2><p className="font-mono text-[12px] text-muted-foreground">{hash}</p></div>
        <DiffFontControl />
        <div className="flex gap-1"><Button variant={split ? 'ghost' : 'secondary'} aria-pressed={!split} onClick={() => setSplit(false)}>{t('diff.unified')}</Button><Button variant={split ? 'secondary' : 'ghost'} aria-pressed={split} onClick={() => setSplit(true)}>{t('diff.split')}</Button></div>
        <Button variant="ghost" size="icon" aria-label={t('rightPane.closePreview')} onClick={onClose}><X className="h-4 w-4" /></Button>
      </header>
      <DiffTools query={query} onQueryChange={setQuery} contents={contents} targetId={diffId} onReload={onReload} />
      <div id={diffId} style={{ fontSize: diffFontSize }} className={cn('flex-1 min-h-0 overflow-auto font-mono leading-6 select-text', wrap && 'diff-wrap')} role="region" tabIndex={0} aria-label={t('changes.viewDiff')}>
        {loading ? <p role="status" className="p-6 text-muted-foreground">{t('common.loading')}</p> : error ? <p role="alert" className="p-6 text-destructive">{error}</p> : !lines.length ? <p className="p-6 text-muted-foreground">{t('rightPane.noTextDiff')}</p> : split ?
          <div className="min-w-[800px]"><VirtualRows items={rows} renderRow={(row, index) => row.isHeader ? <div key={index} className="diff-line-header px-3 whitespace-pre">{row.headerContent}</div> : <div key={index} className="grid grid-cols-2">
            {[row.left, row.right].map((side, sideIndex) => <div key={sideIndex} className={cn('flex min-w-0 border-r border-border', lineClass(side?.type))}><span className="w-12 shrink-0 text-right pr-3 text-muted-foreground select-none">{side?.lineNo}</span><span data-diff-content className="whitespace-pre overflow-x-auto px-2">{highlightDiff(side?.content || '', query)}</span></div>)}
          </div>} /></div> :
          <VirtualRows items={lines} contentWidth={!wrap} renderRow={(line, index) => <div key={index} className={cn('flex whitespace-pre pr-6', lineClass(line.type))}><span className="w-12 shrink-0 text-right pr-3 text-muted-foreground select-none">{line.oldNo}</span><span className="w-12 shrink-0 text-right pr-3 text-muted-foreground select-none">{line.newNo}</span><span data-diff-content>{highlightDiff(line.content, query)}</span></div>} />}
      </div>
    </div>
  </ModalSurface>;
}
