import { requestRemoteOperation, type RemoteAction } from '@/stores/remoteDialogStore';
import { useRepoStore } from '@/stores/repoStore';
import { gitService } from './GitService';
import { tNow } from '@/i18n';
const activePushes = new Set<string>();

export async function chooseRemoteTarget(repoPath: string, branch?: string, forceWithLease = false, action: RemoteAction = 'branch', tag?: string, alwaysChoose = false) {
  const state = useRepoStore.getState();
  if (state.currentRepo?.path !== repoPath) throw new Error(tNow('remote.changed'));
  const currentBranch = state.status?.currentBranch || state.currentRepo.currentBranch;
  const isCurrent = () => { const latest = useRepoStore.getState(); return latest.currentRepo?.path === repoPath && (latest.status?.currentBranch || latest.currentRepo.currentBranch) === currentBranch; };
  // Force pushes and an explicit destination request always retain their confirmation.
  let context;
  if (action === 'branch' && !forceWithLease) {
    try { context = await gitService.getPushContext(repoPath, branch || currentBranch); }
    catch { /* The dialog offers diagnostics and retry when configuration cannot be read. */ }
    if (!isCurrent()) return null;
    if (!alwaysChoose && context?.remotes.length === 1) {
      const remote = context.remotes[0].name;
      return { remote, branch: context.branch, targetBranch: remote === context.remote ? context.targetBranch : context.branch, setUpstream: !context.upstream };
    }
  }
  const selection = await requestRemoteOperation({ repoPath, currentBranch, branch: branch || currentBranch, forceWithLease, action, tag, context });
  if (!selection) return null;
  const latest = useRepoStore.getState();
  if (latest.currentRepo?.path !== repoPath || (latest.status?.currentBranch || latest.currentRepo.currentBranch) !== currentBranch) throw new Error(tNow('remote.changed'));
  return selection;
}

export async function pushFromUi(branch?: string, forceWithLease = false, alwaysChoose = false): Promise<boolean> {
  const repo = useRepoStore.getState().currentRepo;
  if (!repo) return false;
  const key = repo.path.replace(/\\/g, '/').replace(/\/$/, '');
  if (activePushes.has(key)) return false;
  activePushes.add(key);
  try {
    const selection = await chooseRemoteTarget(repo.path, branch, forceWithLease, 'branch', undefined, alwaysChoose);
    if (!selection) return false;
    await useRepoStore.getState().push(selection.remote, selection.branch, selection);
    return true;
  } finally { activePushes.delete(key); }
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
