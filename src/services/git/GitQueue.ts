const queues = new Map<string, Promise<void>>();
const pending = new Map<string, number>();
const listeners = new Set<() => void>();
const repoKey = (path: string) => path.replace(/\\/g, '/').replace(/\/$/, '');
export const subscribeGitWrites = (notify: () => void) => { listeners.add(notify); return () => { listeners.delete(notify); }; };
export const getPendingGitWrites = (path: string) => pending.get(repoKey(path)) || 0;

/** Git index/ref writes serialize per repository; reads remain concurrent. */
export function serializeGitWrite<T>(repoPath: string, run: () => Promise<T>): Promise<T> {
  const key = repoKey(repoPath);
  pending.set(key, (pending.get(key) || 0) + 1);
  listeners.forEach(notify => notify());
  const next = (queues.get(key) || Promise.resolve()).then(run);
  const tail = next.then(() => {}, () => {});
  queues.set(key, tail);
  void tail.then(() => {
    pending.set(key, Math.max(0, (pending.get(key) || 1) - 1));
    if (!pending.get(key)) pending.delete(key);
    listeners.forEach(notify => notify());
    if (queues.get(key) === tail) queues.delete(key);
  });
  return next;
}

export function isReadOnlyGitCommand(args: string[]): boolean {
  const [command, ...options] = args;
  if (command === 'worktree') return options[0] === 'list';
  if (['status', 'log', 'show', 'diff', 'rev-parse', 'for-each-ref', 'ls-files', 'ls-tree', 'cat-file', 'blame', 'check-ignore', '--version', 'help'].includes(command)) return true;
  if (command === 'branch') return options.some(option => ['--list', '--show-current', '-a', '-r', '-v', '-vv'].includes(option)) && !options.some(option => ['-d', '-D', '-m', '-M', '-f', '--delete', '--move', '--force'].includes(option));
  if (command === 'tag') return options.includes('-l') || options.includes('--list');
  if (command === 'stash') return ['list', 'show'].includes(options[0]);
  if (command === 'remote') return options[0] === 'get-url' || options[0] === '-v';
  if (command === 'config') return options.some(option => ['--get', '--get-regexp', '--list', '-l'].includes(option));
  return false;
}
