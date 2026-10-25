import { executeGit, GitExecutionError } from './GitExecutor';
import { tNow } from '@/i18n';

/**
 * Git LFS 服务层。git-lfs 缺失是常态而不是错误：detect 返回 null，其余需要
 * git-lfs 的操作在 detect 为 null 时直接抛可读错误（面板按"未安装"降级展示）。
 *
 * 命令面（策略层已收窄）：install/uninstall 必须恰带 --local（拒绝写全局
 * ~/.gitconfig）；track/untrack 仅位置模式；ls-files/status/version/env/fetch/
 * pull/checkout 只接受 bare 调用；push/migrate/lock 等在纯层被永久拒绝。
 */
export interface LfsTrack {
  pattern: string;
  source: string;
}

export interface LfsFile {
  oid: string;
  /** * = 已下载到本地，- = 仅有指针。 */
  downloaded: boolean;
  path: string;
}

/** 解析 `git lfs track`（bare 调用）的列表输出：`    *.psd (.gitattributes)` 形态。 */
export function parseLfsTracks(stdout: string): LfsTrack[] {
  const tracks: LfsTrack[] = [];
  for (const raw of stdout.split(/\r?\n/)) {
    const line = raw.replace(/\s+$/, '');
    if (!line) continue;
    const match = /^\s+(\S+)\s+\((.+)\)$/.exec(line);
    if (!match) continue;
    const [, pattern, source] = match;
    if (pattern === 'Listing' || pattern.startsWith('(')) continue;
    tracks.push({ pattern, source });
  }
  return tracks;
}

/** 解析 `git lfs ls-files` 输出：`<oid前8位> <*|-> <path>` 形态。 */
export function parseLfsFiles(stdout: string): LfsFile[] {
  const files: LfsFile[] = [];
  for (const raw of stdout.split(/\r?\n/)) {
    const line = raw.replace(/\s+$/, '');
    if (!line) continue;
    const match = /^([0-9a-f]{8,64})\s+([*-])\s+(.+)$/.exec(line);
    if (!match) continue;
    files.push({ oid: match[1], downloaded: match[2] === '*', path: match[3] });
  }
  return files;
}

function requireInstalled(version: string | null): string {
  if (!version) throw new Error(tNow('lfs.notInstalled'));
  return version;
}

class LfsService {
  /** 探测 git-lfs：返回版本串；未安装/不可用返回 null（不抛错）。 */
  async detect(repoPath: string): Promise<string | null> {
    try {
      const res = await executeGit(['lfs', 'version'], repoPath);
      return res.stdout.trim() || null;
    } catch (error) {
      if (error instanceof GitExecutionError) return null;
      throw error;
    }
  }

  /** 本仓库是否已启用 LFS 过滤（filter.lfs.clean 等 --local 配置存在即视为启用）。 */
  async repoFilterEnabled(repoPath: string): Promise<boolean> {
    try {
      const res = await executeGit(['config', '--local', '--get', 'filter.lfs.clean'], repoPath);
      return res.stdout.trim().length > 0;
    } catch (error) {
      if (error instanceof GitExecutionError) return false;
      throw error;
    }
  }

  /** 启用本仓库的 LFS 过滤（install --local：只写 .git/config 与 .git/hooks）。 */
  async enableRepoFilters(repoPath: string): Promise<void> {
    requireInstalled(await this.detect(repoPath));
    await executeGit(['lfs', 'install', '--local'], repoPath);
  }

  /** 停用本仓库的 LFS 过滤（uninstall --local）。 */
  async disableRepoFilters(repoPath: string): Promise<void> {
    requireInstalled(await this.detect(repoPath));
    await executeGit(['lfs', 'uninstall', '--local'], repoPath);
  }

  /** 当前跟踪模式列表（bare `lfs track` 输出）。 */
  async tracks(repoPath: string): Promise<LfsTrack[]> {
    requireInstalled(await this.detect(repoPath));
    return parseLfsTracks((await executeGit(['lfs', 'track'], repoPath)).stdout);
  }

  /** 新增跟踪模式（写入 .gitattributes，需随仓库提交生效）。 */
  async addTrack(repoPath: string, pattern: string): Promise<void> {
    const trimmed = pattern.trim();
    if (!trimmed || trimmed.startsWith('-')) throw new Error(tNow('lfs.trackInvalid'));
    requireInstalled(await this.detect(repoPath));
    await executeGit(['lfs', 'track', '--', trimmed], repoPath);
  }

  /** 移除跟踪模式。 */
  async removeTrack(repoPath: string, pattern: string): Promise<void> {
    requireInstalled(await this.detect(repoPath));
    await executeGit(['lfs', 'untrack', '--', pattern], repoPath);
  }

  /** 仓库内当前由 LFS 管理的文件列表。 */
  async files(repoPath: string): Promise<LfsFile[]> {
    requireInstalled(await this.detect(repoPath));
    return parseLfsFiles((await executeGit(['lfs', 'ls-files'], repoPath)).stdout);
  }

  /** 拉取全部 LFS 对象到本地（bare `lfs pull`）。 */
  async pull(repoPath: string): Promise<void> {
    requireInstalled(await this.detect(repoPath));
    await executeGit(['lfs', 'pull'], repoPath);
  }
}

export const lfsService = new LfsService();
