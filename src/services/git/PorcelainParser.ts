import {
  GitBranch,
  GitCommit,
  GitFileChange,
  GitFileStatusType,
  GitStatusResult,
  GitTag,
} from './types';

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
      const filePath = line.substring(2).trim();
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
        const filePath = parts.slice(8).join(' ');
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
      const filePath = headerParts[headerParts.length - 1];
      const origPath = parts[1];

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
      const filePath = parts.slice(10).join(' ');
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

function formatRelativeTime(isoDateStr: string): string {
  try {
    const date = new Date(isoDateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);

    if (diffSec < 60) return '刚刚';
    if (diffMin < 60) return `${diffMin} 分钟前`;
    if (diffHour < 24) return `${diffHour} 小时前`;
    if (diffDay < 30) return `${diffDay} 天前`;
    return date.toLocaleDateString('zh-CN');
  } catch {
    return isoDateStr;
  }
}
