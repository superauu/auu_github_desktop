import { executeGitTransaction, type GitTransactionRunner } from './GitExecutor';
import { gitService } from './GitService';
import { savePoint } from './BranchSafetyService';
import { buildHunkPatch, groupDiffIntoHunks, parseDiffOutput } from './PorcelainParser';
import type { GitFileChange } from './types';
import { tNow } from '@/i18n';

export interface CommitUnit { id: string; path: string; paths: string[]; kind: 'hunk' | 'file'; label: string; patch: string }
export interface HunkCommitGroup { id: string; title: string; body: string; units: string[]; reason?: string }
export interface HunkCommitPlan {
  repoPath: string; branch: string; head: string; baseTree: string; indexTree: string;
  index: string; flags: string; files: GitFileChange[]; units: CommitUnit[];
}
export interface HunkCommitResult { hash: string; title: string; units: string[] }
export class HunkCommitError extends Error {
  constructor(message: string, public completed: HunkCommitResult[], public recoveryRef?: string) { super(message); this.name = 'HunkCommitError'; }
}
const oid = (value: string) => /^(?:[a-f\d]{40}|[a-f\d]{64})$/i.test(value);
const headOf = (status: Awaited<ReturnType<typeof gitService.getStatus>>) => oid(status.headOid || '') ? status.headOid! : '';
const nul = (paths: string[]) => paths.join('\0') + '\0';
const aborted = (signal?: AbortSignal) => { if (signal?.aborted) throw new DOMException('Aborted', 'AbortError'); };
const treeOf = (value?: string) => { if (!value || !oid(value)) throw new Error(tNow('hunkPlan.invalidTree')); return value; };

export function validateHunkGroups(plan: Pick<HunkCommitPlan, 'units'>, groups: HunkCommitGroup[], messages = true) {
  if (!groups.length || groups.length > 12) throw new Error(tNow('hunkPlan.invalidGroups'));
  const available = new Set(plan.units.map(unit => unit.id)), used = new Set<string>();
  for (const group of groups) {
    if (messages && (!group.title.trim() || group.title.length > 120 || /[\r\n\0]/.test(group.title) || group.body.length > 6000 || group.body.includes('\0') || !group.units.length)) throw new Error(tNow('hunkPlan.invalidGroups'));
    for (const id of group.units) {
      if (!available.has(id) || used.has(id)) throw new Error(tNow('hunkPlan.invalidGroups'));
      used.add(id);
    }
  }
  return used;
}

/** Join original staged hunks in file order, rebasing only their output ranges. */
export function combineCommitHunks(units: CommitUnit[]) {
  const files = new Map<string, CommitUnit[]>();
  for (const unit of units.filter(unit => unit.kind === 'hunk')) files.set(unit.path, [...(files.get(unit.path) || []), unit]);
  const patches: string[] = [];
  for (const hunks of files.values()) {
    let shift = 0;
    hunks.forEach((unit, index) => {
      const lines = unit.patch.replace(/\n$/, '').split('\n');
      const position = lines.findIndex(line => line.startsWith('@@'));
      const match = lines[position]?.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/);
      if (!match) throw new Error(tNow('hunkPlan.invalidGroups'));
      if (index === 0) patches.push(...lines.slice(0, position));
      const oldCount = Number(match[2] ?? 1), newCount = Number(match[4] ?? 1);
      const start = Number(match[1]) + (oldCount === 0 ? 1 : 0) + shift;
      patches.push(`@@ -${match[1]},${oldCount} +${newCount ? start : start - 1},${newCount} @@${match[5]}`, ...lines.slice(position + 1));
      shift += newCount - oldCount;
    });
  }
  return patches.length ? patches.join('\n') + '\n' : '';
}

async function assertCurrent(git: GitTransactionRunner, plan: HunkCommitPlan, expectedHead = plan.head) {
  const status = await gitService.getStatus(plan.repoPath);
  if (status.currentBranch !== plan.branch || headOf(status) !== expectedHead || (await gitService.getRepoOperationState(plan.repoPath, status)).type !== 'none') throw new Error(tNow('hunkPlan.stale'));
  const [index, flags] = await Promise.all([git(['ls-files', '--stage', '-z']), git(['ls-files', '-v', '-z'])]);
  if (index.stdout !== plan.index || flags.stdout !== plan.flags) throw new Error(tNow('hunkPlan.stale'));
}

