import {
  GitBlameLine,
  GitBranch,
  GitCommit,
  GitFileChange,
  GitFileStatusType,
  GitStatusResult,
  GitTag,
} from './types';
import { tNow } from '@/i18n';

/**
 * 还原 git C 风格引号路径（如 "src/\346\226\207\344\273\266.txt"）。
 * 八进制转义为 UTF-8 字节序列，需按字节聚合后统一解码，
 * 否则中文等非 ASCII 字符会变成 mojibake。
 */
export function unquoteGitPath(path: string): string {
  if (path.length < 2 || !path.startsWith('"') || !path.endsWith('"')) return path;

  const inner = path.slice(1, -1);
  const bytes: number[] = [];
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (ch === '\\' && i + 1 < inner.length) {
      const oct = inner.slice(i + 1, i + 4);
      if (/^[0-7]{3}$/.test(oct)) {
        bytes.push(parseInt(oct, 8));
        i += 3;
        continue;
      }
      const next = inner[i + 1];
      switch (next) {
        case 'n': bytes.push(10); break;
        case 't': bytes.push(9); break;
        case 'r': bytes.push(13); break;
        case '"': bytes.push(34); break;
        case '\\': bytes.push(92); break;
        default: bytes.push(next.charCodeAt(0) & 0xff);
      }
      i++;
    } else {
      bytes.push(...new TextEncoder().encode(ch));
    }
  }
  try {
    return new TextDecoder('utf-8').decode(new Uint8Array(bytes));
  } catch {
    return path;
  }
}

/**
 * Parses output from `git status --porcelain=v2 --branch`
 */
export function parsePorcelainV2(output: string): GitStatusResult {
  const lines = output.split(/\r?\n/);

  let currentBranch = 'main';
  let trackingBranch: string | undefined = undefined;
  let ahead = 0;
  let behind = 0;

  const staged: GitFileChange[] = [];
  const unstaged: GitFileChange[] = [];
  const untracked: GitFileChange[] = [];

  for (const line of lines) {
    if (!line.trim()) continue;

    // Header branch lines
    if (line.startsWith('# branch.head ')) {
      currentBranch = line.substring('# branch.head '.length).trim();
      if (currentBranch === '(detached)') {
        currentBranch = 'DETACHED';
      }
    } else if (line.startsWith('# branch.upstream ')) {
      trackingBranch = line.substring('# branch.upstream '.length).trim();
    } else if (line.startsWith('# branch.ab ')) {
      const match = line.match(/\+(\d+)\s+-(\d+)/);
      if (match) {
        ahead = parseInt(match[1], 10);
        behind = parseInt(match[2], 10);
      }
    }
    // Untracked files: `? <path>`
    else if (line.startsWith('? ')) {
      const filePath = unquoteGitPath(line.substring(2).trim());
      untracked.push({
        path: filePath,
        status: 'untracked',
        staged: false,
      });
    }
    // Changed tracked files: `1 <XY> <sub> <mH> <mI> <mW> <hH> <hI> <path>`
    else if (line.startsWith('1 ')) {
      const parts = line.split(' ');
      if (parts.length >= 9) {
        const xy = parts[1];
        const filePath = unquoteGitPath(parts.slice(8).join(' '));
        const stagedCode = xy[0];
        const unstagedCode = xy[1];

        // Staged changes
        if (stagedCode !== '.') {
          staged.push({
            path: filePath,
            status: mapStatusCode(stagedCode),
            staged: true,
          });
        }

        // Unstaged changes in working tree
        if (unstagedCode !== '.') {
          unstaged.push({
            path: filePath,
            status: mapStatusCode(unstagedCode),
            staged: false,
          });
        }
      }
    }
    // Renamed files: `2 <XY> ... <path>\t<origPath>`
    else if (line.startsWith('2 ')) {
      const parts = line.split('\t');
      const headerParts = parts[0].split(' ');
      const xy = headerParts[1];
      const filePath = unquoteGitPath(headerParts[headerParts.length - 1]);
      const origPath = unquoteGitPath(parts[1] || '');

      const stagedCode = xy[0];
      const unstagedCode = xy[1];

      if (stagedCode !== '.') {
        staged.push({
          path: filePath,
          oldPath: origPath,
          status: 'renamed',
          staged: true,
        });
      }
      if (unstagedCode !== '.') {
        unstaged.push({
          path: filePath,
          oldPath: origPath,
          status: 'renamed',
          staged: false,
        });
      }
    }
    // Unmerged / conflict files: `u <XY> ... <path>`
    else if (line.startsWith('u ')) {
      const parts = line.split(' ');
      const filePath = unquoteGitPath(parts.slice(10).join(' '));
      unstaged.push({
        path: filePath,
        status: 'conflicted',
        staged: false,
      });
    }
  }

  const isClean = staged.length === 0 && unstaged.length === 0 && untracked.length === 0;

  return {
    currentBranch,
    trackingBranch,
    ahead,
    behind,
    isClean,
    staged,
    unstaged,
    untracked,
  };
}

