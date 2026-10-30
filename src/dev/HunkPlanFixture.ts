// Development-only hunk planner fixture. All commits and snapshots stay in memory.
import { hunkCommitService, HunkCommitError, type HunkCommitPlan } from '@/services/git/HunkCommitService';
import { gitService } from '@/services/git/GitService';
import { parseDiffOutput } from '@/services/git/PorcelainParser';
import { useRepoStore } from '@/stores/repoStore';
import { useSettingsStore } from '@/stores/settingsStore';
import type { RepositoryInfo, GitFileChange } from '@/services/git/types';

export function prepareHunkPlanFixture(repo: RepositoryInfo) {
  const params = new URLSearchParams(location.search);
  const raw = (from: number, label: string) => `diff --git a/task.ts b/task.ts\n--- a/task.ts\n+++ b/task.ts\n@@ -${from},1 +${from},1 @@\n-before ${from}\n+${label}\n`;
  const files: GitFileChange[] = [{ path: 'task.ts', status: 'modified', staged: true }, { path: 'assets/logo.bin', status: 'modified', staged: true }];
  const snapshot: HunkCommitPlan = { repoPath: repo.path, branch: repo.currentBranch!, head: 'a'.repeat(40), baseTree: 'b'.repeat(40), indexTree: 'c'.repeat(40), index: 'fixture index', flags: 'fixture flags', files,
    units: [
      { id: 'h0:0', path: 'task.ts', paths: ['task.ts'], kind: 'hunk', label: '@@ -1,1 +1,1 @@', patch: raw(1, 'first feature') },
      { id: 'h0:1', path: 'task.ts', paths: ['task.ts'], kind: 'hunk', label: '@@ -20,1 +20,1 @@', patch: raw(20, 'second feature') },
      { id: 'f1', path: 'assets/logo.bin', paths: ['assets/logo.bin'], kind: 'file', label: 'Whole file', patch: 'Binary files a/assets/logo.bin and b/assets/logo.bin differ' },
    ],
  };
  const written: { title: string; units: string[] }[] = [];
  document.documentElement.dataset.hunkFixtureWrites = '[]';
  document.documentElement.dataset.hunkFixturePreviews = '0';
  useSettingsStore.setState({ reviewBeforeCommit: false });
  useRepoStore.setState(state => ({ activeTab: 'changes', selectedFile: files[0], status: state.status && { ...state.status, headOid: snapshot.head, staged: files, unstaged: [{ ...files[0], staged: false }], untracked: [] } }));
  gitService.getStatus = async () => useRepoStore.getState().status!;
  gitService.getFileDiff = async () => parseDiffOutput(raw(1, 'first feature') + raw(20, 'second feature'));
  const disabledFetch = window.fetch;
  window.fetch = async (input, init) => {
    if (input === '/api/git' && init?.method === 'POST' && typeof init.body === 'string') {
      const data = JSON.parse(init.body);
      if (data.cwd === repo.path && Array.isArray(data.args) && data.args[0] === '-c' && data.args[1] === 'core.quotepath=false' && data.args[2] === '--literal-pathspecs' && data.args[3] === 'diff' && data.args.includes('--full-index')) return new Response(JSON.stringify({ stdout: raw(1, 'first feature'), stderr: '', exitCode: 0 }));
    }
    return disabledFetch(input, init);
  };
  hunkCommitService.capture = async (_repo, signal) => {
    await new Promise(resolve => setTimeout(resolve, params.has('slowRead') ? 1200 : 30));
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const remaining = snapshot.units.filter(unit => !written.some(commit => commit.units.includes(unit.id)));
    if (!remaining.length || params.has('noStaged')) throw Error('尚无已暂存改动。请先暂存需要拆分的文件、代码块或变更行。');
    return structuredClone({ ...snapshot, units: remaining });
  };
  hunkCommitService.preview = async (plan, groups, index) => {
    await new Promise(resolve => setTimeout(resolve, 80));
    document.documentElement.dataset.hunkFixturePreviews = String(Number(document.documentElement.dataset.hunkFixturePreviews) + 1);
    return plan.units.filter(unit => groups[index].units.includes(unit.id)).map(unit => unit.patch).join('\n');
  };
  hunkCommitService.execute = async (_plan, groups, options = {}) => {
    const completed = [];
    for (const group of groups) {
      if (options.canContinue && !options.canContinue()) throw new HunkCommitError('已停止后续提交。', completed, 'refs/auugit/recovery/fixture');
      await new Promise(resolve => setTimeout(resolve, params.has('slowWrite') ? 1200 : 80));
      if (params.has('failSecond') && completed.length === 1) throw new HunkCommitError('Fixture hook rejected the second commit', completed, 'refs/auugit/recovery/fixture');
      written.push({ title: group.title, units: [...group.units] });
      document.documentElement.dataset.hunkFixtureWrites = JSON.stringify(written);
      completed.push({ hash: String(written.length).repeat(40), title: group.title, units: [...group.units] });
      options.onProgress?.([...completed]);
    }
    return { completed, recoveryRef: 'refs/auugit/recovery/fixture' };
  };
}
