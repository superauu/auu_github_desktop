import { executeGit, executeGitTransaction } from './GitExecutor';
import { requireClean, savePoint } from './BranchSafetyService';
import { parseGitLog } from './PorcelainParser';
import { tNow } from '@/i18n';
import type { GitCommit } from './types';

export interface HistoryPlan { branch: string; head: string; base: string; commits: GitCommit[] }
export interface HistoryStep { hash: string; action: 'pick' | 'squash' | 'fixup' }
export interface ReflogEntry { hash: string; selector: string; subject: string; timestamp: number }
const format = '%H%x1f%h%x1f%s%x1f%b%x1f%an%x1f%ae%x1f%aI%x1f%P%x1f%D%x1e';
export const historyWorkflowService = {
  async plan(repoPath: string, count: number): Promise<HistoryPlan> {
    const branch = (await executeGit(['symbolic-ref', '--quiet', '--short', 'HEAD'], repoPath)).stdout.trim();
    const commits = parseGitLog((await executeGit(['log', '--first-parent', `--max-count=${Math.max(2, Math.min(30, count))}`, `--format=${format}`, 'HEAD', '--'], repoPath)).stdout).reverse();
    // The root has no parent onto which Git can replay; leave it as the base.
    if (commits[0]?.parents.length === 0) commits.shift();
    if (!commits.length || commits.some(commit => commit.parents.length !== 1)) throw new Error(tNow('flow.linearOnly'));
    return { branch, head: commits[commits.length - 1].hash, base: commits[0].parents[0], commits };
  },
  async rewrite(repoPath: string, plan: HistoryPlan, steps: HistoryStep[]): Promise<void> {
    if (!/^[0-9a-f]{40,64}$/.test(plan.base) || !/^[0-9a-f]{40,64}$/.test(plan.head)) throw new Error(tNow('flow.invalidPlan'));
    if (!steps.length || steps[0].action !== 'pick' || steps.length !== plan.commits.length || new Set(steps.map(step => step.hash)).size !== steps.length || steps.some(step => !['pick', 'squash', 'fixup'].includes(step.action) || !/^[0-9a-f]{40,64}$/.test(step.hash) || !plan.commits.some(commit => commit.hash === step.hash))) throw new Error(tNow('flow.invalidPlan'));
    return executeGitTransaction(repoPath, async git => {
      await requireClean(repoPath, git);
      const branch = (await git(['symbolic-ref', '--quiet', '--short', 'HEAD'])).stdout.trim();
      const head = (await git(['rev-parse', 'HEAD'])).stdout.trim();
      if (head !== plan.head || branch !== plan.branch) throw new Error(tNow('safety.stale'));
      const original = (await git(['rev-list', '--reverse', '--first-parent', `${plan.base}..${plan.head}`])).stdout.trim().split(/\r?\n/);
      if (original.length !== steps.length || original.some(hash => !steps.some(step => step.hash === hash))) throw new Error(tNow('flow.invalidPlan'));
      // Refuse to rewrite commits already present on a fetched remote branch.
      const published = await git(['for-each-ref', `--contains=${plan.commits[0].hash}`, '--format=%(refname)', 'refs/remotes/']);
      if (published.stdout.trim()) throw new Error(tNow('flow.published'));
      await savePoint(git, branch, head, 'rewrite');
      // Only validated actions and hexadecimal OIDs enter this fixed editor script.
      // Git supplies the todo path as $1. The final ':' consumes its appended argument.
      const editor = `printf '%s\\n' ${steps.map(step => `'${step.action} ${step.hash}'`).join(' ')} > "$1"; :`;
      await git(['-c', `sequence.editor=${editor}`, '-c', 'core.editor=true', '-c', 'rebase.updateRefs=false', 'rebase', '--interactive', plan.base]);
    });
  },
  async reflog(repoPath: string): Promise<ReflogEntry[]> {
    const output = (await executeGit(['reflog', 'show', '--all', '-n', '150', '--date=raw', '--format=%H%x00%gD%x00%gs%x00%ct%x00'], repoPath)).stdout.split('\0');
    const entries: ReflogEntry[] = [];
    for (let i = 0; i + 3 < output.length; i += 4) {
      const hash = output[i].trim();
      if (/^[0-9a-f]{40,64}$/.test(hash)) entries.push({ hash, selector: output[i + 1], subject: output[i + 2], timestamp: Number(output[i + 1].match(/@\{(\d+)/)?.[1] || output[i + 3]) * 1000 });
    }
    return entries;
  },
  async compare(repoPath: string, hash: string): Promise<{ head: string; text: string }> {
    const [head, target] = await Promise.all(['HEAD', hash].map(ref => executeGit(['rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`], repoPath).then(result => result.stdout.trim())));
    const diff = await executeGit(['diff', '--stat', '--patch', '--no-ext-diff', '--no-textconv', '--no-color', head, target, '--'], repoPath);
    return { head, text: diff.stdout.slice(0, 50000) };
  },
  async recoverBranch(repoPath: string, hash: string, name: string): Promise<void> {
    return executeGitTransaction(repoPath, async git => {
      await git(['check-ref-format', '--branch', name]);
      const target = (await git(['rev-parse', '--verify', '--end-of-options', `${hash}^{commit}`])).stdout.trim();
      await git(['update-ref', '--create-reflog', '-m', 'AuuGit recovery', `refs/heads/${name}`, target, '0'.repeat(target.length)]);
    });
  },
  async searchContents(repoPath: string, query: string): Promise<GitCommit[]> {
    if (!query.trim()) return [];
    return parseGitLog((await executeGit(['log', '--all', '--topo-order', '--max-count=100', '--fixed-strings', `-S${query}`, `--format=${format}`, '--'], repoPath)).stdout);
  },
};
