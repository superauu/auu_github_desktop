const commands = new Set(['--version', 'status', 'rev-parse', 'log', 'show', 'diff', 'blame', 'branch', 'tag', 'stash', 'remote', 'fetch', 'pull', 'push', 'clone', 'init', 'add', 'rm', 'restore', 'checkout', 'switch', 'bisect', 'describe', 'grep', 'format-patch', 'shortlog', 'count-objects', 'gc', 'fsck', 'ls-remote', 'notes', 'commit', 'merge', 'rebase', 'revert', 'cherry-pick', 'reset', 'clean', 'apply', 'check-ref-format', 'check-ignore', 'for-each-ref', 'show-ref', 'update-ref', 'symbolic-ref', 'rev-list', 'merge-tree', 'reflog', 'ls-files', 'ls-tree', 'hash-object', 'write-tree', 'cat-file', 'worktree', 'submodule', 'lfs', 'config']);
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
  clone: ['boju', ''], init: ['b', ''], merge: ['m', 'FX'], rebase: ['XCS', ''],
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

// URL 百分号解码（与 git 的 url_decode 对齐）：非法序列按字面量保留。解码在授权之前进行，
// ".." 逃逸由调用方的 allowedPath 拒绝。与 src-tauri/src/git_policy.rs percent_decode 一致。
function percentDecode(value: string): string {
  if (!value.includes('%')) return value;
  let result = '', bytes: number[] = [];
  const flush = () => { if (bytes.length) { result += Buffer.from(bytes).toString('utf8'); bytes = []; } };
  for (let index = 0; index < value.length; index++) {
    const hex = value.slice(index + 1, index + 3);
    if (value[index] === '%' && /^[0-9a-fA-F]{2}$/.test(hex)) { bytes.push(parseInt(hex, 16)); index += 2; }
    else { flush(); result += value[index]; }
  }
  flush();
  return result;
}

// 传输目标按本地 file 传输处理时的路径形态；远程 URL 返回 null。远程 URL 包括带 scheme 的
// URL、scp 风格 host:path，以及 git 按 ssh 处理的 file:<path>（单斜杠）形式。file:// URL 解析
// 出文件系统路径：authority 仅接受空、localhost 与（Windows）盘符，并做百分号解码；
// 非本地 host 维持 null（fail closed）。与 src-tauri/src/git_policy.rs local_transport_path 一致。
export function localTransportPath(spec: string): string | null {
  if (spec.length >= 7 && spec.slice(0, 7).toLowerCase() === 'file://') return localFileUrl(spec.slice(7));
  if (spec.length >= 5 && spec.slice(0, 5).toLowerCase() === 'file:') return null;
  if (spec.includes('://')) return null;
  const colon = spec.indexOf(':');
  const slash = spec.search(/[/\\]/);
  if (colon >= 0 && (slash < 0 || colon < slash)) {
    // 冒号先于任何斜杠：Windows 盘符路径，或 scp 风格 host:path（远程）。
    if (process.platform === 'win32' && spec.length >= 2 && spec[1] === ':' && /[a-zA-Z]/.test(spec[0])) return spec;
    return null;
  }
  return spec;
}

function localFileUrl(rest: string): string | null {
  const boundary = rest.search(/[/\\]/);
  if (boundary < 0) return null;
  const authority = rest.slice(0, boundary);
  let result = rest.slice(boundary);
  if (authority.toLowerCase() !== 'localhost') {
    if (process.platform === 'win32' && /^[a-zA-Z]:$/.test(authority)) result = authority + result;
    else if (authority !== '') return null;
  }
  if (process.platform === 'win32' && /^[/\\][a-zA-Z]:/.test(result)) result = result.slice(1);
  return percentDecode(result);
}

