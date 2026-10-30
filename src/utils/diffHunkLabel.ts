import type { ParsedDiffLine } from '@/services/git/PorcelainParser';
import { translate, type Lang } from '@/i18n';

export interface DiffHunkRange { start: number; count: number }
export interface DiffHunkStats { added: number; removed: number }
/** Presentation only. Original headers remain the identities used by Git and review records. */
export function parseDiffHunkHeader(header: string) {
  const match = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(?:[ \t](.*))?$/.exec(header);
  if (!match) return null;
  const old = { start: Number(match[1]), count: Number(match[2] ?? 1) };
  const next = { start: Number(match[3]), count: Number(match[4] ?? 1) };
  if ([old, next].some(range => !Number.isSafeInteger(range.start) || !Number.isSafeInteger(range.count) || !Number.isSafeInteger(range.start + Math.max(0, range.count - 1)) || range.count > 0 && range.start === 0)) return null;
  return { old, next, context: match[5] || '' };
}

export function formatDiffHunkLabel(header: string, lang: Lang) {
  const parsed = parseDiffHunkHeader(header);
  if (!parsed) return header;
  const side = (range: DiffHunkRange, old: boolean) => {
    const prefix = old ? 'diffHunk.old' : 'diffHunk.new';
    if (range.count === 0) return range.start === 0 ? translate(lang, `${prefix}Empty`) : translate(lang, `${prefix}After`).replace('{n}', String(range.start));
    const lines = range.count === 1 ? String(range.start) : `${range.start}–${range.start + range.count - 1}`;
    return translate(lang, prefix).replace('{lines}', lines);
  };
  return `${side(parsed.old, true)} → ${side(parsed.next, false)}`;
}

/** Count changed lines from the body, never infer them from context-inclusive ranges. */
export function diffHunkStats(lines: readonly ParsedDiffLine[]) {
  const result = new Map<number, DiffHunkStats>();
  let current: DiffHunkStats | undefined;
  lines.forEach((line, index) => {
    if (line.type === 'header') { current = { added: 0, removed: 0 }; result.set(index, current); }
    else if (current && line.type === 'add') current.added++;
    else if (current && line.type === 'delete') current.removed++;
  });
  return result;
}
