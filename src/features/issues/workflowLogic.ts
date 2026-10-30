import type { GitHubCheckRun } from '@/services/github/types';
import type { GitHubCommitStatus } from '@/services/github/issueTypes';
import type { GitHubPullRequestReview } from '@/services/github/GitHubService';

export type CiSummary = 'none' | 'passing' | 'running' | 'failed' | 'neutral' | 'unknown';
export function summarizeCI(runs: GitHubCheckRun[], statuses: GitHubCommitStatus[], incomplete = false): CiSummary {
  if (runs.some(run => run.status === 'completed' && ['failure', 'cancelled', 'timed_out', 'action_required', 'startup_failure', 'stale'].includes(run.conclusion || ''))
    || statuses.some(status => status.state === 'failure' || status.state === 'error')) return 'failed';
  if (incomplete) return 'unknown';
  if (runs.some(run => run.status !== 'completed') || statuses.some(status => status.state === 'pending')) return 'running';
  if (!runs.length && !statuses.length) return 'none';
  if (runs.some(run => !['success', 'neutral', 'skipped'].includes(run.conclusion || ''))) return 'unknown';
  if (runs.some(run => run.conclusion === 'neutral' || run.conclusion === 'skipped')) return 'neutral';
  return 'passing';
}
export function summarizeReviews(reviews: GitHubPullRequestReview[]) {
  const latest = new Map<string, GitHubPullRequestReview>();
  for (const review of [...reviews].sort((a, b) => a.id - b.id)) {
    if (review.state === 'PENDING' || review.state === 'COMMENTED') continue;
    latest.set(review.user.login.toLowerCase(), review);
  }
  return { approved: [...latest.values()].filter(review => review.state === 'APPROVED').length,
    changesRequested: [...latest.values()].filter(review => review.state === 'CHANGES_REQUESTED').length };
}
export function pullRequestReference(url: string) {
  const match = /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/pull\/(\d+)$/.exec(url);
  return match ? { owner: match[1], repo: match[2], number: Number(match[3]) } : null;
}
