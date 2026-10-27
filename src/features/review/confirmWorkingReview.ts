import { captureWorkingReviews } from '@/services/git/WorkingReviewService';
import type { GitFileChange } from '@/services/git/types';
import { gitService } from '@/services/git/GitService';
import { useWorkingReviewStore, workingReviewKey, workingReviewStatus } from '@/stores/workingReviewStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useRepoStore } from '@/stores/repoStore';
import { confirmAction } from '@/stores/confirmStore';
import { toast } from '@/stores/toastStore';
import { tNow } from '@/i18n';

/** Advisory only. A declined reminder returns to changes; accepting never requires approval. */
export async function confirmWorkingReview(repo: string, branch: string, files: GitFileChange[], wholeWorktree = false, head = '') {
  if (!useSettingsStore.getState().reviewBeforeCommit || !files.length) return true;
  const current = () => useRepoStore.getState().currentRepo?.path === repo && useRepoStore.getState().status?.currentBranch === branch;
  const captured = await captureWorkingReviews(repo, files, wholeWorktree, head);
  if (!current()) return false;
  const records = useWorkingReviewStore.getState().records;
  const pending = captured.filter(({ file, snapshot }) => !workingReviewStatus(records[workingReviewKey(repo, branch, file.path)], snapshot).approved);
  if (!pending.length) return true;
  const unresolved = pending.reduce((sum, { file, snapshot }) => sum + workingReviewStatus(records[workingReviewKey(repo, branch, file.path)], snapshot).unresolved, 0);
  const accepted = await confirmAction({
    title: tNow('workingReview.reminderTitle'),
    description: tNow('workingReview.reminderDesc').replace('{n}', String(pending.length)) + (unresolved ? '\n' + tNow('workingReview.unresolvedCount').replace('{n}', String(unresolved)) : ''),
    detail: pending.map(({ file }) => file.path).join('\n'),
    danger: false, confirmLabel: tNow('workingReview.continueCommit'), cancelLabel: tNow('workingReview.return'),
    checkbox: { label: tNow('workingReview.dontRemind'), onChange: checked => useSettingsStore.getState().setReviewBeforeCommit(!checked) },
  });
  if (!current()) return false;
  if (!accepted) {
    useRepoStore.getState().setActiveTab('changes');
    useRepoStore.getState().setSelectedFile(pending[0].file);
    return false;
  }
  // A dialog can stay open while an editor or another Git client changes the commit contents.
  const status = await gitService.getStatus(repo);
  const fresh = await captureWorkingReviews(repo, files, wholeWorktree, head);
  if (!current() || status.currentBranch !== branch || (head && status.headOid !== head) || fresh.some((entry, index) => captured[index].snapshot && entry.snapshot?.fingerprint !== captured[index].snapshot?.fingerprint)) {
    toast.warning(tNow('composer.scopeChanged'), tNow('composer.scopeChangedDesc'));
    return false;
  }
  return true;
}
