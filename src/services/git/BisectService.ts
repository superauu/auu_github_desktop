import { executeGit, GitExecutionError } from './GitExecutor';
import { tNow } from '@/i18n';

/**
 * 可视化 Bisect 向导的服务层。所有命令直连 executeGit（白名单已放行
 * bisect 的 start/bad/good/new/old/skip/reset/log/terms 子命令；run/replay/
 * visualize/view 与任何选项在 git_policy 纯层被拒，因此这里天然无法执行
 * 任意命令或读取外部文件）。
 *
 * 状态探测不依赖 .git/BISECT_LOG 文件读取（repo_file 拒绝 .git 组件、
 * paths_exist 只探测四个已知操作文件），统一用 git 自身语义：
 * - 会话存在性：`git bisect log` 的退出码（未在 bisect 中时非 0，与本地化文案无关）。
 * - 收敛结果：BISECT_LOG 末尾的机器格式注释 `# first bad commit: [<hash>]`，
 *   或 stdout 的 `<hash> is the first <term> commit`（两者互为备份以抗 git 本地化）。
 */
export interface BisectCandidate {
  hash: string;
  shortHash: string;
  subject: string;
  authorName: string;
  dateIso: string;
}

export interface BisectMarkResult {
  finished: boolean;
  firstBad: BisectCandidate | null;
  output: string;
}

interface BisectSession {
  badHash: string;
  goodHash: string;
}

// BISECT_LOG 的机器格式注释（replay 数据源，git 不做本地化，最可靠）。
const FIRST_BAD_LOG = /^# first bad commit: \[([0-9a-f]{40})(?:[0-9a-f]{24})?\]/mi;
// 会话恢复时从日志还原初始 good 边界（第一条 `# good:` 注释即 start 时的好提交）。
const FIRST_GOOD_LOG = /^# good: \[([0-9a-f]{40})(?:[0-9a-f]{24})?\]/mi;
const HASH_ONLY = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/i;

const repoKey = (repoPath: string) => repoPath.replace(/\\/g, '/').replace(/\/$/, '');

class BisectService {
  /** 每个仓库的进行中会话边界（仅内存缓存，用于剩余步数估算；丢失时回落日志解析）。 */
  private sessions = new Map<string, BisectSession>();

  /** 用 rev-parse 双端校验任意用户输入，返回完整 hash；杜绝选项走私进 bisect 参数。 */
  async verifyCommit(repoPath: string, revision: string): Promise<string> {
    const trimmed = revision.trim();
    if (!trimmed || trimmed.startsWith('-')) throw new Error(tNow('bisect.invalidRef'));
    const res = await executeGit(['rev-parse', '--verify', '--end-of-options', `${trimmed}^{commit}`], repoPath);
    const hash = res.stdout.trim();
    if (!HASH_ONLY.test(hash)) throw new Error(tNow('bisect.invalidRef'));
    return hash;
  }

  /**
   * 开始一次二分：一条 `bisect start <bad> <good>` 原子完成三点定位（git 原生语义，
   * 比逐条 start/bad/good 少两次中间态）。工作区脏时 checkout 可能被 git 拒绝——
   * 尽力清理半初始化状态后把报错交给调用方展示。
   */
  async start(repoPath: string, badRef: string, goodRef: string): Promise<void> {
    const [badHash, goodHash] = await Promise.all([
      this.verifyCommit(repoPath, badRef),
      this.verifyCommit(repoPath, goodRef),
    ]);
    if (badHash === goodHash) throw new Error(tNow('bisect.sameRef'));
    // 语义前置校验：good 必须是 bad 的祖先（merge-base 不在白名单，用 rev-list 计数等价判断）。
    const span = await this.rangeCount(repoPath, goodHash, badHash);
    if (span === 0) throw new Error(tNow('bisect.badOrder'));
    try {
      await executeGit(['bisect', 'start', badHash, goodHash], repoPath);
    } catch (error) {
      // checkout 被拒（脏工作区等）时 git 可能留下半初始化状态，尽力还原。
      await this.reset(repoPath).catch(() => {});
      throw error;
    }
    this.sessions.set(repoKey(repoPath), { badHash, goodHash });
  }

  /**
   * 标记当前候选（rev 缺省 = HEAD 检出的候选）。git 在收敛时输出首个坏提交并保持
   * bisect 状态（BISECT_LOG 保留到 reset 为止），因此完成检测走 stdout/日志双信号。
   */
  private async mark(repoPath: string, sub: 'good' | 'bad' | 'skip', rev?: string): Promise<BisectMarkResult> {
    const args = ['bisect', sub];
    if (rev !== undefined) args.push(await this.verifyCommit(repoPath, rev));
    const res = await executeGit(args, repoPath);
    const output = res.stdout;
    // 首选 stdout 收敛行（hash 紧跟 " is the first "，术语可定制、文案可能本地化）；
    // 未命中时回落 BISECT_LOG 的机器格式注释。
    let hash: string | undefined = /^[0-9a-f]{40}(?:[0-9a-f]{24})?(?= is the first )/mi.exec(output)?.[0];
    if (!hash) {
      const log = await this.log(repoPath);
      hash = FIRST_BAD_LOG.exec(log)?.[1];
    }
    if (hash && HASH_ONLY.test(hash)) {
      return { finished: true, firstBad: await this.commitInfo(repoPath, hash), output };
    }
    return { finished: false, firstBad: null, output };
  }

