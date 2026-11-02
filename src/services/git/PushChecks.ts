import { gitService } from './GitService';
import { emitPushedCommit } from '@/services/integrations/pushEvents';

/** CI observation must never change the outcome of a completed push. */
export async function watchPushedCommit(repoPath: string, remote: string | undefined, source: string | undefined, sha: string, isCurrent: () => boolean) {
  try {
    const context = await gitService.getPushContext(repoPath, source);
    if (!isCurrent()) return;
    const destination = context.remotes.find(item => item.name === (remote || context.remote));
    emitPushedCommit({ repoPath, destinationUrls: (destination?.pushUrl || destination?.fetchUrl || '').split('\n'), sha, isCurrent });
  } catch { /* The push succeeded even if optional CI metadata is unavailable. */ }
}
