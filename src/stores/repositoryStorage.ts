import type { RepositoryInfo } from '@/services/git/types';

export const RECENT_REPOS_KEY = 'auu_git_recent_repos';
export const OPEN_TABS_KEY = 'auu_git_open_tabs';
export const LAST_ACTIVE_REPO_KEY = 'auu_git_last_active_repo';

export function saveRepositoryState(key: string, value: RepositoryInfo | RepositoryInfo[] | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch { /* Storage may be unavailable or full; repository operations still work. */ }
}

export function loadRepositoryList(key: string): RepositoryInfo[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(value) ? value.filter((repo): repo is RepositoryInfo => !!repo && typeof repo.path === 'string' && typeof repo.name === 'string') : [];
  } catch { return []; }
}
