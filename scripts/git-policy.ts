const commands = new Set(['--version', 'status', 'rev-parse', 'log', 'show', 'diff', 'blame', 'branch', 'tag', 'stash', 'remote', 'fetch', 'pull', 'push', 'clone', 'init', 'add', 'rm', 'restore', 'checkout', 'switch', 'commit', 'merge', 'rebase', 'revert', 'cherry-pick', 'reset', 'clean', 'apply', 'check-ref-format', 'check-ignore', 'for-each-ref', 'show-ref', 'update-ref', 'symbolic-ref', 'rev-list', 'merge-tree', 'reflog', 'ls-files', 'ls-tree', 'hash-object', 'write-tree', 'cat-file', 'worktree', 'config']);
const fixedOverrides = new Set(['core.quotepath=false', 'core.editor=true', 'rebase.updaterefs=false']);
function safeOverride(value: string): boolean {
  if (fixedOverrides.has(value.toLowerCase())) return true;
  const match = /^sequence\.editor=printf '%s\\n' '(.+)' > "\$1"; :$/.exec(value);
  const entries = match?.[1].split("' '");
  return !!entries && entries.length <= 30 && entries.every((entry, index) => /^(pick|squash|fixup) ([0-9a-f]{40}|[0-9a-f]{64})$/i.test(entry) && (index !== 0 || entry.startsWith('pick ')));
}

function shortOption(command: string, argument: string): boolean {
  if (!argument.startsWith('-') || argument.startsWith('--')) return false;
  const valueFlags: Record<string, string> = { clone: 'boju', init: 'b', merge: 'mFXS', rebase: 'XCS' };
  if (!(command in valueFlags)) return false;
  for (let index = 1; index < argument.length; index++) {
    const flag = argument[index];
    if ((['clone', 'init'].includes(command) && flag === 'c') || (command === 'clone' && flag === 'u') ||
        (['merge', 'rebase'].includes(command) && flag === 's') || (command === 'rebase' && flag === 'x')) throw new Error(`Unsupported Git option: -${flag}`);
    if (valueFlags[command].includes(flag)) return index === argument.length - 1;
  }
  return false;
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
    if (!read && !/^(user\.(name|email)|auugit\..+|branch\..+\.(remote|merge|pushremote))$/.test(values[0] || '')) throw new Error('Unsupported Git configuration access');
  }
  const blocked = ['--upload-pack', '--receive-pack', '--exec', '--ext-diff', '--textconv', '--template', '--separate-git-dir', '--unsafe-paths', '--output', '--config', '--config-env', '--strategy'];
  for (let cursor = index + 1; cursor < args.length; cursor++) {
    const argument = args[cursor];
    if (argument === '--' || argument === '--end-of-options') break;
    const consumesValue = shortOption(command, argument);
    const option = argument.split('=')[0];
    if ((option.startsWith('--') && option.length > 2 && blocked.some(value => value.startsWith(option))) ||
        (command === 'rebase' && argument.startsWith('-x')) ||
        (['clone', 'init'].includes(command) && argument.startsWith('-c')) ||
        (['merge', 'rebase'].includes(command) && argument.startsWith('-s')) ||
        (['push', 'fetch', 'pull', 'clone'].includes(command) && argument.startsWith('-u'))) throw new Error(`Unsupported Git option: ${option}`);
    if (consumesValue || ['-m', '--message', '--format', '--pretty', '--author', '--grep', '-b', '-B', '-n', '--max-count', '--file'].includes(argument)) cursor++;
  }
  return { command, index };
}