function mapStatusCode(char: string): GitFileStatusType {
  switch (char) {
    case 'M':
      return 'modified';
    case 'A':
      return 'added';
    case 'D':
      return 'deleted';
    case 'R':
      return 'renamed';
    case 'C':
      return 'conflicted';
    default:
      return 'modified';
  }
}

/**
 * Parses machine-formatted `git log` output using ASCII separators:
 * Record separator `\x1e`, Unit separator `\x1f`:
 * `%H%x1f%h%x1f%s%x1f%b%x1f%an%x1f%ae%x1f%aI%x1f%P%x1f%D%x1e`
 */
export function parseGitLog(output: string): GitCommit[] {
  if (!output.trim()) return [];

  const records = output.split('\x1e');
  const commits: GitCommit[] = [];

  for (const record of records) {
    const trimmed = record.trim();
    if (!trimmed) continue;

    const fields = trimmed.split('\x1f');
    if (fields.length < 8) continue;

    const [
      hash,
      shortHash,
      subject,
      body,
      authorName,
      authorEmail,
      authorDateIso,
      parentsStr,
      refNamesStr,
    ] = fields;

    const refs = refNamesStr
      ? refNamesStr
          .split(',')
          .map((r) => r.trim())
          .filter(Boolean)
      : [];

    const parents = parentsStr
      ? parentsStr.split(' ').map((p) => p.trim()).filter(Boolean)
      : [];

    commits.push({
      hash,
      shortHash,
      subject,
      body: body || undefined,
      author: {
        name: authorName,
        email: authorEmail,
        date: authorDateIso,
        relativeDate: formatRelativeTime(authorDateIso),
      },
      parents,
      refs: refs.length > 0 ? refs : undefined,
    });
  }

  return commits;
}

/**
 * Parses `git branch -a -v --no-color`
 */