// push/fetch/pull 的传输目标候选：'all'（fetch --all 枚举全部 remote）、'upstream'（裸调用用
// 上游/推送远程）或位置参数（--multiple 时全部，否则首个位置参数是 <repository>）。位置参数
// 之前的选项必须能确定是否取值，否则返回 null（fail closed）——防止把选项值（如
// --shallow-exclude ./x 的 ./x）误读成 <repository> 造成越界放行。
// 与 src-tauri/src/git_policy.rs transport_candidates 一致。
const transportValueOptions = new Set(['--depth', '--deepen', '--shallow-since', '--shallow-exclude', '--refmap', '--jobs', '--server-option', '--upload-pack', '--receive-pack', '--exec', '--negotiation-tip', '--submodule-prefix', '--repo', '--into-name']);
const transportFlagOptions = new Set(['--all', '--multiple', '--tags', '--force', '--delete', '--set-upstream', '--force-with-lease', '--no-force-with-lease', '--force-if-includes', '--prune', '--prune-tags', '--no-prune', '--dry-run', '--no-tags', '--atomic', '--quiet', '--verbose', '--progress', '--porcelain', '--ipv4', '--ipv6', '--follow-tags', '--unshallow', '--update-shallow', '--stdin', '--mirror', '--signed', '--no-signed', '--thin', '--no-thin', '--recurse-submodules', '--no-recurse-submodules', '--no-verify', '--write-fetch-head', '--no-write-fetch-head', '--no-show-forced-updates', '--auto-maintenance', '--no-auto-maintenance', '--no-write-commit-graph', '--rebase', '--no-rebase', '--commit', '--no-commit', '--squash', '--no-squash', '--ff', '--no-ff', '--ff-only', '--log', '--no-log', '--stat', '--no-stat', '--compact-summary', '--signoff', '--no-verify-signatures', '--verify-signatures', '--allow-unrelated-histories', '--overwrite-ignore', '--no-overwrite-ignore', '--edit', '--no-edit', '--autostash', '--no-autostash', '--fork-point', '--no-fork-point']);
const transportShortFlags = new Set(['q', 'v', 'f', 'n', 'd', 't', 'p', '4', '6']);

// 返回 true 表示该短选项簇以 -o 结尾、消耗下一个参数；null 表示含未知选项。
function transportShortOptions(cluster: string): boolean | null {
  for (let index = 0; index < cluster.length; index++) {
    if (cluster[index] === 'o') return index + 1 === cluster.length;
    if (!transportShortFlags.has(cluster[index])) return null;
  }
  return false;
}

export type TransportCandidates = 'all' | 'upstream' | { explicit: string[] };
export function transportCandidates(rest: string[]): TransportCandidates | null {
  let all = false, multiple = false;
  const positionals: string[] = [];
  for (let index = 0; index < rest.length; index++) {
    const argument = rest[index];
    if (argument === '--') {
      // git parse-options：-- 之后的第一个参数就是 <repository>。
      const value = rest[index + 1];
      if (value !== undefined) return { explicit: [value] };
      return all ? 'all' : 'upstream';
    }
    if (!argument.startsWith('-')) {
      if (multiple) { positionals.push(argument); continue; }
      return { explicit: [argument] };
    }
    if (argument.startsWith('--')) {
      const equals = argument.indexOf('=');
      const name = equals < 0 ? argument : argument.slice(0, equals);
      if (transportValueOptions.has(name)) { if (equals < 0) index++; continue; }
      if (transportFlagOptions.has(name)) { all ||= name === '--all'; multiple ||= name === '--multiple'; continue; }
      return null;
    }
    const short = transportShortOptions(argument.slice(1));
    if (short === null) return null;
    if (short) index++;
  }
  if (all) return 'all';
  if (positionals.length) return { explicit: positionals };
  return 'upstream';
}

// git bisect 子命令约束：run（执行任意外部命令）、replay（读取并重放外部文件）、
// visualize/view（拉起图形界面/pager）以及未列出的子命令（含 help）一律拒绝（fail closed）。
// 放行的子命令其参数只允许纯位置 rev：-- 之后的参数 git 按修订/路径解析，同样只放行非选项形态；
// --term-* 等任何选项在纯层直接拒绝。rev 的真实性由服务层在调用前用
// rev-parse --verify --end-of-options <rev>^{commit} 双端校验。与 src-tauri/src/git_policy.rs 一致。
const bisectSubcommands = new Set(['start', 'bad', 'good', 'new', 'old', 'skip', 'reset', 'log', 'terms']);
function safeBisect(rest: string[]): void {
  const sub = rest[0];
  if (!sub) throw new Error('Missing bisect subcommand');
  if (!bisectSubcommands.has(sub)) throw new Error(`Unsupported bisect subcommand: ${sub}`);
  for (const argument of rest.slice(1)) {
    if (argument === '--') break;
    if (argument.startsWith('-')) throw new Error(`Unsupported bisect option: ${argument}`);
  }
}

