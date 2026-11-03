/// <reference types="vite/client" />
import { prepareOverviewFixture } from './OverviewFixture';
// Standalone Vite development entry. This module is not imported by the production app.
import { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import '../index.css';
import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
import '@fontsource-variable/orbitron';
import { AppLayout } from '@/components/layout/AppLayout';
import { AppTextContextMenu } from '@/components/ui/AppTextContextMenu';
import { useRepoStore } from '@/stores/repoStore';
import { DEFAULT_LAYOUT, useLayoutStore } from '@/stores/layoutStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useThemeStore } from '@/stores/themeStore';
import { useWorkspaceSessionStore } from '@/stores/workspaceSessionStore';
import { useCollaborationStore } from '@/stores/collaborationStore';
import { gitService } from '@/services/git/GitService';
import type { GitCommit, GitBranch, GitFileChange, RepositoryInfo } from '@/services/git/types';
import { prepareIssueFixture } from './IssueFixture';
import { prepareErrorsFixture } from './ErrorFixture';
import { prepareHunkPlanFixture } from './HunkPlanFixture';
import { prepareWorkingReviewFixture } from './WorkingReviewFixture';

const hash = (index: number) => (index + 1).toString(16).padStart(40, '0');
const longBranch = 'feature/workspace-review-with-an-intentionally-long-branch-name';
const files: GitFileChange[] = [
  { path: 'src/features/git/CommitHistoryView.tsx', status: 'modified', staged: false },
  { path: 'src/index.css', status: 'modified', staged: false },
  { path: 'tests/visual/long-branch-fixture.ts', status: 'untracked', staged: false },
];
const subjects = ['Merge workspace review improvements', '改进历史列表的键盘导航与焦点恢复', 'Long branch labels keep their overflow menu accessible', '修复窄窗口下的面板排版与文本换行', 'Merge release branch and preserve graph lanes', 'Support independent history and composer widths'];
const parents = [[1, 2], [3], [4], [5], [6], [7, 8], [9], [10], [10], [11]];
const commits: GitCommit[] = Array.from({ length: 60 }, (_, index) => ({
  hash: hash(index), shortHash: hash(index).slice(-7),
  subject: subjects[index % subjects.length],
  body: index === 0 ? 'Deterministic visual fixture. No repository operations are performed.' : undefined,
  author: { name: index % 3 === 0 ? 'Alex Chen' : 'Morgan Lee', email: index % 3 === 0 ? 'alex@example.invalid' : 'morgan@example.invalid', date: '2026-10-01T12:00:00Z', relativeDate: index < 8 ? '2 小时前' : '1 天前' },
  parents: index < parents.length ? parents[index].map(hash) : index < 59 ? [hash(index + 1)] : [],
  refs: index === 0 ? [`HEAD -> ${longBranch}`, 'tag: v9.8.7', `origin/${longBranch}`, 'tag: release/ui-preview', 'release/workspace', 'remotes/upstream/workspace'] : index === 1 ? ['main', 'origin/main'] : index === 2 ? ['feature/keyboard-navigation'] : index === 8 ? ['fix/narrow-layout'] : undefined,
}));
const branches: GitBranch[] = [
  { name: longBranch, isCurrent: true, isRemote: false, upstream: `origin/${longBranch}`, lastCommit: { hash: hash(0), message: subjects[0], date: '2026-10-01' } },
  { name: 'main', isCurrent: false, isRemote: false, lastCommit: { hash: hash(1), message: subjects[1], date: '2026-10-01' } },
  { name: 'feature/keyboard-navigation', isCurrent: false, isRemote: false, lastCommit: { hash: hash(2), message: subjects[2], date: '2026-10-01' } },
  { name: `origin/${longBranch}`, isCurrent: false, isRemote: true, lastCommit: { hash: hash(0), message: subjects[0], date: '2026-10-01' } },
  { name: 'origin/main', isCurrent: false, isRemote: true, lastCommit: { hash: hash(1), message: subjects[1], date: '2026-10-01' } },
];
const repo: RepositoryInfo = { id: 'visual-fixture', name: 'workspace-ui-fixture', path: '/__auugit_visual_fixture__', currentBranch: longBranch, lastOpenedAt: 0 };

function prepare() {
  // No network requests or native Git writes; all preferences remain in this tab's memory.
  const networkAttempts: string[] = [];
  document.documentElement.dataset.uiFixtureNetworkAttempts = '[]';
  window.fetch = async input => {
    networkAttempts.push(input instanceof Request ? input.url : String(input));
    document.documentElement.dataset.uiFixtureNetworkAttempts = JSON.stringify(networkAttempts);
    throw new Error('Network disabled in the UI visual fixture');
  };
  useLayoutStore.persist.setOptions({ storage: { getItem: () => null, setItem() {}, removeItem() {} } });
  useWorkspaceSessionStore.persist.setOptions({ storage: { getItem: () => null, setItem() {}, removeItem() {} } });
  useLayoutStore.setState(DEFAULT_LAYOUT);
  useWorkspaceSessionStore.setState({ drafts: {}, historyViews: { [repo.path]: { query: '', scrollTop: 0, columns: { author: false, date: true, hash: false } } } });
  useSettingsStore.setState({ language: 'zh', compactMode: false, autoFetchInterval: 'never', cursorTheme: 'system' });
  // ?lang=en 覆盖默认语言（双语截图验收用；内存隔离存储不跨 reload，故用参数而非 localStorage）
  const fixtureLang = new URLSearchParams(location.search).get('lang');
  if (fixtureLang === 'en' || fixtureLang === 'zh') useSettingsStore.setState({ language: fixtureLang });
  const applyTheme = (theme: 'dark' | 'light' | 'system') => {
    const resolvedTheme = theme === 'light' ? 'light' : 'dark';
    document.documentElement.classList.toggle('dark', resolvedTheme === 'dark');
    document.documentElement.classList.remove('compact-mode');
    useThemeStore.setState({ theme, resolvedTheme });
  };
  useThemeStore.setState({ setTheme: applyTheme });
  applyTheme(new URLSearchParams(location.search).get('theme') === 'light' ? 'light' : 'dark');
  let filesFailed = false;
  const failFiles = new URLSearchParams(location.search).get('failFiles') === '1';
  gitService.getCommitFiles = async path => {
    if (failFiles && !filesFailed) { filesFailed = true; throw new Error('Fixture file load failed'); }
    return path === repo.path ? files.slice(0, 2) : [{ path: 'other-only.ts', status: 'modified', staged: false }];
  };
  gitService.getGitVersion = async () => 'git version 2.50.0 (fixture)';
  // AppLayout 随仓库上下文读取 origin（errors loadRepoContext + forge detect）——
  // 中性域名：不触发 GitHub 身份识别，也不是 gitlab.com/已连 forge，detect 结果为空。
  gitService.getOriginUrl = async () => 'https://visual.fixture/auugit/demo.git';
  // Errors M4 提交后记录修复提交 SHA 会读 HEAD hash（commit 桩返回 d×40，保持一致）
  gitService.getBranchCommitHash = async () => 'd'.repeat(40);
  gitService.getRepoOperationState = async () => ({ type: 'none', conflictedFiles: [], inConflict: false, isAllResolved: false });
  gitService.getPushContext = async () => ({ branch: longBranch, remote: 'origin', targetBranch: longBranch, upstream: `origin/${longBranch}`, remotes: [], ahead: 0, behind: 0 });
  gitService.findCommits = async (_path, query) => commits.filter(commit => commit.subject.toLowerCase().includes(query.toLowerCase()));
  // 差异视图会读整文件内容（块头所属方法 / 完整文件）；夹具默认无内容，禁止触网。
  gitService.readFileRevision = async () => '';
  useCollaborationStore.setState({ user: null, isAuthenticated: false, profiles: [], fetchCommitChecks: async () => [] });
  useRepoStore.setState({ currentRepo: repo, openTabs: [repo], recentRepos: [repo], activeTab: 'history', commits, commitsLoadedAll: true, selectedCommit: commits[0], selectedBranch: longBranch, branches,
    status: { currentBranch: longBranch, trackingBranch: `origin/${longBranch}`, ahead: 0, behind: 0, isClean: false, staged: [], unstaged: files.slice(0, 2), untracked: files.slice(2) },
    tags: [{ name: 'v9.8.7', commitHash: hash(0), isAnnotated: false }], stashes: [], redoStack: [], isLoading: false, errorMessage: null, isLeftSidebarCollapsed: false, isRightPaneCollapsed: false,
    checkExternalChanges: async () => {}, refreshStatus: async () => {}, refreshAll: async () => {},
    selectAndLocateBranch: async target => {
      const commit = commits.find(item => item.refs?.some(ref => ref.replace(/^HEAD -> /, '').replace(/^tag: /, 'refs/tags/').replace(/^remotes\//, '') === target));
      if (commit) useRepoStore.setState({ selectedBranch: target, selectedCommit: commit, scrollToCommitHash: commit.hash });
    },
  });
  if (new URLSearchParams(location.search).get('issues') === '1') prepareIssueFixture(repo);
  if (new URLSearchParams(location.search).get('errors') === '1') prepareErrorsFixture(repo);
  if (new URLSearchParams(location.search).get('linear') === '1') void import('./LinearFixture').then(module => module.prepareLinearFixture(repo));
  if (new URLSearchParams(location.search).get('hunks') === '1') prepareHunkPlanFixture(repo);
  if (new URLSearchParams(location.search).get('review') === '1') prepareWorkingReviewFixture();
  if (new URLSearchParams(location.search).get('overview') === '1') prepareOverviewFixture(repo);
  if (new URLSearchParams(location.search).get('interactions') === '1') {
    const other: RepositoryInfo = { ...repo, id: 'other-fixture', path: '/__auugit_other_fixture__', name: 'other-ui-fixture', currentBranch: 'main' };
    const otherCommit: GitCommit = { ...commits[0], hash: 'f'.repeat(40), shortHash: 'fffffff', subject: 'Other repository commit', refs: ['HEAD -> main'] };
    useRepoStore.setState({ openTabs: [repo, other], recentRepos: [repo, other],
      setCurrentRepo: async selected => {
        const list = selected?.path === repo.path ? commits : [otherCommit];
        useRepoStore.setState({ currentRepo: selected, commits: list, selectedCommit: list[0], activeTab: 'history' });
        return true;
      },
    });
  }
}

function Fixture() {
  useEffect(() => {
    void document.fonts.ready.then(() => requestAnimationFrame(() => { document.documentElement.dataset.uiFixtureReady = 'true'; }));
  }, []);
  // Production shell mounts the global text context menu in App; the fixture
  // shell mirrors that so text-editing behavior is exercisable end to end.
  return <><AppTextContextMenu /><AppLayout /></>;
}

if (import.meta.env.DEV && !('__TAURI_INTERNALS__' in window)) {
  if (new URLSearchParams(location.search).get('automation') === '1') await import('../../tests/visual/automation.css');
  prepare();
  if (new URLSearchParams(location.search).get('gitlab') === '1') await (await import('./GitLabFixture')).prepareGitLabFixture(repo);
  createRoot(document.getElementById('root')!).render(<Fixture />);
}
