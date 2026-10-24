/**
 * Git Conflict Parser and Resolver Utilities
 * Supports standard Git 2-way and 3-way (diff3) conflict markers:
 * <<<<<<< <current>
 * ...
 * ||||||| <base> (optional)
 * ...
 * =======
 * ...
 * >>>>>>> <incoming>
 */

export interface ConflictBlock {
  id: string;
  index: number;
  startLine: number; // 1-indexed line in file
  endLine: number;   // 1-indexed line in file
  currentBranchName: string;
  incomingBranchName: string;
  currentContent: string;
  baseContent?: string;
  incomingContent: string;
  rawStartIdx: number;
  rawEndIdx: number;
}

export interface ParseConflictResult {
  hasConflicts: boolean;
  totalConflicts: number;
  blocks: ConflictBlock[];
  rawContent: string;
}

const CONFLICT_START_REGEX = /^<{7}(?: (.*))?$/;
const CONFLICT_BASE_REGEX = /^\|{7}(?: (.*))?$/;
const CONFLICT_DIVIDER_REGEX = /^={7}$/;
const CONFLICT_END_REGEX = /^>{7}(?: (.*))?$/;

/**
 * Check if the text contains Git conflict markers.
 */
export function hasConflictMarkers(content: string): boolean {
  return /<{7}/.test(content) && /={7}/.test(content) && />{7}/.test(content);
}

/**
 * Parses all conflict blocks from raw file content.
 */
export function parseConflictBlocks(content: string): ParseConflictResult {
  if (!content) {
    return { hasConflicts: false, totalConflicts: 0, blocks: [], rawContent: '' };
  }

  const lines = content.split(/\r?\n/);
  const blocks: ConflictBlock[] = [];

  let inConflict = false;
  let inBase = false;
  let inIncoming = false;

  let startLine = 0;
  let currentBranch = '当前更改 (HEAD)';
  let incomingBranch: string;
  let currentLines: string[] = [];
  let baseLines: string[] = [];
  let incomingLines: string[] = [];
  let blockIndex = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    if (!inConflict) {
      const match = line.match(CONFLICT_START_REGEX);
      if (match) {
        inConflict = true;
        inBase = false;
        inIncoming = false;
        startLine = lineNum;
        currentBranch = (match[1] || 'HEAD').trim();
        currentLines = [];
        baseLines = [];
        incomingLines = [];
      }
    } else {
      if (!inIncoming && !inBase && CONFLICT_BASE_REGEX.test(line)) {
        inBase = true;
        continue;
      }

      if (!inIncoming && CONFLICT_DIVIDER_REGEX.test(line)) {
        inIncoming = true;
        inBase = false;
        continue;
      }

      const endMatch = line.match(CONFLICT_END_REGEX);
      if (endMatch) {
        incomingBranch = (endMatch[1] || '传入更改').trim();

        blocks.push({
          id: `conflict-${blockIndex}-${startLine}`,
          index: blockIndex,
          startLine,
          endLine: lineNum,
          currentBranchName: currentBranch,
          incomingBranchName: incomingBranch,
          currentContent: currentLines.join('\n'),
          baseContent: baseLines.length > 0 ? baseLines.join('\n') : undefined,
          incomingContent: incomingLines.join('\n'),
          rawStartIdx: startLine - 1,
          rawEndIdx: lineNum - 1,
        });

        blockIndex++;
        inConflict = false;
        inBase = false;
        inIncoming = false;
        continue;
      }

      if (inIncoming) {
        incomingLines.push(line);
      } else if (inBase) {
        baseLines.push(line);
      } else {
        currentLines.push(line);
      }
    }
  }

  return {
    hasConflicts: blocks.length > 0,
    totalConflicts: blocks.length,
    blocks,
    rawContent: content,
  };
}

interface ConflictSpan {
  /** Character offset of the `<<<<<<<` marker line. */
  blockStart: number;
  /** Character offset where content resumes, just past the `>>>>>>>` line's terminator. */
  afterEnd: number;
  /** Terminator of the `>>>>>>>` line, '' when the block ends at EOF without one. */
  endTerminator: string;
  /** Terminator to use between replacement lines ('' means the block is at EOF). */
  eol: '\n' | '\r\n';
}

/**
 * Locates a conflict block by 0-indexed line numbers while tracking raw
 * character offsets and line terminators, so replacement can be done as a
 * string slice that leaves every uninvolved line (and its line ending)
 * byte-identical — even in files with mixed line endings.
 */
function locateConflictSpan(content: string, startLine0: number, endLine0: number): ConflictSpan | null {
  let offset = 0;
  let lineIndex = 0;
  let blockStart = -1;
  let afterEnd = content.length;
  let endTerminator = '';
  let eol: '\n' | '\r\n' = '\n';
  while (offset < content.length && lineIndex <= endLine0) {
    if (lineIndex === startLine0) blockStart = offset;
    const nl = content.indexOf('\n', offset);
    const lineEnd = nl === -1 ? content.length : nl + 1;
    if (lineIndex < endLine0 && nl !== -1) {
      // Terminators of the lines before the block decide the replacement's EOL style.
      eol = nl > offset && content[nl - 1] === '\r' ? '\r\n' : '\n';
    }
    if (lineIndex === endLine0) {
      endTerminator = nl === -1 ? '' : nl > offset && content[nl - 1] === '\r' ? '\r\n' : '\n';
      afterEnd = lineEnd;
    }
    offset = lineEnd;
    lineIndex++;
  }
  return blockStart < 0 ? null : { blockStart, afterEnd, endTerminator, eol };
}

/**
 * Resolves a specific conflict block within the full file content by index.
 * Only the block span is rewritten; line endings elsewhere are preserved.
 */
export function resolveSingleBlock(
  content: string,
  blockIndex: number,
  resolution: 'current' | 'incoming' | 'both' | 'both_reverse' | 'custom',
  customContent: string = ''
): string {
  const parsed = parseConflictBlocks(content);
  const target = parsed.blocks.find((b) => b.index === blockIndex);
  if (!target) return content;

  let replacement = '';
  switch (resolution) {
    case 'custom':
      replacement = customContent;
      break;
    case 'current':
      replacement = target.currentContent;
      break;
    case 'incoming':
      replacement = target.incomingContent;
      break;
    case 'both':
      replacement = target.currentContent
        ? target.incomingContent
          ? `${target.currentContent}\n${target.incomingContent}`
          : target.currentContent
        : target.incomingContent;
      break;
    case 'both_reverse':
      replacement = target.incomingContent
        ? target.currentContent
          ? `${target.incomingContent}\n${target.currentContent}`
          : target.incomingContent
        : target.currentContent;
      break;
  }

  const span = locateConflictSpan(content, target.startLine - 1, target.endLine - 1);
  if (!span) return content;
  const replacementLines = replacement.length > 0 ? replacement.split('\n') : [];
  // When the resolution is empty the single separator that used to sit between
  // the block and the following content is dropped along with the block.
  const middle = replacementLines.length
    ? replacementLines.join(span.eol) + (span.endTerminator || '')
    : '';
  return content.slice(0, span.blockStart) + middle + content.slice(span.afterEnd);
}

/**
 * Resolves all conflict blocks in the file using the given resolution rule.
 */
export function resolveAllBlocks(
  content: string,
  resolution: 'current' | 'incoming' | 'both'
): string {
  let currentContent = content;
  let parsed = parseConflictBlocks(currentContent);

  while (parsed.blocks.length > 0) {
    currentContent = resolveSingleBlock(currentContent, parsed.blocks[0].index, resolution);
    parsed = parseConflictBlocks(currentContent);
  }

  return currentContent;
}
