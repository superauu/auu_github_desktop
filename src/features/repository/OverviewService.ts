import { gitService } from '@/services/git/GitService';
import { getHostingPlugin } from '@/services/integrations/plugins';
import { providerSupports } from '@/services/integrations/registry';
import { collaborationClient } from '@/services/collaboration/CollaborationService';
import { resolveHostingBinding } from '@/services/integrations/repositoryBinding';
import { hostingConnections } from '@/services/integrations/runtime';
import { useCollaborationStore } from '@/stores/collaborationStore';
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
    if (!authenticated && !useCollaborationStore.getState().profiles.length) return { state: 'auth' };
    const ref = status.trackingBranch;
    if (!ref) return { state: 'unpublished' };
    const remotes = await gitService.listRemotes(repo.path);
    const remote = remotes.sort((a, b) => b.name.length - a.name.length).find(item => ref.startsWith(`${item.name}/`));
    const binding = resolveHostingBinding(remote, hostingConnections());
    const plugin = binding && getHostingPlugin(binding.providerId);
    if (!binding || !plugin || !providerSupports(plugin.manifest, 'ci-cd:commit-checks')) return { state: 'unsupported', ref };
    const sha = await gitService.getBranchCommitHash(repo.path, ref);
    if (!sha || !/^(?:[a-f\d]{40}|[a-f\d]{64})$/i.test(sha)) return { state: 'unpublished', ref };
    const profile = useCollaborationStore.getState().profiles.find(item => item.id === binding.connectionId);
    const account = useCollaborationStore.getState();
    const credential = profile ? await plugin.credentials.read(profile.id) : account.providerId === binding.providerId && account.server === binding.server ? token : null;
    const client = collaborationClient(plugin.createClient(binding.server, credential), plugin.manifest);
    const owner = binding.ownerPath, name = binding.repo;
    const [checks, statuses] = await Promise.allSettled([client.getWorkflowCheckRuns(owner, name, sha), client.getWorkflowCommitStatuses(owner, name, sha)]);
    const runs = checks.status === 'fulfilled' ? checks.value.check_runs : [], states = statuses.status === 'fulfilled' ? statuses.value.statuses : [];
    const incomplete = checks.status === 'rejected' || statuses.status === 'rejected'
      || (checks.status === 'fulfilled' && checks.value.total_count > runs.length) || (statuses.status === 'fulfilled' && statuses.value.total_count > states.length);
    return { state: summarizeCI(runs, states, incomplete), ref, sha, url: `${binding.server}/${owner}/${name}${plugin.checkPath?.(sha) ?? ''}`,
      ...(incomplete ? { error: [checks, statuses].filter(item => item.status === 'rejected').map(item => String((item as PromiseRejectedResult).reason?.message || (item as PromiseRejectedResult).reason)).join('\n') } : {}) };
  },
};
