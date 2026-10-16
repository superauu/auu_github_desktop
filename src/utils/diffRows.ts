import type { ParsedDiffLine } from '@/services/git/PorcelainParser';

export interface SplitRow {
  isHeader?: boolean;
  headerContent?: string;
  hunkIdx?: number;
  left?: {
    lineNo?: number | null;
    content: string;
    type: 'delete' | 'context';
  };
  right?: {
    lineNo?: number | null;
    content: string;
    type: 'add' | 'context';
  };
}

export function computeSplitRows(diffLines: ParsedDiffLine[]): SplitRow[] {
  const rows: SplitRow[] = [];
  let i = 0;
  let hunkIdx = -1;

  while (i < diffLines.length) {
    const line = diffLines[i];

    if (line.type === 'header') {
      hunkIdx++;
      rows.push({
        isHeader: true,
        headerContent: line.content,
        hunkIdx,
      });
      i++;
      continue;
    }

    if (line.type === 'context') {
      rows.push({
        left: { lineNo: line.oldNo, content: line.content, type: 'context' },
        right: { lineNo: line.newNo, content: line.content, type: 'context' },
      });
      i++;
      continue;
    }

    // Accumulate consecutive deletes and adds to align them side-by-side
    const deletes: ParsedDiffLine[] = [];
    const adds: ParsedDiffLine[] = [];

    while (i < diffLines.length && (diffLines[i].type === 'delete' || diffLines[i].type === 'add')) {
      if (diffLines[i].type === 'delete') {
        deletes.push(diffLines[i]);
      } else {
        adds.push(diffLines[i]);
      }
      i++;
    }

    const maxLen = Math.max(deletes.length, adds.length);
    for (let k = 0; k < maxLen; k++) {
      const del = deletes[k];
      const add = adds[k];
      rows.push({
        left: del ? { lineNo: del.oldNo, content: del.content, type: 'delete' } : undefined,
        right: add ? { lineNo: add.newNo, content: add.content, type: 'add' } : undefined,
      });
    }
  }

  return rows;
}
