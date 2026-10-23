import { useGitHubStore } from '@/stores/githubStore';
import { gitService } from './GitService';
import { parseGitHubRemote } from './remoteIdentity';

/** CI observation must never change the outcome of a completed push. */
export async function watchPushedCommit(repoPath: string, remote: string | undefined, source: string | undefined, sha: string, isCurrent: () => boolean) {
  try {
    const context = await gitService.getPushContext(repoPath, source);
    if (!isCurrent()) return;
    const destination = context.remotes.find(item => item.name === (remote || context.remote));
    const identities = (destination?.pushUrl || destination?.fetchUrl || '').split('\n').map(parseGitHubRemote);
    const github = useGitHubStore.getState();
    if (identities.some(identity => identity && identity.owner.toLowerCase() === github.currentOwner?.toLowerCase() && identity.repo.toLowerCase() === github.currentRepoName?.toLowerCase())) github.watchPushChecks(sha);
  } catch { /* The push succeeded even if optional CI metadata is unavailable. */ }
}
