import { executeGit, executeGitTransaction, GitExecutionError } from './GitExecutor';
import { requireClean, savePoint } from './BranchSafetyService';
import { parseGitLog } from './PorcelainParser';
import { tNow } from '@/i18n';
import type { GitCommit } from './types';

export interface HistoryPlan { branch: string; head: string; base: string; commits: GitCommit[]; published: boolean }
export interface HistoryStep { hash: string; action: 'pick' | 'squash' | 'fixup' | 'reword' | 'drop'; message?: string }
export interface ReflogEntry { hash: string; selector: string; subject: string; timestamp: number }
/** Options for searchContents: pickaxe variant and an optional repository-relative pathspec filter. */
export interface ContentSearchOptions { regex?: boolean; path?: string }
const format = '%H%x1f%h%x1f%s%x1f%b%x1f%an%x1f%ae%x1f%aI%x1f%P%x1f%D%x1e';
/** 哈希与动作白名单：rebase 编辑器脚本路径与 cherry-pick 重放路径共用。 */
const HASH = /^[0-9a-f]{40,64}$/;
const REBASE_ACTIONS = ['pick', 'squash', 'fixup'];
const ALL_ACTIONS = [...REBASE_ACTIONS, 'reword', 'drop'];
/** reword 新信息的硬上限；防误粘贴超长文本，也与其余用户参数边界保持一致。 */
const MESSAGE_LIMIT = 2000;

/** reword 步骤必须携带一条可直接作为提交信息的新文本（argv 传递，不经 shell）。 */
function validMessage(message: unknown): message is string {
  return typeof message === 'string' && message.trim().length > 0 && message.length <= MESSAGE_LIMIT && !message.startsWith('-');
}

