import type { GitFileChange, GitStatusResult } from './types';

/** One policy shared by the scope summary, generation and commit action. */
export function getCommitScope(status: GitStatusResult | null, amend = false) {
  const staged = status?.staged || [];
  const unstaged = [...(status?.unstaged || []), ...(status?.untracked || [])];
  const stageAll = staged.length === 0 && !amend && unstaged.length > 0;
  const files: GitFileChange[] = stageAll ? unstaged : staged;
  return { files, stageAll, excluded: stageAll ? [] : unstaged };
}
