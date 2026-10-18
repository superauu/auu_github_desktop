const queues = new Map<string, Promise<void>>();
const pending = new Map<string, number>();
const listeners = new Set<() => void>();
const repoKey = (path: string) => path.replace(/\\/g, '/').replace(/\/$/, '');
export const subscribeGitWrites = (notify: () => void) => { listeners.add(notify); return () => { listeners.delete(notify); }; };
export const getPendingGitWrites = (path: string) => pending.get(repoKey(path)) || 0;
export const getTotalPendingGitWrites = () => [...pending.values()].reduce((total, count) => total + count, 0);
export class GitQueueCancelledError extends Error {}

interface Task { command: string; startedAt: number | null; cancelled: string | null }
export interface GitWriteActivity { command: string; startedAt: number | null; queued: number }
const tasks = new Map<string, Set<Task>>();
const activity = new Map<string, GitWriteActivity>();
export const getGitWriteActivity = (path: string) => activity.get(repoKey(path)) ?? null;
function publish(key: string) {
  const live = [...(tasks.get(key) || [])].filter(task => task.cancelled === null);
  const running = live.find(task => task.startedAt !== null);
  if (live.length) {
    pending.set(key, live.length);
    activity.set(key, { command: running?.command || live[0].command, startedAt: running?.startedAt ?? null,
      queued: live.length - (running ? 1 : 0) });
  } else { pending.delete(key); activity.delete(key); }
  listeners.forEach(notify => notify());
}

/** Only tasks that have not started may be cancelled; running writes always finish. */
export function cancelQueuedGitWrites(path: string, message: string): void {
  const key = repoKey(path);
  for (const task of tasks.get(key) || []) if (task.startedAt === null) task.cancelled = message;
  publish(key);
}

/** Update the displayed phase within a transaction without exposing paths or arguments. */
export function updateGitWriteCommand(path: string, command: string): void {
  const key = repoKey(path);
  const task = [...(tasks.get(key) || [])].find(task => task.startedAt !== null && task.cancelled === null);
  if (task && task.command !== command) { task.command = command; publish(key); }
}

/** Git index/ref writes serialize per repository; reads remain concurrent. */
export function serializeGitWrite<T>(repoPath: string, run: () => Promise<T>, command = 'transaction'): Promise<T> {
  const key = repoKey(repoPath);
  const task: Task = { command, startedAt: null, cancelled: null };
  if (!tasks.has(key)) tasks.set(key, new Set());
  tasks.get(key)!.add(task);
  publish(key);
  const next = (queues.get(key) || Promise.resolve()).then(async () => {
    try {
      if (task.cancelled !== null) throw new GitQueueCancelledError(task.cancelled);
      task.startedAt = Date.now(); publish(key);
      return await run();
    } finally {
      tasks.get(key)?.delete(task);
      if (!tasks.get(key)?.size) tasks.delete(key);
      publish(key);
    }
  });
  const tail = next.then(() => {}, () => {});
  queues.set(key, tail);
  void tail.then(() => { if (queues.get(key) === tail) queues.delete(key); });
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
