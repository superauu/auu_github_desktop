import type { ParsedDiffLine } from '@/services/git/PorcelainParser';
import type { SplitRow } from './diffRows';

/** 一段连续的修改行：滚动条标记与「上/下一处修改」跳转共用这一定位口径。 */
export interface DiffMarkerRun {
  /** 段起始行（items 下标，含）。 */
  startIndex: number;
  /** 段结束行（含）。 */
  endIndex: number;
  hasAdd: boolean;
  hasDel: boolean;
}

/** 统一视图的修改段：连续的增/删行合为一段，块头与上下文行切断。 */
export function computeDiffMarkerRuns(lines: readonly ParsedDiffLine[]): DiffMarkerRun[] {
  const runs: DiffMarkerRun[] = [];
  let current: DiffMarkerRun | null = null;
  for (let index = 0; index < lines.length; index++) {
    const type = lines[index].type;
    if (type !== 'add' && type !== 'delete') { current = null; continue; }
    if (!current) { current = { startIndex: index, endIndex: index, hasAdd: false, hasDel: false }; runs.push(current); }
    current.endIndex = index;
    if (type === 'add') current.hasAdd = true; else current.hasDel = true;
  }
  return runs;
}

/** 分栏视图的修改段：左列删除或右列新增都算变更行，块头行切断。 */
export function computeSplitMarkerRuns(rows: readonly SplitRow[]): DiffMarkerRun[] {
  const runs: DiffMarkerRun[] = [];
  let current: DiffMarkerRun | null = null;
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    const hasDel = row.left?.type === 'delete';
    const hasAdd = row.right?.type === 'add';
    if (row.isHeader || (!hasDel && !hasAdd)) { current = null; continue; }
    if (!current) { current = { startIndex: index, endIndex: index, hasAdd: false, hasDel: false }; runs.push(current); }
    current.endIndex = index;
    current.hasAdd ||= hasAdd;
    current.hasDel ||= hasDel;
  }
  return runs;
}
