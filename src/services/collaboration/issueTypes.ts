export interface IssueReference { owner: string; repo: string; number: number; providerId?: string; server?: string }
export interface IssueDraftContext extends IssueReference { title: string; body: string }
export interface CollaborationCommitStatus { id: number; context: string; state: 'error' | 'failure' | 'pending' | 'success' | 'warning'; description?: string | null; target_url?: string | null }
export interface CollaborationLabel { id: number; name: string; color: string; description?: string | null }
export interface IssueUser { login: string; avatar_url?: string }
export interface CollaborationIssue {
  id: number; number: number; title: string; body: string | null;
  state: 'open' | 'closed'; state_reason?: 'completed' | 'not_planned' | 'reopened' | null;
  html_url: string; user: IssueUser; labels: CollaborationLabel[]; assignees: IssueUser[];
  comments: number; created_at: string; updated_at: string; closed_at: string | null;
  locked?: boolean; pull_request?: unknown;
}
export interface IssueListOptions {
  state: 'open' | 'closed' | 'all'; query: string; label: string; assignee: string; page: number;
}
export interface IssueSearchResult { items: CollaborationIssue[]; total_count: number; incomplete_results: boolean }
export interface IssueInput { title: string; body: string; labels: string[]; assignees: string[] }
export interface IssueTimelineEvent {
  event: string;
  source?: { issue?: { number: number; title: string; state: 'open' | 'closed'; html_url: string; pull_request?: { merged_at?: string | null } } };
}
