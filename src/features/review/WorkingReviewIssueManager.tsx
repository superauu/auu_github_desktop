import { EmptyState } from '@/components/ui/EmptyState';
import { VirtualRows } from '@/components/ui/VirtualRows';
import { useI18n } from '@/i18n';
import type { WorkingReviewIssue } from '@/stores/workingReviewStore';
import { WorkingReviewIssueCard } from './WorkingReviewIssueCard';
import type { workingReviewEntries } from './workingReviewReportLogic';

export function WorkingReviewIssueManager({ entries, activePaths, onLocate }: { entries: ReturnType<typeof workingReviewEntries>; activePaths?: readonly string[]; onLocate?: (path: string, issue: WorkingReviewIssue) => void }) {
  const { t } = useI18n();
  const active = activePaths === undefined ? null : new Set(activePaths);
  const rows = entries.flatMap(entry => entry.record.issues.map((issue, index) => ({ key: entry.key, path: entry.path, issue, index })));
  return <div data-testid="working-review-issue-manager" role="region" aria-label={t('workingReview.manageNotes')} tabIndex={0} className="flex-1 min-h-0 overflow-auto overscroll-contain rounded-lg border border-border p-3">
    {rows.length ? <VirtualRows items={rows} threshold={50} rowHeight={160} renderRow={({ key, path, issue, index }) => <article className="flex flex-col gap-2 py-2">
      <div className="flex flex-wrap items-center gap-2 text-xs"><span className="min-w-0 font-mono [overflow-wrap:anywhere]">{path}</span>{active && !active.has(path) && <span className="text-muted-foreground">{t('workingReview.historicalNote')}</span>}</div>
      <WorkingReviewIssueCard recordKey={key} issue={issue} index={index} onLocate={onLocate && (!active || active.has(path)) ? () => onLocate(path, issue) : undefined} />
    </article>} /> : <EmptyState variant="check" title={t('review.reportEmpty')} />}
  </div>;
}
