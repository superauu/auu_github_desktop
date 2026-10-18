import { useSyncExternalStore } from 'react';
import { getPendingGitWrites, getGitWriteActivity, subscribeGitWrites } from '@/services/git/GitQueue';
export const useGitActivity = (repoPath: string) => useSyncExternalStore(subscribeGitWrites, () => getPendingGitWrites(repoPath), () => 0);
export const useGitWriteActivity = (repoPath: string) => useSyncExternalStore(subscribeGitWrites, () => getGitWriteActivity(repoPath), () => null);
