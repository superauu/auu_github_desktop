import { executeGitTransaction, type GitCommandResult } from './GitExecutor';
import { gitService } from './GitService';
import { savePoint } from './BranchSafetyService';
import { tNow } from '@/i18n';
import type { GitFileChange } from './types';

type Git = (args: string[], stdin?: string) => Promise<GitCommandResult>;
export interface BatchCommitGroup { id?: string; title: string; body: string; reason: string; files: string[] }
export interface CommitBatchPlan {
  repoPath: string; branch: string; head: string; files: GitFileChange[]; skipped: string[];
  status: GitFileChange[]; fingerprints: Record<string, string>; index: string; context: string; truncated: boolean;
}
export interface CompletedBatchCommit { hash: string; title: string; files: string[] }
export interface BatchCaptureProgress { stage: 'waiting' | 'reading' | 'checking'; completed: number; total: number }
export class CommitBatchError extends Error {
  constructor(message: string, public completed: CompletedBatchCommit[], public recoveryRef?: string, public indexError?: string) { super(message); this.name = 'CommitBatchError'; }
}
const entries = (status: Awaited<ReturnType<typeof gitService.getStatus>>) => [...status.staged, ...status.unstaged, ...status.untracked];
const headOf = (status: Awaited<ReturnType<typeof gitService.getStatus>>) => /^[0-9a-f]{40,64}$/.test(status.headOid || '') ? status.headOid! : '';
const signature = (files: GitFileChange[]) => JSON.stringify(files.map(({ path, oldPath, status, staged }) => ({ path, oldPath, status, staged })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))));
const pathsFor = (plan: Pick<CommitBatchPlan, 'files'>, paths: string[]) => [...new Set(paths.flatMap(path => { const file = plan.files.find(file => file.path === path); return file?.oldPath ? [file.oldPath, path] : [path]; }))];
const nul = (paths: string[]) => paths.join('\0') + '\0';
const aborted = (signal?: AbortSignal) => { if (signal?.aborted) throw new DOMException('Aborted', 'AbortError'); };

async function readFingerprints(git: Git, files: GitFileChange[], signal?: AbortSignal) {
  const result: Record<string, string> = Object.create(null);
  const batches: string[][] = [];
  let batch: string[] = [], length = 0;
  for (const file of files) {
    if (file.status === 'deleted') { result[file.path] = 'deleted'; continue; }
    // Keep argument lists well below Windows' process limit, including escaped quotes.
    if (batch.length && (batch.length >= 64 || length + file.path.length * 2 + 3 > 8000)) {
      batches.push(batch); batch = []; length = 0;
    }
    batch.push(file.path); length += file.path.length * 2 + 3;
  }
  if (batch.length) batches.push(batch);
  for (const paths of batches) {
    aborted(signal);
    const hashes = (await git(['hash-object', '--no-filters', '--', ...paths])).stdout.trim().split(/\r?\n/);
    aborted(signal);
    if (hashes.length !== paths.length || hashes.some(hash => !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(hash))) throw new Error('Unable to fingerprint working files');
    paths.forEach((path, index) => { result[path] = hashes[index]; });
  }
  return result;
}

export function validateBatchGroups(groups: BatchCommitGroup[], paths: string[]) {
  if (!Array.isArray(groups) || !groups.length || groups.length > 12) throw new Error(tNow('batch.invalid'));
  const seen = new Set<string>();
  for (const group of groups) {
    if (typeof group.title !== 'string' || !group.title.trim() || group.title.length > 120 || /[\r\n\0]/.test(group.title) || typeof group.body !== 'string' || group.body.length > 6000 || group.body.includes('\0') || typeof group.reason !== 'string' || group.reason.length > 2000 || !Array.isArray(group.files) || !group.files.length) throw new Error(tNow('batch.invalid'));
    for (const path of group.files) {
      if (typeof path !== 'string' || !paths.includes(path) || seen.has(path)) throw new Error(tNow('batch.invalid'));
      seen.add(path);
    }
  }
  if (seen.size !== paths.length) throw new Error(tNow('batch.invalid'));
}

