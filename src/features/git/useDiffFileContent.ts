import { useEffect, useMemo, useState } from 'react';
import { gitService } from '@/services/git/GitService';
import type { ParsedDiffLine } from '@/services/git/PorcelainParser';
import { hunkScopes, type CodeScope, type DiffContentSide } from '@/utils/codeScope';
import { splitFileContent } from '@/utils/fullFileDiff';

/** 完整文件模式的护栏：超出上限就不展开，避免一次渲染超大文件。 */
export const FULL_FILE_MAX_LINES = 20_000;
export const FULL_FILE_MAX_BYTES = 2 * 1024 * 1024;

const CACHE_LIMIT = 6;
interface CacheEntry { lines: string[]; token: string | number; }
const cache = new Map<string, CacheEntry>();

/** 逐行比较两次读取：一致就复用旧数组 identity，下游 memo 与滚动位置都不受校验影响。 */
export function sameFileLines(a: readonly string[], b: readonly string[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index++) if (a[index] !== b[index]) return false;
  return true;
}

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
 * token 变化（例如工作区刷新）只触发后台复读校验：期间继续展示旧内容，
 * 内容没变就保持原数组 identity，整文件视图不再闪断、滚动位置不被重置。
 */
export function useDiffFileContent(
  repoPath: string | null,
  filePath: string | null,
  revision: string | null,
  token: string | number = '',
): DiffFileContent {
  const key = repoPath && filePath && revision ? `${repoPath}\u0000${revision}\u0000${filePath}` : null;
  const [state, setState] = useState<DiffFileContent & { key: string | null }>({ key: null, lines: null, loading: false, error: null, tooLarge: false });

  useEffect(() => {
    if (!key || !repoPath || !filePath || !revision) {
      setState({ key: null, lines: null, loading: false, error: null, tooLarge: false });
      return;
    }
    let cancelled = false;
    const apply = (next: DiffFileContent) => {
      if (cancelled) return;
      setState(previous => {
        const merged = { key, ...next };
        return previous.key === key && previous.lines === merged.lines && previous.loading === merged.loading
          && previous.error === merged.error && previous.tooLarge === merged.tooLarge ? previous : merged;
      });
    };
    const cached = cache.get(key);
    if (cached) {
      apply({ lines: cached.lines, loading: false, error: null, tooLarge: false });
      if (cached.token === token) return;
    } else {
      apply({ lines: null, loading: true, error: null, tooLarge: false });
    }
    gitService.readFileRevision(repoPath, filePath, revision)
      .then(content => {
        if (cancelled) return;
        const tooLarge = content.length > FULL_FILE_MAX_BYTES;
        if (tooLarge || content.includes('\u0000')) {
          apply({ lines: null, loading: false, error: null, tooLarge });
          return;
        }
        const lines = splitFileContent(content);
        if (!lines.length) { apply({ lines: null, loading: false, error: null, tooLarge: false }); return; }
        if (lines.length > FULL_FILE_MAX_LINES) { apply({ lines: null, loading: false, error: null, tooLarge: true }); return; }
        // 重读内容与展示中的一致时保留旧数组 identity：这次刷新对视图完全不可见。
        const stable = cached && sameFileLines(cached.lines, lines) ? cached.lines : lines;
        cache.delete(key);
        cache.set(key, { lines: stable, token });
        while (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value!);
        apply({ lines: stable, loading: false, error: null, tooLarge: false });
      })
      .catch((error: unknown) => {
        // 校验失败时保留旧内容：瞬时的读取错误不应塌掉正在浏览的整文件视图。
        if (cached) return;
        apply({ lines: null, loading: false, error: error instanceof Error ? error.message : String(error), tooLarge: false });
      });
    return () => { cancelled = true; };
  }, [key, repoPath, filePath, revision, token]);

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
