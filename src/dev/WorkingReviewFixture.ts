// Development-only working-review fixture. All diffs, commits and review evidence stay in memory.
import { gitService } from '@/services/git/GitService';
import { parseDiffOutput } from '@/services/git/PorcelainParser';
import { useRepoStore } from '@/stores/repoStore';
import { useSettingsStore } from '@/stores/settingsStore';
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
  let flipped = false;
  const rawFor = (file: string) => file === 'notes.md' ? notesDiff('first') : taskDiff(flipped ? 'CHANGED' : 'first');
  const commits: string[] = [];
  document.documentElement.dataset.reviewFixtureCommits = '[]';
  document.documentElement.dataset.reviewFixtureFlipped = '0';

  useSettingsStore.setState({ reviewBeforeCommit: true });
  useRepoStore.setState(state => ({
    activeTab: 'changes', selectedFile: files[0],
    status: state.status && { ...state.status, staged: [files[0]], unstaged: [], untracked: [files[1]], headOid: 'c'.repeat(40), isClean: false },
  }));
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
