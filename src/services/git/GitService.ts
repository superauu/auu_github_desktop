import {
  GitBranch,
  GitCommit,
  GitStatusResult,
  GitStash,
  GitTag,
  IGitService,
  RepositoryInfo,
} from './types';
import { executeGit } from './GitExecutor';
import {
  parseDiffOutput,
  ParsedDiffLine,
  parseGitBranches,
  parseGitLog,
  parseGitTags,
  parsePorcelainV2,
} from './PorcelainParser';

export class GitService implements IGitService {
  async isGitInstalled(): Promise<boolean> {
    try {
      const res = await executeGit(['--version'], process.cwd());
      return res.exitCode === 0;
    } catch {
      return false;
    }
  }

  async getGitVersion(): Promise<string> {
    const res = await executeGit(['--version'], process.cwd());
    return res.stdout.trim();
  }

  async openRepository(path: string): Promise<RepositoryInfo> {
    const normalizedPath = path.trim().replace(/\\/g, '/');
    // Validate repository by running git rev-parse
    await executeGit(['rev-parse', '--git-dir'], normalizedPath);

    const status = await this.getStatus(normalizedPath);
    const name = normalizedPath.split(/[/\\]/).filter(Boolean).pop() || 'repository';

    let remoteUrl: string | undefined = undefined;
    try {
      const remoteRes = await executeGit(['remote', 'get-url', 'origin'], normalizedPath);
      if (remoteRes.stdout.trim()) {
        remoteUrl = remoteRes.stdout.trim();
      }
    } catch {
      // origin remote might not exist
    }

    let isGitHubRepo = false;
    let gitHubOwner: string | undefined = undefined;
    let gitHubRepo: string | undefined = undefined;

    if (remoteUrl) {
      // Support https://github.com/owner/repo(.git) and git@github.com:owner/repo(.git)
      const httpsMatch = remoteUrl.match(/github\.com\/([^/]+)\/([^/.]+)(?:\.git)?$/i);
      const sshMatch = remoteUrl.match(/github\.com:([^/]+)\/([^/.]+)(?:\.git)?$/i);
      const match = httpsMatch || sshMatch;
      if (match) {
        isGitHubRepo = true;
        gitHubOwner = match[1];
        gitHubRepo = match[2];
      }
    }

    return {
      id: String(Date.now()),
      name,
      path: normalizedPath,
      currentBranch: status.currentBranch || 'main',
      lastOpenedAt: Date.now(),
      remoteUrl,
      isGitHubRepo,
      gitHubOwner,
      gitHubRepo,
    };
  }

  async initRepository(path: string): Promise<void> {
    const normalizedPath = path.trim().replace(/\\/g, '/');
    await executeGit(['init', '-b', 'main'], normalizedPath);
  }

  async cloneRepository(url: string, targetPath: string, branch?: string): Promise<void> {
    const normalizedTarget = targetPath.trim().replace(/\\/g, '/');
    const args = ['clone'];
    if (branch) {
      args.push('-b', branch);
    }
    args.push(url.trim(), normalizedTarget);
    await executeGit(args, process.cwd());
  }

  async getStatus(repoPath: string): Promise<GitStatusResult> {
    const res = await executeGit(['status', '--porcelain=v2', '--branch'], repoPath);
    return parsePorcelainV2(res.stdout);
  }

  async getBranches(repoPath: string): Promise<GitBranch[]> {
    try {
      const res = await executeGit(['branch', '-a', '-v', '--no-color'], repoPath);
      return parseGitBranches(res.stdout);
    } catch {
      return [];
    }
  }

  async getTags(repoPath: string): Promise<GitTag[]> {
    try {
      const format = '%(refname:short)%x1f%(objectname)%x1f%(subject)%x1f%(taggername)%x1f%(taggeremail)%x1f%(taggerdate:iso-strict)';
      const res = await executeGit(['tag', '-l', `--format=${format}`], repoPath);
      return parseGitTags(res.stdout);
    } catch {
      return [];
    }
  }

  async getCommits(repoPath: string, limit: number = 50): Promise<GitCommit[]> {
    try {
      const format = '%H%x1f%h%x1f%s%x1f%b%x1f%an%x1f%ae%x1f%aI%x1f%P%x1f%D%x1e';
      const res = await executeGit(
        ['log', `-n`, String(limit), `--format=${format}`],
        repoPath
      );
      return parseGitLog(res.stdout);
    } catch {
      // Empty repository or brand new repo without commits
      return [];
    }
  }

  async getStashes(repoPath: string): Promise<GitStash[]> {
    try {
      const res = await executeGit(['stash', 'list', '--format=%gd%x1f%gs%x1f%cr%x1f%H'], repoPath);
      const lines = res.stdout.split(/\r?\n/).filter(Boolean);
      return lines.map((line, index) => {
        const parts = line.split('\x1f');
        return {
          index,
          message: parts[1] || 'WIP on stash',
          branch: parts[0] || 'stash',
          date: parts[2] || '',
          hash: parts[3] || '',
        };
      });
    } catch {
      return [];
    }
  }

  async stashPush(repoPath: string, message?: string, includeUntracked: boolean = true): Promise<void> {
    const args = ['stash', 'push'];
    if (includeUntracked) {
      args.push('-u');
    }
    if (message?.trim()) {
      args.push('-m', message.trim());
    }
    await executeGit(args, repoPath);
  }

  async stashPop(repoPath: string, index: number = 0): Promise<void> {
    await executeGit(['stash', 'pop', `stash@{${index}}`], repoPath);
  }

  async stashApply(repoPath: string, index: number = 0): Promise<void> {
    await executeGit(['stash', 'apply', `stash@{${index}}`], repoPath);
  }