export function parseGitBranches(output: string): GitBranch[] {
  const lines = output.split(/\r?\n/);
  const branches: GitBranch[] = [];

  for (const line of lines) {
    if (!line.trim()) continue;

    const isCurrent = line.startsWith('* ');
    const cleanLine = line.replace(/^[\*\s]+/, '').trim();
    const parts = cleanLine.split(/\s+/);
    if (parts.length === 0) continue;

    const name = parts[0];
    if (name.includes('->')) continue; // Skip HEAD aliases like remotes/origin/HEAD -> origin/master
    if (/\/HEAD$/.test(name)) continue; // `branch -a -v` 下别名行首列不含箭头，按名称兜底过滤

    const isRemote = name.startsWith('remotes/');
    const displayName = isRemote ? name.replace(/^remotes\//, '') : name;
    const commitHash = parts[1] || '';
    const commitMessage = parts.slice(2).join(' ') || '';

    branches.push({
      name: displayName,
      isCurrent,
      isRemote,
      lastCommit: commitHash
        ? {
            hash: commitHash,
            message: commitMessage,
            date: '',
          }
        : undefined,
    });
  }

  return branches;
}

/**
 * Parses `git tag -l --format="%(refname:short)%x1f%(objectname)%x1f%(subject)%x1f%(taggername)%x1f%(taggeremail)%x1f%(taggerdate:iso-strict)"`
 */
export function parseGitTags(output: string): GitTag[] {
  const lines = output.split(/\r?\n/);
  const tags: GitTag[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const fields = trimmed.includes('\x1f')
      ? trimmed.split('\x1f')
      : trimmed.includes('%x1f')
      ? trimmed.split('%x1f')
      : trimmed.split(/\s+/);
    const name = fields[0];
    const commitHash = fields[1] || '';
    const message = fields[2] || undefined;
    const taggerName = fields[3] || undefined;
    const taggerEmail = fields[4] || undefined;
    const taggerDate = fields[5] || undefined;

    tags.push({
      name,
      commitHash,
      message,
      tagger: taggerName
        ? {
            name: taggerName,
            email: taggerEmail || '',
            date: taggerDate || '',
          }
        : undefined,
      isAnnotated: Boolean(taggerName || message),
    });
  }

  return tags;
}

export interface ParsedDiffLine {
  type: 'header' | 'context' | 'add' | 'delete';
  oldNo: number | null;
  newNo: number | null;
  content: string;
}

/**
 * 将逐行 diff 按 `@@` 块头切分为 hunk 数组，
 * 用于块级暂存（每个 hunk 可独立 stage/unstage/discard）。
 */
export function groupDiffIntoHunks(lines: ParsedDiffLine[]): ParsedDiffLine[][] {
  const hunks: ParsedDiffLine[][] = [];
  for (const line of lines) {
    if (line.type === 'header') {
      hunks.push([line]);
    } else if (hunks.length > 0) {
      hunks[hunks.length - 1].push(line);
    }
  }
  return hunks.filter((h) => h.length > 0);
}

export type HunkPatchMode = 'stage' | 'unstage' | 'discard';
/**
 * 用单个 hunk 重建一段 git apply 可用的完整 patch。
 * - stage: 未暂存 hunk → 写入 index（--cached）；未跟踪文件合成 new file patch
 * - unstage: 已暂存 hunk → --cached --reverse
 * - discard: 未暂存 hunk → 工作区 --reverse（未跟踪文件不支持）
 */
export function buildHunkPatch(
  filePath: string,
  hunk: ParsedDiffLine[],
  mode: HunkPatchMode,
  isUntracked: boolean = false
): string {
  if (hunk.length === 0 || hunk[0].type !== 'header') return '';

  const headerMatch = hunk[0].content.match(
    /@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@/
  );
  // count 缺省时代表 1 行；0 行表示该侧为空（新建/删除）
  const oldCount = headerMatch ? (headerMatch[2] !== undefined ? parseInt(headerMatch[2], 10) : 1) : 1;
  const newCount = headerMatch ? (headerMatch[4] !== undefined ? parseInt(headerMatch[4], 10) : 1) : 1;
  const oldSideEmpty = oldCount === 0;
  const newSideEmpty = newCount === 0;

  const body = hunk.map((l) => l.content).join('\n');
  const safePath = filePath.replace(/\\/g, '/');

  const lines: string[] = [`diff --git a/${safePath} b/${safePath}`];
  if (isUntracked && mode === 'stage') {
    lines.push('new file mode 100644');
    lines.push('--- /dev/null');
    lines.push(`+++ b/${safePath}`);
  } else {
    lines.push(oldSideEmpty ? '--- /dev/null' : `--- a/${safePath}`);
    lines.push(newSideEmpty ? '+++ /dev/null' : `+++ b/${safePath}`);
  }
  lines.push(body);

  return lines.join('\n') + '\n';
}

/**
 * Parses raw unified diff output into structured line objects
 */
export function parseDiffOutput(rawDiff: string): ParsedDiffLine[] {
  if (!rawDiff.trim()) return [];

  const lines = rawDiff.split(/\r?\n/);
  const result: ParsedDiffLine[] = [];

  let oldLine = 0;
  let newLine = 0;

  for (const line of lines) {
    if (
      line.startsWith('diff --git') ||
      line.startsWith('index ') ||
      line.startsWith('--- ') ||
      line.startsWith('+++ ')
    ) {
      continue;
    }

    if (line.startsWith('@@')) {
      // e.g. @@ -14,8 +14,14 @@
      const match = line.match(/@@\s+-(\d+)(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@/);
      if (match) {
        oldLine = parseInt(match[1], 10);
        newLine = parseInt(match[2], 10);
      }
      result.push({
        type: 'header',
        oldNo: null,
        newNo: null,
        content: line,
      });
      continue;
    }

    if (line.startsWith('+')) {
      result.push({
        type: 'add',
        oldNo: null,
        newNo: newLine++,
        content: line,
      });
    } else if (line.startsWith('-')) {
      result.push({
        type: 'delete',
        oldNo: oldLine++,
        newNo: null,
        content: line,
      });
    } else {
      result.push({
        type: 'context',
        oldNo: oldLine++,
        newNo: newLine++,
        content: line,
      });
    }
  }

  return result;
}

/**
 * 解析 `git blame --line-porcelain` 输出。
 * --line-porcelain 使每行都重复完整头信息，解析时遇到制表符行即产出一条记录。
 */
export function parseBlamePorcelain(output: string): GitBlameLine[] {
  if (!output.trim()) return [];

  const lines = output.split(/\r?\n/);
  const result: GitBlameLine[] = [];
  let hash = '';
  let finalLine = 0;
  let author = '';
  let authorDateIso = '';
  let summary = '';

  for (const line of lines) {
    if (line.startsWith('\t')) {
      result.push({
        hash,
        shortHash: hash.slice(0, 7),
        author,
        authorDateIso,
        summary,
        lineNo: finalLine,
        content: line.slice(1),
      });
      hash = '';
      finalLine = 0;
      author = '';
      authorDateIso = '';
      summary = '';
      continue;
    }
    if (!line.trim()) continue;

    // 记录头行：`<40位hash> <原始行号> <最终行号> [<行数>]`
    if (!hash && /^[0-9a-f]{40} \d+ \d+/.test(line)) {
      const parts = line.split(' ');
      hash = parts[0];
      finalLine = parseInt(parts[2], 10) || 0;
      continue;
    }

    const sp = line.indexOf(' ');
    const key = sp === -1 ? line : line.slice(0, sp);
    const value = sp === -1 ? '' : line.slice(sp + 1);
    if (key === 'author') {
      author = value;
    } else if (key === 'author-time') {
      const sec = parseInt(value, 10);
      authorDateIso = Number.isFinite(sec) ? new Date(sec * 1000).toISOString() : '';
    } else if (key === 'summary') {
      summary = value;
    }
  }

  return result;
}

function formatRelativeTime(isoDateStr: string): string {
  try {
    const date = new Date(isoDateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);

    if (diffSec < 60) return tNow('time.justNow');
    if (diffMin < 60) return tNow('time.minutesAgo').replace('{n}', String(diffMin));
    if (diffHour < 24) return tNow('time.hoursAgo').replace('{n}', String(diffHour));
    if (diffDay < 30) return tNow('time.daysAgo').replace('{n}', String(diffDay));
    return date.toLocaleDateString(tNow('time.locale'));
  } catch {
    return isoDateStr;
  }
}
