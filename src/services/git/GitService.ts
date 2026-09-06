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
    // Validate repository by running git rev-parse
    await executeGit(['rev-parse', '--git-dir'], path);

    const status = await this.getStatus(path);
    const name = path.split(/[/\\]/).filter(Boolean).pop() || 'repository';

    let remoteUrl: string | undefined = undefined;
    try {
      const remoteRes = await executeGit(['remote', 'get-url', 'origin'], path);
      if (remoteRes.stdout.trim()) {
        remoteUrl = remoteRes.stdout.trim();
      }
    } catch {
      // origin remote might not exist
    }

    return {
      id: String(Date.now()),
      name,
      path,
      currentBranch: status.currentBranch,
      lastOpenedAt: Date.now(),
      remoteUrl,
    };
  }

  async initRepository(path: string): Promise<void> {
    await executeGit(['init', '-b', 'main'], path);
  }

  async cloneRepository(url: string, targetPath: string, branch?: string): Promise<void> {
    const args = ['clone'];
    if (branch) {
      args.push('-b', branch);
    }
    args.push(url, targetPath);
    await executeGit(args, process.cwd());
  }

  async getStatus(repoPath: string): Promise<GitStatusResult> {
    const res = await executeGit(['status', '--porcelain=v2', '--branch'], repoPath);
    return parsePorcelainV2(res.stdout);
  }

  async getBranches(repoPath: string): Promise<GitBranch[]> {
    const res = await executeGit(['branch', '-a', '-v', '--no-color'], repoPath);
    return parseGitBranches(res.stdout);
  }

  async getTags(repoPath: string): Promise<GitTag[]> {
    const format = '%(refname:short)%x1f%(objectname)%x1f%(subject)%x1f%(taggername)%x1f%(taggeremail)%x1f%(taggerdate:iso-strict)';
    const res = await executeGit(['tag', '-l', `--format=${format}`], repoPath);
    return parseGitTags(res.stdout);
  }

  async getCommits(repoPath: string, limit: number = 50): Promise<GitCommit[]> {
    const format = '%H%x1f%h%x1f%s%x1f%b%x1f%an%x1f%ae%x1f%aI%x1f%P%x1f%D%x1e';
    const res = await executeGit(
      ['log', `-n`, String(limit), `--format=${format}`],
      repoPath
    );
    return parseGitLog(res.stdout);
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

  async getFileDiff(repoPath: string, filePath: string, staged?: boolean): Promise<ParsedDiffLine[]> {
    const args = ['diff', '--no-color'];
    if (staged) {
      args.push('--staged');
    }
    args.push('--', filePath);

    const res = await executeGit(args, repoPath);
    return parseDiffOutput(res.stdout);
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

  async pushTag(repoPath: string, name: string): Promise<void> {
    await executeGit(['push', 'origin', `refs/tags/${name}`], repoPath);
  }
}

export const gitService = new GitService();
