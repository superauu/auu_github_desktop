export type GitFileStatusType =
  | 'modified'
  | 'added'
  | 'deleted'
  | 'renamed'
  | 'untracked'
  | 'conflicted';

export interface GitFileChange {
  path: string;
  oldPath?: string;
  status: GitFileStatusType;
  staged: boolean;
  insertions?: number;
  deletions?: number;
}

export interface ParsedDiffLine {
  type: 'header' | 'context' | 'add' | 'delete';
  oldNo: number | null;
  newNo: number | null;
  content: string;
}

export interface GitStatusResult {
  currentBranch: string;
  trackingBranch?: string;
  ahead: number;
  behind: number;
  isClean: boolean;
  staged: GitFileChange[];
  unstaged: GitFileChange[];
  untracked: GitFileChange[];
}

export interface GitCommit {
  hash: string;
  shortHash: string;
  subject: string;
  body?: string;
  author: {
    name: string;
    email: string;
    date: string;
    relativeDate: string;
  };
  parents: string[];
  refs?: string[]; // e.g. ['HEAD -> main', 'origin/main', 'tag: v1.0.0']
  changedFilesCount?: number;
  insertions?: number;
  deletions?: number;
}

export interface GitBranch {
  name: string;
  isCurrent: boolean;
  isRemote: boolean;
  upstream?: string;
  lastCommit?: {
    hash: string;
    message: string;
    date: string;
  };
}

export interface GitTag {
  name: string;
  commitHash: string;
  message?: string;
  tagger?: {
    name: string;
    email: string;
    date: string;
  };
  isAnnotated: boolean;
}

export interface GitStash {
  index: number;
  message: string;
  branch: string;
  date: string;
  hash: string;
}

export interface RepositoryInfo {
  id: string;
  name: string;
  path: string;
  currentBranch: string;
  lastOpenedAt: number;
  remoteUrl?: string;
  isGitHubRepo?: boolean;
  gitHubOwner?: string;
  gitHubRepo?: string;
}

export interface IGitService {
  isGitInstalled(): Promise<boolean>;
  getGitVersion(): Promise<string>;
  openRepository(path: string): Promise<RepositoryInfo>;
  initRepository(path: string): Promise<void>;
  cloneRepository(url: string, targetPath: string, branch?: string): Promise<void>;
  getStatus(repoPath: string): Promise<GitStatusResult>;
  getBranches(repoPath: string): Promise<GitBranch[]>;
  getBranchCommitHash(repoPath: string, branchName: string): Promise<string | null>;
  getTags(repoPath: string): Promise<GitTag[]>;
  getCommits(repoPath: string, limit?: number): Promise<GitCommit[]>;
  getCommitsForBranch(repoPath: string, branchName: string, limit?: number): Promise<GitCommit[]>;
  getStashes(repoPath: string): Promise<GitStash[]>;
  stageFile(repoPath: string, filePath: string): Promise<void>;
  unstageFile(repoPath: string, filePath: string): Promise<void>;
  stageHunk(repoPath: string, filePath: string, hunk: ParsedDiffLine[], isUntracked?: boolean): Promise<void>;
  unstageHunk(repoPath: string, filePath: string, hunk: ParsedDiffLine[]): Promise<void>;
  discardHunk(repoPath: string, filePath: string, hunk: ParsedDiffLine[]): Promise<void>;
  stageAll(repoPath: string): Promise<void>;
  unstageAll(repoPath: string): Promise<void>;
  discardChanges(repoPath: string, filePath: string): Promise<void>;
  commit(repoPath: string, message: string, amend?: boolean): Promise<string>;
  push(repoPath: string, remote?: string, branch?: string, options?: { setUpstream?: boolean; forceWithLease?: boolean }): Promise<void>;
  pull(repoPath: string, rebase?: boolean): Promise<void>;
  fetch(repoPath: string): Promise<void>;
  createBranch(repoPath: string, name: string, startPoint?: string): Promise<void>;
  checkoutBranch(repoPath: string, name: string): Promise<void>;
  deleteBranch(repoPath: string, name: string, force?: boolean): Promise<void>;
  getFileDiff(repoPath: string, filePath: string, staged?: boolean, isUntracked?: boolean): Promise<any[]>;
  getCommitFiles(repoPath: string, commitHash: string): Promise<GitFileChange[]>;
  getCommitFileDiff(repoPath: string, commitHash: string, filePath: string): Promise<ParsedDiffLine[]>;
  createTag(repoPath: string, name: string, commitHash?: string, message?: string): Promise<void>;
  deleteTag(repoPath: string, name: string): Promise<void>;
  pushTag(repoPath: string, name: string, remote?: string): Promise<void>;
  pushAllTags(repoPath: string, remote?: string): Promise<void>;
  deleteRemoteTag(repoPath: string, name: string, remote?: string): Promise<void>;
  merge(repoPath: string, branch: string, options?: { noFf?: boolean; message?: string }): Promise<string>;
  abortMerge(repoPath: string): Promise<void>;
  rebase(repoPath: string, upstream: string): Promise<string>;
  rebaseContinue(repoPath: string): Promise<void>;
  rebaseAbort(repoPath: string): Promise<void>;
  cherryPickContinue(repoPath: string): Promise<void>;
  cherryPickAbort(repoPath: string): Promise<void>;
  undoLastCommit(repoPath: string): Promise<void>;
  redoCommit(repoPath: string, commitHash: string): Promise<void>;
  openTerminal(repoPath: string): Promise<void>;
  fetchAndCheckoutPR(repoPath: string, prNumber: number, customBranchName?: string): Promise<string>;
  diagnoseRepository(repoPath: string): Promise<RepoHealthDiagnosis>;
  // Conflict & In-Progress Operation Management
  getRepoOperationState(repoPath: string): Promise<RepoOperationState>;
  resolveConflictWithOurs(repoPath: string, filePath: string): Promise<void>;
  resolveConflictWithTheirs(repoPath: string, filePath: string): Promise<void>;
  resetConflictMarkers(repoPath: string, filePath: string): Promise<void>;
  readWorkingFile(repoPath: string, filePath: string): Promise<string>;
  writeWorkingFile(repoPath: string, filePath: string, content: string): Promise<void>;
}

export interface RepoOperationState {
  type: 'none' | 'merge' | 'rebase' | 'cherry-pick';
  inConflict: boolean;
  conflictedFiles: string[];
  isAllResolved: boolean;
  branchName?: string;
}

export interface HealthIssue {
  type: 'conflict' | 'detached' | 'unpushed' | 'behind' | 'in_progress' | 'clean';
  level: 'error' | 'warning' | 'info' | 'success';
  title: string;
  description: string;
  actionHint?: string;
}

export interface RepoHealthDiagnosis {
  score: number;
  status: 'healthy' | 'warning' | 'danger';
  issues: HealthIssue[];
  summary: string;
}

