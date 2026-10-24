const commands = new Set(['--version', 'status', 'rev-parse', 'log', 'show', 'diff', 'blame', 'branch', 'tag', 'stash', 'remote', 'fetch', 'pull', 'push', 'clone', 'init', 'add', 'rm', 'restore', 'checkout', 'switch', 'commit', 'merge', 'rebase', 'revert', 'cherry-pick', 'reset', 'clean', 'apply', 'check-ref-format', 'check-ignore', 'for-each-ref', 'show-ref', 'update-ref', 'symbolic-ref', 'rev-list', 'merge-tree', 'reflog', 'ls-files', 'ls-tree', 'hash-object', 'write-tree', 'cat-file', 'worktree', 'config']);
const fixedOverrides = new Set(['core.quotepath=false', 'core.editor=true', 'rebase.updaterefs=false']);
function safeOverride(value: string): boolean {
  if (fixedOverrides.has(value.toLowerCase())) return true;
  const match = /^sequence\.editor=printf '%s\\n' '(.+)' > "\$1"; :$/.exec(value);
  const entries = match?.[1].split("' '");
  return !!entries && entries.length <= 30 && entries.every((entry, index) => /^(pick|squash|fixup) ([0-9a-f]{40}|[0-9a-f]{64})$/i.test(entry) && (index !== 0 || entry.startsWith('pick ')));
}

// 各命令的短选项声明：[消耗下一个参数, 一律禁止]。白名单只收录前端真实用到的
// (命令, flag)，与 src-tauri/src/git_policy.rs short_option 逐条一致，未声明的一律不取值（fail closed）。
const shortOptions: Record<string, [string, string]> = {
  clone: ['boju', ''], init: ['b', ''], merge: ['m', 'F'], rebase: ['XCS', ''],
  commit: ['m', 'FtcC'], tag: ['m', 'Ft'], stash: ['m', ''], 'update-ref': ['m', ''],
  'hash-object': ['', 'w'],
};
function shortOption(command: string, argument: string): boolean {
  if (!argument.startsWith('-') || argument.startsWith('--')) return false;
  const entry = shortOptions[command];
  if (!entry) return false;
  const [valueFlags, blockedFlags] = entry;
  for (let index = 1; index < argument.length; index++) {
    const flag = argument[index];
    if ((['clone', 'init'].includes(command) && flag === 'c') || (command === 'clone' && flag === 'u') ||
        (['merge', 'rebase'].includes(command) && flag === 's') || (command === 'rebase' && flag === 'x') ||
        blockedFlags.includes(flag)) throw new Error(`Unsupported Git option: -${flag}`);
    if (valueFlags.includes(flag)) return index === argument.length - 1;
  }
  return false;
}