export const historyWorkflowService = {
  async plan(repoPath: string, count: number, base?: string): Promise<HistoryPlan> {
    const branch = (await executeGit(['symbolic-ref', '--quiet', '--short', 'HEAD'], repoPath)).stdout.trim();
    // 显式 base(如审查检查点):整理范围锁定为 base..HEAD,超出整理上限时要求分批。
    let range = 'HEAD';
    let baseHash = '';
    if (base !== undefined) {
      if (!HASH.test(base)) throw new Error(tNow('flow.invalidPlan'));
      baseHash = (await executeGit(['rev-parse', '--verify', '--end-of-options', `${base}^{commit}`], repoPath)).stdout.trim();
      const total = Number((await executeGit(['rev-list', '--count', `${baseHash}..HEAD`], repoPath)).stdout.trim());
      if (total > 30) throw new Error(tNow('review.tidyRangeTooLarge'));
      range = `${baseHash}..HEAD`;
    }
    const commits = parseGitLog((await executeGit(['log', '--first-parent', `--max-count=${Math.max(2, Math.min(30, count))}`, `--format=${format}`, range, '--'], repoPath)).stdout).reverse();
    // The root has no parent onto which Git can replay; leave it as the base.
    if (commits[0]?.parents.length === 0) commits.shift();
    if (!commits.length || commits.some(commit => commit.parents.length !== 1)) throw new Error(tNow('flow.linearOnly'));
    // 已发布预检：与 rewrite 内的强制拒绝同一判定，供对话框提前警示而非事后失败。
    const published = !!(await executeGit(['for-each-ref', `--contains=${commits[0].hash}`, '--format=%(refname)', 'refs/remotes/'], repoPath)).stdout.trim();
    return { branch, head: commits[commits.length - 1].hash, base: baseHash || commits[0].parents[0], commits, published };
  },
  async rewrite(repoPath: string, plan: HistoryPlan, steps: HistoryStep[]): Promise<void> {
    if (!HASH.test(plan.base) || !HASH.test(plan.head)) throw new Error(tNow('flow.invalidPlan'));
    const commonInvalid = !steps.length
      || steps.length !== plan.commits.length
      || new Set(steps.map(step => step.hash)).size !== steps.length
      || steps.some(step => !ALL_ACTIONS.includes(step.action) || !HASH.test(step.hash) || !plan.commits.some(commit => commit.hash === step.hash))
      || steps.some(step => step.action === 'reword' && !validMessage(step.message));
    // 纯 pick/squash/fixup 走 rebase 编辑器脚本路径（首条必须保留，rebase 语义）；
    // 含 reword/drop 走 cherry-pick 重放路径（首条不得为合并类——没有可并入的上一条）。
    const loop = steps.some(step => step.action === 'reword' || step.action === 'drop');
    const pathInvalid = loop
      ? ['squash', 'fixup'].includes(steps[0].action)
      : steps[0].action !== 'pick' || steps.some(step => !REBASE_ACTIONS.includes(step.action));
    if (commonInvalid || pathInvalid) throw new Error(tNow('flow.invalidPlan'));
    return executeGitTransaction(repoPath, async git => {
      await requireClean(repoPath, git);
      const branch = (await git(['symbolic-ref', '--quiet', '--short', 'HEAD'])).stdout.trim();
      const head = (await git(['rev-parse', 'HEAD'])).stdout.trim();
      if (head !== plan.head || branch !== plan.branch) throw new Error(tNow('safety.stale'));
      const original = (await git(['rev-list', '--reverse', '--first-parent', `${plan.base}..${plan.head}`])).stdout.trim().split(/\r?\n/);
      if (original.length !== steps.length || original.some(hash => !steps.some(step => step.hash === hash))) throw new Error(tNow('flow.invalidPlan'));
      // Refuse to rewrite commits already present on a fetched remote branch.
      const published = await git(['for-each-ref', `--contains=${plan.commits[0].hash}`, '--format=%(refname)', 'refs/remotes/']);
      if (published.stdout.trim()) throw new Error(tNow('flow.published'));
      await savePoint(git, branch, head, 'rewrite');
      if (!loop) {
        // Only validated actions and hexadecimal OIDs enter this fixed editor script.
        // Git supplies the todo path as $1. The final ':' consumes its appended argument.
        const editor = `printf '%s\\n' ${steps.map(step => `'${step.action} ${step.hash}'`).join(' ')} > "$1"; :`;
        await git(['-c', `sequence.editor=${editor}`, '-c', 'core.editor=true', '-c', 'rebase.updateRefs=false', 'rebase', '--interactive', plan.base]);
        return;
      }
      // reword/drop 重放：从基点分离后逐条 cherry-pick 重建，最后把分支指到新头。
      // 全部参数为白名单内的固定选项与已校验哈希；reword 信息经 argv 传递，不进任何 shell。
      // --keep-redundant-commits 让重放中变空的提交保持为空提交而不是中断。
      try {
        await git(['checkout', '--detach', plan.base]);
        for (const step of steps) {
          if (step.action === 'drop') continue;
          if (step.action === 'reword') {
            await git(['cherry-pick', '--no-commit', step.hash]);
            await git(['commit', '--allow-empty', '-m', (step.message ?? '').replace(/\r\n/g, '\n')]);
          } else if (step.action === 'pick') {
            await git(['cherry-pick', '--keep-redundant-commits', step.hash]);
          } else {
            // squash/fixup：并入上一条并沿用其信息（与 rebase 路径在 core.editor=true 下行为一致）。
            await git(['cherry-pick', '--no-commit', step.hash]);
            await git(['commit', '--amend', '--no-edit']);
          }
        }
      } catch (error) {
        // 尽力把现场还原为原始分支（cherry-pick 中止 + 分支指回原头），失败不掩盖原始错误。
        try { await git(['cherry-pick', '--abort']); } catch { /* 无进行中的 cherry-pick */ }
        try { await git(['checkout', '-B', branch, head]); } catch { /* 分支还原失败时保留现场供恢复中心处理 */ }
        throw error;
      }
      await git(['checkout', '-B', branch]);
    });
  },
  async reflog(repoPath: string): Promise<ReflogEntry[]> {
    const output = (await executeGit(['reflog', 'show', '--all', '-n', '150', '--date=raw', '--format=%H%x00%gD%x00%gs%x00%ct%x00'], repoPath)).stdout.split('\0');
    const entries: ReflogEntry[] = [];
    for (let i = 0; i + 3 < output.length; i += 4) {
      const hash = output[i].trim();
      if (/^[0-9a-f]{40,64}$/.test(hash)) entries.push({ hash, selector: output[i + 1], subject: output[i + 2], timestamp: Number(output[i + 1].match(/@\{(\d+)/)?.[1] || output[i + 3]) * 1000 });
    }
    return entries;
  },
  async compare(repoPath: string, hash: string): Promise<{ head: string; text: string }> {
    const [head, target] = await Promise.all(['HEAD', hash].map(ref => executeGit(['rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`], repoPath).then(result => result.stdout.trim())));
    const diff = await executeGit(['diff', '--stat', '--patch', '--no-ext-diff', '--no-textconv', '--no-color', head, target, '--'], repoPath);
    return { head, text: diff.stdout.slice(0, 50000) };
  },
  async recoverBranch(repoPath: string, hash: string, name: string): Promise<void> {
    return executeGitTransaction(repoPath, async git => {
      await git(['check-ref-format', '--branch', name]);
      const target = (await git(['rev-parse', '--verify', '--end-of-options', `${hash}^{commit}`])).stdout.trim();
      await git(['update-ref', '--create-reflog', '-m', 'AuuGit recovery', `refs/heads/${name}`, target, '0'.repeat(target.length)]);
    });
  },
  async searchContents(repoPath: string, query: string, options: ContentSearchOptions = {}): Promise<GitCommit[]> {
    if (!query.trim()) return [];
    const pathspec = options.path?.trim() || '';
    // Pathspec travels after "--", but a leading "-" is rejected outright so an
    // option-looking filter can never reach the command line.
    if (pathspec.startsWith('-')) throw new Error('Invalid path filter: a pathspec must not start with "-"');
    // Literal mode keeps -S with --fixed-strings; regex mode swaps in -G and must NOT be fixed-strings.
    const pickaxe = options.regex ? `-G${query}` : `-S${query}`;
    const args = ['log', '--all', '--topo-order', '--max-count=100', ...(options.regex ? [] : ['--fixed-strings']), pickaxe, `--format=${format}`];
    // Every option stays ahead of the separator; git treats the remainder as pathspecs.
    args.push('--', ...(pathspec ? [pathspec] : []));
    try {
      return parseGitLog((await executeGit(args, repoPath)).stdout);
    } catch (error) {
      // An illegal pattern makes git exit 128; surface a readable hint instead of a bare stderr dump.
      if (options.regex && error instanceof GitExecutionError && /invalid regex|not a valid regular expression/i.test(error.stderr)) {
        throw new Error(`Invalid regular expression: ${query}`, { cause: error });
      }
      throw error;
    }
  },
};
