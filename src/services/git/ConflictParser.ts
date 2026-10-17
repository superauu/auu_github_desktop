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
  let incomingBranch = '传入更改 (Incoming)';
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

/**
 * Resolves a specific conflict block within the full file content by index.
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

  const lines = content.split(/\r?\n/);
  const before = lines.slice(0, target.startLine - 1);
  const after = lines.slice(target.endLine);

  const replacementLines = replacement.length > 0 ? replacement.split('\n') : [];
  return [...before, ...replacementLines, ...after].join(content.includes('\r\n') ? '\r\n' : '\n');
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
