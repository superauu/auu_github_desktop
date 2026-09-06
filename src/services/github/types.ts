export interface GitHubUser {
  login: string;
  id: number;
  avatar_url: string;
  name: string | null;
  email: string | null;
  bio: string | null;
  public_repos: number;
  html_url: string;
}

export interface GitHubRepoDetails {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  html_url: string;
  description: string | null;
  stargazers_count: number;
  forks_count: number;
  default_branch: string;
  open_issues_count: number;
}

export interface GitHubWorkflow {
  id: number;
  name: string;
  path: string;
  state: 'active' | 'disabled_manually' | 'disabled_inactivity';
  html_url: string;
  badge_url: string;
}

export type WorkflowRunStatus = 'queued' | 'in_progress' | 'completed' | 'waiting';
export type WorkflowRunConclusion =
  | 'success'
  | 'failure'
  | 'neutral'
  | 'cancelled'
  | 'timed_out'
  | 'action_required'
  | 'skipped'
  | null;

export interface GitHubWorkflowRun {
  id: number;
  name: string;
  head_branch: string;
  head_sha: string;
  event: string;
  status: WorkflowRunStatus;
  conclusion: WorkflowRunConclusion;
  html_url: string;
  created_at: string;
  updated_at: string;
  run_number: number;
  run_attempt: number;
  duration_ms?: number;
  actor: {
    login: string;
    avatar_url: string;
  };
  head_commit: {
    id: string;
    message: string;
    author: {
      name: string;
      email: string;
    };
  };
}

export interface GitHubJobStep {
  name: string;
  status: 'queued' | 'in_progress' | 'completed';
  conclusion: 'success' | 'failure' | 'skipped' | null;
  number: number;
  started_at?: string;
  completed_at?: string;
}

export interface GitHubJob {
  id: number;
  run_id: number;
  name: string;
  status: 'queued' | 'in_progress' | 'completed';
  conclusion: 'success' | 'failure' | 'neutral' | 'cancelled' | 'skipped' | null;
  started_at: string;
  completed_at: string | null;
  steps: GitHubJobStep[];
  html_url: string;
}

export interface GitHubCheckRun {
  id: number;
  name: string;
  head_sha: string;
  status: 'queued' | 'in_progress' | 'completed';
  conclusion: 'success' | 'failure' | 'neutral' | 'cancelled' | 'timed_out' | 'action_required' | null;
  started_at: string;
  completed_at: string | null;
  html_url: string;
}

export interface WorkflowDispatchParams {
  ref: string;
  inputs?: Record<string, string>;
}

export interface JobLogsData {
  jobId: number;
  jobName: string;
  rawLogs: string;
  stepLogs?: { stepNumber: number; stepName: string; lines: string[] }[];
}

export interface WorkflowYamlContent {
  path: string;
  content: string;
}

export interface GitHubPullRequest {
  id: number;
  number: number;
  title: string;
  state: 'open' | 'closed';
  merged_at: string | null;
  created_at: string;
  updated_at: string;
  body: string | null;
  html_url: string;
  user: {
    login: string;
    avatar_url: string;
  };
  head: {
    ref: string;
    sha: string;
    label: string;
  };
  base: {
    ref: string;
    sha: string;
  };
  labels: {
    id: number;
    name: string;
    color: string;
    description: string | null;
  }[];
  review_status?: 'APPROVED' | 'CHANGES_REQUESTED' | 'PENDING' | 'COMMENTED';
  checks_summary?: {
    total: number;
    success: number;
    failure: number;
  };
  additions?: number;
  deletions?: number;
  changed_files?: number;
}
