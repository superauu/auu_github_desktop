import { executeGit, GitExecutionError } from './GitExecutor';

/** 单条代码搜索命中：file 为仓库相对路径（POSIX 斜杠），line/column 从 1 起计。 */
export interface CodeSearchHit {
  file: string;
  line: number;
  column: number;
  text: string;
}

export interface CodeSearchResult {
  hits: CodeSearchHit[];
  /** 命中被截断到上限：提示用户缩小搜索范围。 */
  truncated: boolean;
}

export interface CodeSearchOptions {
  /** 大小写不敏感（-i） */
  ignoreCase?: boolean;
  /** 全词匹配（-w） */
  wholeWord?: boolean;
  /** 按正则表达式检索（-E）；默认按字面文本（-F） */
  regex?: boolean;
  /** 路径过滤（git pathspec，逐个字面传递） */
  pathspecs?: string[];
}

// 结果上限：够浏览又避免巨仓把视图拖垮；超限截断并提示缩小范围。
export const MAX_HITS = 500;

/** 解析 `grep -n --column` 的 `file:line:col:text` 行；文件名可含冒号，从右按最后两个冒号切。 */
export function parseGrepOutput(stdout: string, maxHits = MAX_HITS): { hits: CodeSearchHit[]; truncated: boolean } {
  const hits: CodeSearchHit[] = [];
  let truncated = false;
  for (const rawLine of stdout.split(/\r?\n/)) {
    if (!rawLine) continue;
    const lineColMatch = /:(\d+):(\d+):(.*)$/s.exec(rawLine);
    if (!lineColMatch) continue;
    const file = rawLine.slice(0, rawLine.length - lineColMatch[0].length);
    if (!file) continue;
    hits.push({
      file,
      line: Number(lineColMatch[1]),
      column: Number(lineColMatch[2]),
      text: lineColMatch[3],
    });
    if (hits.length >= maxHits) {
      truncated = true;
      break;
    }
  }
  return { hits, truncated };
}

/**
 * git grep 全仓代码搜索（只读，跟踪的工作树内容）。
 * 字面模式走 -F（用户无需转义），正则走 -E（ERE）；pathspec 经 -- 显式分隔。
 */
export const codeSearchService = {
  async grepRepo(repoPath: string, query: string, options: CodeSearchOptions = {}): Promise<CodeSearchResult> {
    const trimmed = query.trim();
    if (!trimmed) return { hits: [], truncated: false };
    const args = ['grep', '-n', '--column', '-I'];
    if (options.ignoreCase) args.push('-i');
    if (options.wholeWord) args.push('-w');
    args.push(options.regex ? '-E' : '-F', trimmed);
    const pathspecs = (options.pathspecs ?? []).map(spec => spec.trim()).filter(Boolean);
    if (pathspecs.length) args.push('--', ...pathspecs);
    try {
      const res = await executeGit(args, repoPath);
      return parseGrepOutput(res.stdout);
    } catch (error) {
      // git grep 无命中以退出码 1 结束（正常语义，归一为空结果）；其余错误照常上抛。
      if (error instanceof GitExecutionError && error.exitCode === 1) return { hits: [], truncated: false };
      throw error;
    }
  },
};
