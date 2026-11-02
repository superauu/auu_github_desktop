import type { CollaborationCheckRun } from '@/services/collaboration/types';
import { currentPlatformPath } from '@/services/integrations/links';
import type { CollaborationCommitStatus } from '@/services/collaboration/issueTypes';
import type { CollaborationPullRequestReview } from '@/services/collaboration/CollaborationService';

export type CiSummary = 'none' | 'passing' | 'running' | 'failed' | 'neutral' | 'unknown';
export function summarizeCI(runs: CollaborationCheckRun[], statuses: CollaborationCommitStatus[], incomplete = false): CiSummary {
  if (runs.some(run => run.status === 'completed' && ['failure', 'cancelled', 'timed_out', 'action_required', 'startup_failure', 'stale'].includes(run.conclusion || ''))
    || statuses.some(status => status.state === 'failure' || status.state === 'error')) return 'failed';
  if (incomplete) return 'unknown';
  if (runs.some(run => run.status !== 'completed') || statuses.some(status => status.state === 'pending')) return 'running';
  if (!runs.length && !statuses.length) return 'none';
  if (runs.some(run => !['success', 'neutral', 'skipped'].includes(run.conclusion || ''))) return 'unknown';
  if (runs.some(run => run.conclusion === 'neutral' || run.conclusion === 'skipped')) return 'neutral';
  return 'passing';
}
export function summarizeReviews(reviews: CollaborationPullRequestReview[]) {
  const latest = new Map<string, CollaborationPullRequestReview>();
  for (const review of [...reviews].sort((a, b) => a.id - b.id)) {
    if (review.state === 'PENDING' || review.state === 'COMMENTED') continue;
    latest.set(review.user.login.toLowerCase(), review);
  }
  return { approved: [...latest.values()].filter(review => review.state === 'APPROVED').length,
    changesRequested: [...latest.values()].filter(review => review.state === 'CHANGES_REQUESTED').length };
}
export function pullRequestReference(url: string) {
  const match = currentPlatformPath(url)?.match(/^\/(.+?)\/(?:-\/)?(?:pull|pulls|merge_requests)\/(\d+)$/);
  if (!match) return null;
  const parts = match[1].split('/');
  return { owner: parts.slice(0, -1).map(decodeURIComponent).join('/'), repo: decodeURIComponent(parts.at(-1)!), number: Number(match[2]) };
}
