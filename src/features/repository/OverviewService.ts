import { gitService } from '@/services/git/GitService';
import { GitHubService } from '@/services/github/GitHubService';
import { parseGitHubRemote } from '@/services/git/remoteIdentity';
import { listRepositoryPermissions } from '@/services/fs/RepositoryAccess';
import { sameWorktreePath } from '@/services/git/worktrees';
import type { GitStatusResult, RepositoryInfo, RepoOperationState } from '@/services/git/types';
import { summarizeCI, type CiSummary } from '@/features/issues/workflowLogic';

export class OverviewPermissionError extends Error {}
export interface OverviewLocal { status: GitStatusResult; operation: RepoOperationState; checkedAt: number }
export interface OverviewCI { state: CiSummary | 'auth' | 'unpublished' | 'unsupported'; ref?: string; sha?: string; url?: string; error?: string }
export const overviewService = {
  async local(repo: RepositoryInfo, authorized = false): Promise<OverviewLocal> {
    if (!authorized && typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
      && !(await listRepositoryPermissions()).some(path => sameWorktreePath(path, repo.path))) throw new OverviewPermissionError();
    const status = await gitService.getStatus(repo.path);
    const operation = await gitService.getRepoOperationState(repo.path, status);
    return { status, operation, checkedAt: Date.now() };
  },
  async ci(repo: RepositoryInfo, status: GitStatusResult, token: string | null, authenticated: boolean): Promise<OverviewCI> {
    if (!authenticated) return { state: 'auth' };
    const ref = status.trackingBranch;
    if (!ref) return { state: 'unpublished' };
    const remotes = await gitService.listRemotes(repo.path);
    const remote = remotes.sort((a, b) => b.name.length - a.name.length).find(item => ref.startsWith(`${item.name}/`));
    const identities = (remote?.fetchUrl || '').split('\n').map(parseGitHubRemote).filter(value => !!value);
    if (!identities.length || new Set(identities.map(item => `${item.owner.toLowerCase()}/${item.repo.toLowerCase()}`)).size !== 1) return { state: 'unsupported', ref };
    const sha = await gitService.getBranchCommitHash(repo.path, ref);
    if (!sha || !/^(?:[a-f\d]{40}|[a-f\d]{64})$/i.test(sha)) return { state: 'unpublished', ref };
    const client = new GitHubService(); client.setToken(token);
    const { owner, repo: name } = identities[0];
    const [checks, statuses] = await Promise.allSettled([client.getWorkflowCheckRuns(owner, name, sha), client.getWorkflowCommitStatuses(owner, name, sha)]);
    const runs = checks.status === 'fulfilled' ? checks.value.check_runs : [], states = statuses.status === 'fulfilled' ? statuses.value.statuses : [];
    const incomplete = checks.status === 'rejected' || statuses.status === 'rejected'
      || (checks.status === 'fulfilled' && checks.value.total_count > runs.length) || (statuses.status === 'fulfilled' && statuses.value.total_count > states.length);
    return { state: summarizeCI(runs, states, incomplete), ref, sha, url: `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/commit/${sha}/checks`,
      ...(incomplete ? { error: [checks, statuses].filter(item => item.status === 'rejected').map(item => String((item as PromiseRejectedResult).reason?.message || (item as PromiseRejectedResult).reason)).join('\n') } : {}) };
  },
};
