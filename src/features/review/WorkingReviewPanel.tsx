import { useEffect, useRef } from 'react';
import { Check, ChevronRight, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/i18n';
import { useWorkingReviewStore, useWorkingReviewDraftStore, useWorkingReviewStorageStatus, isWorkingIssueCurrent, type WorkingReviewIssue } from '@/stores/workingReviewStore';
import { toast } from '@/stores/toastStore';
import { WorkingReviewIssueCard } from './WorkingReviewIssueCard';
import type { WorkingReviewController } from './useWorkingReview';
import { formatDiffHunkLabel } from '@/utils/diffHunkLabel';

export function WorkingReviewPanel({ review, filtered, onNext, onLocate }: { review: WorkingReviewController; filtered: boolean; onNext?: () => void; onLocate?: (issue: WorkingReviewIssue) => void }) {
  const { t, lang } = useI18n();
  const draftKey = JSON.stringify([review.key, review.snapshot?.fingerprint, review.noteTarget]);
  const text = useWorkingReviewDraftStore(state => state.drafts[draftKey] ?? '');
  const setDraft = useWorkingReviewDraftStore(state => state.setDraft);
  const textarea = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (review.noteTarget !== undefined) textarea.current?.focus(); }, [draftKey, review.noteTarget]);
  const storageFailed = useWorkingReviewStorageStatus(state => state.unavailable);
  const actions = useWorkingReviewStore.getState();
  const issues = review.record?.issues ?? [];
  const target = review.snapshot?.hunks.find(hunk => hunk.id === review.noteTarget);
  const canSave = !!text.trim() && review.ready && (!review.noteTarget || !!target);
  const save = () => {
    if (!canSave) return;
    review.addIssue(text); setDraft(draftKey, ''); toast.success(t('workingReview.noteSaved'));
  };
  return <section aria-label={t('workingReview.title')} className="workspace-divider shrink-0 border-b border-border text-xs">
    <div className="px-3 py-2 flex flex-wrap items-center gap-2">
      <span className="font-medium">{t('workingReview.title')}</span>
      <span role="status" className={review.approved && review.displayReady ? 'text-git-added' : 'text-muted-foreground'}>{t(review.approved && review.displayReady ? 'workingReview.approved' : 'workingReview.pending')}{review.snapshot?.hunks.length ? ` · ${review.approvedHunks}/${review.snapshot.hunks.length}` : ''}</span>
      <Button size="xs" variant={review.approved ? 'secondary' : 'outline'} disabled={!review.ready || !!review.unresolved} aria-pressed={review.approved} onClick={review.approveFile}><Check className="h-3 w-3" />{t(review.approved ? 'workingReview.reopen' : 'workingReview.approveFile')}</Button>
      {onNext && <>
        {!review.approved && <Button size="xs" variant="outline" disabled={!review.ready || !!review.unresolved} onClick={() => { review.approveFile(); onNext(); }}>{t('workingReview.approveNext')}<ChevronRight aria-hidden="true" className="size-3" /></Button>}
        <Button size="xs" variant="ghost" onClick={onNext}>{t('workingReview.nextPending')}<ChevronRight aria-hidden="true" className="size-3" /></Button>
      </>}
      <Button size="xs" variant="ghost" aria-expanded={review.noteTarget !== undefined} onClick={() => review.setNoteTarget(review.noteTarget === undefined ? null : undefined)}><MessageSquare className="h-3 w-3" />{t('workingReview.issues')} ({issues.length})</Button>
      {!!review.unresolved && <span className="text-destructive">{t('workingReview.resolveFirst').replace('{n}', String(review.unresolved))}</span>}
      {filtered && <span className="text-muted-foreground">{t('workingReview.filtered')}</span>}
      {review.failed && <><span className="text-muted-foreground">{t('workingReview.loadFailed')}</span><Button size="xs" variant="ghost" onClick={review.retry}>{t('composer.retry')}</Button></>}
    </div>
    {storageFailed && <div role="alert" className="px-3 pb-2 flex flex-wrap items-center gap-2 text-destructive"><span>{t('workingReview.storageFailed')}</span><Button size="xs" variant="outline" onClick={actions.retrySave}>{t('workingReview.retrySave')}</Button></div>}
    {!!review.snapshot?.metadata.length && <pre className="px-3 pb-2 text-muted-foreground whitespace-pre-wrap wrap-break-word">{review.snapshot.metadata.join('\n')}</pre>}
    {review.noteTarget !== undefined && <div className="px-3 pb-3 flex flex-col gap-2 max-h-72 overflow-y-auto">
      {issues.map((issue, index) => <WorkingReviewIssueCard key={issue.id} recordKey={review.key} issue={issue} index={index} changed={issue.snapshot !== review.snapshot?.fingerprint} onLocate={onLocate ? () => onLocate(issue) : undefined} />)}
      <form onSubmit={event => { event.preventDefault(); save(); }} className="flex flex-col gap-2">
        <label htmlFor="working-review-note" className="text-muted-foreground truncate" title={target?.header}>{target ? formatDiffHunkLabel(target.header, lang) : t(review.noteTarget ? 'workingReview.hunkChanged' : 'workingReview.wholeFile')}</label>
        <textarea id="working-review-note" ref={textarea} aria-label={t('workingReview.issueText')} aria-describedby="working-review-draft-hint" name="reviewNote" autoComplete="off" value={text} maxLength={6000} onChange={event => setDraft(draftKey, event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !event.nativeEvent.isComposing) { event.preventDefault(); save(); } }} placeholder={t('workingReview.issuePlaceholder')} rows={2} className="w-full rounded border border-input bg-background p-2 resize-y focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring" />
        <div className="flex flex-wrap items-center justify-end gap-2"><span id="working-review-draft-hint" className="mr-auto text-muted-foreground">{t('workingReview.draftHint')}</span><Button type="button" size="xs" variant="ghost" onClick={() => review.setNoteTarget(undefined)}>{t('common.close')}</Button><Button type="submit" size="xs" disabled={!canSave}>{t('workingReview.addIssue')}</Button></div>
      </form>
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
    <button type="button" title={t(approved ? 'workingReview.reopenHunk' : 'workingReview.approveHunk')} aria-label={t(approved ? 'workingReview.reopenHunk' : 'workingReview.approveHunk')} aria-pressed={approved} disabled={!review.ready || !!issues} onClick={() => review.approveHunk(hunk.id)} className={`h-7 w-7 rounded flex items-center justify-center disabled:opacity-40 focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring ${approved ? 'text-git-added bg-emerald-500/15' : 'text-muted-foreground hover:bg-accent'}`}><Check aria-hidden="true" className="h-3 w-3" /></button>
    <button type="button" title={t('workingReview.commentHunk')} aria-label={t('workingReview.commentHunk')} disabled={!review.ready} onClick={() => review.setNoteTarget(hunk.id)} className="h-7 px-1.5 rounded flex items-center justify-center gap-1 text-muted-foreground hover:bg-accent disabled:opacity-40 focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"><MessageSquare aria-hidden="true" className="h-3 w-3" />{!!issues && <span>{issues}</span>}</button>
  </div>;
}
