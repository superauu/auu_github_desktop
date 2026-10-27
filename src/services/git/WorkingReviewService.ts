import { executeGit } from './GitExecutor';
import { groupDiffIntoHunks, parseDiffOutput, type ParsedDiffLine } from './PorcelainParser';
import type { GitFileChange } from './types';

export interface WorkingReviewSnapshot {
  fingerprint: string;
  hunks: { id: string; header: string }[];
  lines: ParsedDiffLine[];
  metadata: string[];
}
export type WorkingReviewIdentity = Pick<WorkingReviewSnapshot, 'fingerprint' | 'hunks'>;

const digest = async (text: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))), byte => byte.toString(16).padStart(2, '0')).join('');

/** Read the complete diff, including binary object IDs and mode changes. Never use -w for review evidence. */
export async function captureWorkingReview(repoPath: string, file: GitFileChange, wholeWorktree = false, head = ''): Promise<WorkingReviewSnapshot> {
  const untracked = file.status === 'untracked' || (wholeWorktree && !head);
  const args = ['--literal-pathspecs', 'diff', '--no-color', '--no-ext-diff', '--no-textconv', '--full-index'];
  if (untracked) args.push('--no-index', '--', '/dev/null', file.path);
  else {
    if (wholeWorktree && head) args.push(head);
    else if (file.staged) args.push('--staged');
    args.push('--', ...new Set([file.oldPath, file.path].filter((path): path is string => !!path)));
  }
  const raw = (await executeGit(args, repoPath)).stdout;
  const lines = parseDiffOutput(raw);
  // Git's no-index and cached diff can spell the first path differently for a new file.
  const normalized = raw.split('\n').filter(line => !line.startsWith('diff --git ')).join('\n');
  const metadata = raw.split('\n').filter(line => /^(?:new file mode|deleted file mode|old mode|new mode|rename from|rename to|copy from|copy to) /.test(line));
  const hunks = groupDiffIntoHunks(lines).filter(hunk => hunk.some(line => line.type === 'add' || line.type === 'delete'));
  return {
    fingerprint: await digest(normalized),
    hunks: await Promise.all(hunks.map(async hunk => ({
      id: await digest(metadata.join('\n') + '\n' + hunk.map(line => line.patchContent ?? line.content).join('\n')),
      header: hunk[0].content,
    }))),
    lines,
    metadata,
  };
}

export async function captureWorkingReviews(repoPath: string, files: GitFileChange[], wholeWorktree = false, head = '') {
  const result: { file: GitFileChange; snapshot: WorkingReviewSnapshot | null }[] = new Array(files.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(4, files.length) }, async () => {
    while (next < files.length) {
      const index = next++, file = files[index];
      try { result[index] = { file, snapshot: await captureWorkingReview(repoPath, file, wholeWorktree, head) }; }
      catch { result[index] = { file, snapshot: null }; }
    }
  }));
  return result;
}
