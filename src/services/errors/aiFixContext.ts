/**
 * AI 修复上下文收集（PRD §8.5）：从堆栈解析可跳转目标（仅精确/唯一档，不猜测），
 * 读取本地文件内容组装受限载荷——敏感文件跳过、文件数/单文件/总预算三重上限。
 * 读取器由调用方注入（纯函数可单测）。
 */
import { resolveStackFrame } from './stackNavigation';
import type { StackFrame, UnifiedErrorIssue } from './types';

export const AI_FIX_MAX_FILES = 5;
export const AI_FIX_FILE_CHAR_CAP = 8000;
export const AI_FIX_TOTAL_CHAR_BUDGET = 32000;

/** 敏感/不该外发的文件（.env、密钥、凭证等，§8.5 ignore 规则）。 */
const SENSITIVE_PATTERNS: readonly RegExp[] = [
  /(^|\/)\.env(\.|$)/i,
  /(^|\/)\.npmrc$/i,
  /(^|\/)\.netrc$/i,
  /credential/i,
  /secret/i,
  /(^|\/)id_rsa/i,
  /(^|\/)\.ssh\//i,
  /\.(pem|key|p12|pfx|keystore|jks)$/i,
  /(^|\/)(secrets?|keys?)(\/|$)/i,
];

export function isSensitivePath(path: string): boolean {
  return SENSITIVE_PATTERNS.some((pattern) => pattern.test(path));
}

export interface AiFixTarget {
  path: string;
  line: number | null;
}

/**
 * 堆栈 → 本地文件目标：仅采纳 exact/unique 两档（§8.4）；ambiguous/unresolved 不猜测。
 * 按堆栈顺序去重，限 maxTargets（抛出点优先——帧已逆序）。
 */
export function collectFixTargets(
  frames: readonly StackFrame[],
  options: { prefixMap?: readonly { from: string; to: string }[]; trackedFiles: readonly string[]; maxTargets?: number },
): AiFixTarget[] {
  const maxTargets = options.maxTargets ?? AI_FIX_MAX_FILES;
  const seen = new Set<string>();
  const targets: AiFixTarget[] = [];
  for (const frame of frames) {
    if (targets.length >= maxTargets) break;
    const result = resolveStackFrame({ file: frame.file, line: frame.line }, options);
    if (result.kind !== 'exact' && result.kind !== 'unique') continue;
    if (isSensitivePath(result.path)) continue;
    if (seen.has(result.path)) continue;
    seen.add(result.path);
    targets.push({ path: result.path, line: result.line });
  }
  return targets;
}

export interface AiFixFileContext {
  path: string;
  content: string;
  truncated: boolean;
}

export interface AiFixContextResult {
  files: AiFixFileContext[];
  /** 因敏感/不可读/预算不足而未纳入的路径数。 */
  skipped: number;
  truncated: boolean;
}

/**
 * 依次读取目标文件（注入 reader；null = 读取失败/二进制/过大），组装受限载荷：
 * 单文件截断 FILE_CHAR_CAP，累计达 TOTAL_CHAR_BUDGET 或 MAX_FILES 即停止。
 */
export function selectContextFiles(
  targets: readonly AiFixTarget[],
  read: (path: string) => string | null,
  limits?: { maxFiles?: number; fileCharCap?: number; totalBudget?: number },
): AiFixContextResult {
  const maxFiles = limits?.maxFiles ?? AI_FIX_MAX_FILES;
  const fileCharCap = limits?.fileCharCap ?? AI_FIX_FILE_CHAR_CAP;
  const totalBudget = limits?.totalBudget ?? AI_FIX_TOTAL_CHAR_BUDGET;
  const files: AiFixFileContext[] = [];
  let used = 0;
  let skipped = 0;
  let truncated = false;
  for (const target of targets) {
    if (files.length >= maxFiles) {
      skipped += 1;
      continue;
    }
    const raw = read(target.path);
    if (raw == null || raw.includes('\0')) {
      skipped += 1;
      continue;
    }
    const remaining = totalBudget - used;
    if (remaining <= 0) {
      skipped += 1;
      truncated = true;
      continue;
    }
    const content = raw.length > Math.min(fileCharCap, remaining) ? raw.slice(0, Math.min(fileCharCap, remaining)) : raw;
    const wasTruncated = content.length < raw.length;
    if (wasTruncated) truncated = true;
    files.push({ path: target.path, content, truncated: wasTruncated });
    used += content.length;
  }
  return { files, skipped, truncated };
}

/** 从 issue 堆栈一步组装上下文（供对话框调用；reader 注入保持可测）。 */
export function collectAiFixContext(
  issue: UnifiedErrorIssue,
  options: {
    prefixMap?: readonly { from: string; to: string }[];
    trackedFiles: readonly string[];
    read: (path: string) => string | null;
  },
): AiFixContextResult & { targets: AiFixTarget[] } {
  const targets = collectFixTargets(issue.stacktrace ?? [], options);
  const result = selectContextFiles(targets, options.read);
  return { ...result, targets };
}
