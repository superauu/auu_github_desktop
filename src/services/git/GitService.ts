import { diagnoseRepository, probeRepoOperation } from './RepositoryDiagnostics';
import {
  GitBlameLine,
  GitBranch,
  PushContext,
  PushOptions,
  PushResult,
  GitCommit,
  GitFileChange,
  GitWorktree,
  GitStatusResult,
  GitStash,
  GitTag,
  IGitService,
  RepositoryInfo,
  RepoHealthDiagnosis,
  RepoOperationState,
} from './types';
import { executeGit, executeGitTransaction, GitExecutionError } from './GitExecutor';
import { normalizeInvokeError } from './invokeError';
import { parseWorktrees } from './worktrees';
import {
  parseDiffOutput,
  ParsedDiffLine,
  parseGitBranches,
  parseGitLog,
  parseGitTags,
  parsePorcelainV2,
  unquoteGitPath,
  buildHunkPatch,
  parseBlamePorcelain,
} from './PorcelainParser';
import { tNow } from '@/i18n';
import { parseGitHubRemote } from './remoteIdentity';
import { DiffCache } from './DiffCache';
import { authorizeRepository } from '@/services/fs/RepositoryAccess';

/**
 * Null device used by `diff --no-index` comparisons against untracked files.
 * `/dev/null` wins on every platform: Git for Windows accepts it directly,
 * while the DOS device `nul` breaks when a repository is nested inside
 * another git repository (path prefix handling mangles it).
 */
const NULL_DEVICE = '/dev/null';
/** 十六进制提交哈希:审查范围方法的入参门槛,保证范围/计数参数无法携带选项形态的输入。 */
const COMMIT_HASH = /^[0-9a-f]{40,64}$/;

export class GitService implements IGitService {
  private readonly diffCache = new DiffCache();
  async isGitInstalled(): Promise<boolean> {
    try {
      const res = await executeGit(['--version'], '.');
      return res.exitCode === 0;
    } catch {
      return false;
    }
  }

  async getGitVersion(): Promise<string> {
    const res = await executeGit(['--version'], '.');
    return res.stdout.trim();
  }

  async openRepository(path: string, snapshot?: GitStatusResult): Promise<RepositoryInfo> {
    const normalizedPath = path.trim().replace(/\\/g, '/');
    await authorizeRepository(normalizedPath);
    // Validate repository by running git rev-parse
    await executeGit(['rev-parse', '--git-dir'], normalizedPath);

    const status = snapshot || await this.getStatus(normalizedPath);
    const name = normalizedPath.split(/[/\\]/).filter(Boolean).pop() || 'repository';

    const binding = await this.getGitHubBinding(normalizedPath);
    const remoteUrl = binding?.fetchUrl;
    const identity = remoteUrl ? parseGitHubRemote(remoteUrl) : undefined;

    return {
      //随机 id 仅用于会话内标识；持久化层比较的是仓库路径，同毫秒打开两个仓库也不会冲突。
      id: crypto.randomUUID(),
      name,
      path: normalizedPath,
      currentBranch: status.currentBranch || 'main',
      lastOpenedAt: Date.now(),
      remoteUrl,
      isGitHubRepo: !!identity,
      gitHubOwner: identity?.owner,
      gitHubRepo: identity?.repo,
      gitHubRemote: identity ? binding?.name : undefined,
    };
  }

  async initRepository(path: string): Promise<void> {
    const normalizedPath = path.trim().replace(/\\/g, '/');
    await authorizeRepository(normalizedPath);
    await executeGit(['init', '-b', 'main'], normalizedPath);
  }

  async cloneRepository(url: string, targetPath: string, branch?: string): Promise<void> {
    const normalizedTarget = targetPath.trim().replace(/\\/g, '/');
    await authorizeRepository(normalizedTarget);
    const args = ['clone'];
    if (branch) {
      args.push('-b', branch);
    }
    args.push('--', url.trim(), normalizedTarget);
    // 克隆目标是绝对路径，工作目录使用当前目录即可（浏览器环境没有 process 对象）
    await executeGit(args, '.');
  }

  async getStatus(repoPath: string): Promise<GitStatusResult> {
    const res = await executeGit(['status', '--porcelain=v2', '--branch', '-z', '--untracked-files=all'], repoPath);
    return parsePorcelainV2(res.stdout);
  }

  async getRefsFingerprint(repoPath: string): Promise<string> {
    return (await executeGit(['for-each-ref', '--format=%(refname)%00%(objectname)', 'refs/heads', 'refs/remotes', 'refs/tags', 'refs/stash'], repoPath)).stdout;
  }

  async getOriginUrl(repoPath: string): Promise<string | undefined> {
    try { return (await executeGit(['remote', 'get-url', 'origin'], repoPath)).stdout.trim() || undefined; }
    catch { return undefined; }
  }

  async getGitHubBinding(repoPath: string) {
    const [remotes, configured] = await Promise.all([this.listRemotes(repoPath), this.getGitHubRemotePreference(repoPath)]);
    if (configured && configured !== 'auto') return remotes.find(item => item.name === configured);
    const origin = remotes.find(item => item.name === 'origin');
    const github = remotes.filter(item => parseGitHubRemote(item.fetchUrl));
    return origin || (github.length === 1 ? github[0] : undefined);
  }

  async getGitHubRemotePreference(repoPath: string): Promise<string> {
    return await this.configValue(repoPath, 'auugit.githubRemote') || 'auto';
  }

  async setGitHubRemote(repoPath: string, remote: string): Promise<void> {
    if (remote !== 'auto') {
      const selected = (await this.listRemotes(repoPath)).find(item => item.name === remote);
      if (!selected || !parseGitHubRemote(selected.fetchUrl)) throw new Error(tNow('remote.invalid'));
    }
    await executeGit(['config', '--local', 'auugit.githubRemote', remote], repoPath);
  }