// git submodule 子命令约束：foreach（对每个子模块执行任意 shell 命令！）、
// absorbgitdirs、summary、set-url、helper 与未列出的子命令（含裸 git submodule）
// 一律拒绝（fail closed）。放行的子命令按各自选项白名单校验：除列出的一律拒绝，
// 取值选项必须显式声明（add 的 --reference/--reference-if-able 会读取外部仓库对象，
// 已含在"未知选项即拒"中）。add 的本地路径 <repository> 由调用方（dev 中间件 /
// execute_git）与 clone 源同构授权。与 src-tauri/src/git_policy.rs safe_submodule 一致。
const submoduleOptionRules: Record<string, { valueLong: Set<string>; flagLong: Set<string>; valueShort: Set<string>; flagShort: Set<string> }> = {
  status: { valueLong: new Set(), flagLong: new Set(['--cached', '--recursive']), valueShort: new Set(), flagShort: new Set() },
  add: { valueLong: new Set(['--name', '--branch', '--depth']), flagLong: new Set(['--force']), valueShort: new Set(['b']), flagShort: new Set(['f']) },
  update: { valueLong: new Set(['--depth']), flagLong: new Set(['--init', '--recursive', '--remote', '--checkout', '--force']), valueShort: new Set(), flagShort: new Set(['f']) },
  deinit: { valueLong: new Set(), flagLong: new Set(['--all', '--force']), valueShort: new Set(), flagShort: new Set(['f']) },
  // git submodule init 实际没有 --recursive 之类的 flag：只放位置路径与 --。
  init: { valueLong: new Set(), flagLong: new Set(), valueShort: new Set(), flagShort: new Set() },
  sync: { valueLong: new Set(), flagLong: new Set(['--recursive']), valueShort: new Set(), flagShort: new Set() },
};
function safeSubmodule(rest: string[]): void {
  const sub = rest[0];
  if (!sub) throw new Error('Missing submodule subcommand');
  const rule = submoduleOptionRules[sub];
  if (!rule) throw new Error(`Unsupported submodule subcommand: ${sub}`);
  for (let index = 1; index < rest.length; index++) {
    const argument = rest[index];
    // -- 之后全是位置参数（路径 / add 的源+路径），不再做选项检查。
    if (argument === '--') break;
    if (!argument.startsWith('-')) continue;
    if (argument.startsWith('--')) {
      // 长选项支持 = 内联值；开关选项带 = 的形态（git 本身也不接受）直接拒绝。
      const equals = argument.indexOf('=');
      const name = equals < 0 ? argument : argument.slice(0, equals);
      if (rule.valueLong.has(name)) {
        if (equals < 0) index++;
        continue;
      }
      if (rule.flagLong.has(name) && equals < 0) continue;
      throw new Error(`Unsupported submodule option: ${argument}`);
    }
    // 短选项簇：取值字符必须位于簇尾（消耗下一参数作值）；未知字符一律拒绝。
    const flags = argument.slice(1);
    for (let position = 0; position < flags.length; position++) {
      if (rule.valueShort.has(flags[position])) {
        if (position + 1 !== flags.length) throw new Error(`Unsupported submodule option: ${argument}`);
        index++;
        break;
      }
      if (!rule.flagShort.has(flags[position])) throw new Error(`Unsupported submodule option: ${argument}`);
    }
  }
}

// git submodule add 的 <repository> 位置参数（本地路径源需与 clone 源同构授权）：
// -- 之后的首个位置参数，或跳过取值选项（--name/--branch/--depth 及簇尾 -b 的值）
// 之后的首个位置参数。任何不确定的形态返回 null（fail closed——validate 纯层已先行
// 拒绝未知选项，这里只是解析层的兜底）。与 src-tauri/src/git_policy.rs submodule_add_source 一致。
export function submoduleAddSource(args: string[], index: number): string | null {
  if (args[index] !== 'submodule' || args[index + 1] !== 'add') return null;
  for (let cursor = index + 2; cursor < args.length; cursor++) {
    const argument = args[cursor];
    if (argument === '--') return args[cursor + 1] ?? null;
    if (!argument.startsWith('-')) return argument;
    if (argument.startsWith('--')) {
      const equals = argument.indexOf('=');
      const name = equals < 0 ? argument : argument.slice(0, equals);
      if (['--name', '--branch', '--depth'].includes(name)) { if (equals < 0) cursor++; }
      else if (name !== '--force') return null;
      continue;
    }
    // 短选项簇：-b 取值必须在簇尾（内联值形态 validate 层已拒，这里兜底返回 null）。
    const flags = argument.slice(1);
    let consumes = false;
    for (let position = 0; position < flags.length; position++) {
      if (flags[position] === 'f') continue;
      if (flags[position] === 'b' && position + 1 === flags.length) { consumes = true; continue; }
      return null;
    }
    if (consumes) cursor++;
  }
  return null;
}

