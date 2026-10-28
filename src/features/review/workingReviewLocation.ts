import type { GitFileChange } from '@/services/git/types';
import type { WorkingReviewSnapshot } from '@/services/git/WorkingReviewService';
import { isWorkingIssueCurrent, type WorkingReviewIssue } from '@/stores/workingReviewStore';

/** Prefer the recorded source when both index and worktree still contain the hunk. */
export function workingReviewLocation(issue: WorkingReviewIssue, entries: { file: GitFileChange; snapshot: WorkingReviewSnapshot | null }[]) {
  const preferred = (file: GitFileChange) => issue.origin?.source === 'staged' ? !!file.staged : !file.staged;
  const ordered = [...entries.filter(entry => preferred(entry.file)), ...entries.filter(entry => !preferred(entry.file))];
  const choice = ordered.find(entry => entry.snapshot?.fingerprint === issue.snapshot)
    ?? ordered.find(entry => entry.snapshot && isWorkingIssueCurrent(issue, entry.snapshot))
    ?? ordered[0];
  if (!choice) return null;
  const header = choice.snapshot?.hunks.find(hunk => hunk.id === issue.hunk)?.header;
  return { ...choice, header, changed: !!issue.hunk && !header };
}
