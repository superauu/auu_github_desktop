import { useEffect, useState } from 'react';
import { Check, MessageSquare, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/i18n';
import { useWorkingReviewStore, isWorkingIssueCurrent } from '@/stores/workingReviewStore';
import type { WorkingReviewController } from './useWorkingReview';

export function WorkingReviewPanel({ review, filtered }: { review: WorkingReviewController; filtered: boolean }) {
  const { t } = useI18n();
  const [text, setText] = useState('');
  useEffect(() => { setText(''); }, [review.key, review.noteTarget]);
  const actions = useWorkingReviewStore();
  const issues = review.record?.issues ?? [];
  const target = review.snapshot?.hunks.find(hunk => hunk.id === review.noteTarget);
  return <section aria-label={t('workingReview.title')} className="workspace-divider shrink-0 border-b border-border text-xs">
    <div className="px-3 py-2 flex flex-wrap items-center gap-2">
      <span className="font-medium">{t('workingReview.title')}</span>
      <span role="status" className={review.approved && review.displayReady ? 'text-git-added' : 'text-muted-foreground'}>{t(review.approved && review.displayReady ? 'workingReview.approved' : 'workingReview.pending')}{review.snapshot?.hunks.length ? ` · ${review.approvedHunks}/${review.snapshot.hunks.length}` : ''}</span>
      <Button size="xs" variant={review.approved ? 'secondary' : 'outline'} disabled={!review.ready || !!review.unresolved} aria-pressed={review.approved} onClick={review.approveFile}><Check className="h-3 w-3" />{t(review.approved ? 'workingReview.reopen' : 'workingReview.approveFile')}</Button>
      <Button size="xs" variant="ghost" aria-expanded={review.noteTarget !== undefined} onClick={() => review.setNoteTarget(review.noteTarget === undefined ? null : undefined)}><MessageSquare className="h-3 w-3" />{t('workingReview.issues')} ({issues.length})</Button>
      {filtered && <span className="text-muted-foreground">{t('workingReview.filtered')}</span>}
      {review.failed && <><span className="text-muted-foreground">{t('workingReview.loadFailed')}</span><Button size="xs" variant="ghost" onClick={review.retry}>{t('composer.retry')}</Button></>}
    </div>
    {!!review.snapshot?.metadata.length && <pre className="px-3 pb-2 text-muted-foreground whitespace-pre-wrap wrap-break-word">{review.snapshot.metadata.join('\n')}</pre>}
    {review.noteTarget !== undefined && <div className="px-3 pb-3 space-y-2 max-h-72 overflow-y-auto">
      {issues.map(issue => <div key={issue.id} className="rounded border border-border p-2 flex items-start gap-2">
        <label className="flex gap-2 flex-1 min-w-0"><input type="checkbox" checked={issue.resolved} onChange={event => actions.updateIssue(review.key, issue.id, event.target.checked)} aria-label={t('workingReview.resolve')} /><span className="min-w-0"><span className={issue.resolved ? 'line-through text-muted-foreground whitespace-pre-wrap wrap-break-word' : 'whitespace-pre-wrap wrap-break-word'}>{issue.text}</span><span className="block text-muted-foreground mt-1">{t(issue.resolved ? 'workingReview.resolved' : 'workingReview.unresolved')}{issue.snapshot !== review.snapshot?.fingerprint ? ` · ${t('workingReview.contentChanged')}` : ''}</span></span></label>
        <button type="button" title={t('workingReview.deleteIssue')} aria-label={t('workingReview.deleteIssue')} onClick={() => actions.deleteIssue(review.key, issue.id)}><X className="h-3 w-3" /></button>
      </div>)}
      <p className="font-mono text-muted-foreground truncate">{target?.header ?? t('workingReview.wholeFile')}</p>
      <textarea aria-label={t('workingReview.issueText')} value={text} maxLength={6000} onChange={event => setText(event.target.value)} placeholder={t('workingReview.issuePlaceholder')} rows={2} className="w-full rounded border border-input bg-background p-2 resize-y" />
      <div className="flex justify-end gap-2"><Button size="xs" variant="ghost" onClick={() => review.setNoteTarget(undefined)}>{t('common.close')}</Button><Button size="xs" disabled={!text.trim() || !review.ready || (!!review.noteTarget && !target)} onClick={() => { review.addIssue(text); setText(''); }}>{t('workingReview.addIssue')}</Button></div>
    </div>}
  </section>;
}

export function WorkingReviewHunkActions({ review, header }: { review: WorkingReviewController; header: string }) {
  const { t } = useI18n();
  const hunk = review.snapshot?.hunks.find(item => item.header === header);
  if (!hunk) return null;
  const approved = !!review.record?.approvedHunks.includes(hunk.id);
  const issues = review.record?.issues.filter(issue => !issue.resolved && isWorkingIssueCurrent(issue, review.snapshot) && (!issue.hunk || issue.hunk === hunk.id)).length ?? 0;
  return <div className="flex items-center gap-1 border-r border-border pr-2 mr-1">
    <button type="button" title={t('workingReview.approveHunk')} aria-label={t('workingReview.approveHunk')} aria-pressed={approved} disabled={!review.ready || !!issues} onClick={() => review.approveHunk(hunk.id)} className={`h-7 w-7 rounded flex items-center justify-center disabled:opacity-40 ${approved ? 'text-git-added bg-emerald-500/15' : 'text-muted-foreground hover:bg-accent'}`}><Check className="h-3 w-3" /></button>
    <button type="button" title={t('workingReview.commentHunk')} aria-label={t('workingReview.commentHunk')} disabled={!review.ready} onClick={() => review.setNoteTarget(hunk.id)} className="h-7 px-1.5 rounded flex items-center justify-center gap-1 text-muted-foreground hover:bg-accent disabled:opacity-40"><MessageSquare className="h-3 w-3" />{!!issues && <span>{issues}</span>}</button>
  </div>;
}
