import { captureWorkingReviews } from '@/services/git/WorkingReviewService';
import { gitService } from '@/services/git/GitService';
import type { GitStatusResult } from '@/services/git/types';
import { useRepoStore } from '@/stores/repoStore';
import { useWorkingReviewStore, workingReviewKey } from '@/stores/workingReviewStore';

function scope(status: GitStatusResult | null) {
  return status && JSON.stringify([status.currentBranch, status.headOid,
    [...status.staged, ...status.unstaged, ...status.untracked].map(file => JSON.stringify([file.path, !!file.staged, file.oldPath, file.status])).sort(),
  ]);
}

/** Read exact versions before changing any approvals. This operation never writes the Git index. */
export async function approveAllWorkingReviews(repo: string, status: GitStatusResult) {
  const expected = scope(status);
  const current = () => useRepoStore.getState().currentRepo?.path === repo && scope(useRepoStore.getState().status) === expected;
  const cancelled = { cancelled: true, approved: 0, alreadyApproved: 0, unresolved: 0, failed: 0, conflicts: 0 };
  if (!current()) return cancelled;
  const files = [...status.staged, ...status.unstaged, ...status.untracked];
  const conflicts = files.filter(file => file.status === 'conflicted').length;
  const captured = await captureWorkingReviews(repo, files.filter(file => file.status !== 'conflicted'));
  if (!current()) return cancelled;
  const latest = await gitService.getStatus(repo);
  if (!current() || scope(latest) !== expected) return cancelled;
  // Approvals bind only to the captured fingerprints. Later edits require review again.
  const entries = captured.flatMap(({ file, snapshot }) => snapshot
    ? [{ key: workingReviewKey(repo, status.currentBranch, file.path), snapshot }] : []);
  return { cancelled: false, ...useWorkingReviewStore.getState().approveFiles(entries),
    conflicts, failed: captured.filter(entry => !entry.snapshot).length };
}
