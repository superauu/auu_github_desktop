import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/EmptyState';
import { VirtualRows } from '@/components/ui/VirtualRows';
import { useI18n } from '@/i18n';
import { useWorkingReviewStore } from '@/stores/workingReviewStore';
import { deleteWorkingReviewIssue } from './workingReviewIssueActions';
import type { workingReviewEntries } from './workingReviewReportLogic';

export function WorkingReviewIssueManager({ entries, activePaths }: { entries: ReturnType<typeof workingReviewEntries>; activePaths?: readonly string[] }) {
  const { t } = useI18n();
  const active = activePaths === undefined ? null : new Set(activePaths);
  const rows = entries.flatMap(entry => entry.record.issues.map((issue, index) => ({ key: entry.key, path: entry.path, issue, index })));
  return <div data-testid="working-review-issue-manager" role="region" aria-label={t('workingReview.manageNotes')} tabIndex={0} className="flex-1 min-h-0 overflow-auto overscroll-contain rounded-lg border border-border p-3">
    {rows.length ? <VirtualRows items={rows} threshold={50} rowHeight={120} renderRow={({ key, path, issue, index }) => <article data-testid={`working-review-note-${issue.id}`} className="flex flex-col gap-2 border-b border-border py-3 last:border-b-0">
      <div className="flex flex-wrap items-center gap-2 text-xs"><span className="min-w-0 font-mono [overflow-wrap:anywhere]">{path}</span>{active && !active.has(path) && <span className="text-muted-foreground">{t('workingReview.historicalNote')}</span>}</div>
      <p className="text-sm whitespace-pre-wrap [overflow-wrap:anywhere]">{issue.text}</p>
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <label className="flex items-center gap-2"><input data-testid={`working-review-resolve-${issue.id}`} type="checkbox" checked={issue.resolved} onChange={event => useWorkingReviewStore.getState().updateIssue(key, issue.id, event.target.checked)} aria-label={t(issue.resolved ? 'workingReview.reopenIssue' : 'workingReview.resolve')} />{t(issue.resolved ? 'workingReview.resolved' : 'workingReview.unresolved')}</label>
        <Button data-testid={`working-review-delete-${issue.id}`} size="xs" variant="ghost" onClick={() => deleteWorkingReviewIssue(key, issue, index)}><Trash2 aria-hidden="true" className="size-3" />{t('workingReview.deleteIssue')}</Button>
      </div>
    </article>} /> : <EmptyState variant="check" title={t('review.reportEmpty')} />}
  </div>;
}
