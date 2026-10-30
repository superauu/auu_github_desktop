import type { GitStatusResult, RepositoryInfo } from '@/services/git/types';
import { sameWorktreePath } from '@/services/git/worktrees';

export function overviewRepositories(open: RepositoryInfo[], recent: RepositoryInfo[]) {
  const result: RepositoryInfo[] = [];
  for (const repo of [...open, ...recent]) if (!result.some(item => sameWorktreePath(item.path, repo.path))) result.push(repo);
  return result;
}
export function overviewCounts(status: GitStatusResult) {
  const changes = [...status.staged, ...status.unstaged, ...status.untracked];
  return { changed: new Set(changes.map(file => file.path)).size,
    conflicts: new Set(changes.filter(file => file.status === 'conflicted').map(file => file.path)).size };
}
/** Cooperative cancellation stops scheduling; in-flight reads may finish. */
export async function mapOverview<T>(items: T[], read: (item: T) => Promise<void>, signal: AbortSignal) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(3, items.length) }, async () => {
    while (!signal.aborted && next < items.length) await read(items[next++]);
  }));
}
