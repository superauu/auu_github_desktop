import type { CollaborationPullRequest } from './types';
import type { CollaborationIssueComment, CollaborationPullRequestReview, CollaborationPullRequestFilesResult, CollaborationReviewComment, CreateReviewParams } from './reviewTypes';
export interface CodeHostingClient {
  getPullRequest(owner: string, repo: string, number: number): Promise<CollaborationPullRequest>;
  getPullRequests(owner: string, repo: string, state?: 'open' | 'closed' | 'all', maxPages?: number): Promise<CollaborationPullRequest[]>;
  getPullRequestReviews(owner: string, repo: string, pullNumber: number): Promise<CollaborationPullRequestReview[]>;
  getPullRequestFiles(owner: string, repo: string, pullNumber: number, maxPages?: number): Promise<CollaborationPullRequestFilesResult>;
  getPullRequestReviewComments(owner: string, repo: string, pullNumber: number): Promise<CollaborationReviewComment[]>;
  getPullRequestIssueComments(owner: string, repo: string, pullNumber: number): Promise<CollaborationIssueComment[]>;
  createPullRequestReview(owner: string, repo: string, pullNumber: number, params: CreateReviewParams): Promise<CollaborationPullRequestReview>;
  createPullRequest(owner: string, repo: string, params: { title: string; head: string; headRepo?: string; base: string; body?: string; draft?: boolean }): Promise<CollaborationPullRequest>;
  mergePullRequest(owner: string, repo: string, pullNumber: number, options?: { mergeMethod?: 'merge' | 'squash' | 'rebase'; commitTitle?: string; commitMessage?: string; expectedHeadSha?: string }): Promise<{ merged: boolean; message: string }>;
  updatePullRequestState(owner: string, repo: string, pullNumber: number, state: 'closed' | 'open'): Promise<CollaborationPullRequest>;
}
