import { useState } from 'react';
import { MapPin, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/i18n';
import { useWorkingReviewStore, useWorkingReviewDraftStore, type WorkingReviewIssue } from '@/stores/workingReviewStore';
import { deleteWorkingReviewIssue } from './workingReviewIssueActions';

export function WorkingReviewIssueCard({ recordKey, issue, index, onLocate, changed = false }: {
  recordKey: string; issue: WorkingReviewIssue; index: number; onLocate?: () => void; changed?: boolean;
}) {
  const { t } = useI18n();
  const [editing, setEditing] = useState(false), [original, setOriginal] = useState(''), [error, setError] = useState(false);
  const draftKey = JSON.stringify(['edit', recordKey, issue.id]);
  const draft = useWorkingReviewDraftStore(state => state.drafts[draftKey] ?? issue.text);
  const setDraft = useWorkingReviewDraftStore(state => state.setDraft);
  const save = () => {
    if (!draft.trim()) return;
    if (!useWorkingReviewStore.getState().editIssue(recordKey, issue.id, draft, original)) { setError(true); return; }
    setDraft(draftKey, ''); setEditing(false); setError(false);
  };
  return <div data-testid={`working-review-note-${issue.id}`} className="flex flex-col gap-2 rounded border border-border p-2 text-xs">
    {editing ? <form onSubmit={event => { event.preventDefault(); save(); }} className="flex flex-col gap-2">
      <textarea autoFocus name="reviewNoteEdit" autoComplete="off" aria-label={t('workingReview.editIssue')} value={draft} maxLength={6000} rows={3} onChange={event => setDraft(draftKey, event.target.value, true)} onKeyDown={event => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !event.nativeEvent.isComposing) { event.preventDefault(); save(); } }} className="w-full rounded border border-input bg-background p-2 focus-visible:ring-1 focus-visible:ring-ring" />
      {error && <p role="alert" className="text-destructive">{t('workingReview.editChanged')}</p>}
      <div className="flex justify-end gap-2"><Button type="button" size="xs" variant="ghost" onClick={() => { setEditing(false); setError(false); }}>{t('common.cancel')}</Button><Button type="submit" size="xs" disabled={!draft.trim()}>{t('workingReview.saveEdit')}</Button></div>
    </form> : <p className={issue.resolved ? 'line-through text-muted-foreground whitespace-pre-wrap [overflow-wrap:anywhere]' : 'whitespace-pre-wrap [overflow-wrap:anywhere]'}>{issue.text}</p>}
    {issue.origin?.header && <p className="font-mono text-muted-foreground [overflow-wrap:anywhere]">{issue.origin.header}</p>}
    {changed && <p className="text-muted-foreground">{t('workingReview.contentChanged')}</p>}
    <div className="flex flex-wrap items-center gap-2">
      <label className="flex items-center gap-2"><input data-testid={`working-review-resolve-${issue.id}`} type="checkbox" checked={issue.resolved} onChange={event => useWorkingReviewStore.getState().updateIssue(recordKey, issue.id, event.target.checked)} aria-label={t(issue.resolved ? 'workingReview.reopenIssue' : 'workingReview.resolve')} />{t(issue.resolved ? 'workingReview.resolved' : 'workingReview.unresolved')}</label>
      {onLocate && <Button size="xs" variant="ghost" onClick={onLocate}><MapPin aria-hidden="true" className="size-3" />{t('workingReview.locateIssue')}</Button>}
      {!editing && <Button data-testid={`working-review-edit-${issue.id}`} size="xs" variant="ghost" onClick={() => { setOriginal(issue.text); setEditing(true); setError(false); }}><Pencil aria-hidden="true" className="size-3" />{t('workingReview.editIssue')}</Button>}
      <Button data-testid={`working-review-delete-${issue.id}`} size="xs" variant="ghost" aria-label={t('workingReview.deleteIssue')} onClick={() => deleteWorkingReviewIssue(recordKey, issue, index)}><Trash2 aria-hidden="true" className="size-3" />{t('workingReview.deleteIssue')}</Button>
    </div>
  </div>;
}