async function assertCurrent(git: Git, plan: CommitBatchPlan, completed: CompletedBatchCommit[], signal?: AbortSignal) {
  aborted(signal);
  const current = await gitService.getStatus(plan.repoPath);
  const expectedHead = completed.at(-1)?.hash || plan.head;
  if (current.currentBranch !== plan.branch || headOf(current) !== expectedHead || (await gitService.getRepoOperationState(plan.repoPath, current)).type !== 'none') throw new Error(tNow('batch.stale'));
  const done = new Set(pathsFor(plan, completed.flatMap(commit => commit.files)));
  const expected = plan.status.filter(file => !done.has(file.path) && !done.has(file.oldPath || ''));
  if (signature(entries(current)) !== signature(expected)) throw new Error(tNow('batch.stale'));
  const remaining = new Map(expected.map(file => [file.path, file]));
  const fingerprints = await readFingerprints(git, [...remaining.values()], signal);
  for (const file of remaining.values()) if (fingerprints[file.path] !== plan.fingerprints[file.path]) throw new Error(tNow('batch.stale'));
  const index = (await git(['ls-files', '--stage', '-z'])).stdout;
  const withoutDone = (value: string) => value.split('\0').filter(entry => entry && !done.has(entry.slice(entry.indexOf('\t') + 1))).sort().join('\0');
  if (withoutDone(index) !== withoutDone(plan.index)) throw new Error(tNow('batch.stale'));
}

