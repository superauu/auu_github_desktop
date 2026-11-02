import type { CollaborationIssue, CollaborationLabel, IssueInput, IssueListOptions, IssueSearchResult, IssueTimelineEvent, IssueUser } from './issueTypes';
import type { CollaborationIssueComment } from './reviewTypes';
export interface TaskTrackingClient {
  searchIssues(owner: string, repo: string, options: IssueListOptions): Promise<IssueSearchResult>;
  getIssue(owner: string, repo: string, number: number): Promise<CollaborationIssue>;
  createIssue(owner: string, repo: string, input: IssueInput): Promise<CollaborationIssue>;
  updateIssue(owner: string, repo: string, number: number, input: Partial<IssueInput> & { state?: 'open' | 'closed'; state_reason?: 'completed' | 'not_planned' | 'reopened' }): Promise<CollaborationIssue>;
  getIssueComments(owner: string, repo: string, number: number): Promise<CollaborationIssueComment[]>;
  createIssueComment(owner: string, repo: string, number: number, body: string): Promise<CollaborationIssueComment>;
  getIssueTimeline(owner: string, repo: string, number: number): Promise<IssueTimelineEvent[]>;
  getIssueLabels(owner: string, repo: string): Promise<CollaborationLabel[]>;
  getIssueAssignees(owner: string, repo: string): Promise<IssueUser[]>;
}
