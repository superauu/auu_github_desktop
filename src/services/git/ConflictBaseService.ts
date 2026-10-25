import { executeGit, GitExecutionError } from './GitExecutor';

/**
 * F3 冲突解决器三方对照服务：从 git 索引读取冲突文件的三个阶段版本。
 *
 * - 基线 :1:<path>（add/add 冲突下可能不存在，返回 null）
 * - 我方 :2:<path>（HEAD 侧）
 * - 对方 :3:<path>（传入侧）
 *
 * 策略层事实：`show` / `cat-file` 均在 git_policy 白名单；`:<n>:<path>` 以冒号
 * 开头不会被当作选项；`--literal-pathspecs` 让含 `[` `]` `!` 等 glob 元字符的
 * 路径按字面匹配（缺失时 `:N:<path>` 会被 pathspec magic 误解析并报
 * "outside repository"）。路径合法性由本服务自行校验。
 */

/** 单个阶段版本的大小上限：`git show` 之前用 `cat-file -s` 预检，超过即拒绝。 */
export const MAX_CONFLICT_STAGE_BYTES = 2 * 1024 * 1024;

export type ConflictStageRole = 'base' | 'ours' | 'theirs';
export type ConflictSide = 'base' | 'ours' | 'theirs';

export interface ConflictStages {
  /** `:1:<path>` — add/add 冲突下为 null。 */
  base: string | null;
  /** `:2:<path>` — HEAD 侧。 */
  ours: string | null;
  /** `:3:<path>` — 传入侧。 */
  theirs: string | null;
}

/** 定位启发式接受的冲突块最小结构（ConflictParser.ConflictBlock 的子集）。 */
export interface ConflictBlockLike {
  index: number;
  startLine: number;
  endLine: number;
  currentContent: string;
  baseContent?: string;
  incomingContent: string;
}

/** 冲突块在某个版本文件中的行区间（0 起始；end 不含）。 */
export interface BlockSpan {
  start: number;
  end: number;
  /** false 表示上下文未能精确匹配、由比例位置兜底。 */
  matched: boolean;
}

const STAGE_NUMBER: Record<ConflictStageRole, number> = { base: 1, ours: 2, theirs: 3 };

/**
 * 校验并规范化冲突文件路径：trim 非空、相对路径（拒绝绝对前缀与 `..` 组件）、
 * 不以 `-` 开头。返回 trim 后的路径。
 */
export function validateConflictFilePath(filePath: string): string {
  const trimmed = (filePath || '').trim();
  if (!trimmed) throw new Error('Conflict file path is empty');
  if (trimmed.startsWith('-')) {
    throw new Error(`Conflict file path must not start with "-": ${trimmed}`);
  }
  if (trimmed.startsWith('/') || trimmed.startsWith('\\') || /^[a-z]:/i.test(trimmed)) {
    throw new Error(`Conflict file path must be relative to the repository: ${trimmed}`);
  }
  if (trimmed.split(/[/\\]/).some((part) => part === '..')) {
    throw new Error(`Conflict file path must not contain ".." segments: ${trimmed}`);
  }
  return trimmed;
}

/** 读取单个索引阶段；git 报告该阶段不存在（exit 128）时返回 null。 */
async function fetchStage(repoPath: string, filePath: string, role: ConflictStageRole): Promise<string | null> {
  const spec = `:${STAGE_NUMBER[role]}:${filePath}`;
  let size: number;
  try {
    const probe = await executeGit(['--literal-pathspecs', 'cat-file', '-s', spec], repoPath);
    size = Number.parseInt(probe.stdout.trim(), 10);
  } catch (error) {
    // 典型场景：add/add 冲突没有 :1: 基线。
    if (error instanceof GitExecutionError && error.exitCode === 128) return null;
    throw error;
  }
  if (!Number.isFinite(size) || size < 0) {
    throw new Error(`Unable to determine the size of the ${role} version for ${filePath}`);
  }
  if (size > MAX_CONFLICT_STAGE_BYTES) {
    throw new Error(
      `The ${role} version of ${filePath} is ${(size / 1024 / 1024).toFixed(1)} MB, ` +
      `which exceeds the ${MAX_CONFLICT_STAGE_BYTES / 1024 / 1024} MB three-way comparison limit`
    );
  }
  try {
    return (await executeGit(['--literal-pathspecs', 'show', spec], repoPath)).stdout;
  } catch (error) {
    // 预检与读取之间索引被并发修改（例如终端里 git add）：按缺失处理而非整体失败。
    if (error instanceof GitExecutionError && error.exitCode === 128) return null;
    throw error;
  }
}

/** 读取冲突文件的三个阶段版本（base 可为 null，ours/theirs 通常存在）。 */
export async function fetchStages(repoPath: string, filePath: string): Promise<ConflictStages> {
  if (!repoPath || !repoPath.trim()) throw new Error('Repository path is empty');
  const validated = validateConflictFilePath(filePath);
  const [base, ours, theirs] = await Promise.all([
    fetchStage(repoPath, validated, 'base'),
    fetchStage(repoPath, validated, 'ours'),
    fetchStage(repoPath, validated, 'theirs'),
  ]);
  return { base, ours, theirs };
}

