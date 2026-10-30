// Development-only hunk planner fixture. All commits and snapshots stay in memory.
import { hunkCommitService, HunkCommitError, type HunkCommitPlan } from '@/services/git/HunkCommitService';
import { gitService } from '@/services/git/GitService';
import { parseDiffOutput } from '@/services/git/PorcelainParser';
import { useRepoStore } from '@/stores/repoStore';
import { useSettingsStore } from '@/stores/settingsStore';
import type { RepositoryInfo, GitFileChange } from '@/services/git/types';
import { aiHunkCommitService, parseHunkAiResult } from '@/services/ai/AiHunkCommitService';
import { useIssueWorkflowStore } from '@/stores/issueWorkflowStore';

export function prepareHunkPlanFixture(repo: RepositoryInfo) {
  const params = new URLSearchParams(location.search);
  if (params.has('hunkCrossIssue')) useIssueWorkflowStore.getState().linkBranch(repo.path, repo.currentBranch!, { owner: 'upstream', repo: 'other-project', number: 12 });
  const raw = (from: number, label: string) => `diff --git a/task.ts b/task.ts\n--- a/task.ts\n+++ b/task.ts\n@@ -${from},1 +${from},1 @@\n-before ${from}\n+${label}\n`;
  const readableHeader = '@@ -47,6 +47,8 @@ The commit panel sits beside the diff at typical laptop widths';
  const readableDiff = `diff --git a/task.ts b/task.ts\n--- a/task.ts\n+++ b/task.ts\n${readableHeader}\n context 47\n context 48\n context 49\n+new line one\n+new line two\n context 50\n context 51\n context 52\n`;
  const displayedDiff = params.has('diffHunks') ? readableDiff : raw(1, 'first feature') + raw(20, 'second feature');
  const files: GitFileChange[] = [{ path: 'task.ts', status: 'modified', staged: true }, { path: 'assets/logo.bin', status: 'modified', staged: true }];
  const snapshot: HunkCommitPlan = { repoPath: repo.path, branch: repo.currentBranch!, head: 'a'.repeat(40), baseTree: 'b'.repeat(40), indexTree: 'c'.repeat(40), index: 'fixture index', flags: 'fixture flags', files,
    units: [
      { id: 'h0:0', path: 'task.ts', paths: ['task.ts'], kind: 'hunk', label: '@@ -1,1 +1,1 @@', patch: raw(1, 'first feature') },
      { id: 'h0:1', path: 'task.ts', paths: ['task.ts'], kind: 'hunk', label: '@@ -20,1 +20,1 @@', patch: raw(20, 'second feature') },
      { id: 'f1', path: 'assets/logo.bin', paths: ['assets/logo.bin'], kind: 'file', label: 'Whole file', patch: 'Binary files a/assets/logo.bin and b/assets/logo.bin differ' },
    ],
  };
  if (params.has('draftHead')) snapshot.head = 'd'.repeat(40);
  if (params.has('draftIndex')) snapshot.index += ' changed';
  if (params.has('draftQuota')) {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) { if (key === 'auugit-hunk-plan-drafts') throw new DOMException('Fixture storage full', 'QuotaExceededError'); setItem.call(this, key, value); };
  }
  const written: { title: string; units: string[] }[] = [];
  const messages: { title: string; body: string }[] = [];
  document.documentElement.dataset.hunkFixtureWrites = '[]';
  document.documentElement.dataset.hunkFixtureMessages = '[]';
  document.documentElement.dataset.hunkFixturePreviews = '0';
  document.documentElement.dataset.hunkFixtureAiRequests = '0';
  document.documentElement.dataset.hunkFixtureAiResponses = '0';
  document.documentElement.dataset.hunkFixtureDraftChecks = '0';
  let stale = false, checks = 0;
  if (params.has('ai')) useSettingsStore.setState({ aiConfig: { provider: 'openai-compatible', protocol: 'chat-completions', endpoint: 'https://fixture.invalid/v1', model: 'fixture-model', apiKey: 'fixture-only' } });
  hunkCommitService.verify = async () => {
    if (params.has('draftRestoreSlow')) await new Promise(resolve => setTimeout(resolve, 1200));
    document.documentElement.dataset.hunkFixtureDraftChecks = String(Number(document.documentElement.dataset.hunkFixtureDraftChecks) + 1);
    checks++; if (stale || params.has('draftRestoreStale') || (params.has('aiStaleOnApply') && checks === 3)) throw Error('分支、HEAD 或暂存区已变化，请重新读取剩余改动。');
  };
  aiHunkCommitService.analyze = async plan => {
    document.documentElement.dataset.hunkFixtureAiRequests = String(Number(document.documentElement.dataset.hunkFixtureAiRequests) + 1);
    // Deliberately ignore abort to exercise the UI's late-response protection.
    await new Promise(resolve => setTimeout(resolve, params.has('aiSlow') ? 1200 : 80));
    document.documentElement.dataset.hunkFixtureAiResponses = String(Number(document.documentElement.dataset.hunkFixtureAiResponses) + 1);
    if (params.has('aiStale')) stale = true;
    return parseHunkAiResult(JSON.stringify({ summary: '按代码与资源组织两个提交，代码块可分别调整。', groups: [
      { title: 'feat: staged feature', body: '实现第一处暂存变更。', reason: '第一处功能改动可独立审核。', units: ['h0:0'] },
      { title: 'chore: staged assets', body: '更新另一处代码及配套资源。', reason: '保持资源与相关代码一致。', units: params.has('aiInvalid') ? ['h0:1', 'unknown'] : ['h0:1', 'f1'] },
    ] }), plan);
  };
  useSettingsStore.setState({ reviewBeforeCommit: false });
  useRepoStore.setState(state => ({ activeTab: 'changes', selectedFile: files[0], status: state.status && { ...state.status, headOid: snapshot.head, staged: files, unstaged: [{ ...files[0], staged: false }], untracked: [] } }));
  if (params.has('diffHunks')) {
    document.documentElement.dataset.hunkFixtureStageHeader = '';
    useRepoStore.setState({ fileDiffLines: parseDiffOutput(displayedDiff), fileDiffLoading: false, fileDiffError: null,
      unstageHunk: async (_path, hunk) => { document.documentElement.dataset.hunkFixtureStageHeader = hunk[0].content; },
    });
  }
  gitService.getStatus = async () => useRepoStore.getState().status!;
  gitService.getFileDiff = async () => parseDiffOutput(displayedDiff);
  const disabledFetch = window.fetch;
  window.fetch = async (input, init) => {
    if (input === '/api/git' && init?.method === 'POST' && typeof init.body === 'string') {
      const data = JSON.parse(init.body);
      if (data.cwd === repo.path && Array.isArray(data.args) && data.args[0] === '-c' && data.args[1] === 'core.quotepath=false' && data.args[2] === '--literal-pathspecs' && data.args[3] === 'diff' && data.args.includes('--full-index')) return new Response(JSON.stringify({ stdout: params.has('diffHunks') ? readableDiff : raw(1, 'first feature'), stderr: '', exitCode: 0 }));
    }
    return disabledFetch(input, init);
  };
  hunkCommitService.capture = async (_repo, signal) => {
    stale = false; checks = 0;
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
      messages.push({ title: group.title, body: group.body });
      document.documentElement.dataset.hunkFixtureWrites = JSON.stringify(written);
      document.documentElement.dataset.hunkFixtureMessages = JSON.stringify(messages);
      completed.push({ hash: String(written.length).repeat(40), title: group.title, units: [...group.units] });
      options.onProgress?.([...completed]);
    }
    return { completed, recoveryRef: 'refs/auugit/recovery/fixture' };
  };
}