// git lfs 子命令约束：git lfs ... 会执行 PATH 里的 git-lfs 外部二进制，策略只管
// argv。push（v1 不做上传面）、migrate（重写历史！）、pointer/clean/smudge（过滤
// 驱动）、update/logs/prune/dedup/lock/unlock 与未列出的子命令（含裸 git lfs）
// 一律拒绝（fail closed）。git-lfs 缺失时 git 自然报错，由前端捕获展示。
// 与 src-tauri/src/git_policy.rs safe_lfs 一致。
function safeLfs(rest: string[]): void {
  const sub = rest[0];
  if (!sub) throw new Error('Missing lfs subcommand');
  if (sub === 'install' || sub === 'uninstall') {
    // 裸调用会写全局 ~/.gitconfig：必须恰带 --local（只写仓库内 .git/config 与
    // .git/hooks）；其余任何选项或位置参数拒绝。
    if (rest.length !== 2 || rest[1] !== '--local') throw new Error(`Unsupported lfs ${sub} arguments`);
  } else if (sub === 'track' || sub === 'untrack') {
    // 只接受位置模式参数（-- 分隔之后同样按模式字面传递）；任何选项拒绝（含
    // --filename，v1 不放）。
    for (const argument of rest.slice(1)) {
      if (argument === '--') break;
      if (argument.startsWith('-')) throw new Error(`Unsupported lfs option: ${argument}`);
    }
  } else if (['ls-files', 'status', 'version', 'env', 'fetch', 'pull', 'checkout'].includes(sub)) {
    // 只读/下载面子命令：bare 调用（无选项无位置参数）。
    if (rest.length !== 1) throw new Error(`Unsupported lfs ${sub} arguments`);
  } else {
    throw new Error(`Unsupported lfs subcommand: ${sub}`);
  }
}

// git describe 约束：只放行「距 tag 距离」展示所需的最小形态——开关选项仅
// --tags/--long/--always（不取值），恰好一个位置 rev（非选项形态）。--match/--exclude
// 可变参、--dirty、--candidates 等其余选项一律拒绝（fail closed）。rev 来自列表
// 数据的真实 hash，真实性由服务层保证；describe 本身只读。与 src-tauri/src/git_policy.rs
// 的 safe_describe 一致。
function safeDescribe(rest: string[]): void {
  let positionals = 0;
  for (const argument of rest) {
    if (argument === '--') break;
    if (argument.startsWith('-')) {
      if (!['--tags', '--long', '--always'].includes(argument)) throw new Error(`Unsupported describe option: ${argument}`);
      continue;
    }
    positionals++;
    if (positionals > 1) throw new Error('Too many describe revisions');
  }
  if (positionals !== 1) throw new Error('Describe requires exactly one revision');
}

// git grep 约束：全局代码搜索只需「模式 + 开关 + pathspec」最小面。开关仅
// -i/-w/-F/-E/-I/-n/--column（均不取值）；-- 前的位置参数恰一个（pattern，非 dash），
// -- 后的 pathspec 逐个保持非 dash 字面放行。取值与外部执行面选项（-f 模式文件、
// --output/-O/--open-files-in-pager pager 面、--and 表达式组合等）一律拒绝
// （fail closed）。与 src-tauri/src/git_policy.rs safe_grep 一致。
function safeGrep(rest: string[]): void {
  const flags = new Set(['-i', '-w', '-F', '-E', '-I', '-n', '--column']);
  let pattern: string | null = null;
  let separated = false;
  for (const argument of rest) {
    if (separated) {
      if (argument.startsWith('-')) throw new Error(`Unsupported grep pathspec: ${argument}`);
      continue;
    }
    if (argument === '--') { separated = true; continue; }
    if (argument.startsWith('-')) {
      if (!flags.has(argument)) throw new Error(`Unsupported grep option: ${argument}`);
      continue;
    }
    if (pattern !== null) throw new Error('Too many grep patterns');
    pattern = argument;
  }
  if (pattern === null) throw new Error('Missing grep pattern');
}

