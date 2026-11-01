/**
 * 堆栈帧 → 本地文件跳转（PRD §8.4，M3 落点定案：系统默认编辑器，内置只读视图列为后续增强）。
 * 三档置信度：前缀映射精确命中 → 唯一模糊匹配 → 多候选选择器 / 显式不可定位。
 */
import { executeGit } from '@/services/git/GitExecutor';

export interface StackJumpFrame {
  file: string;
  line: number | null;
}

export type StackJumpResult =
  | { kind: 'exact'; path: string; line: number | null }
  | { kind: 'unique'; path: string; line: number | null }
  | { kind: 'ambiguous'; candidates: string[] }
  | { kind: 'unresolved'; framePath: string };

export interface StackJumpOptions {
  /** 项目映射的前缀映射（§6.1 sourcePathPrefixMap）：平台路径前缀 → 仓库相对路径前缀。 */
  prefixMap?: readonly { from: string; to: string }[];
  /** 工作区跟踪文件清单（git ls-files，正斜杠仓库相对路径）。 */
  trackedFiles: readonly string[];
  maxCandidates?: number;
}

const normalizePath = (value: string): string => value.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+/g, '/');

const basenameOf = (value: string): string => {
  const normalized = normalizePath(value);
  const index = normalized.lastIndexOf('/');
  return index >= 0 ? normalized.slice(index + 1) : normalized;
};

/** 公共后缀长度（按完整路径段对齐），用于模糊匹配排序。 */
function suffixScore(framePath: string, candidate: string): number {
  const a = framePath.split('/').reverse();
  const b = candidate.split('/').reverse();
  let score = 0;
  while (score < a.length && score < b.length && a[score] === b[score]) score++;
  return score;
}

export function resolveStackFrame(frame: StackJumpFrame, options: StackJumpOptions): StackJumpResult {
  const original = normalizePath(frame.file ?? '');
  if (!original) return { kind: 'unresolved', framePath: '' };
  const maxCandidates = options.maxCandidates ?? 8;
  const tracked = options.trackedFiles;

  // 第 1 档：前缀映射（高置信）
  const mapped = applyPrefixMap(original, options.prefixMap);
  if (mapped && tracked.includes(mapped)) {
    return { kind: 'exact', path: mapped, line: frame.line ?? null };
  }

  // 第 2 档：模糊匹配——文件名相同者中按公共后缀排序
  const base = basenameOf(original);
  if (!base) return { kind: 'unresolved', framePath: original };
  const byName = tracked.filter((candidate) => candidate === base || candidate.endsWith(`/${base}`));
  if (byName.length === 1) {
    return { kind: 'unique', path: byName[0], line: frame.line ?? null };
  }
  if (byName.length > 1) {
    const ranked = [...byName].sort((a, b) => suffixScore(original, b) - suffixScore(original, a));
    const best = suffixScore(original, ranked[0]);
    const tied = ranked.filter((candidate) => suffixScore(original, candidate) === best);
    if (tied.length === 1) {
      return { kind: 'unique', path: tied[0], line: frame.line ?? null };
    }
    return { kind: 'ambiguous', candidates: tied.slice(0, maxCandidates) };
  }

  // 第 3 档：不可定位——显式提示，不静默失败
  return { kind: 'unresolved', framePath: mapped ?? original };
}

function applyPrefixMap(
  original: string,
  prefixMap?: readonly { from: string; to: string }[],
): string | null {
  if (!prefixMap?.length) return null;
  const needle = original.toLowerCase();
  for (const rule of prefixMap) {
    const from = normalizePath(rule.from).replace(/\/+$/, '');
    const to = normalizePath(rule.to).replace(/\/+$/, '');
    if (!from) continue;
    if (needle === from.toLowerCase()) return to || '.';
    if (needle.startsWith(`${from.toLowerCase()}/`)) {
      return `${to}${original.slice(from.length)}`;
    }
  }
  return null;
}

/**
 * 打开本地文件（系统默认程序）。桌面端走 open_local_path 命令（opener 插件；
 * shell 插件 open 的 IPC 校验器是 github.com 专用白名单，会拒绝本地路径）；
 * web 预览回落剪贴板复制路径。
 * 传入绝对路径（调用方用仓库根 + 相对路径拼接）；行号无法跨编辑器通用传递，由 toast 提示。
 */
export async function revealLocalFile(absolutePath: string): Promise<'opened' | 'copied'> {
  if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('open_local_path', { path: absolutePath });
    return 'opened';
  }
  try {
    await navigator.clipboard.writeText(absolutePath);
  } catch {
    /* 剪贴板不可用时忽略：调用方已提示路径 */
  }
  return 'copied';
}

/** 当前仓库工作区跟踪文件清单（模糊匹配的数据源，会话内缓存由调用方持有）。 */
export async function listTrackedFiles(repoPath: string): Promise<string[]> {
  const { stdout } = await executeGit(['ls-files', '--deduplicate'], repoPath);
  return stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}
