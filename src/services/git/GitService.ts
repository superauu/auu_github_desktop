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
  HealthIssue,
  RepoOperationState,
} from './types';
import { executeGit, GitExecutionError } from './GitExecutor';
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
    // Validate repository by running git rev-parse
    await executeGit(['rev-parse', '--git-dir'], normalizedPath);

    const status = snapshot || await this.getStatus(normalizedPath);
    const name = normalizedPath.split(/[/\\]/).filter(Boolean).pop() || 'repository';

    const binding = await this.getGitHubBinding(normalizedPath);
    const remoteUrl = binding?.fetchUrl;
    const identity = remoteUrl ? parseGitHubRemote(remoteUrl) : undefined;

    return {
      id: String(Date.now()),
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
    await executeGit(['init', '-b', 'main'], normalizedPath);
  }

  async cloneRepository(url: string, targetPath: string, branch?: string): Promise<void> {
    const normalizedTarget = targetPath.trim().replace(/\\/g, '/');
    const args = ['clone'];
    if (branch) {
      args.push('-b', branch);
    }
    args.push(url.trim(), normalizedTarget);
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
    await executeGit(['revert', '--no-edit', hash], repoPath);
  }

  async cherryPickCommit(repoPath: string, hash: string): Promise<void> {
    await executeGit(['cherry-pick', hash], repoPath);
  }

  async hardResetCommit(repoPath: string, hash: string): Promise<void> {
    await executeGit(['reset', '--hard', hash], repoPath);
  }

  async softResetCommit(repoPath: string, hash: string): Promise<void> {
    await executeGit(['reset', '--soft', hash], repoPath);
  }

  async stageFile(repoPath: string, filePath: string): Promise<void> {
    await this.stageFiles(repoPath, [filePath]);
  }

  async stageFiles(repoPath: string, filePaths: string[]): Promise<void> {
    if (filePaths.length) await executeGit(['--literal-pathspecs', 'add', '--pathspec-from-file=-', '--pathspec-file-nul'], repoPath, filePaths.join('\0') + '\0');
  }

  async unstageFiles(repoPath: string, filePaths: string[]): Promise<void> {
    if (!filePaths.length) return;
    const initial = (await this.getStatus(repoPath)).headOid === '(initial)';
    await executeGit(initial ? ['--literal-pathspecs', 'rm', '--cached', '--ignore-unmatch', '--pathspec-from-file=-', '--pathspec-file-nul']
      : ['--literal-pathspecs', 'restore', '--staged', '--pathspec-from-file=-', '--pathspec-file-nul'], repoPath, filePaths.join('\0') + '\0');
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
    // For tracked modified files, restore
    try {
      await executeGit(['restore', '--', filePath], repoPath);
    } catch {
      await executeGit(['checkout', '--', filePath], repoPath);
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
    const args = ['branch', name];
    if (startPoint) {
      args.push(startPoint);
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

    let files: GitFileChange[] = [];
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

    let patchText = '';
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
    try {
      if (isUntracked) {
        const nullDev = navigator.userAgent.includes('Windows') ? 'nul' : '/dev/null';
        const res = await executeGit(['diff', '--no-index', '--no-color', ...(ignoreWhitespace ? ['-w'] : []), '--', nullDev, filePath], repoPath);
        return this.diffCache.parse(JSON.stringify([repoPath, filePath, 'untracked', ignoreWhitespace]), res.stdout);
      }

      const args = ['diff', '--no-color'];
      if (ignoreWhitespace) args.push('-w');
      if (staged) {
        args.push('--staged');
      }
      args.push('--', filePath);

      const res = await executeGit(args, repoPath);
      return this.diffCache.parse(JSON.stringify([repoPath, filePath, !!staged, ignoreWhitespace]), res.stdout);
    } catch (err: any) {
      throw err;
    }
  }

  async getCommitFiles(repoPath: string, commitHash: string): Promise<GitFileChange[]> {
    try {
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
    } catch (err) {
      throw err;
    }
  }

  async getCommitFileDiff(repoPath: string, commitHash: string, filePath: string, ignoreWhitespace = false): Promise<ParsedDiffLine[]> {
    try {
      const res = await executeGit(['show', '--format=', '--no-color', ...(ignoreWhitespace ? ['-w'] : []), '--first-parent', '--diff-merges=first-parent', commitHash, '--', filePath], repoPath);
      return parseDiffOutput(res.stdout);
    } catch (err) {
      throw err;
    }
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
    try {
      // 优先尝试 Tauri Shell 唤起 Windows PowerShell
      const { Command } = await import('@tauri-apps/plugin-shell');
      // Escape single quotes for PowerShell by doubling them
      const safePath = repoPath.replace(/'/g, "''");
      const cmd = Command.create('powershell', ['-NoExit', '-Command', `Set-Location -Path '${safePath}'`]);
      await cmd.spawn();
    } catch {
      // 在纯网页/Dev模式下降级复制路径并提示
      navigator.clipboard.writeText(repoPath);
    }
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
    await executeGit(['fetch', binding.name, `refs/pull/${prNumber}/head`], repoPath);
    const exists = await executeGit(['show-ref', '--verify', '--quiet', `refs/heads/${targetBranch}`], repoPath)
      .then(() => true, () => false);
    if (exists) {
      await executeGit(['switch', targetBranch], repoPath);
      // Never force-update a PR branch that may contain the user's unpushed commits.
      await executeGit(['merge', '--ff-only', '--no-edit', 'FETCH_HEAD'], repoPath);
    } else {
      await executeGit(['switch', '-c', targetBranch, 'FETCH_HEAD'], repoPath);
    }
    return targetBranch;
  }

  async diagnoseRepository(repoPath: string): Promise<RepoHealthDiagnosis> {
    const issues: HealthIssue[] = [];
    let score = 100;

    // 1. Check working tree conflicts
    try {
      const statusRes = await executeGit(['status', '--porcelain'], repoPath);
      const conflictLines = statusRes.stdout
        .split(/\r?\n/)
        .filter((l) => /^(UU|AA|DD|DU|UD|AU|UA)/.test(l.trim()));

      if (conflictLines.length > 0) {
        score -= 40;
        issues.push({
          type: 'conflict',
          level: 'error',
          title: tNow('diag.issue.conflictTitle').replace('{n}', String(conflictLines.length)),
          description: tNow('diag.issue.conflictDesc').replace(
            '{files}',
            `${conflictLines.map((l) => l.slice(3)).slice(0, 3).join(', ')}${conflictLines.length > 3 ? '…' : ''}`
          ),
          actionHint: tNow('diag.issue.conflictHint'),
        });
      }
    } catch {
      // ignore
    }

    // 2. Check in-progress operations (Merge, Rebase, Cherry-pick)
    try {
      const statusText = await executeGit(['status'], repoPath);

      if (statusText.stdout.includes('rebase in progress') || statusText.stdout.includes('You are currently rebasing')) {
        score -= 30;
        issues.push({
          type: 'in_progress',
          level: 'error',
          title: tNow('diag.issue.rebaseTitle'),
          description: tNow('diag.issue.rebaseDesc'),
          actionHint: tNow('diag.issue.rebaseHint'),
        });
      } else if (statusText.stdout.includes('You have unmerged paths') || statusText.stdout.includes('All conflicts fixed but you are still merging')) {
        score -= 30;
        issues.push({
          type: 'in_progress',
          level: 'error',
          title: tNow('diag.issue.mergeTitle'),
          description: tNow('diag.issue.mergeDesc'),
          actionHint: tNow('diag.issue.mergeHint'),
        });
      }
    } catch {
      // ignore
    }

    // 3. Check detached HEAD
    try {
      const status = await this.getStatus(repoPath);
      if (!status.currentBranch || status.currentBranch === 'HEAD' || status.currentBranch.includes('detached')) {
        score -= 15;
        issues.push({
          type: 'detached',
          level: 'warning',
          title: tNow('diag.issue.detachedTitle'),
          description: tNow('diag.issue.detachedDesc'),
          actionHint: tNow('diag.issue.detachedHint'),
        });
      }

      // 4. Check Ahead / Behind
      if (status.behind > 0) {
        score -= 10;
        issues.push({
          type: 'behind',
          level: 'warning',
          title: tNow('diag.issue.behindTitle').replace('{n}', String(status.behind)),
          description: tNow('diag.issue.behindDesc'),
          actionHint: tNow('diag.issue.behindHint'),
        });
      }

      if (status.ahead > 0) {
        score -= 5;
        issues.push({
          type: 'unpushed',
          level: 'info',
          title: tNow('diag.issue.unpushedTitle').replace('{n}', String(status.ahead)),
          description: tNow('diag.issue.unpushedDesc'),
          actionHint: tNow('diag.issue.unpushedHint'),
        });
      }
    } catch {
      // ignore
    }

    // 5. Check branches without remote upstream
    try {
      const branchRes = await executeGit(['branch', '-vv'], repoPath);
      const unpushedBranches = branchRes.stdout
        .split(/\r?\n/)
        .filter((l) => l.trim() && !l.includes('[origin/') && !l.includes('->'));

      if (unpushedBranches.length > 2) {
        issues.push({
          type: 'clean',
          level: 'info',
          title: tNow('diag.issue.localOnlyTitle').replace('{n}', String(unpushedBranches.length)),
          description: tNow('diag.issue.localOnlyDesc'),
        });
      }
    } catch {
      // ignore
    }

    score = Math.max(0, Math.min(100, score));
    const status: 'healthy' | 'warning' | 'danger' =
      score >= 85 ? 'healthy' : score >= 60 ? 'warning' : 'danger';

    if (issues.length === 0) {
      issues.push({
        type: 'clean',
        level: 'success',
        title: tNow('diag.issue.cleanTitle'),
        description: tNow('diag.issue.cleanDesc'),
      });
    }

    const summary =
      status === 'healthy'
        ? tNow('diag.summary.healthy')
        : status === 'warning'
        ? tNow('diag.summary.warning')
        : tNow('diag.summary.danger');

    return {
      score,
      status,
      issues,
      summary,
    };
  }

  async getRepoOperationState(repoPath: string, snapshot?: GitStatusResult): Promise<RepoOperationState> {
    const status = snapshot || await this.getStatus(repoPath);
    const conflictedFiles = status.unstaged.filter((file) => file.status === 'conflicted').map((file) => file.path);
    // Git's path resolver supports linked worktrees and does not depend on localized status prose.
    const names = ['rebase-merge', 'rebase-apply', 'CHERRY_PICK_HEAD', 'MERGE_HEAD'];
    const resolved = (await executeGit(['rev-parse', '--path-format=absolute', ...names.flatMap(name => ['--git-path', name])], repoPath)).stdout.trimEnd().split(/\r?\n/);
    const exists = async (name: string) => {
      const path = resolved[names.indexOf(name)];
      if (!path) throw new Error('Unable to resolve Git operation paths');
      const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
      if (isTauri) {
        const { invoke } = await import('@tauri-apps/api/core');
        return invoke<boolean>('path_exists', { path });
      }
      const res = await fetch('/api/fs/exists', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-AuuGit-Request': '1' },
        body: JSON.stringify({ path, cwd: repoPath }),
      });
      if (!res.ok) throw new Error('Unable to read repository operation state');
      return (await res.json()).exists as boolean;
    };
    const [rebasing, cherryPicking, merging] = await Promise.all([
      Promise.all([exists('rebase-merge'), exists('rebase-apply')]).then((states) => states.some(Boolean)),
      exists('CHERRY_PICK_HEAD'), exists('MERGE_HEAD'),
    ]);
    const type = rebasing ? 'rebase' : cherryPicking ? 'cherry-pick' : merging ? 'merge' : 'none';
    return { type, conflictedFiles, inConflict: conflictedFiles.length > 0,
      isAllResolved: type !== 'none' && conflictedFiles.length === 0 };
  }

  async resolveConflictWithOurs(repoPath: string, filePath: string): Promise<void> {
    await executeGit(['checkout', '--ours', '--', filePath], repoPath);
    await executeGit(['add', '--', filePath], repoPath);
  }

  async resolveConflictWithTheirs(repoPath: string, filePath: string): Promise<void> {
    await executeGit(['checkout', '--theirs', '--', filePath], repoPath);
    await executeGit(['add', '--', filePath], repoPath);
  }

  async resetConflictMarkers(repoPath: string, filePath: string): Promise<void> {
    try {
      await executeGit(['checkout', '--merge', '--', filePath], repoPath);
    } catch {
      await executeGit(['restore', '--staged', '--', filePath], repoPath);
      await executeGit(['checkout', '--merge', '--', filePath], repoPath);
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
      return invoke<string>('read_file_content', { repoPath, filePath, allowMissing });
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
      await invoke('write_file_content', { repoPath, filePath, content, expectedContent });
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
