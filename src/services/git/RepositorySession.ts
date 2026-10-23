import { useRepoStore } from '@/stores/repoStore';
import { toast } from '@/stores/toastStore';
import { tNow } from '@/i18n';
import { validateDirectoryPath } from '@/services/fs/DirectoryService';
import { gitService } from './GitService';
import { authorizeRepository } from '@/services/fs/RepositoryAccess';

/** Validate saved paths before exposing a repository or starting background Git reads. */
export async function restoreSavedRepository(cancelled: () => boolean = () => false): Promise<void> {
  const key = 'auu_git_last_active_repo';
  const saved = localStorage.getItem(key);
  if (!saved || useRepoStore.getState().currentRepo) return;
  const active = () => !cancelled() && !useRepoStore.getState().currentRepo && localStorage.getItem(key) === saved;
  try {
    const candidate = JSON.parse(saved);
    if (typeof candidate?.path !== 'string' || !candidate.path.trim()) return;
    await authorizeRepository(candidate.path);
    if (!active()) return;
    const directory = await validateDirectoryPath(candidate.path, true);
    if (!active()) return;
    if (!directory.exists || !directory.isDirectory) {
      useRepoStore.getState().closeTab(candidate.path);
      localStorage.removeItem(key);
      toast.warning(tNow('remote.savedUnavailable'), candidate.path);
      return;
    }
    const repository = await gitService.openRepository(candidate.path);
    if (active()) useRepoStore.getState().setCurrentRepo(repository);
  } catch (error) {
    // Keep the saved path on connection or Git failures so a retry can recover it.
    if (active()) toast.warning(tNow('remote.restoreFailed'), error instanceof Error ? error.message : String(error));
  }
}