const MARKER_LINE = /^(?:<{7}|\|{7}|={7}|>{7})(?: |$)/;

function contentFor(block: ConflictBlockLike, side: ConflictSide): string | null {
  if (side === 'ours') return block.currentContent;
  if (side === 'theirs') return block.incomingContent;
  return block.baseContent ?? null;
}

function lineCount(content: string | null): number {
  return content ? content.split(/\r?\n/).length : 0;
}

/**
 * 块前最近 3 行非冲突上下文行（保持文件顺序）。
 * 只取上一个冲突块之后、当前块标记之前的普通行，并防御性跳过疑似标记行。
 */
function contextAnchor(
  blocks: readonly ConflictBlockLike[],
  blockIndex: number,
  workingLines: readonly string[]
): string[] {
  const block = blocks[blockIndex];
  const lowerBound = blockIndex > 0 ? blocks[blockIndex - 1].endLine : 0; // 0-indexed 首个普通行
  const anchor: string[] = [];
  for (let line = block.startLine - 2; line >= lowerBound && anchor.length < 3; line--) {
    const text = workingLines[line];
    if (text === undefined) break;
    if (MARKER_LINE.test(text)) continue;
    anchor.unshift(text);
  }
  return anchor;
}

/** 在 haystack 中自 from 起顺序查找 pattern 的完整匹配，返回起始下标或 -1。 */
function findSequence(haystack: readonly string[], pattern: readonly string[], from: number): number {
  if (pattern.length === 0 || pattern.length > haystack.length) return -1;
  const last = haystack.length - pattern.length;
  for (let start = Math.max(0, from); start <= last; start++) {
    let matched = true;
    for (let offset = 0; offset < pattern.length; offset++) {
      if (haystack[start + offset] !== pattern[offset]) { matched = false; break; }
    }
    if (matched) return start;
  }
  return -1;
}

/**
 * 把工作文件中的每个冲突块定位到某个版本（基线/我方/对方）中的行区间。
 *
 * 启发式（按顺序尝试，均先自上一个块之后顺序查找、再从文件头重试）：
 * 1. 上下文锚点 + 块内容（我方/对方及 diff3 基线：内容即块解析结果，精确）；
 * 2. 仅块内容；
 * 3. 仅上下文锚点（区域长度用两侧行数估算）；
 * 4. 都找不到 → 按块在工作文件中的相对位置比例兜底（matched=false）。
 *
 * 块按文件顺序处理并推进搜索起点，保证多块定位单调不回退。
 */
export function locateBlockSpans(
  versionLines: readonly string[],
  blocks: readonly ConflictBlockLike[],
  workingLines: readonly string[],
  side: ConflictSide
): BlockSpan[] {
  const spans: BlockSpan[] = [];
  let cursor = 0;
  for (let blockIndex = 0; blockIndex < blocks.length; blockIndex++) {
    const block = blocks[blockIndex];
    const content = contentFor(block, side);
    const contentLines = content ? content.split(/\r?\n/) : [];
    const anchor = contextAnchor(blocks, blockIndex, workingLines);
    // 基线无独立内容时用两侧行数估算区域高度；我方/对方区域即块内容自身。
    const estimated = side === 'base' && contentLines.length === 0
      ? Math.max(lineCount(block.currentContent), lineCount(block.incomingContent), 1)
      : Math.max(contentLines.length, 1);

    interface Candidate { pattern: string[]; offset: number; exact: boolean }
    const candidates: Candidate[] = [];
    if (contentLines.length > 0 && anchor.length > 0) {
      candidates.push({ pattern: [...anchor, ...contentLines], offset: anchor.length, exact: true });
    }
    if (contentLines.length > 0) {
      candidates.push({ pattern: contentLines, offset: 0, exact: true });
    }
    if (anchor.some((line) => line.length > 0)) {
      candidates.push({ pattern: anchor, offset: anchor.length, exact: false });
    }

    let span: BlockSpan | null = null;
    for (const candidate of candidates) {
      let at = findSequence(versionLines, candidate.pattern, cursor);
      if (at < 0 && cursor > 0) at = findSequence(versionLines, candidate.pattern, 0);
      if (at < 0) continue;
      const start = at + candidate.offset;
      const length = candidate.exact ? contentLines.length : Math.max(estimated, 1);
      span = { start, end: Math.min(start + length, versionLines.length), matched: true };
      break;
    }
    if (!span) {
      // 兜底：按块在工作文件中的相对位置推算（找不到任何锚点时）。
      const ratio = workingLines.length > 0 ? (block.startLine - 1) / workingLines.length : 0;
      const start = Math.max(0, Math.min(
        Math.floor(versionLines.length * ratio),
        Math.max(0, versionLines.length - estimated)
      ));
      span = { start, end: Math.min(start + estimated, versionLines.length), matched: false };
    }
    spans.push(span);
    cursor = Math.max(cursor, span.end);
  }
  return spans;
}