  async stashDrop(repoPath: string, index: number = 0): Promise<void> {
    await executeGit(['stash', 'drop', `stash@{${index}}`], repoPath);
  }

  async revertCommit(repoPath: string, hash: string): Promise<void> {
    await executeGit(['revert', '--no-edit', hash], repoPath);
  }

  async softResetCommit(repoPath: string, hash: string): Promise<void> {
    await executeGit(['reset', '--soft', hash], repoPath);
  }

  async stageFile(repoPath: string, filePath: string): Promise<void> {
    await executeGit(['add', '--', filePath], repoPath);
  }

  async unstageFile(repoPath: string, filePath: string): Promise<void> {
    // Try git restore --staged first, fallback to git reset HEAD
    try {
      await executeGit(['restore', '--staged', '--', filePath], repoPath);
    } catch {
      await executeGit(['reset', 'HEAD', '--', filePath], repoPath);
    }
  }

  async stageAll(repoPath: string): Promise<void> {
    await executeGit(['add', '-A'], repoPath);
  }

  async unstageAll(repoPath: string): Promise<void> {
    try {
      await executeGit(['restore', '--staged', '.'], repoPath);
    } catch {
      await executeGit(['reset'], repoPath);
    }
  }

  async discardChanges(repoPath: string, filePath: string): Promise<void> {
    // For tracked modified files, restore
    try {
      await executeGit(['restore', '--', filePath], repoPath);
    } catch {
      await executeGit(['checkout', '--', filePath], repoPath);
    }
  }

  async commit(repoPath: string, message: string, amend?: boolean): Promise<string> {
    if (!message.trim()) {
      throw new Error('提交信息 (Commit Message) 不能为空');
    }
    const args = ['commit', '-m', message];
    if (amend) {
      args.push('--amend');
    }
    const res = await executeGit(args, repoPath);
    return res.stdout;
  }

  async push(repoPath: string, remote: string = 'origin', branch?: string): Promise<void> {
    const args = ['push', remote];
    if (branch) {
      args.push(branch);
    }
    await executeGit(args, repoPath);
  }

  async pull(repoPath: string): Promise<void> {
    await executeGit(['pull'], repoPath);
  }

  async fetch(repoPath: string): Promise<void> {
    await executeGit(['fetch'], repoPath);
  }

  async createBranch(repoPath: string, name: string, startPoint?: string): Promise<void> {
    const args = ['branch', name];
    if (startPoint) {
      args.push(startPoint);
    }
    await executeGit(args, repoPath);
  }

  async checkoutBranch(repoPath: string, name: string): Promise<void> {
    await executeGit(['checkout', name], repoPath);
  }

  async deleteBranch(repoPath: string, name: string, force?: boolean): Promise<void> {
    const flag = force ? '-D' : '-d';
    await executeGit(['branch', flag, name], repoPath);
  }

  async getFileDiff(
    repoPath: string,
    filePath: string,
    staged?: boolean,
    isUntracked?: boolean
  ): Promise<ParsedDiffLine[]> {
    try {
      if (isUntracked) {
        const nullDev = navigator.userAgent.includes('Windows') ? 'nul' : '/dev/null';
        const res = await executeGit(['diff', '--no-index', '--no-color', '--', nullDev, filePath], repoPath);
        return parseDiffOutput(res.stdout);
      }

      const args = ['diff', '--no-color'];
      if (staged) {
        args.push('--staged');
      }
      args.push('--', filePath);

      const res = await executeGit(args, repoPath);
      return parseDiffOutput(res.stdout);
    } catch (err: any) {
      console.warn('Get file diff warning:', err);
      return [];
    }
  }

  async createTag(
    repoPath: string,
    name: string,
    commitHash?: string,
    message?: string
  ): Promise<void> {
    const args = ['tag'];
    if (message) {
      args.push('-a', name, '-m', message);
    } else {
      args.push(name);
    }
    if (commitHash) {
      args.push(commitHash);
    }
    await executeGit(args, repoPath);
  }

  async deleteTag(repoPath: string, name: string): Promise<void> {
    await executeGit(['tag', '-d', name], repoPath);
  }

  async pushTag(repoPath: string, name: string, remote: string = 'origin'): Promise<void> {
    await executeGit(['push', remote, `refs/tags/${name}`], repoPath);
  }

  async pushAllTags(repoPath: string, remote: string = 'origin'): Promise<void> {
    await executeGit(['push', remote, '--tags'], repoPath);
  }

  async deleteRemoteTag(repoPath: string, name: string, remote: string = 'origin'): Promise<void> {
    await executeGit(['push', remote, `--delete`, name], repoPath);
  }

  async merge(
    repoPath: string,
    branch: string,
    options?: { noFf?: boolean; message?: string }
  ): Promise<string> {
    const args = ['merge'];
    if (options?.noFf) {
      args.push('--no-ff');
    }
    if (options?.message?.trim()) {
      args.push('-m', options.message.trim());
    }
    args.push(branch);
    const res = await executeGit(args, repoPath);
    return res.stdout || res.stderr;
  }

  async abortMerge(repoPath: string): Promise<void> {
    await executeGit(['merge', '--abort'], repoPath);
  }

  async rebase(repoPath: string, upstream: string): Promise<string> {
    const res = await executeGit(['rebase', upstream], repoPath);
    return res.stdout || res.stderr;
  }

  async rebaseContinue(repoPath: string): Promise<void> {
    await executeGit(['rebase', '--continue'], repoPath);
  }

  async rebaseAbort(repoPath: string): Promise<void> {
    await executeGit(['rebase', '--abort'], repoPath);
  }
}

export const gitService = new GitService();
