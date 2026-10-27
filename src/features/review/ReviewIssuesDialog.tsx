import { useState } from 'react';
import { MessageSquare, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ModalSurface } from '@/components/ui/ModalSurface';
import { useI18n } from '@/i18n';
import { ReviewDiffText } from './ReviewDiffText';
import { commentStatus, type ReviewComment, type ReviewCommentStatus } from './reviewLogic';

export interface ReviewIssue {
  target: string;
  comment: ReviewComment;
}

export const REVIEW_STATUS_KEYS = {
  open: 'review.statusOpen', needsReview: 'review.statusNeedsReview', resolved: 'review.statusResolved', outdated: 'review.statusOutdated',
} as const;

export function ReviewIssuesDialog({ issues, onClose, onStatus, onText, onOpen }: {
  issues: ReviewIssue[];
  onClose: () => void;
  onStatus: (issue: ReviewIssue, status: ReviewCommentStatus) => void;
  onText: (issue: ReviewIssue, text: string) => void;
  onOpen: (issue: ReviewIssue) => void;
}) {
  const { t } = useI18n();
  const [filter, setFilter] = useState('active');
  const [editor, setEditor] = useState<{ key: string; text: string } | null>(null);
  const visible = issues.filter(({ comment }) => filter === 'all' || (filter === 'active' ? commentStatus(comment) !== 'resolved' : commentStatus(comment) === filter));
  return (
    <ModalSurface label={t('review.issuesTitle')} onDismiss={onClose} className="fixed inset-0 z-50 bg-background/80 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="w-full max-w-3xl max-h-[85dvh] flex flex-col bg-card border border-border rounded-xl shadow-2xl">
        <header className="flex items-center gap-3 p-4 border-b border-border shrink-0">
          <h2 className="font-semibold flex items-center gap-2"><MessageSquare className="h-4 w-4 text-primary" />{t('review.issuesTitle')}</h2>
          <select aria-label={t('review.issuesFilter')} className="ml-auto bg-background border border-input rounded px-2 py-1 text-xs" value={filter} onChange={(event) => setFilter(event.target.value)}>
            <option value="active">{t('review.issuesActive')}</option>
            <option value="all">{t('review.issuesAll')}</option>
            {Object.entries(REVIEW_STATUS_KEYS).map(([status, key]) => <option key={status} value={status}>{t(key)} ({issues.filter((issue) => commentStatus(issue.comment) === status).length})</option>)}
          </select>
          <Button variant="ghost" size="icon" aria-label={t('common.close')} onClick={onClose}><X className="h-4 w-4" /></Button>
        </header>
        <p className="px-4 pt-3 text-xs text-muted-foreground">{t('review.issuesHint')}</p>
        <div className="p-4 space-y-3 overflow-y-auto min-h-0" role="list" aria-label={t('review.issuesTitle')}>
          {visible.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">{t('review.issuesEmpty')}</p>}
          {visible.map((issue) => {
            const { target, comment } = issue;
            const key = `${target}:${comment.id}`;
            const origin = comment.origin;
            return (
              <article key={key} role="listitem" className="p-3 rounded-lg border border-border space-y-2" data-testid={`review-issue-${comment.id}`}>
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium break-all">{comment.path}</p>
                    <p className="text-xs text-muted-foreground break-all">{target === 'net' ? t('review.netChanges') : t('review.reportCommit').replace('{hash}', target.slice(0, 10))}
                      {!comment.anchorStale && comment.startLine !== null && ` · ${t('review.reportLines').replace('{a}', String(comment.startLine)).replace('{b}', String(comment.endLine ?? comment.startLine))}`}
                    </p>
                  </div>
                  <select data-testid={`review-issue-status-${comment.id}`} aria-label={t('review.issueStatus')} value={commentStatus(comment)} onChange={(event) => onStatus(issue, event.target.value as ReviewCommentStatus)} className="bg-background border border-input rounded px-2 py-1 text-xs shrink-0">
                    {Object.entries(REVIEW_STATUS_KEYS).map(([status, label]) => <option key={status} value={status}>{t(label)}</option>)}
                  </select>
                </div>
                {editor?.key === key ? (
                  <div className="space-y-2">
                    <textarea aria-label={t('review.commentEditor')} rows={3} className="w-full border border-input rounded bg-background p-2 text-sm" value={editor.text} onChange={(event) => setEditor({ key, text: event.target.value })} />
                    <div className="flex justify-end gap-2">
                      <Button size="xs" variant="outline" onClick={() => setEditor(null)}>{t('common.cancel')}</Button>
                      <Button size="xs" disabled={!editor.text.trim()} onClick={() => { onText(issue, editor.text.trim()); setEditor(null); }}>{t('review.commentUpdate')}</Button>
                    </div>
                  </div>
                ) : <p className="text-sm whitespace-pre-wrap break-words select-text">{comment.text}</p>}
                {commentStatus(comment) === 'needsReview' && <p className="text-xs text-amber-600 dark:text-amber-300">{t('review.issueNeedsReviewHint')}</p>}
                {comment.anchorStale && <p className="text-xs text-muted-foreground">{t('review.issueOutdatedHint')}</p>}
                {origin && (
                  <details>
                    <summary className="text-xs text-muted-foreground cursor-pointer">{t('review.issueOriginal').replace('{hash}', origin.headHash.slice(0, 10))}
                      {origin.startLine !== null && ` · ${t('review.reportLines').replace('{a}', String(origin.startLine)).replace('{b}', String(origin.endLine ?? origin.startLine))}`}
                    </summary>
                    <pre className="mt-2 max-h-48 overflow-auto bg-muted/30 rounded py-2 text-xs font-mono whitespace-pre select-text">
                      <code className="block min-w-max"><ReviewDiffText text={origin.context || t('review.issueNoContext')} /></code>
                    </pre>
                  </details>
                )}
                <div className="flex justify-end gap-2">
                  <Button size="xs" variant="ghost" onClick={() => setEditor({ key, text: comment.text })}>{t('review.commentUpdate')}</Button>
                  <Button size="xs" variant="outline" onClick={() => onOpen(issue)}>{t('review.issueOpenDiff')}</Button>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </ModalSurface>
  );
}