// git format-patch 约束：导出补丁的产物必须走 --stdout 回传前端（没有 --stdout 时
// format-patch 会向工作目录写文件，绝不能放行）。开关仅 `-<N>`（1-99 个提交）与
// --stdout，位置参数恰一个非 dash rev。--output-directory/--cover-letter/--attach
// 等其余选项一律拒绝（fail closed）。与 src-tauri/src/git_policy.rs safe_format_patch 一致。
function safeFormatPatch(rest: string[]): void {
  let stdout = false, count = false, positionals = 0;
  for (const argument of rest) {
    if (argument === '--') break;
    if (argument === '--stdout') { stdout = true; continue; }
    if (argument.startsWith('-')) {
      const digits = argument.slice(1);
      const isCount = argument.length >= 2 && /^\d+$/.test(digits) && Number(digits) >= 1 && Number(digits) <= 99;
      if (!isCount) throw new Error(`Unsupported format-patch option: ${argument}`);
      count = true;
      continue;
    }
    positionals++;
    if (positionals > 1) throw new Error('Too many format-patch revisions');
  }
  if (!stdout) throw new Error('format-patch requires --stdout');
  if (!count || positionals !== 1) throw new Error('format-patch requires a commit count and exactly one revision');
}

// git shortlog 约束：统计面板的固定形态 `-s -n --no-merges <rev>`。不带 rev 的
// shortlog 会读 stdin（挂起风险），rev 必填且非 dash；其余选项（-e 邮箱、-w 换行
// 宽度、分组选项等）一律拒绝（fail closed）。只读。与 src-tauri/src/git_policy.rs
// safe_shortlog 一致。
function safeShortlog(rest: string[]): void {
  const flags = new Set(['-s', '-n', '--no-merges']);
  let positionals = 0;
  for (const argument of rest) {
    if (argument === '--') break;
    if (argument.startsWith('-')) {
      if (!flags.has(argument)) throw new Error(`Unsupported shortlog option: ${argument}`);
      continue;
    }
    positionals++;
    if (positionals > 1) throw new Error('Too many shortlog revisions');
  }
  if (positionals !== 1) throw new Error('shortlog requires exactly one revision');
}

// git count-objects 约束：仓库体积统计只放行固定形态 `-vH`（人类可读的详细键值）；
// 裸调用与 gc 类参数（--gc 隐含维护写入）一律拒绝（fail closed）。只读。
// 与 src-tauri/src/git_policy.rs safe_count_objects 一致。
function safeCountObjects(rest: string[]): void {
  if (rest.length === 1 && rest[0] === '-vH') return;
  throw new Error('count-objects only supports the -vH reporting form');
}

// git gc 约束：仓库维护只放行裸调用（默认安全参数由 git 决定）；--aggressive 重写
// 打包策略、--prune=now 越过宽限期删对象、--auto 语义依赖调用场景，一律不放行（fail closed）。
// 与 src-tauri/src/git_policy.rs safe_gc 一致。
function safeGc(rest: string[]): void {
  if (rest.length === 0) return;
  throw new Error('gc only supports the bare form');
}

// git fsck 约束：完整性检查只放行裸调用（报告含 dangling 提示，退出码非 0 视为损坏）。
// 与 src-tauri/src/git_policy.rs safe_fsck 一致。
function safeFsck(rest: string[]): void {
  if (rest.length === 0) return;
  throw new Error('fsck only supports the bare form');
}

// git clean 约束：未跟踪文件删除只放行强制删除窄形态 `-f|--force [--] [pathspec…]`。
// 目录面 -d、忽略文件面 -x/-X、交互 -i、排除模式 -e、干跑 -n 等一律拒绝（fail closed）；
// -- 之后的 pathspec 不校验（调用方以 --literal-pathspecs 传入字面路径）。
// 与 src-tauri/src/git_policy.rs safe_clean 一致。
function safeClean(rest: string[]): void {
  let separator = false;
  let force = false;
  for (const argument of rest) {
    if (separator) continue;
    if (argument === '--') { separator = true; continue; }
    if ((argument === '-f' || argument === '--force') && !force) { force = true; continue; }
    if (!argument.startsWith('-')) continue;
    throw new Error('clean only supports the force form: clean -f [--] <pathspec>');
  }
  if (!force) throw new Error('clean requires -f or --force');
}

