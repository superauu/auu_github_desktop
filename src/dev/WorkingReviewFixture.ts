// Development-only working-review fixture. All diffs, commits and review evidence stay in memory.
import { gitService } from '@/services/git/GitService';
import { parseDiffOutput } from '@/services/git/PorcelainParser';
import { useRepoStore } from '@/stores/repoStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useLayoutStore } from '@/stores/layoutStore';
import type { GitFileChange } from '@/services/git/types';

/** One hunk pair for task.ts plus a single-hunk untracked file, so hunk-, file- and batch-level review all apply. */
const taskDiff = (marker: string) => `diff --git a/task.ts b/task.ts
--- a/task.ts
+++ b/task.ts
@@ -10,7 +10,9 @@ export function plan() {
 context A
-removed line one
+added line one ${marker}
 context B
 context C
@@ -40,4 +42,5 @@ export function verify() {
 old tail
+new tail ${marker}
 context tail
`;
const notesDiff = (marker: string) => `diff --git a/notes.md b/notes.md
--- /dev/null
+++ b/notes.md
@@ -0,0 +1,2 @@
+note line one ${marker}
+note line two ${marker}
`;

export function prepareWorkingReviewFixture() {
  const files: GitFileChange[] = [
    { path: 'task.ts', status: 'modified', staged: true },
    { path: 'notes.md', status: 'untracked', staged: false },
  ];
  const actionFixture = new URLSearchParams(location.search).has('fileActions');
  if (actionFixture) files.push(
    { path: 'src/long/directory/working-file.ts', status: 'modified', staged: false },
    { path: 'src/long/directory/conflicted-file.ts', status: 'conflicted', staged: false },
  );
  let flipped = false;
  const rawFor = (file: string) => file === 'notes.md' ? notesDiff('first') : taskDiff(flipped ? 'CHANGED' : 'first');
  const commits: string[] = [];
  document.documentElement.dataset.reviewFixtureCommits = '[]';
  document.documentElement.dataset.reviewFixtureFlipped = '0';

  useSettingsStore.setState({ reviewBeforeCommit: true });
  useRepoStore.setState(state => ({
    activeTab: 'changes', selectedFile: files[0],
    status: state.status && { ...state.status, staged: [files[0]], unstaged: files.slice(2), untracked: [files[1]], headOid: 'c'.repeat(40), isClean: false },
  }));
  if (actionFixture) {
    useRepoStore.setState({ isLeftSidebarCollapsed: true, isRightPaneCollapsed: true, readWorkingFile: async () => '' });
    window.addEventListener('file-actions-fixture-width', event => useLayoutStore.getState().setChangesFileListWidth((event as CustomEvent<number>).detail));
    const writes: { action: string; path: string }[] = [];
    document.documentElement.dataset.fileActionsFixtureWrites = '[]';
    const write = async (action: string, path: string) => {
      writes.push({ action, path });
      document.documentElement.dataset.fileActionsFixtureWrites = JSON.stringify(writes);
      await new Promise(resolve => setTimeout(resolve, 500));
      if (new URLSearchParams(location.search).has('actionFailure')) throw new Error('Fixture index locked');
      useRepoStore.setState(state => {
        const status = state.status!;
        if (action !== 'stage' && action !== 'unstage') return {};
        const source = action === 'stage' ? [...status.unstaged, ...status.untracked] : status.staged;
        const file = source.find(item => item.path === path)!;
        const next = { ...file, staged: action === 'stage', status: file.status === 'untracked' ? 'added' as const : file.status };
        return { status: { ...status,
          staged: action === 'stage' ? [...status.staged, next] : status.staged.filter(item => item.path !== path),
          unstaged: action === 'unstage' ? [...status.unstaged, next] : status.unstaged.filter(item => item.path !== path),
          untracked: status.untracked.filter(item => item.path !== path),
        } };
      });
    };
    useRepoStore.setState({ stageFile: path => write('stage', path), unstageFile: path => write('unstage', path),
      discardChanges: path => write('discard', path), resolveFileOurs: path => write('ours', path),
      resolveFileTheirs: path => write('theirs', path), resetFileConflictMarkers: path => write('reset', path) });
  }
  gitService.getStatus = async () => useRepoStore.getState().status!;
  gitService.getFileDiff = async (_repoPath, filePath) => parseDiffOutput(rawFor(filePath));
  gitService.commit = async (_path, message) => {
    commits.push(message);
    document.documentElement.dataset.reviewFixtureCommits = JSON.stringify(commits);
    return 'd'.repeat(40);
  };
  const disabledFetch = window.fetch;
  window.fetch = async (input, init) => {
    // WorkingReviewService reads its evidence through executeGit → /api/git. Serve the same
    // canned diffs so the displayed diff and the captured fingerprint always agree.
    if (input === '/api/git' && init?.method === 'POST' && typeof init.body === 'string') {
      const data = JSON.parse(init.body);
      const args: unknown[] = Array.isArray(data.args) ? data.args : [];
      if (args.includes('--literal-pathspecs') && args.includes('diff') && args.includes('--full-index')) {
        const target = args.includes('notes.md') ? 'notes.md' : 'task.ts';
        return new Response(JSON.stringify({ stdout: rawFor(target), stderr: '', exitCode: args.includes('--no-index') ? 1 : 0 }));
      }
    }
    return disabledFetch(input, init);
  };
  // Content changed elsewhere (the flagship safety property): flip the canned diff and
  // reload so the displayed lines and captured fingerprint both move to a new version.
  window.addEventListener('review-fixture-change', () => {
    flipped = true;
    document.documentElement.dataset.reviewFixtureFlipped = '1';
    void useRepoStore.getState().loadFileDiff(files[0]).catch(() => {});
  });
  // setSelectedFile drives the diff load through user clicks; seeding the store
  // directly bypasses that, so run the initial load explicitly like the store does.
  // Must stay after every stub above: loadFileDiff reads them synchronously.
  void useRepoStore.getState().loadFileDiff(files[0]).catch(() => {});
}