  async getBranches(repoPath: string): Promise<GitBranch[]> {
    try {
      const [res, worktrees, remotes] = await Promise.all([
        executeGit(['branch', '-a', '-v', '--no-abbrev', '--no-color'], repoPath), this.getWorktrees(repoPath), this.listRemotes(repoPath),
      ]);
      const sortedRemotes = [...remotes].sort((a, b) => b.name.length - a.name.length);
      return parseGitBranches(res.stdout).map(branch => {
        const remote = branch.isRemote ? sortedRemotes.find(item => branch.name.startsWith(`${item.name}/`)) : undefined;
        return {
          ...branch, remoteName: remote?.name, remoteBranch: remote ? branch.name.slice(remote.name.length + 1) : undefined,
          worktreePath: branch.isRemote ? undefined : worktrees.find(tree => tree.branch === `refs/heads/${branch.name}`)?.path,
        };
      });
    } catch {
      return [];
    }
  }

  async getWorktrees(repoPath: string): Promise<GitWorktree[]> {
    return parseWorktrees((await executeGit(['worktree', 'list', '--porcelain', '-z'], repoPath)).stdout);
  }

  async getBranchWorktree(repoPath: string, name: string): Promise<GitWorktree | undefined> {
    const explicitRemote = name.startsWith('refs/remotes/');
    const target = name.trim().replace(/^(?:refs\/)?remotes\//, '');
    const trees = await this.getWorktrees(repoPath);
    const direct = !explicitRemote ? trees.find(tree => tree.branch === `refs/heads/${target}`) : undefined;
    if (direct || trees.length < 2) return direct;
    const hasRef = async (ref: string) => {
      try { await executeGit(['show-ref', '--verify', '--quiet', ref], repoPath); return true; }
      catch (error) { if (error instanceof GitExecutionError && error.exitCode === 1) return false; throw error; }
    };
    if ((explicitRemote || !await hasRef(`refs/heads/${target}`)) && await hasRef(`refs/remotes/${target}`)) {
      const owner = (await this.listRemotes(repoPath)).sort((a, b) => b.name.length - a.name.length).find(item => target.startsWith(`${item.name}/`));
      const localName = target.slice(owner ? owner.name.length + 1 : target.indexOf('/') + 1);
      const upstream = (await executeGit(['for-each-ref', '--format=%(upstream)', `refs/heads/${localName}`], repoPath)).stdout.trim();
      if (await hasRef(`refs/heads/${localName}`) && upstream !== `refs/remotes/${target}`) throw new Error(tNow('remote.checkoutConflict').replace('{branch}', localName).replace('{remote}', target));
      return trees.find(tree => tree.branch === `refs/heads/${localName}`);
    }
    return undefined;
  }

  async createWorktree(repoPath: string, path: string, branch: string, newBranch?: string): Promise<void> {
    if (!path.trim() || /[\0\r\n]/.test(path) || !/^(?:[a-z]:[/\\]|[/\\])/i.test(path)) throw new Error(tNow('worktree.invalidPath'));
    if (!branch || branch.startsWith('-')) throw new Error(tNow('worktree.invalidBranch'));
    await authorizeRepository(path);
    const args = ['worktree', 'add'];
    if (newBranch !== undefined) {
      if (!newBranch || newBranch.startsWith('-')) throw new Error(tNow('worktree.invalidBranch'));
      await executeGit(['check-ref-format', `refs/heads/${newBranch}`], repoPath);
      args.push('-b', newBranch);
    }
    args.push('--', path, branch);
    await executeGit(args, repoPath);
  }

  async getBranchCommitHash(repoPath: string, branchName: string): Promise<string | null> {
    try {
      const res = await executeGit(['rev-parse', '--verify', '--end-of-options', `${branchName}^{commit}`], repoPath);
      const hash = res.stdout.trim();
      return hash || null;
    } catch {
      return null;
    }
  }

  /**
   * Validates that a user supplied revision is a real commit before it is
   * spliced into a write command. `--end-of-options` guarantees the operand is
   * parsed as a revision, so option-shaped input (e.g. `--abort`) can never be
   * smuggled into `revert`, `cherry-pick` or `reset` as a flag.
   */
  private async resolveCommitHash(repoPath: string, revision: string): Promise<string> {
    const trimmed = revision.trim();
    if (!trimmed) throw new Error('Invalid revision');
    const res = await executeGit(['rev-parse', '--verify', '--end-of-options', `${trimmed}^{commit}`], repoPath);
    const hash = res.stdout.trim();
    if (!hash) throw new Error(`Invalid revision: ${trimmed}`);
    return hash;
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

  async getCommits(repoPath: string, limit: number = 50, skip = 0): Promise<GitCommit[]> {
    try {
      const format = '%H%x1f%h%x1f%s%x1f%b%x1f%an%x1f%ae%x1f%aI%x1f%P%x1f%D%x1e';
      const res = await executeGit(
        ['log', '--all', '--topo-order', '-n', String(limit), `--skip=${skip}`, `--format=${format}`],
        repoPath
      );
      return parseGitLog(res.stdout);
    } catch {
      // Empty repository or brand new repo without commits
      return [];
    }
  }

  async findCommits(repoPath: string, query: string, skip = 0): Promise<GitCommit[]> {
    const format = '%H%x1f%h%x1f%s%x1f%b%x1f%an%x1f%ae%x1f%aI%x1f%P%x1f%D%x1e';
    if (/^[0-9a-f]{7,40}$/i.test(query.trim())) {
      try {
        const hash = (await executeGit(['rev-parse', '--verify', '--end-of-options', `${query.trim()}^{commit}`], repoPath)).stdout.trim();
        return skip ? [] : parseGitLog((await executeGit(['show', '-s', `--format=${format}`, hash], repoPath)).stdout);
      } catch { return []; }
    }
    // Git combines author and message filters with AND; combine separate result sets with OR.
    const [messages, authors] = await Promise.all(['--grep', '--author'].map(flag => executeGit(
      ['log', '--all', '--topo-order', '-n', String(skip + 100), '--regexp-ignore-case', '--fixed-strings', `${flag}=${query.trim()}`, `--format=${format}`], repoPath
    )));
    const refs = (await executeGit(['for-each-ref', '--format=%(refname)'], repoPath)).stdout.split(/\r?\n/).filter(ref => ref.toLowerCase().includes(query.trim().toLowerCase())).slice(0, skip + 100);
    const refCommits = refs.length ? parseGitLog((await executeGit(['log', '--no-walk', `--format=${format}`, ...refs, '--'], repoPath)).stdout) : [];
    const unique = new Map<string, GitCommit>();
    [...parseGitLog(messages.stdout), ...parseGitLog(authors.stdout), ...refCommits].forEach(commit => unique.set(commit.hash, commit));
    return [...unique.values()].sort((a, b) => Date.parse(b.author.date) - Date.parse(a.author.date)).slice(skip, skip + 100);
  }

  async getCommitsForBranch(repoPath: string, branchName: string, limit: number = 100): Promise<GitCommit[]> {
    try {
      const format = '%H%x1f%h%x1f%s%x1f%b%x1f%an%x1f%ae%x1f%aI%x1f%P%x1f%D%x1e';
      const res = await executeGit(
        ['log', branchName, `-n`, String(limit), `--format=${format}`],
        repoPath
      );
      return parseGitLog(res.stdout);
    } catch {
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

  async getStashPatch(repoPath: string, index: number): Promise<ParsedDiffLine[]> {
    try {
      const res = await executeGit(
        ['stash', 'show', '-p', '--include-untracked', `stash@{${index}}`],
        repoPath
      );
      return parseDiffOutput(res.stdout);
    } catch (err) {
      console.warn('Stash patch warning:', err);
      return [];
    }
  }

  async revertCommit(repoPath: string, hash: string): Promise<void> {
    await executeGit(['revert', '--no-edit', await this.resolveCommitHash(repoPath, hash)], repoPath);
  }

  async cherryPickCommit(repoPath: string, hash: string): Promise<void> {
    await executeGit(['cherry-pick', await this.resolveCommitHash(repoPath, hash)], repoPath);
  }

  async hardResetCommit(repoPath: string, hash: string): Promise<void> {
    await executeGit(['reset', '--hard', await this.resolveCommitHash(repoPath, hash)], repoPath);
  }

  async softResetCommit(repoPath: string, hash: string): Promise<void> {
    await executeGit(['reset', '--soft', await this.resolveCommitHash(repoPath, hash)], repoPath);
  }

  async stageFile(repoPath: string, filePath: string): Promise<void> {
    await this.stageFiles(repoPath, [filePath]);
  }

  async stageFiles(repoPath: string, filePaths: string[]): Promise<void> {
    if (filePaths.length) await executeGit(['--literal-pathspecs', 'add', '--pathspec-from-file=-', '--pathspec-file-nul'], repoPath, filePaths.join('\0') + '\0');
  }

  async unstageFiles(repoPath: string, filePaths: string[]): Promise<void> {
    if (!filePaths.length) return;
    // Probe and write inside one serialized transaction: a commit queued
    // between the `(initial)` probe and the write must not turn the unstage
    // into `rm --cached`, which would stage deletions of committed files.
    await executeGitTransaction(repoPath, async git => {
      const status = parsePorcelainV2((await git(['status', '--porcelain=v2', '--branch', '-z', '--untracked-files=all'])).stdout);
      const initial = status.headOid === '(initial)';
      await git(initial ? ['--literal-pathspecs', 'rm', '--cached', '--ignore-unmatch', '--pathspec-from-file=-', '--pathspec-file-nul']
        : ['--literal-pathspecs', 'restore', '--staged', '--pathspec-from-file=-', '--pathspec-file-nul'], filePaths.join('\0') + '\0');
    });
  }

  async unstageFile(repoPath: string, filePath: string): Promise<void> {
    await this.unstageFiles(repoPath, [filePath]);
  }

  async stageAll(repoPath: string): Promise<void> {
    await executeGit(['add', '-A'], repoPath);
  }

  async unstageAll(repoPath: string): Promise<void> {
    const status = await this.getStatus(repoPath);
    await this.unstageFiles(repoPath, status.staged.map(file => file.path));
  }

  async discardChanges(repoPath: string, filePath: string): Promise<void> {
    // For tracked modified files, restore. --literal-pathspecs keeps glob
    // metacharacters in repository paths from widening the pathspec.
    try {
      await executeGit(['--literal-pathspecs', 'restore', '--', filePath], repoPath);
    } catch {
      await executeGit(['--literal-pathspecs', 'checkout', '--', filePath], repoPath);
    }
  }

  /**
   * 块级（hunk 级）暂存/取消暂存/放弃。
   * 通过 stdin 传递完整补丁，兼容 worktree，避免临时文件覆盖及并发冲突。
   */
  private async applyHunkPatch(
    repoPath: string,
    patch: string,
    extraArgs: string[]
  ): Promise<void> {
    if (!patch.trim()) {
      throw new Error('Empty hunk patch');
    }
    await executeGit(['apply', '--whitespace=nowarn', ...extraArgs, '-'], repoPath, patch);
  }

  async stageHunk(
    repoPath: string,
    filePath: string,
    hunk: ParsedDiffLine[],
    isUntracked: boolean = false
  ): Promise<void> {
    const patch = buildHunkPatch(filePath, hunk, 'stage', isUntracked);
    await this.applyHunkPatch(repoPath, patch, ['--cached']);
  }

  async unstageHunk(repoPath: string, filePath: string, hunk: ParsedDiffLine[]): Promise<void> {
    const patch = buildHunkPatch(filePath, hunk, 'unstage');
    await this.applyHunkPatch(repoPath, patch, ['--cached', '--reverse']);
  }

  async discardHunk(repoPath: string, filePath: string, hunk: ParsedDiffLine[]): Promise<void> {
    const patch = buildHunkPatch(filePath, hunk, 'discard');
    await this.applyHunkPatch(repoPath, patch, ['--reverse']);
  }

  async commit(repoPath: string, message: string, amend?: boolean): Promise<string> {
    if (!message.trim()) {
      throw new Error(tNow('err.commitEmpty'));
    }
    const args = ['commit', '-m', message];
    if (amend) {
      args.push('--amend');
    }
    const res = await executeGit(args, repoPath);
    return res.stdout;
  }

  private async configValue(repoPath: string, key: string): Promise<string | undefined> {
    try { return (await executeGit(['config', '--get', key], repoPath)).stdout.trim() || undefined; }
    catch (error) { if (error instanceof GitExecutionError && error.exitCode === 1) return undefined; throw error; }
  }

  async getPushContext(repoPath: string, source?: string): Promise<PushContext> {
    const branch = source || (await executeGit(['symbolic-ref', '--quiet', '--short', 'HEAD'], repoPath)).stdout.trim();
    if (!branch || branch === 'HEAD' || branch.startsWith('-')) throw new Error(tNow('remote.detached'));
    await executeGit(['check-ref-format', `refs/heads/${branch}`], repoPath);
    const [remotes, branchRemote, pushRemote, defaultRemote, pushDefault, upstreamResult] = await Promise.all([
      this.listRemotes(repoPath), this.configValue(repoPath, `branch.${branch}.remote`),
      this.configValue(repoPath, `branch.${branch}.pushRemote`), this.configValue(repoPath, 'remote.pushDefault'),
      this.configValue(repoPath, 'push.default'),
      executeGit(['for-each-ref', '--format=%(upstream)%00%(upstream:remoteref)', `refs/heads/${branch}`], repoPath),
    ]);
    const [upstreamRef, upstreamRemoteRef] = upstreamResult.stdout.trim().split('\0');
    const upstream = upstreamRef?.replace(/^refs\/remotes\//, '') || undefined;
    const configured = pushRemote || defaultRemote || branchRemote;
    const remote = configured
      ? remotes.find(item => item.name === configured)?.name
      : remotes.find(item => item.name === 'origin')?.name || (remotes.length === 1 ? remotes[0].name : undefined);
    const targetBranch = remote === branchRemote && pushDefault !== 'current' && upstreamRemoteRef?.startsWith('refs/heads/')
      ? upstreamRemoteRef.slice('refs/heads/'.length) : branch;
    return { branch, remotes, remote, targetBranch, upstream, pushRemote };
  }

  async push(repoPath: string, remote?: string, branch?: string, options?: PushOptions): Promise<PushResult> {
    const context = await this.getPushContext(repoPath, branch);
    const destination = remote || context.remote;
    if (!destination) throw new Error(tNow('remote.choose'));
    await this.requireRemote(repoPath, destination);
    const target = options?.targetBranch || (destination === context.remote ? context.targetBranch : context.branch);
    await executeGit(['check-ref-format', `refs/heads/${target}`], repoPath);
    const args = ['push'];
    if (options?.forceWithLease) args.push('--force-with-lease');
    // Inspect the source branch, and preserve an explicit choice to leave tracking unchanged.
    if ((options?.setUpstream ?? !context.upstream) && context.upstream !== `${destination}/${target}`) args.push('--set-upstream');
    args.push(destination, `refs/heads/${context.branch}:refs/heads/${target}`);
    await executeGit(args, repoPath);
    const preferenceErrors: string[] = [];
    if (options?.unsetUpstream && context.upstream === `${destination}/${target}` && !options.setUpstream) {
      try { await executeGit(['branch', '--unset-upstream', context.branch], repoPath); }
      catch (error) { preferenceErrors.push(error instanceof Error ? error.message : String(error)); }
    }
    if (options?.rememberRemote || (options?.rememberRemote === false && context.pushRemote === destination)) {
      try { await executeGit(options.rememberRemote
        ? ['config', '--local', `branch.${context.branch}.pushRemote`, destination]
        : ['config', '--local', '--unset-all', `branch.${context.branch}.pushRemote`], repoPath); }
      catch (error) { preferenceErrors.push(error instanceof Error ? error.message : String(error)); }
    }
    return preferenceErrors.length ? { preferenceError: preferenceErrors.join('\n') } : {};
  }

  async pull(repoPath: string, rebase?: boolean): Promise<void> {
    await executeGit(rebase ? ['pull', '--rebase'] : ['pull'], repoPath);
  }

  async fetch(repoPath: string, remote?: string, prune = false): Promise<void> {
    if (remote) await this.requireRemote(repoPath, remote);
    await executeGit(['fetch', ...(prune ? ['--prune'] : []), ...(remote ? [remote] : ['--all'])], repoPath);
  }

  private async requireRemote(repoPath: string, remote: string): Promise<void> {
    if (!remote || remote.startsWith('-') || !(await this.listRemotes(repoPath)).some(item => item.name === remote)) {
      throw new Error(tNow('remote.invalid'));
    }
  }

  private async hasRef(repoPath: string, ref: string): Promise<boolean> {
    try { await executeGit(['show-ref', '--verify', '--quiet', ref], repoPath); return true; }
    catch (error) { if (error instanceof GitExecutionError && error.exitCode === 1) return false; throw error; }
  }

  async deleteRemoteBranch(repoPath: string, remote: string, branch: string): Promise<void> {
    await this.requireRemote(repoPath, remote);
    await executeGit(['check-ref-format', `refs/heads/${branch}`], repoPath);
    await executeGit(['push', remote, '--delete', `refs/heads/${branch}`], repoPath);
  }

  async createBranch(repoPath: string, name: string, startPoint?: string): Promise<void> {
    const branch = name.trim();
    // Reject option-shaped names before anything reaches `git branch`: an
    // unvalidated `-D` paired with start point `main` would delete `main`.
    if (!branch || branch.startsWith('-')) throw new Error('Invalid branch name');
    await executeGit(['check-ref-format', '--branch', branch], repoPath);
    const args = ['branch', branch];
    const start = startPoint?.trim();
    if (start) {
      if (start.startsWith('-')) throw new Error('Invalid branch start point');
      // Validate through --end-of-options so option-shaped start points are
      // rejected instead of being parsed as flags by `git branch`.
      const commit = await executeGit(['rev-parse', '--verify', '--end-of-options', `${start}^{commit}`], repoPath);
      if (!commit.stdout.trim()) throw new Error(`Invalid branch start point: ${start}`);
      args.push(start);
    }
    await executeGit(args, repoPath);
  }

  async checkoutBranch(repoPath: string, name: string): Promise<void> {
    const explicitRemote = name.startsWith('refs/remotes/');
    const target = name.trim().replace(/^(?:refs\/)?remotes\//, '');
    if (!target || target.startsWith('-')) throw new Error('Invalid branch name');
    const local = !explicitRemote && await this.hasRef(repoPath, `refs/heads/${target}`);
    const remote = !local && await this.hasRef(repoPath, `refs/remotes/${target}`);
    if (explicitRemote && !remote) throw new Error(tNow('remote.invalid'));
    if (remote) {
      const remotes = await this.listRemotes(repoPath);
      const owner = remotes.sort((a, b) => b.name.length - a.name.length).find(item => target.startsWith(`${item.name}/`));
      const shortName = owner ? target.slice(owner.name.length + 1) : target.slice(target.indexOf('/') + 1);
      const exists = await this.hasRef(repoPath, `refs/heads/${shortName}`);
      if (exists) {
        const upstream = (await executeGit(['for-each-ref', '--format=%(upstream)', `refs/heads/${shortName}`], repoPath)).stdout.trim();
        if (upstream !== `refs/remotes/${target}`) throw new Error(tNow('remote.checkoutConflict').replace('{branch}', shortName).replace('{remote}', target));
      }
      await executeGit(exists ? ['switch', shortName] : ['switch', '--track', '-c', shortName, `refs/remotes/${target}`], repoPath);
    } else {
      await executeGit(['checkout', target], repoPath);
    }
  }

  async deleteBranch(repoPath: string, name: string, force?: boolean): Promise<void> {
    const flag = force ? '-D' : '-d';
    await executeGit(['branch', flag, name], repoPath);
  }

  /** 分支差异：base...head 的文件清单与截断后的 patch 文本（供 PR 描述生成用） */
  async getBranchDiff(
    repoPath: string,
    base: string,
    head: string,
    maxPatchChars: number = 4000
  ): Promise<{ files: GitFileChange[]; patchText: string }> {
    const range = `${base}...${head}`;

    let files: GitFileChange[];
    try {
      const res = await executeGit(['diff', '--name-status', range], repoPath);
      files = res.stdout
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => {
          const parts = line.split(/\t+/);
          const statusCode = parts[0]?.charAt(0) || 'M';
          // For renames (R), use the new path (last column) instead of old path
          const filePath = unquoteGitPath(
            (statusCode === 'R' ? parts[parts.length - 1] : parts[1]) || parts[0]?.slice(1).trim() || ''
          );
          let status: 'modified' | 'added' | 'deleted' | 'renamed' = 'modified';
          if (statusCode === 'A') status = 'added';
          else if (statusCode === 'D') status = 'deleted';
          else if (statusCode === 'R') status = 'renamed';
          return { path: filePath, status, staged: false };
        });
    } catch {
      files = [];
    }

    let patchText: string;
    try {
      const res = await executeGit(['diff', '--no-color', range], repoPath);
      patchText = res.stdout.slice(0, maxPatchChars);
    } catch {
      patchText = '';
    }

    return { files, patchText };
  }

  async getFileDiff(
    repoPath: string,
    filePath: string,
    staged?: boolean,
    isUntracked?: boolean,
    ignoreWhitespace = false
  ): Promise<ParsedDiffLine[]> {
    if (isUntracked) {
      // `/dev/null` is the only safe null device: Git for Windows accepts it
      // directly, while the DOS device `nul` is mangled by Git's path prefix
      // handling when a repository is nested inside another git repository.
      // (The device choice therefore must not depend on navigator probing —
      // userAgent-based platform detection is unreliable under WebView2 anyway.)
      const res = await executeGit(['--literal-pathspecs', 'diff', '--no-index', '--no-color', ...(ignoreWhitespace ? ['-w'] : []), '--', NULL_DEVICE, filePath], repoPath);
      return this.diffCache.parse(JSON.stringify([repoPath, filePath, 'untracked', ignoreWhitespace]), res.stdout);
    }

    const args = ['--literal-pathspecs', 'diff', '--no-color'];
    if (ignoreWhitespace) args.push('-w');
    if (staged) {
      args.push('--staged');
    }
    args.push('--', filePath);

    const res = await executeGit(args, repoPath);
    return this.diffCache.parse(JSON.stringify([repoPath, filePath, !!staged, ignoreWhitespace]), res.stdout);
  }

  async getCommitFiles(repoPath: string, commitHash: string): Promise<GitFileChange[]> {
    const res = await executeGit(
      ['show', '--format=', '--name-status', '--first-parent', '--diff-merges=first-parent', commitHash, '--'],
      repoPath
    );
    const lines = res.stdout.split(/\r?\n/).filter(Boolean);
    return lines.map((line) => {
      const parts = line.split(/\t+/);
      const statusCode = parts[0]?.charAt(0) || 'M';
      // For renames (R), use the new path (last column) instead of old path
      const filePath = unquoteGitPath(
        (statusCode === 'R' ? parts[parts.length - 1] : parts[1]) || parts[0]?.slice(1).trim() || ''
      );
      let status: 'modified' | 'added' | 'deleted' | 'renamed' = 'modified';
      if (statusCode === 'A') status = 'added';
      else if (statusCode === 'D') status = 'deleted';
      else if (statusCode === 'R') status = 'renamed';
      return {
        path: filePath,
        status,
        staged: false,
      };
    });
  }

  async getCommitFileDiff(repoPath: string, commitHash: string, filePath: string, ignoreWhitespace = false): Promise<ParsedDiffLine[]> {
    const res = await executeGit(['show', '--format=', '--no-color', ...(ignoreWhitespace ? ['-w'] : []), '--first-parent', '--diff-merges=first-parent', commitHash, '--', filePath], repoPath);
    return parseDiffOutput(res.stdout);
  }

  // ---- 审查视图:已审查检查点之后的范围查询(base/head 一律为已解析的十六进制提交哈希) ----

  /**
   * 审查范围内的提交(first-parent 链,旧→新)。linear=false 表示含合并提交,
   * 进入历史整理前需提示;truncated 表示提交数达到上限,列表可能不完整。
   */
  async getCommitsInRange(repoPath: string, base: string, head: string, limit = 500): Promise<{ commits: GitCommit[]; linear: boolean; truncated: boolean }> {
    if (!COMMIT_HASH.test(base) || !COMMIT_HASH.test(head)) throw new Error('Invalid review range');
    const format = '%H%x1f%h%x1f%s%x1f%b%x1f%an%x1f%ae%x1f%aI%x1f%P%x1f%D%x1e';
    const res = await executeGit(['log', '--first-parent', '-n', String(limit), `--format=${format}`, `${base}..${head}`, '--'], repoPath);
    const commits = parseGitLog(res.stdout).reverse();
    return {
      commits,
      linear: commits.every((commit) => commit.parents.length === 1),
      truncated: commits.length >= limit,
    };
  }

  /**
   * 审查范围的净差异(两点 diff):文件清单与每文件/总计增删行数。
   * 关闭重命名检测让 name-status 与 numstat 在 -z 模式下都能按路径稳定配对;
   * -z 输出路径不经 C 转义,无需 unquoteGitPath。
   */
  async getRangeDiffSummary(repoPath: string, base: string, head: string): Promise<{ files: GitFileChange[]; insertions: number; deletions: number }> {
    if (!COMMIT_HASH.test(base) || !COMMIT_HASH.test(head)) throw new Error('Invalid review range');
    const [statusRes, numstatRes] = await Promise.all([
      executeGit(['diff', '--no-renames', '--name-status', '-z', base, head, '--'], repoPath),
      executeGit(['diff', '--no-renames', '--numstat', '-z', base, head, '--'], repoPath),
    ]);
    const counts = new Map<string, { insertions: number; deletions: number }>();
    for (const record of numstatRes.stdout.split('\0')) {
      if (!record) continue;
      const [addStr, delStr, path] = record.split('\t');
      if (!path) continue;
      counts.set(path, {
        insertions: addStr === '-' ? 0 : Number(addStr) || 0,
        deletions: delStr === '-' ? 0 : Number(delStr) || 0,
      });
    }
    const fields = statusRes.stdout.split('\0');
    const files: GitFileChange[] = [];
    for (let i = 0; i + 1 < fields.length; i += 2) {
      const statusCode = fields[i]?.charAt(0) || 'M';
      const path = fields[i + 1];
      if (!path) continue;
      let status: 'modified' | 'added' | 'deleted' = 'modified';
      if (statusCode === 'A') status = 'added';
      else if (statusCode === 'D') status = 'deleted';
      files.push({ path, status, staged: false, ...counts.get(path) });
    }
    return {
      files,
      insertions: files.reduce((sum, file) => sum + (file.insertions ?? 0), 0),
      deletions: files.reduce((sum, file) => sum + (file.deletions ?? 0), 0),
    };
  }

  /** 审查范围内单个文件的净差异(两点 diff) */
  async getReviewFileVersions(repoPath: string, base: string, head: string): Promise<Record<string, string>> {
    if (!COMMIT_HASH.test(base) || !COMMIT_HASH.test(head)) throw new Error('Invalid review range');
    const res = await executeGit(['diff', '--no-renames', '--no-ext-diff', '--raw', '--no-abbrev', '-z', base, head, '--'], repoPath);
    const fields = res.stdout.split('\0');
    const versions: Record<string, string> = {};
    for (let index = 0; index + 1 < fields.length; index += 2) {
      const metadata = fields[index];
      if (!/^:\d{6} \d{6} [0-9a-f]{40,64} [0-9a-f]{40,64} [A-Z]$/.test(metadata)) continue;
      const path = fields[index + 1];
      if (path) versions[path] = metadata;
    }
    return versions;
  }

  /** 审查范围内单个文件的净差异(两点 diff) */
  async getRangeFileDiff(repoPath: string, base: string, head: string, filePath: string, ignoreWhitespace = false): Promise<ParsedDiffLine[]> {
    if (!COMMIT_HASH.test(base) || !COMMIT_HASH.test(head)) throw new Error('Invalid review range');
    const args = ['--literal-pathspecs', 'diff', '--no-color', ...(ignoreWhitespace ? ['-w'] : []), base, head, '--', filePath];
    const res = await executeGit(args, repoPath);
    return this.diffCache.parse(JSON.stringify(['range', repoPath, filePath, base, head, ignoreWhitespace]), res.stdout);
  }

  /** 审查范围完整 patch(按字符截断)——供风险扫描与 AI 上下文 */
  async getRangePatch(repoPath: string, base: string, head: string, capChars: number): Promise<string> {
    if (!COMMIT_HASH.test(base) || !COMMIT_HASH.test(head)) throw new Error('Invalid review range');
    const res = await executeGit(['diff', '--no-color', '--no-ext-diff', '--no-textconv', base, head, '--'], repoPath);
    return res.stdout.slice(0, capChars);
  }

  /** base 是否为 head 的祖先或与 head 相等(rev-list --count 判定,免 merge-base 白名单) */
  async isAncestor(repoPath: string, base: string, head: string): Promise<boolean> {
    if (!COMMIT_HASH.test(base) || !COMMIT_HASH.test(head)) throw new Error('Invalid review range');
    const res = await executeGit(['rev-list', '--count', `${head}..${base}`], repoPath);
    return Number(res.stdout.trim()) === 0;
  }

  /** 审查范围内提交数(导航徽标等轻量场景;first-parent 链) */
  async getRangeCommitCount(repoPath: string, base: string, head: string): Promise<number> {
    if (!COMMIT_HASH.test(base) || !COMMIT_HASH.test(head)) throw new Error('Invalid review range');
    const res = await executeGit(['rev-list', '--first-parent', '--count', `${base}..${head}`], repoPath);
    return Number(res.stdout.trim()) || 0;
  }

  async blameFile(repoPath: string, filePath: string): Promise<GitBlameLine[]> {
    try {
      const res = await executeGit(['blame', '--line-porcelain', '--', filePath], repoPath);
      return parseBlamePorcelain(res.stdout);
    } catch (err) {
      // 未跟踪/新文件没有 blame 历史
      console.warn('Blame warning:', err);
      return [];
    }
  }

  async getCommitsForFile(repoPath: string, filePath: string, limit: number = 100): Promise<GitCommit[]> {
    try {
      const format = '%H%x1f%h%x1f%s%x1f%b%x1f%an%x1f%ae%x1f%aI%x1f%P%x1f%D%x1e';
      // --follow 追踪重命名前的历史
      const res = await executeGit(
        ['log', '--follow', `-n`, String(limit), `--format=${format}`, '--', filePath],
        repoPath
      );
      return parseGitLog(res.stdout);
    } catch (err) {
      console.warn('File history warning:', err);
      return [];
    }
  }

  async createTag(
    repoPath: string,
    name: string,
    commitHash?: string,
    message?: string
  ): Promise<void> {
    const tag = name.trim();
    // check-ref-format alone is not enough: it accepts option-shaped
    // components (`refs/tags/--delete=v1.0` is a "valid" ref), so a leading
    // dash must be rejected explicitly to keep `git tag` flag-free.
    if (!tag || tag.startsWith('-')) throw new Error('Invalid tag name');
    await executeGit(['check-ref-format', `refs/tags/${tag}`], repoPath);
    const args = ['tag'];
    if (message) {
      args.push('-a', tag, '-m', message);
    } else {
      args.push(tag);
    }
    if (commitHash?.trim()) {
      args.push(await this.resolveCommitHash(repoPath, commitHash.trim()));
    }
    await executeGit(args, repoPath);
  }

  async deleteTag(repoPath: string, name: string): Promise<void> {
    const tag = name.trim();
    if (!tag || tag.startsWith('-')) throw new Error('Invalid tag name');
    await executeGit(['check-ref-format', `refs/tags/${tag}`], repoPath);
    await executeGit(['tag', '-d', tag], repoPath);
  }

  private async tagRemote(repoPath: string, remote?: string): Promise<string> {
    if (remote) { await this.requireRemote(repoPath, remote); return remote; }
    let branch: string | undefined;
    try { branch = (await executeGit(['symbolic-ref', '--quiet', '--short', 'HEAD'], repoPath)).stdout.trim(); }
    catch (error) { if (!(error instanceof GitExecutionError && error.exitCode === 1)) throw error; }
    const remotes = await this.listRemotes(repoPath);
    const configured = (branch && await this.configValue(repoPath, `branch.${branch}.pushRemote`))
      || await this.configValue(repoPath, 'remote.pushDefault') || (branch && await this.configValue(repoPath, `branch.${branch}.remote`));
    const destination = configured || remotes.find(item => item.name === 'origin')?.name || (remotes.length === 1 ? remotes[0].name : undefined);
    if (!destination) throw new Error(tNow('remote.choose'));
    await this.requireRemote(repoPath, destination);
    return destination;
  }

  async pushTag(repoPath: string, name: string, remote?: string): Promise<void> {
    const destination = await this.tagRemote(repoPath, remote);
    await executeGit(['check-ref-format', `refs/tags/${name}`], repoPath);
    await executeGit(['push', destination, `refs/tags/${name}:refs/tags/${name}`], repoPath);
  }

  async pushAllTags(repoPath: string, remote?: string): Promise<void> {
    await executeGit(['push', await this.tagRemote(repoPath, remote), '--tags'], repoPath);
  }

  async deleteRemoteTag(repoPath: string, name: string, remote?: string): Promise<void> {
    const destination = await this.tagRemote(repoPath, remote);
    await executeGit(['check-ref-format', `refs/tags/${name}`], repoPath);
    await executeGit(['push', destination, '--delete', `refs/tags/${name}`], repoPath);
  }

  async listRemotes(repoPath: string): Promise<{ name: string; fetchUrl: string; pushUrl: string }[]> {
    const res = await executeGit(['remote', '-v'], repoPath);
    const map = new Map<string, { name: string; fetchUrl: string; pushUrl: string }>();
    for (const line of res.stdout.split(/\r?\n/)) {
      const m = line.match(/^(\S+)\t(.+) \((fetch|push)\)$/);
      if (!m) continue;
      const entry = map.get(m[1]) || { name: m[1], fetchUrl: '', pushUrl: '' };
      if (m[3] === 'fetch') entry.fetchUrl ||= m[2];
      else entry.pushUrl = entry.pushUrl ? `${entry.pushUrl}\n${m[2]}` : m[2];
      map.set(m[1], entry);
    }
    return [...map.values()];
  }

  async addRemote(repoPath: string, name: string, url: string): Promise<void> {
    await executeGit(['remote', 'add', name, url], repoPath);
  }

  async removeRemote(repoPath: string, name: string): Promise<void> {
    await executeGit(['remote', 'remove', name], repoPath);
  }

  async setRemoteUrl(repoPath: string, name: string, url: string): Promise<void> {
    await executeGit(['remote', 'set-url', name, url], repoPath);
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
    args.push('--end-of-options', branch);
    const res = await executeGit(args, repoPath);
    return res.stdout || res.stderr;
  }

  async abortMerge(repoPath: string): Promise<void> {
    await executeGit(['merge', '--abort'], repoPath);
  }

  async rebase(repoPath: string, upstream: string): Promise<string> {
    const res = await executeGit(['rebase', '--end-of-options', upstream], repoPath);
    return res.stdout || res.stderr;
  }

  async rebaseContinue(repoPath: string): Promise<void> {
    // 无终端环境下编辑器无法启动，用 core.editor=true 跳过交互式消息编辑
    await executeGit(['-c', 'core.editor=true', 'rebase', '--continue'], repoPath);
  }

  async rebaseAbort(repoPath: string): Promise<void> {
    await executeGit(['rebase', '--abort'], repoPath);
  }

  async cherryPickContinue(repoPath: string): Promise<void> {
    await executeGit(['-c', 'core.editor=true', 'cherry-pick', '--continue'], repoPath);
  }

  async cherryPickAbort(repoPath: string): Promise<void> {
    await executeGit(['cherry-pick', '--abort'], repoPath);
  }

  async undoLastCommit(repoPath: string): Promise<void> {
    // 类似于 GitKraken 的 Undo：安全软重置最新一次提交，保留代码到暂存区
    await executeGit(['reset', '--soft', 'HEAD~1'], repoPath);
  }

  async redoCommit(repoPath: string, commitHash: string, expectedBranch?: string): Promise<void> {
    // Compare-and-swap the original branch ref, preserving both index and worktree.
    // Unlike reset, this cannot move a different branch if an external checkout races with Redo.
    const ref = (await executeGit(['symbolic-ref', '--quiet', 'HEAD'], repoPath)).stdout.trim();
    if (expectedBranch && ref !== `refs/heads/${expectedBranch}`) throw new Error('Branch changed since Undo');
    const current = await this.getBranchCommitHash(repoPath, ref);
    const parent = await this.getBranchCommitHash(repoPath, `${commitHash}^`);
    if (!current || current !== parent) throw new Error('HEAD changed since Undo; Redo is no longer safe');
    await executeGit(['update-ref', '-m', 'AuuGit Redo', ref, commitHash, current], repoPath);
  }

  async openTerminal(repoPath: string): Promise<void> {
    if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
      const { invoke } = await import('@tauri-apps/api/core');
      try { await invoke('open_terminal', { repoPath }); }
      catch (error) { throw error instanceof Error ? error : new Error(String(error)); }
      return;
    }
    throw new Error(tNow('terminal.desktopOnly'));
  }

  async fetchAndCheckoutPR(
    repoPath: string,
    prNumber: number,
    customBranchName?: string
  ): Promise<string> {
    const targetBranch = customBranchName || `pr-${prNumber}`;
    if (!Number.isInteger(prNumber) || prNumber <= 0) throw new Error('Invalid pull request number');
    await executeGit(['check-ref-format', '--branch', targetBranch], repoPath);
    const binding = await this.getGitHubBinding(repoPath);
    if (!binding) throw new Error(tNow('remote.choose'));
    // The fetch and the switch below must not be interleaved with any other
    // queued write (e.g. a poller's `fetch --all` overwriting FETCH_HEAD).
    await executeGitTransaction(repoPath, async git => {
      await git(['fetch', binding.name, `refs/pull/${prNumber}/head`]);
      const exists = await git(['show-ref', '--verify', '--quiet', `refs/heads/${targetBranch}`])
        .then(() => true, () => false);
      if (exists) {
        await git(['switch', targetBranch]);
        // Never force-update a PR branch that may contain the user's unpushed commits.
        await git(['merge', '--ff-only', '--no-edit', 'FETCH_HEAD']);
      } else {
        await git(['switch', '-c', targetBranch, 'FETCH_HEAD']);
      }
    });
    return targetBranch;
  }

  async diagnoseRepository(repoPath: string): Promise<RepoHealthDiagnosis> {
    return diagnoseRepository(repoPath, path => this.getStatus(path));
  }

  async getRepoOperationState(repoPath: string, snapshot?: GitStatusResult): Promise<RepoOperationState> {
    const status = snapshot || await this.getStatus(repoPath);
    const conflictedFiles = status.unstaged.filter((file) => file.status === 'conflicted').map((file) => file.path);
    const type = await probeRepoOperation(repoPath);
    return { type, conflictedFiles, inConflict: conflictedFiles.length > 0,
      isAllResolved: type !== 'none' && conflictedFiles.length === 0 };
  }

  async resolveConflictWithOurs(repoPath: string, filePath: string): Promise<void> {
    // --literal-pathspecs keeps glob metacharacters in the path from widening
    // the pathspec when the conflict resolution is applied.
    await executeGit(['--literal-pathspecs', 'checkout', '--ours', '--', filePath], repoPath);
    await executeGit(['--literal-pathspecs', 'add', '--', filePath], repoPath);
  }

  async resolveConflictWithTheirs(repoPath: string, filePath: string): Promise<void> {
    await executeGit(['--literal-pathspecs', 'checkout', '--theirs', '--', filePath], repoPath);
    await executeGit(['--literal-pathspecs', 'add', '--', filePath], repoPath);
  }

  async resetConflictMarkers(repoPath: string, filePath: string): Promise<void> {
    try {
      await executeGit(['--literal-pathspecs', 'checkout', '--merge', '--', filePath], repoPath);
    } catch {
      await executeGit(['--literal-pathspecs', 'restore', '--staged', '--', filePath], repoPath);
      await executeGit(['--literal-pathspecs', 'checkout', '--merge', '--', filePath], repoPath);
    }
  }

  private validateFilePath(filePath: string): void {
    if (!filePath || /^(?:[/\\]|[a-z]:)/i.test(filePath) || filePath.split(/[/\\]/).some((part) => part === '..' || part === '.git')) {
      throw new Error('Invalid repository file path');
    }
  }

  async readWorkingFile(repoPath: string, filePath: string, allowMissing = false): Promise<string> {
    this.validateFilePath(filePath);
    if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
      const { invoke } = await import('@tauri-apps/api/core');
      try {
        return await invoke<string>('read_file_content', { repoPath, filePath, allowMissing });
      } catch (error) {
        throw normalizeInvokeError(error, `Unable to read ${filePath}`);
      }
    }
    const res = await fetch('/api/fs/read-file', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-AuuGit-Request': '1' },
      body: JSON.stringify({ repoPath, filePath, allowMissing }),
    });
    if (!res.ok) throw new Error(`Unable to read ${filePath} (HTTP ${res.status})`);
    const data = await res.json();
    if (typeof data.content !== 'string') throw new Error(`Invalid file response: ${filePath}`);
    return data.content;
  }

  async writeWorkingFile(repoPath: string, filePath: string, content: string, expectedContent?: string): Promise<void> {
    this.validateFilePath(filePath);
    if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
      const { invoke } = await import('@tauri-apps/api/core');
      try {
        await invoke('write_file_content', { repoPath, filePath, content, expectedContent });
      } catch (error) {
        throw normalizeInvokeError(error, `Unable to write ${filePath}`);
      }
      return;
    }
    const res = await fetch('/api/fs/write-file', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-AuuGit-Request': '1' },
      body: JSON.stringify({ repoPath, filePath, content, expectedContent }),
    });
    if (!res.ok) throw new Error(`Unable to write ${filePath}: ${await res.text()}`);
  }
}

export const gitService = new GitService();
