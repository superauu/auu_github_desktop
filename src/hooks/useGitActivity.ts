import { useSyncExternalStore } from 'react';
import { getPendingGitWrites, subscribeGitWrites } from '@/services/git/GitQueue';
export const useGitActivity = (repoPath: string) => useSyncExternalStore(subscribeGitWrites, () => getPendingGitWrites(repoPath), () => 0);