export const commitBatchService = {
  async capture(repoPath: string, signal?: AbortSignal, onProgress?: (progress: BatchCaptureProgress) => void): Promise<CommitBatchPlan> {
    onProgress?.({ stage: 'waiting', completed: 0, total: 0 });
    return executeGitTransaction(repoPath, async git => {
      aborted(signal);
      onProgress?.({ stage: 'reading', completed: 0, total: 0 });
      const status = await gitService.getStatus(repoPath);
      let branch = status.currentBranch;
      // Porcelain already identifies local and unborn branches. Resolve only its detached sentinel.
      if (!branch || branch === 'DETACHED') {
        try { branch = (await git(['symbolic-ref', '--quiet', '--short', 'HEAD'])).stdout.trim(); }
        catch { throw new Error(tNow('batch.localBranch')); }
      }
      const all = entries(status), unique = new Map<string, GitFileChange>();
      // The worktree version takes precedence over a partially staged version.
      for (const file of all) unique.set(file.path, { ...unique.get(file.path), ...file });
      if (!unique.size) throw new Error(tNow('err.aiNoFiles'));
      if (unique.size > 200) throw new Error(tNow('batch.tooMany'));
      for (const file of unique.values()) if (file.oldPath && unique.has(file.oldPath)) throw new Error(tNow('batch.renameOverlap'));
      const head = headOf(status);
      const [operation, indexResult, changedResult] = await Promise.all([
        gitService.getRepoOperationState(repoPath, status),
        git(['ls-files', '--stage', '-z']),
        head ? git(['diff', '--name-only', '--no-renames', '-z', head, '--']) : null,
      ]);
      aborted(signal);
      if (operation.type !== 'none') throw new Error(tNow('safety.operationActive'));
      const index = indexResult.stdout;
      if (index.split('\0').some(entry => entry.startsWith('160000 ') && unique.has(entry.slice(entry.indexOf('\t') + 1)))) throw new Error(tNow('batch.submodule'));
      const changed = changedResult ? new Set(changedResult.stdout.split('\0').filter(Boolean)) : null;
      const files = [...unique.values()].filter(file => changed ? changed.has(file.path) || (!!file.oldPath && changed.has(file.oldPath)) || file.status === 'untracked' : file.status !== 'deleted');
      const skipped = [...unique.keys()].filter(path => !files.some(file => file.path === path));
      if (!files.length) throw new Error(tNow('batch.noNetChanges'));
      onProgress?.({ stage: 'reading', completed: 0, total: files.length });
      const fingerprints = await readFingerprints(git, [...unique.values()], signal);
      const manifest = JSON.stringify(files.map(({ path, oldPath, status }) => ({ path, oldPath, status })));
      if (manifest.length > 16000) throw new Error(tNow('batch.tooMany'));
      const budget = Math.min(2400, Math.floor((48000 - manifest.length) / files.length));
      let truncated = false;
      const excerpts: string[] = new Array(files.length);
      let cursor = 0, completed = 0, failed = false;
      await Promise.all(Array.from({ length: Math.min(4, files.length) }, async () => {
        while (cursor < files.length && !failed) {
          const index = cursor++, file = files[index];
          try {
            aborted(signal);
            let diff: string;
            if (file.status === 'untracked') diff = (await git(['diff', '--no-index', '--no-color', '--no-ext-diff', '--no-textconv', '--', '/dev/null', file.path])).stdout;
            else if (head) diff = (await git(['--literal-pathspecs', 'diff', '--no-color', '--no-ext-diff', '--no-textconv', head, '--', ...pathsFor({ files }, [file.path])])).stdout;
            else diff = (await gitService.getFileDiff(repoPath, file.path, file.staged, false, false, file.oldPath)).map(line => line.content).join('\n');
            aborted(signal);
            if (diff.length > budget) truncated = true;
            excerpts[index] = `${JSON.stringify(file.path)}:\n${diff.slice(0, budget)}`;
            onProgress?.({ stage: 'reading', completed: ++completed, total: files.length });
          } catch (error) { failed = true; throw error; }
        }
      }));
      const plan = { repoPath, branch, head, files, skipped, status: all, fingerprints, index, truncated, context: `ALL FILES (exact paths):\n${manifest}\nDIFF EXCERPTS:\n${excerpts.join('\n\n')}` };
      onProgress?.({ stage: 'checking', completed: 0, total: unique.size });
      await assertCurrent(git, plan, [], signal);
      aborted(signal);
      onProgress?.({ stage: 'checking', completed: unique.size, total: unique.size });
      return plan;
    });
  },

  async execute(plan: CommitBatchPlan, groups: BatchCommitGroup[], options: { canContinue?: () => boolean; onProgress?: (completed: CompletedBatchCommit[]) => void } = {}): Promise<{ completed: CompletedBatchCommit[]; recoveryRef?: string }> {
    // Copy reviewed values so later edits cannot change an in-flight batch.
    const reviewed = groups.map(group => ({ ...group, files: [...group.files] }));
    validateBatchGroups(reviewed, plan.files.map(file => file.path));
    return executeGitTransaction(plan.repoPath, async git => {
      const completed: CompletedBatchCommit[] = [];
      let recoveryRef: string | undefined;
      for (const group of reviewed) {
        let restoring = false, originalIndex = '';
        try {
          if (options.canContinue && !options.canContinue()) throw new Error(tNow('batch.stale'));
          await assertCurrent(git, plan, completed);
          if (!recoveryRef && plan.head) recoveryRef = await savePoint(git, plan.branch, plan.head, 'ai-commits');
          originalIndex = (await git(['write-tree'])).stdout.trim();
          const paths = pathsFor(plan, group.files);
          const tracked = new Set((await git(['ls-files', '-z'])).stdout.split('\0'));
          const stagePaths = paths.filter(path => tracked.has(path) || plan.files.some(file => file.path === path && file.status !== 'deleted'));
          restoring = true;
          if (stagePaths.length) await git(['--literal-pathspecs', 'add', '--all', '--pathspec-from-file=-', '--pathspec-file-nul'], nul(stagePaths));
          const message = group.title.trim() + (group.body.trim() ? `\n\n${group.body.trim()}` : '');
          // --only leaves other staged files out of this commit and preserves their staging.
          await git(['--literal-pathspecs', 'commit', '--only', '-m', message, '--pathspec-from-file=-', '--pathspec-file-nul'], nul(paths));
          restoring = false;
          const hash = (await git(['rev-parse', 'HEAD'])).stdout.trim();
          completed.push({ hash, title: group.title.trim(), files: [...group.files] });
          options.onProgress?.([...completed]);
        } catch (error) {
          let indexError: string | undefined;
          if (restoring) {
            try {
              const actualHead = headOf(await gitService.getStatus(plan.repoPath));
              if (actualHead !== (completed.at(-1)?.hash || plan.head)) throw new Error(tNow('batch.headChanged'), { cause: error });
              const currentPaths = new Set((await git(['ls-files', '-z'])).stdout.split('\0'));
              const originalPaths = new Set((await git(['ls-tree', '-r', '--name-only', '-z', originalIndex])).stdout.split('\0'));
              const restorePaths = pathsFor(plan, group.files).filter(path => currentPaths.has(path) || originalPaths.has(path));
              if (restorePaths.length) await git(['--literal-pathspecs', 'restore', '--staged', `--source=${originalIndex}`, '--pathspec-from-file=-', '--pathspec-file-nul'], nul(restorePaths));
              const intentPaths = group.files.filter(path => plan.status.some(file => file.path === path && !file.staged && file.status === 'added'));
              if (intentPaths.length) await git(['--literal-pathspecs', 'add', '--intent-to-add', '--pathspec-from-file=-', '--pathspec-file-nul'], nul(intentPaths));
            } catch (restoreError) { indexError = restoreError instanceof Error ? restoreError.message : String(restoreError); }
          }
          throw new CommitBatchError(error instanceof Error ? error.message : String(error), [...completed], recoveryRef, indexError);
        }
      }
      return { completed, recoveryRef };
    });
  },
};
