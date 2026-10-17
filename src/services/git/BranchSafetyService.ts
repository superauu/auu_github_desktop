import { executeGit, executeGitTransaction, GitExecutionError, type GitCommandResult } from './GitExecutor';
import { gitService } from './GitService';
import type { GitBranch } from './types';
import { tNow } from '@/i18n';

export type BranchAction = 'merge' | 'rebase-target' | 'rebase-source';
export interface BranchPreview {
  repoPath: string;
  sourceRef: string;
  targetRef: string;
  sourceHash: string;
  targetHash: string;
  sourceOnly: number;
  targetOnly: number;
  files: string[];
  conflicts: string[];
  conflictCheck: 'clean' | 'conflicts' | 'unavailable';
}
export interface RecoveryPoint {
  ref: string;
  hash: string;
  branch: string;
  operation: string;
  timestamp: number;
}
type Git = (args: string[], stdin?: string) => Promise<GitCommandResult>;
const prefix = 'refs/auugit/recovery/';
const refFor = (branch: GitBranch) => `${branch.isRemote ? 'refs/remotes/' : 'refs/heads/'}${branch.name}`;
const resolve = async (git: Git, ref: string) => (await git(['rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`])).stdout.trim();

export async function requireClean(repoPath: string, git: Git) {
  if ((await git(['status', '--porcelain=v2', '-z', '--untracked-files=all'])).stdout) throw new Error(tNow('safety.cleanRequired'));
  if ((await gitService.getRepoOperationState(repoPath)).type !== 'none') throw new Error(tNow('safety.operationActive'));
}

export async function savePoint(git: Git, branch: string, hash: string, operation: string): Promise<string> {
  const ref = `${prefix}${Date.now()}-${crypto.randomUUID()}/${operation}/${branch}`;
  await git(['update-ref', ref, hash, '0'.repeat(hash.length)]);
  return ref;
}

export const branchSafetyService = {
  async preview(repoPath: string, source: GitBranch, target: GitBranch): Promise<BranchPreview> {
    const git: Git = (args, stdin) => executeGit(args, repoPath, stdin);
    const sourceRef = refFor(source), targetRef = refFor(target);
    const [sourceHash, targetHash] = await Promise.all([resolve(git, sourceRef), resolve(git, targetRef)]);
    const [counts, changed] = await Promise.all([
      git(['rev-list', '--left-right', '--count', `${targetHash}...${sourceHash}`]),
      git(['diff', '--name-only', '-z', `${targetHash}...${sourceHash}`, '--']),
    ]);
    const [targetOnly, sourceOnly] = counts.stdout.trim().split(/\s+/).map(Number);
    let conflictCheck: BranchPreview['conflictCheck'] = 'unavailable';
    let conflicts: string[] = [];
    try {
      await git(['merge-tree', '--write-tree', '--name-only', '-z', targetHash, sourceHash]);
      conflictCheck = 'clean';
    } catch (error) {
      if (error instanceof GitExecutionError && error.exitCode === 1 && /^[0-9a-f]{40,64}\0/.test(error.stdout)) {
        const paths = error.stdout.split('\0').slice(1);
        const end = paths.indexOf('');
        conflicts = paths.slice(0, end < 0 ? paths.length : end);
        conflictCheck = 'conflicts';
      }
      // Older Git versions cannot simulate merges; do not report them as clean.
    }
    return { repoPath, sourceRef, targetRef, sourceHash, targetHash, sourceOnly, targetOnly,
      files: changed.stdout.split('\0').filter(Boolean), conflicts, conflictCheck };
  },

  async execute(preview: BranchPreview, action: BranchAction, options?: { noFf?: boolean; message?: string }): Promise<void> {
    return executeGitTransaction(preview.repoPath, async git => {
      const { repoPath, sourceRef, targetRef, sourceHash, targetHash } = preview;
      await requireClean(repoPath, git);
      if (await resolve(git, sourceRef) !== sourceHash || await resolve(git, targetRef) !== targetHash) throw new Error(tNow('safety.stale'));
      const affectedRef = action === 'rebase-source' ? sourceRef : targetRef;
      if (!affectedRef.startsWith('refs/heads/')) throw new Error(tNow('safety.localRequired'));
      const branch = affectedRef.slice('refs/heads/'.length);
      const before = action === 'rebase-source' ? sourceHash : targetHash;
      // switch refuses branches occupied by another worktree, before saving a point.
      await git(['switch', '--no-guess', branch]);
      if (await resolve(git, 'HEAD') !== before) throw new Error(tNow('safety.stale'));
      await savePoint(git, branch, before, action === 'merge' ? 'merge' : 'rebase');
      await git(action === 'merge' ? ['merge', options?.noFf ? '--no-ff' : '--ff', '--no-edit', ...(options?.message?.trim() ? ['-m', options.message.trim()] : []), sourceHash]
        : ['-c', 'rebase.updateRefs=false', 'rebase', action === 'rebase-source' ? targetHash : sourceHash]);
    });
  },

  async list(repoPath: string): Promise<RecoveryPoint[]> {
    const result = await executeGit(['for-each-ref', '--format=%(refname)%09%(objectname)', prefix], repoPath);
    return result.stdout.split(/\r?\n/).filter(Boolean).flatMap(line => {
      const [ref, hash] = line.split('\t');
      const [id, operation, ...parts] = ref.slice(prefix.length).split('/');
      const timestamp = Number(id.split('-')[0]);
      return timestamp && parts.length && /^[0-9a-f]{40,64}$/.test(hash) ? [{ ref, hash, branch: parts.join('/'), operation, timestamp }] : [];
    }).sort((a, b) => b.timestamp - a.timestamp);
  },

  async create(repoPath: string): Promise<void> {
    return executeGitTransaction(repoPath, async git => {
      await requireClean(repoPath, git);
      const branch = (await git(['symbolic-ref', '--quiet', '--short', 'HEAD'])).stdout.trim();
      await savePoint(git, branch, await resolve(git, 'HEAD'), 'manual');
    });
  },

  async restore(repoPath: string, point: RecoveryPoint, expectedHead: string): Promise<void> {
    return executeGitTransaction(repoPath, async git => {
      await requireClean(repoPath, git);
      const branch = (await git(['symbolic-ref', '--quiet', '--short', 'HEAD'])).stdout.trim();
      if (branch !== point.branch) throw new Error(tNow('safety.sameBranch'));
      if (!point.ref.startsWith(prefix) || await resolve(git, point.ref) !== point.hash || await resolve(git, 'HEAD') !== expectedHead) throw new Error(tNow('safety.stale'));
      await savePoint(git, branch, expectedHead, 'restore');
      // --keep refuses to overwrite edits made by an external editor during preflight.
      await git(['reset', '--keep', point.hash]);
    });
  },
};
