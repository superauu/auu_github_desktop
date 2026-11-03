import type { ParsedDiffLine } from '@/services/git/PorcelainParser';
import { parseDiffHunkHeader } from './diffHunkLabel';
import type { DiffContentSide } from './codeScope';

/** 把整文件内容切成行：去掉 CR，丢弃末尾换行产生的空元素。 */
export function splitFileContent(content: string): string[] {
  if (!content) return [];
  const lines = content.split('\n').map(line => line.replace(/\r$/, ''));
  if (lines.length && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

interface DiffHunkSlice {
  header: ParsedDiffLine;
  body: ParsedDiffLine[];
  oldStart: number; oldCount: number; newStart: number; newCount: number;
}

function collectHunks(diffLines: readonly ParsedDiffLine[]): DiffHunkSlice[] | null {
  const hunks: DiffHunkSlice[] = [];
  for (const line of diffLines) {
    if (line.type === 'header') {
      const parsed = parseDiffHunkHeader(line.content);
      // 二进制块、畸形块头：整文件展开没有意义，原样返回。
      if (!parsed) return null;
      hunks.push({
        header: line, body: [],
        oldStart: parsed.old.start, oldCount: parsed.old.count,
        newStart: parsed.next.start, newCount: parsed.next.count,
      });
    } else if (hunks.length) {
      hunks[hunks.length - 1].body.push(line);
    }
  }
  return hunks;
}

/**
 * 统一 diff 的行号语义：count 为 0 时 start 表示插入/删除点，该行本身已被前文消费。
 * 展开未变更行必须按这个口径算两侧偏移，否则纯删除块之后的行号会错位。
 */
const consumedBefore = (start: number, count: number) => count > 0 ? start - 1 : start;

/**
 * 把块与块之间、首块之前、末块之后的未变更行补成上下文行，
 * 得到可以整文件滚动浏览的行列表（只读用途，不参与暂存 patch 重建）。
 * 块头保留原位，因此完整文件视图里仍然能看到「所属方法」。
 */
export function expandDiffWithFile(
  diffLines: readonly ParsedDiffLine[],
  fileLines: readonly string[],
  side: DiffContentSide = 'new',
): ParsedDiffLine[] {
  if (!fileLines.length) return [...diffLines];
  const hunks = collectHunks(diffLines);
  if (!hunks?.length) return [...diffLines];

  const result: ParsedDiffLine[] = [];
  const pushGap = (from: number, to: number, offset: number) => {
    for (let n = from; n <= to; n++) {
      const text = fileLines[n - 1];
      if (text === undefined) break;
      const oldNo = side === 'new' ? n + offset : n;
      result.push({
        type: 'context',
        oldNo: oldNo >= 1 ? oldNo : null,
        newNo: side === 'new' ? n : null,
        content: ` ${text}`,
      });
    }
  };

  // 已消费的行数用游标推进：首块之前、块之间、末块之后都从游标继续补行。
  // 块的「已消费到第几行」对 count 为 0 的块同样成立（此时 start 本身就是已消费的行）。
  let cursorOld = 0, cursorNew = 0;
  for (const hunk of hunks) {
    const beforeOld = consumedBefore(hunk.oldStart, hunk.oldCount);
    const beforeNew = consumedBefore(hunk.newStart, hunk.newCount);
    pushGap(
      (side === 'new' ? cursorNew : cursorOld) + 1,
      side === 'new' ? beforeNew : beforeOld,
      beforeOld - beforeNew,
    );
    result.push(hunk.header, ...hunk.body);
    cursorOld = beforeOld + hunk.oldCount;
    cursorNew = beforeNew + hunk.newCount;
  }

  pushGap((side === 'new' ? cursorNew : cursorOld) + 1, fileLines.length, cursorOld - cursorNew);
  return result;
}
