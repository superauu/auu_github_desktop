import { executeGit, GitExecutionError } from './GitExecutor';
import { tNow } from '@/i18n';

/**
 * 子模块管理服务层。所有命令直连 executeGit（白名单只放行 status/add/update/
 * init/deinit/sync 及各自的选项子集；foreach/absorbgitdirs/summary/set-url 在
 * git_policy 纯层被拒，这里天然无法执行任意命令）。
 *
 * 状态读取用 `git submodule status` 的机器格式：每行 `<前缀><sha> <path> (<describe>)`，
 * 前缀字符是状态（空格=已初始化、`-`=未初始化、`+`=检出与登记 sha 不一致、`U`=冲突）。
 */
export type SubmoduleStatusKind = 'initialized' | 'uninitialized' | 'modified' | 'conflict';

export interface SubmoduleEntry {
  status: SubmoduleStatusKind;
  sha: string;
  path: string;
  describe: string;
}

/** 解析 `git submodule status` 输出。空行跳过；缺 sha 的垃圾行抛错（fail closed）。 */
export function parseSubmoduleStatus(stdout: string): SubmoduleEntry[] {
  const entries: SubmoduleEntry[] = [];
  for (const raw of stdout.split(/\r?\n/)) {
    // 行首的前缀字符（空格/-/+/U）就是状态：不能整体 trim，只去行尾空白。
    const line = raw.replace(/\s+$/, '');
    if (!line) continue;
    const match = /^([-+U ])([0-9a-f]{7,40})\s+(\S+)(?:\s+\((.+)\))?$/.exec(line);
    if (!match) throw new Error(tNow('submodules.loadFailed'));
    const [, prefix, sha, path, describe] = match;
    const status: SubmoduleStatusKind =
      prefix === '-' ? 'uninitialized'
      : prefix === '+' ? 'modified'
      : prefix === 'U' ? 'conflict'
      : 'initialized';
    entries.push({ status, sha, path, describe: describe ?? '' });
  }
  return entries;
}

export interface AddSubmoduleInput {
  /** 仓库地址：远程 URL 或已授权的本地路径。 */
  url: string;
  /** 子模块在父仓库内的相对路径。 */
  path: string;
  /** 可选：跟踪分支。 */
  branch?: string;
}

class SubmoduleService {
  /** 当前子模块列表（空输出 = 无子模块）。 */
  async list(repoPath: string): Promise<SubmoduleEntry[]> {
    const res = await executeGit(['submodule', 'status'], repoPath);
    return parseSubmoduleStatus(res.stdout);
  }

  /**
   * 添加子模块。本地路径源与 clone 源同构：策略层与授权根共同约束（未授权目录
   * 会被拒绝）；branch 缺省时使用子模块默认分支。
   */
  async add(repoPath: string, input: AddSubmoduleInput): Promise<void> {
    const url = input.url.trim();
    const path = input.path.trim().replace(/\\/g, '/');
    const branch = input.branch?.trim();
    if (!url || !path) throw new Error(tNow('submodules.addMissing'));
    if (path.startsWith('-') || path.startsWith('/') || path.includes('..')) {
      throw new Error(tNow('submodules.addMissing'));
    }
    const args = ['submodule', 'add'];
    if (branch) args.push('-b', branch);
    args.push('--', url, path);
    await executeGit(args, repoPath);
  }

  /** 初始化并更新（递归拉齐全部子模块到登记的提交）。 */
  async updateInit(repoPath: string): Promise<void> {
    await executeGit(['submodule', 'update', '--init', '--recursive'], repoPath);
  }

  /** 取消初始化单个子模块（工作区内容移除，.gitmodules 登记保留）。 */
  async deinit(repoPath: string, submodulePath: string): Promise<void> {
    await executeGit(['submodule', 'deinit', '-f', '--', submodulePath], repoPath);
  }

  /** 同步 .gitmodules 里的远程地址到各子模块配置（源地址变更后使用）。 */
  async sync(repoPath: string): Promise<void> {
    await executeGit(['submodule', 'sync', '--recursive'], repoPath);
  }

  /** 是否存在子模块（轻量探测，供其他视图判断入口是否有内容）。 */
  async hasSubmodules(repoPath: string): Promise<boolean> {
    try {
      return (await this.list(repoPath)).length > 0;
    } catch (error) {
      if (error instanceof GitExecutionError) return false;
      throw error;
    }
  }
}

export const submoduleService = new SubmoduleService();