async function candidateTree(git: GitTransactionRunner, plan: HunkCommitPlan, selected: Set<string>) {
  const units = plan.units.filter(unit => selected.has(unit.id));
  let tree = plan.baseTree;
  const wholePaths = [...new Set(units.filter(unit => unit.kind === 'file').flatMap(unit => unit.paths))];
  if (wholePaths.length) tree = treeOf((await git(['--literal-pathspecs', 'restore', '--staged', `--source=${plan.indexTree}`, '--pathspec-from-file=-', '--pathspec-file-nul'], nul(wholePaths), tree)).indexTree);
  const patch = combineCommitHunks(units);
  if (patch) tree = treeOf((await git(['apply', '--cached', '--whitespace=nowarn', '-'], patch, tree)).indexTree);
  return tree;
}

export const hunkCommitService = {
  async verify(plan: HunkCommitPlan) {
    return executeGitTransaction(plan.repoPath, git => assertCurrent(git, plan));
  },
  async capture(repoPath: string, signal?: AbortSignal): Promise<HunkCommitPlan> {
    return executeGitTransaction(repoPath, async git => {
      aborted(signal);
      const status = await gitService.getStatus(repoPath);
      if (!status.currentBranch || status.currentBranch === 'DETACHED') throw new Error(tNow('batch.localBranch'));
      if ((await gitService.getRepoOperationState(repoPath, status)).type !== 'none') throw new Error(tNow('safety.operationActive'));
      const files = status.staged;
      if (!files.length) throw new Error(tNow('hunkPlan.noStaged'));
      if (files.length > 200) throw new Error(tNow('hunkPlan.tooLarge'));
      const [index, flags, indexTree] = await Promise.all([git(['ls-files', '--stage', '-z']), git(['ls-files', '-v', '-z']), git(['write-tree'])]);
      const head = headOf(status);
      const baseTree = head ? (await git(['rev-parse', `${head}^{tree}`])).stdout.trim() : treeOf((await git(['write-tree'], undefined, 'empty')).indexTree);
      const units: CommitUnit[] = [], pathsSeen = new Set<string>();
      const modes = new Map(index.stdout.split('\0').filter(Boolean).map(entry => [entry.slice(entry.indexOf('\t') + 1), entry.slice(0, 6)]));
      let size = 0;
      for (const [fileIndex, file] of files.entries()) {
        aborted(signal);
        const paths = [...new Set([file.oldPath, file.path].filter((path): path is string => !!path))];
        if (paths.some(path => pathsSeen.has(path))) throw new Error(tNow('batch.renameOverlap'));
        paths.forEach(path => pathsSeen.add(path));
        const raw = (await git(['--literal-pathspecs', 'diff', '--cached', '--no-renames', '--no-color', '--no-ext-diff', '--no-textconv', '--src-prefix=a/', '--dst-prefix=b/', '--full-index', '--unified=3', '--', ...paths])).stdout;
        size += raw.length;
        if (size > 2 * 1024 * 1024) throw new Error(tNow('hunkPlan.tooLarge'));
        const mode = modes.get(file.path);
        const hunks = groupDiffIntoHunks(parseDiffOutput(raw)).filter(hunk => hunk.some(line => line.type === 'add' || line.type === 'delete'));
        const splittable = file.status === 'modified' && ['100644', '100755'].includes(mode || '') && hunks.length > 0
          && !raw.includes('\uFFFD') && !/^(?:old mode |new mode |new file mode |deleted file mode |Binary files |GIT binary patch)/m.test(raw);
        if (splittable) hunks.forEach((hunk, hunkIndex) => units.push({ id: `h${fileIndex}:${hunkIndex}`, path: file.path, paths, kind: 'hunk', label: hunk[0].content, patch: buildHunkPatch(file.path, hunk, 'stage') }));
        else units.push({ id: `f${fileIndex}`, path: file.path, paths, kind: 'file', label: tNow('hunkPlan.wholeFile'), patch: raw || tNow('hunkPlan.metadataOnly') });
        if (units.length > 1000) throw new Error(tNow('hunkPlan.tooLarge'));
      }
      const plan = { repoPath, branch: status.currentBranch, head, baseTree: treeOf(baseTree), indexTree: treeOf(indexTree.stdout.trim()), index: index.stdout, flags: flags.stdout, files, units };
      await assertCurrent(git, plan);
      aborted(signal);
      return plan;
    });
  },

  async preview(plan: HunkCommitPlan, groups: HunkCommitGroup[], index: number): Promise<string> {
    validateHunkGroups(plan, groups, false);
    if (!groups[index]?.units.length) throw new Error(tNow('hunkPlan.invalidGroups'));
    return executeGitTransaction(plan.repoPath, async git => {
      await assertCurrent(git, plan);
      const before = await candidateTree(git, plan, new Set(groups.slice(0, index).flatMap(group => group.units)));
      const after = await candidateTree(git, plan, new Set(groups.slice(0, index + 1).flatMap(group => group.units)));
      const diff = (await git(['diff', '--no-color', '--no-ext-diff', '--no-textconv', '--full-index', before, after, '--'])).stdout;
      await assertCurrent(git, plan);
      return diff;
    });
  },

  async execute(plan: HunkCommitPlan, groups: HunkCommitGroup[], options: { canContinue?: () => boolean; onProgress?: (commits: HunkCommitResult[]) => void } = {}) {
    const reviewed = groups.map(group => ({ ...group, units: [...group.units] }));
    validateHunkGroups(plan, reviewed);
    return executeGitTransaction(plan.repoPath, async git => {
      const completed: HunkCommitResult[] = [], selected = new Set<string>();
      let recoveryRef: string | undefined;
      for (const group of reviewed) {
        const expectedHead = completed.at(-1)?.hash || plan.head;
        let attempting = false;
        try {
          if (options.canContinue && !options.canContinue()) throw new Error(tNow('hunkPlan.stopped'));
          await assertCurrent(git, plan, expectedHead);
          if (!recoveryRef && plan.head) recoveryRef = await savePoint(git, plan.branch, plan.head, 'split-commits');
          group.units.forEach(id => selected.add(id));
          const intendedTree = await candidateTree(git, plan, selected);
          if (intendedTree === (completed.length ? (await git(['rev-parse', `${expectedHead}^{tree}`])).stdout.trim() : plan.baseTree)) throw new Error(tNow('hunkPlan.emptyCommit'));
          await assertCurrent(git, plan, expectedHead);
          attempting = true;
          const result = await git(['commit', '-m', group.title.trim() + (group.body.trim() ? `\n\n${group.body.trim()}` : '')], undefined, intendedTree);
          const hash = (await git(['rev-parse', 'HEAD'])).stdout.trim();
          completed.push({ hash, title: group.title.trim(), units: [...group.units] });
          attempting = false;
          options.onProgress?.([...completed]);
          // Another client can advance HEAD after preflight but before Git locks
          // the ref. Keep the actual result visible and stop on an unexpected parent.
          const parents = (await git(['rev-list', '--parents', '-n', '1', hash])).stdout.trim().split(/\s+/);
          if (parents.length !== (expectedHead ? 2 : 1) || (expectedHead && parents[1] !== expectedHead)) throw new Error(tNow('hunkPlan.stale'));
          if (result.indexTree !== intendedTree || (await git(['rev-parse', `${hash}^{tree}`])).stdout.trim() !== intendedTree) throw new Error(tNow('hunkPlan.hookChanged'));
          await assertCurrent(git, plan, hash);
        } catch (reason) {
          // A lost response may follow a successful commit. Report it once; never retry it.
          if (attempting) {
            try {
              const actualHead = headOf(await gitService.getStatus(plan.repoPath));
              if (actualHead && actualHead !== expectedHead) {
                const parent = (await git(['rev-list', '--parents', '-n', '1', actualHead])).stdout.trim().split(/\s+/);
                if (parent.length === (expectedHead ? 2 : 1) && (!expectedHead || parent[1] === expectedHead)) {
                  completed.push({ hash: actualHead, title: group.title.trim(), units: [...group.units] });
                  options.onProgress?.([...completed]);
                }
              }
            } catch { /* Keep the original error; HEAD can be inspected in recovery. */ }
          }
          throw new HunkCommitError(reason instanceof Error ? reason.message : String(reason), completed, recoveryRef);
        }
      }
      return { completed, recoveryRef };
    });
  },
};
