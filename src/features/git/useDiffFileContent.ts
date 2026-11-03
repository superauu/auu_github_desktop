import { useEffect, useMemo, useState } from 'react';
import { gitService } from '@/services/git/GitService';
import type { ParsedDiffLine } from '@/services/git/PorcelainParser';
import { hunkScopes, type CodeScope, type DiffContentSide } from '@/utils/codeScope';
import { splitFileContent } from '@/utils/fullFileDiff';

/** 完整文件模式的护栏：超出上限就不展开，避免一次渲染超大文件。 */
export const FULL_FILE_MAX_LINES = 20_000;
export const FULL_FILE_MAX_BYTES = 2 * 1024 * 1024;

const CACHE_LIMIT = 6;
const cache = new Map<string, string[]>();

export interface DiffFileContent {
  /** 整文件内容按行切好；读不到或超限时为 null。 */
  lines: string[] | null;
  loading: boolean;
  error: string | null;
  tooLarge: boolean;
}

/**
 * 读取差异文件某一侧的整文件内容（工作区 / 索引 / 提交），
 * 同时服务于「块头所属方法」与「完整文件」两个功能。
 * token 变化（例如工作区刷新）时重新读取，避免展示过期内容。
 */
export function useDiffFileContent(
  repoPath: string | null,
  filePath: string | null,
  revision: string | null,
  token: string | number = '',
): DiffFileContent {
  const key = repoPath && filePath && revision ? `${repoPath}\u0000${revision}\u0000${token}\u0000${filePath}` : null;
  const [state, setState] = useState<DiffFileContent & { key: string | null }>({ key: null, lines: null, loading: false, error: null, tooLarge: false });

  useEffect(() => {
    if (!key || !repoPath || !filePath || !revision) {
      setState({ key: null, lines: null, loading: false, error: null, tooLarge: false });
      return;
    }
    const cached = cache.get(key);
    if (cached) {
      setState({ key, lines: cached, loading: false, error: null, tooLarge: false });
      return;
    }
    let cancelled = false;
    setState({ key, lines: null, loading: true, error: null, tooLarge: false });
    gitService.readFileRevision(repoPath, filePath, revision)
      .then(content => {
        if (cancelled) return;
        if (content.length > FULL_FILE_MAX_BYTES || content.includes('\u0000')) {
          setState({ key, lines: null, loading: false, error: null, tooLarge: content.length > FULL_FILE_MAX_BYTES });
          return;
        }
        const lines = splitFileContent(content);
        if (!lines.length) { setState({ key, lines: null, loading: false, error: null, tooLarge: false }); return; }
        if (lines.length > FULL_FILE_MAX_LINES) { setState({ key, lines: null, loading: false, error: null, tooLarge: true }); return; }
        cache.set(key, lines);
        while (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value!);
        setState({ key, lines, loading: false, error: null, tooLarge: false });
      })
      .catch((error: unknown) => {
        if (!cancelled) setState({ key, lines: null, loading: false, error: error instanceof Error ? error.message : String(error), tooLarge: false });
      });
    return () => { cancelled = true; };
  }, [key, repoPath, filePath, revision]);

  // 切换文件后的首帧里 state 还属于上一个文件：key 不一致就当没有内容，避免串用。
  return state.key === key ? state : { lines: null, loading: !!key, error: null, tooLarge: false };
}

/** 每个块头下标 → 所属作用域；没有整文件内容时为空表。 */
export function useHunkScopes(
  diffLines: readonly ParsedDiffLine[],
  lines: string[] | null,
  side: DiffContentSide = 'new',
): Map<number, CodeScope> {
  return useMemo(() => (lines ? hunkScopes(diffLines, lines, side) : new Map<number, CodeScope>()), [diffLines, lines, side]);
}