  async markGood(repoPath: string, rev?: string): Promise<BisectMarkResult> {
    return this.mark(repoPath, 'good', rev);
  }

  async markBad(repoPath: string, rev?: string): Promise<BisectMarkResult> {
    return this.mark(repoPath, 'bad', rev);
  }

  async markSkip(repoPath: string, rev?: string): Promise<BisectMarkResult> {
    return this.mark(repoPath, 'skip', rev);
  }

  /** 结束二分并回到原检出位置；同时清掉内存会话缓存。未在 bisect 中时 git 会报错。 */
  async reset(repoPath: string): Promise<void> {
    await executeGit(['bisect', 'reset'], repoPath);
    this.sessions.delete(repoKey(repoPath));
  }

  /** 会话探测：`bisect log` 退出码即答案（完成但未 reset 的会话仍算“进行中”，与 git 语义一致）。 */
  async isBisecting(repoPath: string): Promise<boolean> {
    try {
      await executeGit(['bisect', 'log'], repoPath);
      return true;
    } catch (error) {
      if (error instanceof GitExecutionError) return false;
      throw error;
    }
  }

  /** BISECT_LOG 文本（`git bisect log` 的可重放输出），供“查看过程”展示。 */
  async log(repoPath: string): Promise<string> {
    try {
      return (await executeGit(['bisect', 'log'], repoPath)).stdout;
    } catch (error) {
      if (error instanceof GitExecutionError) return '';
      throw error;
    }
  }

  /** 已收敛但尚未 reset 时，从日志还原首个坏提交 hash；否则 null。 */
  async resultHash(repoPath: string): Promise<string | null> {
    return FIRST_BAD_LOG.exec(await this.log(repoPath))?.[1] ?? null;
  }

  /** 当前候选（bisect 检出的 HEAD）。 */
  async currentCandidate(repoPath: string): Promise<string> {
    return (await executeGit(['rev-parse', 'HEAD'], repoPath)).stdout.trim();
  }

  async candidateInfo(repoPath: string): Promise<BisectCandidate | null> {
    return this.commitInfo(repoPath, await this.currentCandidate(repoPath));
  }

  /** 单条提交信息（log -1）；不存在的 hash 返回 null。 */
  async commitInfo(repoPath: string, hash: string): Promise<BisectCandidate | null> {
    if (!HASH_ONLY.test(hash)) return null;
    try {
      const res = await executeGit(['log', '-1', '--format=%H%x1f%h%x1f%s%x1f%an%x1f%aI', hash, '--'], repoPath);
      const parts = res.stdout.trimEnd().split('\x1f');
      if (!HASH_ONLY.test(parts[0] || '')) return null;
      return { hash: parts[0], shortHash: parts[1] || parts[0].slice(0, 8), subject: parts[2] || '', authorName: parts[3] || '', dateIso: parts[4] || '' };
    } catch {
      return null;
    }
  }

  /**
   * 剩余步数估算：`rev-list --count <good>..<candidate>` 后对半向下取整（每次测试
   * 淘汰约一半候选）。这是粗估——git 自己按 log2 报“roughly N steps”；会话边界
   * 缺失（如应用重启后恢复）时回落解析日志第一条 `# good:`，再不行返回 null。
   */
  async stepsRemaining(repoPath: string): Promise<number | null> {
    const candidate = await this.currentCandidate(repoPath);
    const goodHash = this.sessions.get(repoKey(repoPath))?.goodHash
      ?? FIRST_GOOD_LOG.exec(await this.log(repoPath))?.[1];
    if (!goodHash || !HASH_ONLY.test(goodHash)) return null;
    const res = await executeGit(['rev-list', '--count', `${goodHash}..${candidate}`], repoPath);
    const count = Number.parseInt(res.stdout.trim(), 10);
    if (!Number.isFinite(count) || count < 0) return null;
    return Math.max(0, Math.floor(count / 2));
  }

  /** 预览范围大小：good..bad 之间的提交数（start 前用于展示与方向校验）。 */
  async rangeCount(repoPath: string, goodRef: string, badRef: string): Promise<number> {
    const res = await executeGit(['rev-list', '--count', `${goodRef.trim()}..${badRef.trim()}`], repoPath);
    const count = Number.parseInt(res.stdout.trim(), 10);
    if (!Number.isFinite(count) || count < 0) throw new Error(tNow('bisect.invalidRef'));
    return count;
  }

  /** 内存会话是否存在（对话框关闭前询问用；真实状态以 isBisecting 为准）。 */
  hasTrackedSession(repoPath: string): boolean {
    return this.sessions.has(repoKey(repoPath));
  }
}

export const bisectService = new BisectService();
