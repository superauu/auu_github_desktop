import type { CollaborationIssue, CollaborationLabel, IssueInput, IssueListOptions, IssueSearchResult, IssueTimelineEvent, IssueUser } from './issueTypes';
import type { CollaborationIssueComment } from './reviewTypes';
/** Issue 编号：GitHub/GitLab/Gitea 是数字；Gitee 是随机字符串（如 IKWTPH），路径参数同样用它。 */
export type IssueNumber = number | string;
export interface TaskTrackingClient {
  searchIssues(owner: string, repo: string, options: IssueListOptions): Promise<IssueSearchResult>;
  getIssue(owner: string, repo: string, number: IssueNumber): Promise<CollaborationIssue>;
  createIssue(owner: string, repo: string, input: IssueInput): Promise<CollaborationIssue>;
  updateIssue(owner: string, repo: string, number: IssueNumber, input: Partial<IssueInput> & { state?: 'open' | 'closed'; state_reason?: 'completed' | 'not_planned' | 'reopened' }): Promise<CollaborationIssue>;
  getIssueComments(owner: string, repo: string, number: IssueNumber): Promise<CollaborationIssueComment[]>;
  createIssueComment(owner: string, repo: string, number: IssueNumber, body: string): Promise<CollaborationIssueComment>;
  getIssueTimeline(owner: string, repo: string, number: IssueNumber): Promise<IssueTimelineEvent[]>;
  getIssueLabels(owner: string, repo: string): Promise<CollaborationLabel[]>;
  getIssueAssignees(owner: string, repo: string): Promise<IssueUser[]>;
}