// 相对路径检查：拒绝绝对前缀、.. 上溯与（Windows）盘符。与 Rust escapes_working_directory 一致。
function escapesWorkingDirectory(target: string): boolean {
  const windows = process.platform === 'win32';
  return target.split(windows ? /[/\\]/ : /\//).some((part) => part === '..') ||
    target.startsWith('/') || (windows && target.startsWith('\\')) ||
    target.startsWith('~') || (windows && target.includes(':'));
}

export function isNullDevice(path: string): boolean {
  const lowered = path.toLowerCase();
  return lowered === 'nul' || lowered === '/dev/null';
}

export function noIndexPaths(args: string[], index: number): string[] {
  if (args[index] !== 'diff' || !args.slice(index + 1).some((value) => value.startsWith('--no-in'))) return [];
  const rest = args.slice(index + 1);
  const separator = rest.indexOf('--');
  if (separator < 0) throw new Error('Diff --no-index requires an explicit separator');
  const operands = rest.slice(separator + 1);
  if (operands.length !== 2) throw new Error('Diff --no-index requires exactly two paths');
  for (const operand of operands) {
    if (!isNullDevice(operand) && escapesWorkingDirectory(operand)) {
      throw new Error('Diff --no-index paths must stay inside the repository');
    }
  }
  return operands;
}

export function initTarget(args: string[], index: number): string | null {
  const rest = args.slice(index + 1);
  let skip = false;
  for (let offset = 0; offset < rest.length; offset++) {
    const argument = rest[offset];
    if (skip) { skip = false; continue; }
    if (argument === '--') return rest[offset + 1] ?? null;
    if (argument.startsWith('-')) {
      try { skip = shortOption('init', argument); } catch { skip = false; }
      continue;
    }
    return argument;
  }
  return null;
}

export function worktreeMoveTargets(args: string[], index: number): string[] {
  if (args[index] !== 'worktree' || args[index + 1] !== 'move') return [];
  return args.slice(index + 2).filter((value) => !value.startsWith('-'));
}

export function isLocalCloneSource(source: string): boolean {
  if (source.toLowerCase().startsWith('file:')) return true;
  if (source.includes('://')) return false;
  if (['/', '\\', '.', '~'].some((prefix) => source.startsWith(prefix))) return true;
  if (process.platform === 'win32' && source.length >= 2 && source[1] === ':' && /[a-zA-Z]/.test(source[0])) return true;
  const colon = source.indexOf(':');
  if (colon < 0) return true;
  return source.slice(0, colon).includes('/');
}

export function validateGitArguments(args: string[]): { command: string; index: number } {
  let index = 0;
  while (index < args.length) {
    if (args[index] === '-c') {
      if (!safeOverride(args[index + 1] || '')) throw new Error('Unsupported Git configuration override');
      index += 2;
    } else if (['--literal-pathspecs', '--no-pager', '--no-optional-locks'].includes(args[index])) index++;
    else break;
  }
  const command = args[index];
  if (!commands.has(command)) throw new Error('Unsupported Git command or global option');
  if (command === '--version' && args.length !== index + 1) throw new Error('Invalid version arguments');
  if (command === 'config') {
    const options = new Set(['--local', '--bool', '--int', '--bool-or-int', '--null', '-z', '--get', '--get-all', '--get-regexp', '--get-urlmatch', '--list', '-l', '--replace-all', '--unset', '--unset-all']);
    const rest = args.slice(index + 1);
    let separated = false;
    let read = false;
    const values: string[] = [];
    for (const value of rest) {
      if (!separated && value === '--') { separated = true; continue; }
      if (!separated && value.startsWith('-')) {
        if (!options.has(value)) throw new Error('Unsupported Git configuration access');
        if (['--get', '--get-all', '--get-regexp', '--get-urlmatch', '--list', '-l'].includes(value)) read = true;
      } else values.push(value.toLowerCase());
    }
    // 写入形态恰好是 [key] 或 [key value]；读取形态至多两个位置参数。防多键值走私。
    if (read ? values.length > 2 : values.length !== 1 && values.length !== 2) throw new Error('Unsupported Git configuration access');
    if (!read && !/^(user\.(name|email)|auugit\..+|branch\..+\.(remote|merge|pushremote))$/.test(values[0] || '')) throw new Error('Unsupported Git configuration access');
  }
  const blocked = ['--upload-pack', '--receive-pack', '--exec', '--ext-diff', '--textconv', '--template', '--separate-git-dir', '--unsafe-paths', '--output', '--config', '--config-env', '--strategy', '--contents', '--file'];
  let skipValue = false;
  for (let cursor = index + 1; cursor < args.length; cursor++) {
    const argument = args[cursor];
    if (skipValue) {
      // 取值 flag 的值不再免检：仍执行下方全部选项检查，且不再级联跳过（堵住跳检走私）。
      skipValue = false;
    } else {
      if (argument === '--' || argument === '--end-of-options') break;
      if (shortOption(command, argument)) skipValue = true;
    }
    const option = argument.split('=')[0];
    if ((option.startsWith('--') && option.length > 2 && blocked.some((value) => value.startsWith(option))) ||
        (command === 'rebase' && argument.startsWith('-x')) ||
        (['clone', 'init'].includes(command) && argument.startsWith('-c')) ||
        (['merge', 'rebase'].includes(command) && argument.startsWith('-s')) ||
        (['push', 'fetch', 'pull', 'clone'].includes(command) && argument.startsWith('-u')) ||
        (argument.startsWith('--pathspec-from-file') && argument !== '--pathspec-from-file=-')) {
      throw new Error(`Unsupported Git option: ${option}`);
    }
  }
  noIndexPaths(args, index);
  if (command === 'init') {
    const target = initTarget(args, index);
    if (target && escapesWorkingDirectory(target)) throw new Error('Git init target must stay inside the working directory');
  }
  if (worktreeMoveTargets(args, index).some((target) => escapesWorkingDirectory(target))) {
    throw new Error('Worktree target must stay inside the working directory');
  }
  if (command === 'clone') {
    const separator = args.indexOf('--', index + 1);
    const source = separator >= 0 ? args[separator + 1] : undefined;
    if (source && source.toLowerCase().startsWith('file:')) throw new Error('Unsupported clone protocol: file');
  }
  return { command, index };
}
