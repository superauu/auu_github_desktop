import { executeGit, executeGitTransaction, type GitCommandResult } from './GitExecutor';
import { gitService } from './GitService';
import type { GitFileChange } from './types';
import { tNow } from '@/i18n';
import type { CommitGroup } from '@/services/ai/GitAssistantValidation';

type Git = (args: string[], stdin?: string) => Promise<GitCommandResult>;
export interface CommitSplitPlan { branch: string; head: string; files: GitFileChange[]; fingerprints: Record<string, string>; context: string; groups: CommitGroup[] }
async function fingerprint(git: Git, file: GitFileChange) {
  if (file.status === 'deleted') return 'deleted';
  return (await git(['hash-object', '--no-filters', '--', file.path])).stdout.trim();
}
export const commitSplitService = {
  async plan(repoPath: string): Promise<CommitSplitPlan> {
    const git: Git = (args, stdin) => executeGit(args, repoPath, stdin);
    const status = await gitService.getStatus(repoPath);
    if (status.staged.length) throw new Error(tNow('flow.splitEmptyIndex'));
    if ((await gitService.getRepoOperationState(repoPath, status)).type !== 'none') throw new Error(tNow('safety.operationActive'));
    const files = [...status.unstaged, ...status.untracked];
    const fingerprints: Record<string, string> = Object.create(null);
    const groups = new Map<string, CommitGroup>();
    const snippets: string[] = [];
    for (const file of files) {
      fingerprints[file.path] = await fingerprint(git, file);
      const category = /(^|\/)(tests?|__tests__)(\/|\.)|\.(spec|test)\./i.test(file.path) ? 'test' : /\.(md|mdx|txt|rst)$/i.test(file.path) ? 'docs' : /\.(css|scss|less)$/i.test(file.path) ? 'style' : 'feat';
      if (!groups.has(category)) groups.set(category, { title: `${category}: ${tNow('flow.updateGroup')}`, files: [] });
      groups.get(category)!.files.push(file.path);
      const diff = await gitService.getFileDiff(repoPath, file.path, false, file.status === 'untracked');
      snippets.push(`${file.path}:\n${diff.map(line => line.content).join('\n').slice(0, 500)}`);
    }
    return { branch: status.currentBranch, head: status.headOid || '', files, fingerprints, groups: [...groups.values()], context: `ALL FILES:\n${JSON.stringify(files.map(file => file.path))}\nDIFF EXCERPTS:\n${snippets.join('\n\n')}` };
  },
  async stageGroup(repoPath: string, plan: CommitSplitPlan, paths: string[]): Promise<void> {
    if (!paths.length || paths.some(path => !plan.files.some(file => file.path === path))) throw new Error(tNow('flow.invalidPlan'));
    return executeGitTransaction(repoPath, async git => {
      const status = await gitService.getStatus(repoPath);
      if (status.staged.length) throw new Error(tNow('flow.splitEmptyIndex'));
      if (status.currentBranch !== plan.branch || (status.headOid || '') !== plan.head) throw new Error(tNow('safety.stale'));
      if ((await gitService.getRepoOperationState(repoPath, status)).type !== 'none') throw new Error(tNow('safety.operationActive'));
      for (const path of paths) {
        const file = [...status.unstaged, ...status.untracked].find(file => file.path === path);
        if (!file || await fingerprint(git, file) !== plan.fingerprints[path]) throw new Error(tNow('safety.stale'));
      }
      await git(['--literal-pathspecs', 'add', '--pathspec-from-file=-', '--pathspec-file-nul'], paths.join('\0') + '\0');
    });
  },
};
