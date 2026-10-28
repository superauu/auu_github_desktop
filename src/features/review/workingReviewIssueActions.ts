import { tNow } from '@/i18n';
import { useWorkingReviewStore, type WorkingReviewIssue } from '@/stores/workingReviewStore';
import { useToastStore } from '@/stores/toastStore';

/** Undo always restores to the original scope, even after changing repository or branch. */
export function deleteWorkingReviewIssue(key: string, issue: WorkingReviewIssue, index: number) {
  useWorkingReviewStore.getState().deleteIssue(key, issue.id);
  useToastStore.getState().addToast({ type: 'info', title: tNow('workingReview.noteDeleted'), duration: 8000,
    action: { label: tNow('workingReview.undo'), onClick: () => useWorkingReviewStore.getState().restoreIssue(key, issue, index) } });
}
