import { useEffect, useMemo, useState } from 'react';
import { Copy, FileText, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ModalSurface } from '@/components/ui/ModalSurface';
import { EmptyState } from '@/components/ui/EmptyState';
import { useI18n } from '@/i18n';
import { useWorkingReviewStorageStatus, useWorkingReviewStore } from '@/stores/workingReviewStore';
import type { GitFileChange } from '@/services/git/types';
import { toast } from '@/stores/toastStore';
import { ReviewDiffText } from './ReviewDiffText';
import { buildWorkingReviewReport, workingReviewEntries } from './workingReviewReportLogic';
import { WorkingReviewIssueManager } from './WorkingReviewIssueManager';

export function WorkingReviewReport({ repoPath, branch, files }: { repoPath: string; branch: string; files?: readonly GitFileChange[] }) {
  const { t } = useI18n();
  const records = useWorkingReviewStore(state => state.records);
  const [open, setOpen] = useState(false);
  const [includeResolved, setIncludeResolved] = useState(false);
  const [includeHistory, setIncludeHistory] = useState(false);
  const [managing, setManaging] = useState(false);
  const storageFailed = useWorkingReviewStorageStatus(state => state.unavailable);
  useEffect(() => { setOpen(false); setIncludeResolved(false); setIncludeHistory(false); setManaging(false); }, [repoPath, branch]);
  const activePaths = useMemo(() => files?.map(file => file.path), [files]);
  const entries = useMemo(() => workingReviewEntries(records, repoPath, branch), [records, repoPath, branch]);
  const currentEntries = useMemo(() => workingReviewEntries(records, repoPath, branch, activePaths), [records, repoPath, branch, activePaths]);
  const totalCount = entries.reduce((sum, entry) => sum + entry.record.issues.length, 0);
  const currentCount = currentEntries.reduce((sum, entry) => sum + entry.record.issues.length, 0);
  const count = currentEntries.reduce((sum, entry) => sum + entry.record.issues.filter(issue => !issue.resolved).length, 0);
  const historicalCount = totalCount - currentCount;
  const previewCount = includeHistory ? totalCount : currentCount;
  const text = useMemo(() => open ? buildWorkingReviewReport({ records, repoPath, branch, includeResolved, activePaths, includeHistory, t }) : '', [open, records, repoPath, branch, includeResolved, activePaths, includeHistory, t]);
  const copy = async () => {
    if (!text) return;
    try { await navigator.clipboard.writeText(text); toast.success(t('review.reportCopied')); }
    catch (error) { toast.error(t('review.reportCopyFailed'), error instanceof Error ? error.message : String(error)); }
  };
  return <>
    <Button data-testid="working-review-report-open" variant="outline" size="xs" className="ml-auto shrink-0 gap-1.5" disabled={!repoPath || !branch} title={t('workingReview.reportHint')} onClick={() => setOpen(true)}><FileText className="h-3.5 w-3.5" />{t('workingReview.reportTitle')} ({count})</Button>
    {open && <ModalSurface label={t('workingReview.reportTitle')} onDismiss={() => setOpen(false)} className="fixed inset-0 z-50 bg-background/80 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="w-full max-w-3xl max-h-[85dvh] min-h-0 flex flex-col gap-3 overflow-hidden bg-card border border-border rounded-xl shadow-2xl p-5">
        <header className="flex items-center justify-between gap-2 shrink-0"><h2 className="font-semibold flex items-center gap-2"><FileText className="h-4 w-4 text-primary" />{t('workingReview.reportTitle')}</h2><Button variant="ghost" size="icon" aria-label={t('common.close')} onClick={() => setOpen(false)}><X className="h-4 w-4" /></Button></header>
        <p className="text-sm text-muted-foreground shrink-0">{t('workingReview.reportHint')}</p>
        <p className="text-xs text-muted-foreground wrap-break-word shrink-0">{repoPath} · {branch}</p>
        <div className="flex flex-wrap items-center gap-3 text-xs shrink-0">
          {!managing && <>
            <label className="flex items-center gap-2 text-muted-foreground"><input type="checkbox" checked={includeResolved} onChange={event => setIncludeResolved(event.target.checked)} />{t('review.reportIncludeResolved')}</label>
            {!!historicalCount && <label className="flex items-center gap-2 text-muted-foreground"><input data-testid="working-review-include-history" type="checkbox" checked={includeHistory} onChange={event => setIncludeHistory(event.target.checked)} />{t('workingReview.includeHistory')}</label>}
          </>}
          {(!!totalCount || managing) && <Button data-testid="working-review-manage" variant="outline" size="xs" className="ml-auto" aria-pressed={managing} onClick={() => setManaging(value => !value)}>{t(managing ? 'workingReview.backToReport' : 'workingReview.manageNotes')}{!managing && ` (${totalCount})`}</Button>}
        </div>
        {storageFailed && <div role="alert" className="flex flex-wrap items-center gap-2 text-xs text-destructive shrink-0"><span>{t('workingReview.storageFailed')}</span><Button size="xs" variant="outline" onClick={useWorkingReviewStore.getState().retrySave}>{t('workingReview.retrySave')}</Button></div>}
        {!managing && !!historicalCount && !includeHistory && <p role="status" className="text-xs text-muted-foreground shrink-0">{t('workingReview.historyHidden').replace('{n}', String(historicalCount))}</p>}
        {managing ? <><p className="text-xs text-muted-foreground shrink-0">{t('workingReview.manageHint')}</p><WorkingReviewIssueManager entries={entries} activePaths={activePaths} /></> : text ? <div role="region" aria-label={t('workingReview.reportTitle')} tabIndex={0} data-testid="working-review-report-scroll" className="flex-1 min-h-0 overflow-auto overscroll-contain border border-border rounded-lg">
          <pre data-testid="working-review-report-text" className="py-3 text-[12px] leading-relaxed font-mono whitespace-pre-wrap [overflow-wrap:anywhere] select-text"><ReviewDiffText text={text} report /></pre>
        </div> : <div className="flex-1 min-h-0 overflow-y-auto"><EmptyState variant="check" title={t(historicalCount && !includeHistory ? 'workingReview.reportNoCurrent' : previewCount ? 'review.reportNoOpen' : 'review.reportEmpty')} desc={t(historicalCount && !includeHistory ? 'workingReview.reportNoCurrentDesc' : previewCount ? 'review.reportNoOpenDesc' : 'workingReview.reportEmptyDesc')} /></div>}
        <footer className="flex justify-end gap-2 shrink-0"><Button variant="outline" onClick={() => setOpen(false)}>{t('common.close')}</Button>{!managing && <Button data-testid="working-review-report-copy" disabled={!text} onClick={() => void copy()} className="gap-1.5"><Copy className="h-3.5 w-3.5" />{t('review.reportCopy')}</Button>}</footer>
      </div>
    </ModalSurface>}
  </>;
}
