import { overviewService, OverviewPermissionError } from '@/features/repository/OverviewService';
import { useRepoStore } from '@/stores/repoStore';
import { useToastStore } from '@/stores/toastStore';
import { useGitHubStore } from '@/stores/githubStore';
import type { RepositoryInfo, GitStatusResult } from '@/services/git/types';

export function prepareOverviewFixture(repo: RepositoryInfo) {
  const params = new URLSearchParams(location.search);
  const names = ['Application', 'Clean library', 'Conflict project', 'Unavailable folder', 'Permission required', 'Partial CI'];
  const repos = names.map((name, index) => ({ ...repo, id: `overview-${index}`, name, path: index ? `/__overview_${index}__` : repo.path }));
  if (params.has('overviewSingle')) repos.splice(1);
  if (params.has('overviewMany')) repos.push(...Array.from({ length: 30 }, (_, index) => ({ ...repo, id: `extra-${index}`, name: `Extra ${index}`, path: `/__overview_extra_${index}__` })));
  const status = (path: string): GitStatusResult => ({ headOid: 'a'.repeat(40), currentBranch: 'feature/overview', trackingBranch: 'origin/main', ahead: path === repo.path ? 2 : 0, behind: path === '/__overview_2__' ? 3 : 0, isClean: path !== repo.path && path !== '/__overview_2__',
    staged: path === repo.path ? [{ path: 'a.ts', staged: true, status: 'modified' }] : [],
    unstaged: path === repo.path ? [{ path: 'a.ts', staged: false, status: 'modified' }] : path === '/__overview_2__' ? [{ path: 'merge.ts', staged: false, status: 'conflicted' }] : [], untracked: [] });
  let reads = 0;
  document.documentElement.dataset.overviewFixtureReads = '0';
  overviewService.local = async (item, authorized) => {
    document.documentElement.dataset.overviewFixtureReads = String(++reads);
    await new Promise(resolve => setTimeout(resolve, params.has('overviewSlow') ? 1200 : 30));
    if (item.path === '/__overview_3__') throw Error('Fixture directory unavailable');
    if (item.path === '/__overview_4__' && !authorized) throw new OverviewPermissionError();
    return { status: params.has('overviewSingle') ? { ...status(item.path), currentBranch: 'master', ahead: 0, behind: 0, isClean: true, staged: [], unstaged: [], untracked: [] } : status(item.path), operation: { type: item.path === '/__overview_2__' ? 'merge' : 'none', inConflict: item.path === '/__overview_2__', conflictedFiles: item.path === '/__overview_2__' ? ['merge.ts'] : [], isAllResolved: false }, checkedAt: 1793400000000 };
  };
  document.documentElement.dataset.overviewFixtureOldCi = '0';
  if (params.has('overviewAccount')) {
    useGitHubStore.setState({ activeProfileId: 'overview-old', token: 'fixture-old', isAuthenticated: true });
    window.addEventListener('overview-fixture-account', () => useGitHubStore.setState({ activeProfileId: 'overview-new', token: 'fixture-new', isAuthenticated: true }));
  }
  overviewService.ci = async (item, _status, token) => {
    if (params.has('overviewSingle')) return { state: 'auth' };
    if (params.has('overviewAccount')) {
      await new Promise(resolve => setTimeout(resolve, token === 'fixture-old' ? 1200 : 50));
      if (token === 'fixture-old') { document.documentElement.dataset.overviewFixtureOldCi = String(Number(document.documentElement.dataset.overviewFixtureOldCi) + 1); return { state: 'failed', error: 'OLD_ACCOUNT_RESULT' }; }
      return { state: 'passing', ref: 'origin/main', sha: 'b'.repeat(40), url: `https://github.com/fixture/project/commit/${'b'.repeat(40)}/checks` };
    }
    return { state: item.path === '/__overview_2__' ? 'failed' : item.path === '/__overview_5__' ? 'unknown' : 'passing', ref: 'origin/main', sha: 'b'.repeat(40), url: `https://github.com/fixture/project/commit/${'b'.repeat(40)}/checks`, ...(item.path === '/__overview_5__' ? { error: 'Fixture checks permission denied' } : {}) };
  };
  useRepoStore.setState({ activeTab: 'overview', openTabs: repos.slice(0, 2), recentRepos: repos,
    setCurrentRepo: async item => { useRepoStore.setState(state => ({ currentRepo: item, status: item ? status(item.path) : null, openTabs: item && !state.openTabs.some(tab => tab.path === item.path) ? [...state.openTabs, item] : state.openTabs })); return true; } });
  if (!params.has('historyReload') || !useToastStore.getState().history.length) {
    useToastStore.getState().record({ type: 'error', title: 'Fixture failed fetch', description: 'Network error token=fixture-private-token', repoPath: repo.path, elapsedMs: 1400, action: { label: 'Fixture retry', onClick() {} } });
    useToastStore.getState().record({ type: 'success', title: 'Fixture successful commit', description: 'Completed', repoPath: '/__overview_1__' });
  }
}
