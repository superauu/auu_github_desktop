import { DiffFontControl } from '@/components/ui/DiffFontControl';
import { useSettingsStore } from '@/stores/settingsStore';
import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import type { ParsedDiffLine } from '@/services/git/PorcelainParser';
import { computeSplitRows } from '@/utils/diffRows';
import { useI18n } from '@/i18n';
import { ModalSurface } from '@/components/ui/ModalSurface';
import { Button } from '@/components/ui/button';
import { cn } from '@/utils/cn';

export function CommitDiffDialog({ path, hash, lines, loading, error, onClose }: {
  path: string; hash: string; lines: ParsedDiffLine[]; loading: boolean; error: string | null; onClose: () => void;
}) {
  const { t } = useI18n();
  const diffFontSize = useSettingsStore(state => state.diffFontSize);
  const [split, setSplit] = useState(false);
  const rows = useMemo(() => split ? computeSplitRows(lines) : [], [split, lines]);
  const lineClass = (type?: string) => type === 'add' ? 'diff-line-add' : type === 'delete' ? 'diff-line-del' : type === 'header' ? 'diff-line-header' : '';
  return <ModalSurface label={`${t('changes.viewDiff')} · ${path}`} onDismiss={onClose} className="fixed inset-0 z-[60] bg-black/45 flex items-center justify-center p-6">
    <div className="w-full h-[90vh] max-w-[1600px] flex flex-col rounded-xl border border-border bg-background shadow-2xl overflow-hidden">
      <header className="flex items-center gap-3 p-4 border-b border-border shrink-0">
        <div className="flex-1 min-w-0"><h2 className="text-[14px] font-semibold truncate" title={path}>{path}</h2><p className="font-mono text-[12px] text-muted-foreground">{hash}</p></div>
        <DiffFontControl />
        <Button variant="outline" onClick={() => setSplit(!split)}>{t(split ? 'diff.split' : 'diff.unified')}</Button>
        <Button variant="ghost" size="icon" aria-label={t('rightPane.closePreview')} onClick={onClose}><X className="h-4 w-4" /></Button>
      </header>
      <div style={{ fontSize: diffFontSize }} className="flex-1 min-h-0 overflow-auto font-mono leading-6 select-text" role="region" tabIndex={0} aria-label={t('changes.viewDiff')}>
        {loading ? <p role="status" className="p-6 text-muted-foreground">{t('common.loading')}</p> : error ? <p role="alert" className="p-6 text-destructive">{error}</p> : !lines.length ? <p className="p-6 text-muted-foreground">{t('rightPane.noTextDiff')}</p> : split ?
          <div className="min-w-[800px]">{rows.map((row, index) => row.isHeader ? <div key={index} className="diff-line-header px-3 whitespace-pre">{row.headerContent}</div> : <div key={index} className="grid grid-cols-2">
            {[row.left, row.right].map((side, sideIndex) => <div key={sideIndex} className={cn('flex min-w-0 border-r border-border', lineClass(side?.type))}><span className="w-12 shrink-0 text-right pr-3 text-muted-foreground select-none">{side?.lineNo}</span><span className="whitespace-pre-wrap break-all px-2">{side?.content}</span></div>)}
          </div>)}</div> :
          <div className="min-w-max">{lines.map((line, index) => <div key={index} className={cn('flex whitespace-pre pr-6', lineClass(line.type))}><span className="w-12 shrink-0 text-right pr-3 text-muted-foreground select-none">{line.oldNo}</span><span className="w-12 shrink-0 text-right pr-3 text-muted-foreground select-none">{line.newNo}</span><span>{line.content}</span></div>)}</div>}
      </div>
    </div>
  </ModalSurface>;
}
