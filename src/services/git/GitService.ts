import {
  GitBlameLine,
  GitBranch,
  GitCommit,
  GitFileChange,
  GitStatusResult,
  GitStash,
  GitTag,
  IGitService,
  RepositoryInfo,
  RepoHealthDiagnosis,
  HealthIssue,
  RepoOperationState,
} from './types';
import { executeGit } from './GitExecutor';
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

export class GitService implements IGitService {
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
    // 克隆目标是绝对路径，工作目录使用当前目录即可（浏览器环境没有 process 对象）
    await executeGit(args, '.');
  }

  async getStatus(repoPath: string): Promise<GitStatusResult> {
    const res = await executeGit(['status', '--porcelain=v2', '--branch'], repoPath);
    return parsePorcelainV2(res.stdout);
  }

  async getBranches(repoPath: string): Promise<GitBranch[]> {
    try {
      const res = await executeGit(['branch', '-a', '-v', '--no-abbrev', '--no-color'], repoPath);
      return parseGitBranches(res.stdout);
    } catch {
      return [];
    }
  }

  async getBranchCommitHash(repoPath: string, branchName: string): Promise<string | null> {
    try {
      const res = await executeGit(['rev-parse', branchName], repoPath);
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

  async getCommits(repoPath: string, limit: number = 50): Promise<GitCommit[]> {
    try {
      const format = '%H%x1f%h%x1f%s%x1f%b%x1f%an%x1f%ae%x1f%aI%x1f%P%x1f%D%x1e';
      const res = await executeGit(
        ['log', '--all', `-n`, String(limit), `--format=${format}`],
        repoPath
      );
      return parseGitLog(res.stdout);
    } catch {
      // Empty repository or brand new repo without commits
      return [];
    }
  }

  async getCommitsForBranch(repoPath: string, branchName: string, limit: number = 100): Promise<GitCommit[]> {
    try {
      const format = '%H%x1f%h%x1f%s%x1f%b%x1f%an%x1f%ae%x1f%aI%x1f%P%x1f%D%x1e';
      const res = await executeGit(
        ['log', '--all', branchName, `-n`, String(limit), `--format=${format}`],
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

  /**
   * 块级（hunk 级）暂存/取消暂存/放弃。
   * executeGit 不支持 stdin，将重建的 patch 写入 .git 内临时文件再 git apply，
   * 桌面端（Tauri write_file_content）与浏览器开发模式（/api/fs/write-file）通用。
   */
  private async applyHunkPatch(
    repoPath: string,
    patch: string,
    extraArgs: string[]
  ): Promise<void> {
    if (!patch.trim()) {
      throw new Error('Empty hunk patch');
    }
    const patchPath = '.git/auu_hunk_stage.patch';
    await this.writeWorkingFile(repoPath, patchPath, patch);
    await executeGit(['apply', '--whitespace=nowarn', ...extraArgs, patchPath], repoPath);
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
      throw new Error('提交信息 (Commit Message) 不能为空');
    }
    const args = ['commit', '-m', message];
    if (amend) {
      args.push('--amend');
    }
    const res = await executeGit(args, repoPath);
    return res.stdout;
  }

  async push(
    repoPath: string,
    remote: string = 'origin',
    branch?: string,
    options?: { setUpstream?: boolean; forceWithLease?: boolean }
  ): Promise<void> {
    const args = ['push'];
    if (options?.forceWithLease) {
      // 只在远程引用未被他人在此期间更新时覆盖，比裸 --force 安全
      args.push('--force-with-lease');
    }

    // 分支没有上游时自动补 -u：首推即可建立跟踪关系，后续 pull/状态对比不再失效。
    // 注意 `git push -u origin` 缺省 refspec 时仍会因无上游而失败，必须显式带上分支名
    let setUpstream = options?.setUpstream ?? false;
    let refspec = branch;
    if (!setUpstream) {
      try {
        await executeGit(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'], repoPath);
      } catch {
        setUpstream = true;
      }
    }
    if (setUpstream && !refspec) {
      try {
        const headRes = await executeGit(['rev-parse', '--abbrev-ref', 'HEAD'], repoPath);
        const head = headRes.stdout.trim();
        if (head && head !== 'HEAD') {
          refspec = head;
        } else {
          setUpstream = false; // 游离 HEAD 无法建立上游
        }
      } catch {
        setUpstream = false;
      }
    }
    if (setUpstream) {
      args.push('-u');
    }

    args.push(remote);
    if (refspec) {
      args.push(refspec);
    }
    await executeGit(args, repoPath);
  }

  async pull(repoPath: string, rebase?: boolean): Promise<void> {
    await executeGit(rebase ? ['pull', '--rebase'] : ['pull'], repoPath);
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
    const target = await this.resolveCheckoutTarget(repoPath, name);
    await executeGit(['checkout', target], repoPath);
  }

  /**
   * 将分支引用名解析为可安全检出的目标，避免检出远程跟踪分支时进入 detached HEAD：
   * - `remotes/origin/foo` 先归一化为 `origin/foo`
   * - 存在同名本地分支 → 直接检出
   * - 不存在本地分支但存在远程跟踪分支 `origin/foo` → 检出短名 `foo`，
   *   触发 git DWIM 自动创建跟踪本地分支
   * - 标签等其他引用保持原样（detached 行为由调用方提示）
   */
  private async resolveCheckoutTarget(repoPath: string, name: string): Promise<string> {
    const target = name.trim().replace(/^remotes\//, '');
    if (!target) return name;

    try {
      await executeGit(['show-ref', '--verify', '--quiet', `refs/heads/${target}`], repoPath);
      return target;
    } catch {
      // 本地分支不存在，继续判断是否为远程跟踪分支
    }

    const slashIdx = target.indexOf('/');
    if (slashIdx > 0) {
      const shortName = target.slice(slashIdx + 1);
      if (shortName && !shortName.includes('/')) {
        try {
          await executeGit(['show-ref', '--verify', '--quiet', `refs/remotes/${target}`], repoPath);
          return shortName;
        } catch {
          // 不是远程跟踪分支（可能是标签），保持原名
        }
      }
    }
    return target;
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

  async getCommitFiles(repoPath: string, commitHash: string): Promise<GitFileChange[]> {
    try {
      const res = await executeGit(
        ['diff-tree', '--no-commit-id', '--name-status', '-r', commitHash],
        repoPath
      );
      const lines = res.stdout.split(/\r?\n/).filter(Boolean);
      return lines.map((line) => {
        const parts = line.split(/\t+/);
        const statusCode = parts[0]?.charAt(0) || 'M';
        const filePath = unquoteGitPath(parts[1] || parts[0]?.slice(1).trim() || '');
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
      console.warn('Get commit files warning:', err);
      return [];
    }
  }

  async getCommitFileDiff(repoPath: string, commitHash: string, filePath: string): Promise<ParsedDiffLine[]> {
    try {
      const res = await executeGit(['show', '--no-color', `${commitHash}`, '--', filePath], repoPath);
      return parseDiffOutput(res.stdout);
    } catch (err) {
      console.warn('Get commit file diff warning:', err);
      return [];
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

  async redoCommit(repoPath: string, commitHash: string): Promise<void> {
    // 将 HEAD 和工作区恢复到指定的提交哈希（Redo）
    await executeGit(['reset', '--hard', commitHash], repoPath);
  }

  async openTerminal(repoPath: string): Promise<void> {
    try {
      // 优先尝试 Tauri Shell 唤起 Windows PowerShell
      const { Command } = await import('@tauri-apps/plugin-shell');
      const cmd = Command.create('powershell', ['-NoExit', '-Command', `Set-Location -Path '${repoPath}'`]);
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
    try {
      // 1. Fetch the pull request head commit from remote origin
      await executeGit(
        ['fetch', 'origin', `pull/${prNumber}/head:${targetBranch}`, '--force'],
        repoPath
      );
    } catch (fetchErr: any) {
      // Try fallback to refs/pull/
      try {
        await executeGit(
          ['fetch', 'origin', `refs/pull/${prNumber}/head:${targetBranch}`, '--force'],
          repoPath
        );
      } catch {
        throw new Error(
          `从远程拉取 PR #${prNumber} 失败: 请确认存在有效远程仓库与网络连接 (${fetchErr.message})`
        );
      }
    }

    // 2. Checkout to the local branch
    await executeGit(['checkout', targetBranch], repoPath);
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
          title: `存在 ${conflictLines.length} 处未解决的代码冲突`,
          description: `检测到 ${conflictLines.map((l) => l.slice(3)).slice(0, 3).join(', ')}${conflictLines.length > 3 ? ' 等' : ''} 文件包含 Git 冲突标记。`,
          actionHint: '请在工作区解决冲突标记后执行 git add 标记已解决。',
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
          title: '当前处于变基 (Rebase) 进行中状态',
          description: '有未完成的变基流程，等待解决冲突后 continue 或执行 abort 中止。',
          actionHint: '使用顶部菜单执行 Rebase Continue 或 Rebase Abort。',
        });
      } else if (statusText.stdout.includes('You have unmerged paths') || statusText.stdout.includes('All conflicts fixed but you are still merging')) {
        score -= 30;
        issues.push({
          type: 'in_progress',
          level: 'error',
          title: '当前处于分支合并 (Merge) 中间状态',
          description: '合并流程尚未通过提交收尾。',
          actionHint: '提交代码完成合并，或执行 Merge Abort 还原。',
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
          title: '游离头指针状态 (Detached HEAD)',
          description: '当前未处于任何具名分支上，在此状态下的新提交可能在切分支后成为孤立悬空提交。',
          actionHint: '建议通过新建分支 (Branch) 保存当前提交进度。',
        });
      }

      // 4. Check Ahead / Behind
      if (status.behind > 0) {
        score -= 10;
        issues.push({
          type: 'behind',
          level: 'warning',
          title: `本地分支落后远程 ${status.behind} 个提交`,
          description: '远端存在新的团队提交尚未同步至本地。',
          actionHint: '建议点击顶部工具栏的 Pull 按钮拉取最新更新。',
        });
      }

      if (status.ahead > 0) {
        score -= 5;
        issues.push({
          type: 'unpushed',
          level: 'info',
          title: `本地有 ${status.ahead} 个已提交但未推送的改动`,
          description: '这些提交仅保存在本地工作区，远端协作者暂不可见。',
          actionHint: '可使用顶部工具栏的 Push 按钮推送到远端仓库。',
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
          title: `发现 ${unpushedBranches.length} 个本地专有分支`,
          description: '这些分支未配置上游追踪，如不再需要可清理分支保持整洁。',
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
        title: '仓库状态极佳，无潜在异常',
        description: '无未决代码冲突、无中间态悬空提交，分支同步状态健康。',
      });
    }

    const summary =
      status === 'healthy'
        ? '本地仓库整体结构健康，无阻塞性代码风险。'
        : status === 'warning'
        ? '检测到部分建议处理的事项（如落后提交或游离 HEAD）。'
        : '检测到高风险异常（如冲突未解决或中途中断），建议优先处理。';

    return {
      score,
      status,
      issues,
      summary,
    };
  }

  async getRepoOperationState(repoPath: string): Promise<RepoOperationState> {
    try {
      const [statusTextRes, statusPorcelainRes] = await Promise.all([
        executeGit(['status'], repoPath).catch(() => ({ stdout: '', stderr: '', exitCode: 0 })),
        executeGit(['status', '--porcelain'], repoPath).catch(() => ({ stdout: '', stderr: '', exitCode: 0 })),
      ]);

      const statusText = statusTextRes.stdout;
      const conflictLines = statusPorcelainRes.stdout
        .split(/\r?\n/)
        .filter((l) => /^(UU|AA|DD|DU|UD|AU|UA)/.test(l.trim()));

      const conflictedFiles = conflictLines.map((l) => l.slice(3).trim()).filter(Boolean);

      const isRebasing =
        statusText.includes('rebase in progress') ||
        statusText.includes('You are currently rebasing');
      const isCherryPicking =
        statusText.includes('You are currently cherry-picking');
      const isMerging =
        statusText.includes('You have unmerged paths') ||
        statusText.includes('All conflicts fixed but you are still merging');

      // 顺序很重要：cherry-pick/rebase 冲突时 status 同样包含 unmerged paths，
      // 必须先匹配更具体的操作类型，否则会被误判为 merge
      let type: 'none' | 'merge' | 'rebase' | 'cherry-pick' = 'none';
      if (isRebasing) type = 'rebase';
      else if (isCherryPicking) type = 'cherry-pick';
      else if (isMerging) type = 'merge';
      else if (conflictedFiles.length > 0) type = 'merge';

      const inConflict = conflictedFiles.length > 0 || isRebasing || isMerging;
      const isAllResolved = (isRebasing || isMerging) && conflictedFiles.length === 0;

      return {
        type,
        inConflict,
        conflictedFiles,
        isAllResolved,
      };
    } catch {
      return {
        type: 'none',
        inConflict: false,
        conflictedFiles: [],
        isAllResolved: false,
      };
    }
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

  async readWorkingFile(repoPath: string, filePath: string): Promise<string> {
    const fullPath = repoPath.replace(/\\/g, '/') + '/' + filePath.replace(/^\.?\//, '');
    const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

    // 1. Tauri 桌面原生模式
    if (isTauri) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        return await invoke<string>('read_file_content', { path: fullPath });
      } catch (err: any) {
        console.warn('Tauri 读取文件降级:', err);
      }
    }

    // 2. 本地开发服务器 (Dev 模式)
    try {
      const res = await fetch('/api/fs/read-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: fullPath }),
      });
      const text = await res.text();
      if (!text.trim().startsWith('<')) {
        const data = JSON.parse(text);
        if (data.content !== undefined) return data.content;
      }
    } catch {
      // ignore
    }

    // 3. Fallback: Git hash-object + cat-file
    try {
      const hashRes = await executeGit(['hash-object', filePath], repoPath);
      const hash = hashRes.stdout.trim();
      if (hash) {
        const catRes = await executeGit(['cat-file', '-p', hash], repoPath);
        return catRes.stdout;
      }
    } catch (err: any) {
      console.warn('读取工作区文件失败:', err);
    }
    return '';
  }

  async writeWorkingFile(repoPath: string, filePath: string, content: string): Promise<void> {
    const fullPath = repoPath.replace(/\\/g, '/') + '/' + filePath.replace(/^\.?\//, '');
    const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

    // 1. Tauri 桌面原生模式
    if (isTauri) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('write_file_content', { path: fullPath, content });
        return;
      } catch (err: any) {
        console.warn('Tauri 写入文件降级:', err);
      }
    }

    // 2. 本地开发服务器 (Dev 模式)
    try {
      const res = await fetch('/api/fs/write-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: fullPath, content }),
      });
      if (res.ok) {
        return;
      }
    } catch {
      // ignore, fallback
    }

    throw new Error(`无法写入文件 ${filePath}`);
  }
}

export const gitService = new GitService();

