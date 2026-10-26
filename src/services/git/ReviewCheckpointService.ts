import { executeGit } from './GitExecutor';
import { tNow } from '@/i18n';

/**
 * 「审查」视图的已审查检查点:每分支一个自定义 ref(refs/auugit/review/<分支名>)。
 * 与恢复点同一套惯例:update-ref CAS 写入、ref 命名空间 refs/auugit/、分支名直接内嵌
 * ref 路径(git ref 命名规则本身禁用 ..、~^:?*[\ 与 .lock 结尾,无歧义)。
 */
const HASH = /^[0-9a-f]{40,64}$/;
const refFor = (branch: string) => `refs/auugit/review/${branch}`;

export interface ReviewCheckpoint {
  ref: string;
  hash: string;
}

export const reviewCheckpointService = {
  refFor,
  /** 读取检查点;ref 不存在或解析失败一律返回 null(视为尚未建立审查基准)。 */
  async get(repoPath: string, branch: string): Promise<ReviewCheckpoint | null> {
    try {
      const res = await executeGit(['rev-parse', '--verify', '--end-of-options', `${refFor(branch)}^{commit}`], repoPath);
      const hash = res.stdout.trim();
      return HASH.test(hash) ? { ref: refFor(branch), hash } : null;
    } catch {
      return null;
    }
  },
  /**
   * CAS 推进/回退检查点。expectedOld=null 表示当前必须不存在(全零旧值,与 savePoint 相同);
   * 预期旧值不匹配时 git 以非零退出拒绝,由调用方映射为 stale 提示。
   */
  async set(repoPath: string, branch: string, hash: string, expectedOld: string | null): Promise<void> {
    if (!HASH.test(hash)) throw new Error(tNow('safety.stale'));
    if (expectedOld !== null && !HASH.test(expectedOld)) throw new Error(tNow('safety.stale'));
    const oldValue = expectedOld && HASH.test(expectedOld) ? expectedOld : '0'.repeat(hash.length);
    await executeGit(['update-ref', refFor(branch), hash, oldValue], repoPath);
  },
  /** CAS 删除检查点(撤销"标记已审查"时用于恢复旧值)。 */
  async clear(repoPath: string, branch: string, expectedOld: string): Promise<void> {
    if (!HASH.test(expectedOld)) throw new Error(tNow('safety.stale'));
    await executeGit(['update-ref', '--no-deref', '-d', refFor(branch), expectedOld], repoPath);
  },
};
