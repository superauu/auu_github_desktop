import { captureWorkingReviews } from '@/services/git/WorkingReviewService';
import { gitService } from '@/services/git/GitService';
import type { GitStatusResult } from '@/services/git/types';
import type { GitFileChange } from '@/services/git/types';
import type { WorkingReviewCaptureOptions } from '@/services/git/WorkingReviewService';
import { useRepoStore } from '@/stores/repoStore';
import { useWorkingReviewStore, workingReviewKey } from '@/stores/workingReviewStore';

function scope(status: GitStatusResult | null) {
  return status && JSON.stringify([status.currentBranch, status.headOid,
    [...status.staged, ...status.unstaged, ...status.untracked].map(file => JSON.stringify([file.path, !!file.staged, file.oldPath, file.status])).sort(),
  ]);
}

/** Read exact versions before changing any approvals. This operation never writes the Git index. */
export async function approveAllWorkingReviews(repo: string, status: GitStatusResult, options: WorkingReviewCaptureOptions & { files?: readonly GitFileChange[] } = {}) {
  const expected = scope(status);
  const current = () => useRepoStore.getState().currentRepo?.path === repo && scope(useRepoStore.getState().status) === expected;
  const cancelled = { cancelled: true, approved: 0, alreadyApproved: 0, unresolved: 0, failed: 0, conflicts: 0, failedFiles: [] as GitFileChange[] };
  if (options.signal?.aborted || !current()) return cancelled;
  const allFiles = [...status.staged, ...status.unstaged, ...status.untracked];
  const identity = (file: GitFileChange) => JSON.stringify([file.path, !!file.staged, file.oldPath, file.status]);
  const wanted = options.files && new Set(options.files.map(identity));
  const files = wanted ? allFiles.filter(file => wanted.has(identity(file))) : allFiles;
  const conflicts = files.filter(file => file.status === 'conflicted').length;
  const captured = await captureWorkingReviews(repo, files.filter(file => file.status !== 'conflicted'), false, '', { ...options, isCurrent: current });
  if (options.signal?.aborted || !current()) return cancelled;
  const latest = await gitService.getStatus(repo);
  if (options.signal?.aborted || !current() || scope(latest) !== expected) return cancelled;
  // Approvals bind only to the captured fingerprints. Later edits require review again.
  const entries = captured.flatMap(({ file, snapshot }) => snapshot
    ? [{ key: workingReviewKey(repo, status.currentBranch, file.path), snapshot }] : []);
  return { cancelled: false, ...useWorkingReviewStore.getState().approveFiles(entries),
    conflicts, failed: captured.filter(entry => !entry.snapshot).length, failedFiles: captured.filter(entry => !entry.snapshot).map(entry => entry.file) };
}
