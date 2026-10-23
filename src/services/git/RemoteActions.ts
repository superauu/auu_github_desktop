import { requestRemoteOperation, type RemoteAction } from '@/stores/remoteDialogStore';
import { useRepoStore } from '@/stores/repoStore';
import { gitService } from './GitService';
import { tNow } from '@/i18n';

export async function chooseRemoteTarget(repoPath: string, branch?: string, forceWithLease = false, action: RemoteAction = 'branch', tag?: string) {
  const state = useRepoStore.getState();
  if (state.currentRepo?.path !== repoPath) throw new Error(tNow('remote.changed'));
  const currentBranch = state.status?.currentBranch || state.currentRepo.currentBranch;
  const selection = await requestRemoteOperation({ repoPath, currentBranch, branch: branch || currentBranch, forceWithLease, action, tag });
  if (!selection) return null;
  const latest = useRepoStore.getState();
  if (latest.currentRepo?.path !== repoPath || (latest.status?.currentBranch || latest.currentRepo.currentBranch) !== currentBranch) throw new Error(tNow('remote.changed'));
  return selection;
}

export async function pushFromUi(branch?: string, forceWithLease = false): Promise<boolean> {
  const repo = useRepoStore.getState().currentRepo;
  if (!repo) return false;
  const selection = await chooseRemoteTarget(repo.path, branch, forceWithLease);
  if (!selection) return false;
  await useRepoStore.getState().push(selection.remote, selection.branch, selection);
  return true;
}

export async function remoteTagFromUi(action: 'tag' | 'tags' | 'deleteTag', tag?: string): Promise<boolean> {
  const repo = useRepoStore.getState().currentRepo;
  if (!repo) return false;
  const selection = await chooseRemoteTarget(repo.path, undefined, false, action, tag);
  if (!selection) return false;
  if (action === 'tags') await gitService.pushAllTags(repo.path, selection.remote);
  else if (action === 'tag') await gitService.pushTag(repo.path, tag!, selection.remote);
  else await gitService.deleteRemoteTag(repo.path, tag!, selection.remote);
  if (useRepoStore.getState().currentRepo?.path === repo.path) await useRepoStore.getState().refreshAll();
  return true;
}
