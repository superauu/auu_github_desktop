import type { GitWorktree } from './types';

/** --porcelain -z keeps Unicode, newlines and spaces in paths unambiguous. */
export function parseWorktrees(output: string): GitWorktree[] {
  const result: GitWorktree[] = [];
  let current: GitWorktree | null = null;
  for (const field of output.split('\0')) {
    if (field.startsWith('worktree ')) {
      current = { path: field.slice(9) }; result.push(current);
    } else if (current) {
      if (field.startsWith('HEAD ')) current.head = field.slice(5);
      else if (field.startsWith('branch ')) current.branch = field.slice(7);
      else if (field === 'detached') current.detached = true;
      else if (field === 'bare') current.bare = true;
      else if (field === 'locked' || field.startsWith('locked ')) current.locked = field.slice(7) || true;
      else if (field === 'prunable' || field.startsWith('prunable ')) current.prunable = field.slice(9) || true;
    }
  }
  return result;
}

export function sameWorktreePath(left: string, right: string): boolean {
  const normalize = (path: string) => {
    const clean = path.replace(/\\/g, '/').replace(/\/$/, '');
    return /^[a-z]:(?:\/|$)/i.test(clean) || clean.startsWith('//') ? clean.toLowerCase() : clean;
  };
  return normalize(left) === normalize(right);
}