// git notes 约束：提交备注的最小读写面——notes show <rev>、notes remove <rev> 与
// notes add [-f] -m <message> <rev>（-f 覆盖编辑语义，-m 单段文本）。copy/append/
// edit/merge/prune 与 -F/--stdin 等文件面选项一律拒绝（fail closed）。
// 与 src-tauri/src/git_policy.rs safe_notes 一致。
function safeNotes(rest: string[]): void {
  const sub = rest[0];
  if (!sub) throw new Error('Missing notes subcommand');
  if (sub === 'show' || sub === 'remove') {
    if (rest.length !== 2 || rest[1].startsWith('-')) throw new Error('notes show/remove take exactly one revision');
    return;
  }
  if (sub === 'add') {
    let message: string | null = null;
    let positionals = 0;
    for (let index = 1; index < rest.length; index++) {
      const argument = rest[index];
      if (argument === '--') break;
      if (argument === '-f') continue;
      if (argument === '-m') {
        if (message !== null) throw new Error('Only one -m is allowed');
        const value = rest[index + 1];
        if (value === undefined) throw new Error('notes add -m requires a message');
        message = value;
        index++;
        continue;
      }
      if (argument.startsWith('-')) throw new Error(`Unsupported notes option: ${argument}`);
      positionals++;
      if (positionals > 1) throw new Error('Too many notes revisions');
    }
    if (message === null || positionals !== 1) throw new Error('notes add requires -m <message> and exactly one revision');
    return;
  }
  throw new Error(`Unsupported notes subcommand: ${sub}`);
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
    if (!read) {
      const key = values[0] || '';
      const value = values[1];
      // SSH 签名配置：user.signingkey 任意值（user.name 先例）；commit/tag.gpgsign 的值
      // 必须恰为 true/false；gpg.format 必须恰为 ssh（本产品只管 SSH 签名）。
      // gpg.program / gpg.ssh.program 是任意可执行文件执行面，gpg.ssh.* 其余键同样
      // 不放行——fail closed。与 src-tauri/src/git_policy.rs safe_config 一致。
      const base = /^(user\.(name|email|signingkey)|auugit\..+|branch\..+\.(remote|merge|pushremote))$/.test(key);
      const gpgBool = (key === 'commit.gpgsign' || key === 'tag.gpgsign') && (value === 'true' || value === 'false');
      const gpgFormat = key === 'gpg.format' && value === 'ssh';
      if (!base && !gpgBool && !gpgFormat) throw new Error('Unsupported Git configuration access');
    }
  }
  if (command === 'bisect') safeBisect(args.slice(index + 1));
  if (command === 'describe') safeDescribe(args.slice(index + 1));
  if (command === 'grep') safeGrep(args.slice(index + 1));
  if (command === 'clean') safeClean(args.slice(index + 1));
  if (command === 'format-patch') safeFormatPatch(args.slice(index + 1));
  if (command === 'shortlog') safeShortlog(args.slice(index + 1));
  if (command === 'count-objects') safeCountObjects(args.slice(index + 1));
  if (command === 'gc') safeGc(args.slice(index + 1));
  if (command === 'fsck') safeFsck(args.slice(index + 1));
  if (command === 'notes') safeNotes(args.slice(index + 1));
  if (command === 'submodule') safeSubmodule(args.slice(index + 1));
  if (command === 'lfs') safeLfs(args.slice(index + 1));
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
    // 双向覆盖：既堵缩写（--strat → --strategy），也堵扩展（--strategy-option → --strategy）。
    if ((option.startsWith('--') && option.length > 2 && blocked.some((value) => value.startsWith(option) || option.startsWith(value))) ||
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
    // file:// 源只有能解析为本地路径时才交给调用方按授权表放行；
    // 无法解析的形态（非本地 host 等，git 会按 ssh 处理）维持纯层拒绝。
    if (source && source.toLowerCase().startsWith('file:') && !localTransportPath(source)) throw new Error('Unsupported clone protocol: file');
  }
  return { command, index };
}
