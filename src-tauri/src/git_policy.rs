use std::path::{Component, Path};

const COMMANDS: &[&str] = &[
    "--version",
    "status",
    "rev-parse",
    "log",
    "show",
    "diff",
    "blame",
    "branch",
    "tag",
    "stash",
    "remote",
    "fetch",
    "pull",
    "push",
    "clone",
    "init",
    "add",
    "rm",
    "restore",
    "checkout",
    "switch",
    "bisect",
    "commit",
    "merge",
    "rebase",
    "revert",
    "cherry-pick",
    "reset",
    "clean",
    "apply",
    "check-ref-format",
    "check-ignore",
    "for-each-ref",
    "show-ref",
    "update-ref",
    "symbolic-ref",
    "rev-list",
    "merge-tree",
    "reflog",
    "ls-files",
    "ls-tree",
    "hash-object",
    "write-tree",
    "cat-file",
    "worktree",
    "config",
];

fn valid_editor(value: &str) -> bool {
    let Some(entries) = value
        .strip_prefix(r#"printf '%s\n' '"#)
        .and_then(|value| value.strip_suffix(r#"' > "$1"; :"#))
    else {
        return false;
    };
    let steps: Vec<_> = entries.split("' '").collect();
    !steps.is_empty()
        && steps.len() <= 30
        && steps.iter().enumerate().all(|(index, entry)| {
            let Some((action, hash)) = entry.split_once(' ') else {
                return false;
            };
            matches!(action, "pick" | "squash" | "fixup")
                && (index != 0 || action == "pick")
                && matches!(hash.len(), 40 | 64)
                && hash.bytes().all(|byte| byte.is_ascii_hexdigit())
        })
}

fn safe_override(value: &str) -> bool {
    let Some((key, value)) = value.split_once('=') else {
        return false;
    };
    match key.to_ascii_lowercase().as_str() {
        "core.quotepath" => value == "false",
        "core.editor" => value == "true",
        "rebase.updaterefs" => value == "false",
        "sequence.editor" => valid_editor(value),
        _ => false,
    }
}

pub(crate) fn command_index(args: &[String]) -> Result<usize, String> {
    let mut index = 0;
    while let Some(argument) = args.get(index) {
        match argument.as_str() {
            "-c" => {
                if !args
                    .get(index + 1)
                    .is_some_and(|value| safe_override(value))
                {
                    return Err("Unsupported Git configuration override".into());
                }
                index += 2;
            }
            "--literal-pathspecs" | "--no-pager" | "--no-optional-locks" => index += 1,
            value if COMMANDS.contains(&value) => return Ok(index),
            _ => return Err("Unsupported Git command or global option".into()),
        }
    }
    Err("Missing Git command".into())
}

fn safe_config(args: &[String]) -> bool {
    let mut read = false;
    let mut positional = Vec::new();
    let mut options = true;
    for value in args {
        if options && value == "--" {
            options = false;
            continue;
        }
        if options && value.starts_with('-') {
            if !matches!(
                value.as_str(),
                "--local"
                    | "--bool"
                    | "--int"
                    | "--bool-or-int"
                    | "--null"
                    | "-z"
                    | "--get"
                    | "--get-all"
                    | "--get-regexp"
                    | "--get-urlmatch"
                    | "--list"
                    | "-l"
                    | "--replace-all"
                    | "--unset"
                    | "--unset-all"
            ) {
                return false;
            }
            if matches!(
                value.as_str(),
                "--get" | "--get-all" | "--get-regexp" | "--get-urlmatch" | "--list" | "-l"
            ) {
                read = true;
            }
        } else {
            positional.push(value.to_ascii_lowercase());
        }
    }
    // 写入形态恰好是 [key value]（或单独 [key] 的读取）。
    // 显式限制数量，防止 git 未来支持多组键值时把第二个键走私成任意 config 写入；
    // 读取形态的 --get key [value-pattern] / --get-urlmatch name url 同样至多两个位置参数。
    if read {
        return positional.len() <= 2;
    }
    if positional.len() != 1 && positional.len() != 2 {
        return false;
    }
    let key = &positional[0];
    matches!(key.as_str(), "user.name" | "user.email")
        || key.starts_with("auugit.")
        || (key.starts_with("branch.")
            && [".remote", ".merge", ".pushremote"]
                .iter()
                .any(|suffix| key.ends_with(suffix)))
}

/// 各命令的短选项声明：(消耗下一个参数, 一律禁止) 的字符集。
/// 白名单只收录前端真实用到的 (命令, flag)（commit/tag/stash/update-ref 的 -m、
/// clone/init/merge/rebase 的既有用法），未声明的一律按不取值处理（fail closed）。
fn short_option(name: &str, argument: &str) -> Result<bool, String> {
    if !argument.starts_with('-') || argument.starts_with("--") {
        return Ok(false);
    }
    let (value_flags, blocked_flags) = match name {
        "clone" => ("boju", ""),
        "init" => ("b", ""),
        "merge" => ("m", "F"),
        "rebase" => ("XCS", ""),
        "commit" => ("m", "FtcC"),
        "tag" => ("m", "Ft"),
        "stash" => ("m", ""),
        "update-ref" => ("m", ""),
        "hash-object" => ("", "w"),
        _ => return Ok(false),
    };
    let mut flags = argument[1..].chars().peekable();
    while let Some(flag) = flags.next() {
        if (matches!(name, "clone" | "init") && flag == 'c')
            || (name == "clone" && flag == 'u')
            || (matches!(name, "merge" | "rebase") && flag == 's')
            || (name == "rebase" && flag == 'x')
            || blocked_flags.contains(flag)
        {
            return Err(format!("Unsupported Git option: -{flag}"));
        }
        if value_flags.contains(flag) {
            return Ok(flags.peek().is_none());
        }
    }
    Ok(false)
}

/// 相对路径检查：拒绝绝对前缀、.. 上溯与（Windows）盘符，目标必须落在 git 工作目录内。
/// 授权根的最终校验由调用方用授权表完成（dev 镜像只依赖本纯函数）。
fn escapes_working_directory(target: &str) -> bool {
    Path::new(target).components().any(|part| {
        matches!(
            part,
            Component::ParentDir | Component::RootDir | Component::Prefix(_)
        )
    }) || target.starts_with('~')
        || (cfg!(windows) && target.contains(':'))
}

/// 空 (zero) 设备：diff --no-index 用它表示"新增文件没有基线"。
pub fn is_null_device(path: &str) -> bool {
    path.eq_ignore_ascii_case("nul") || path.eq_ignore_ascii_case("/dev/null")
}

/// git diff --no-index 的两个路径操作数。该模式绕过索引直接比较磁盘上的任意文件，
/// 因此操作数必须是空设备或工作目录内的相对路径，且必须用 -- 与选项显式分隔。
/// 返回的操作数由调用方（execute_git）再逐个过授权表；dev 镜像仅依赖本函数的拒绝。
pub fn no_index_operands(args: &[String], index: usize) -> Result<Vec<String>, String> {
    if args.get(index).map(String::as_str) != Some("diff")
        || !args[index + 1..]
            .iter()
            .any(|value| value.starts_with("--no-in"))
    {
        return Ok(Vec::new());
    }
    let rest = &args[index + 1..];
    let Some(separator) = rest.iter().position(|value| value == "--") else {
        return Err("Diff --no-index requires an explicit separator".into());
    };
    let operands = &rest[separator + 1..];
    if operands.len() != 2 {
        return Err("Diff --no-index requires exactly two paths".into());
    }
    for operand in operands {
        if !is_null_device(operand) && escapes_working_directory(operand) {
            return Err("Diff --no-index paths must stay inside the repository".into());
        }
    }
    Ok(operands.to_vec())
}

/// git init 的可选目录参数（git init [<directory>]）。
pub fn init_target(args: &[String], index: usize) -> Option<String> {
    let rest = &args[index + 1..];
    let mut skip = false;
    for (offset, argument) in rest.iter().enumerate() {
        if skip {
            skip = false;
            continue;
        }
        if argument == "--" {
            return rest.get(offset + 1).cloned();
        }
        if argument.starts_with('-') {
            skip = short_option("init", argument).unwrap_or(false);
            continue;
        }
        return Some(argument.clone());
    }
    None
}

/// git worktree move <worktree> <new-path> 的路径参数（未用到的其余子命令返回空）。
pub fn worktree_move_targets(args: &[String], index: usize) -> Vec<String> {
    if args.get(index).map(String::as_str) != Some("worktree")
        || args.get(index + 1).map(String::as_str) != Some("move")
    {
        return Vec::new();
    }
    args[index + 2..]
        .iter()
        .filter(|value| !value.starts_with('-'))
        .cloned()
        .collect()
}

/// 传输目标按本地 file 传输处理时的路径形态；远程 URL 返回 None。
/// 远程 URL 包括 https:// 等带 scheme 的 URL、scp 风格 host:path，以及 git 按 ssh 处理的
/// file:<path>（单斜杠）形式。file:// URL 解析出文件系统路径：authority 仅接受空、
/// localhost 与（Windows）盘符，并做百分号解码；非本地 host 维持 None（fail closed）。
/// 与 scripts/git-policy.ts 的 localTransportPath 一致。
pub fn local_transport_path(spec: &str) -> Option<String> {
    if spec.len() >= 7 && spec.get(..7).is_some_and(|prefix| prefix.eq_ignore_ascii_case("file://")) {
        return local_file_url(&spec[7..]);
    }
    if spec.len() >= 5 && spec.get(..5).is_some_and(|prefix| prefix.eq_ignore_ascii_case("file:")) {
        return None;
    }
    if spec.contains("://") {
        return None;
    }
    let colon = spec.find(':');
    let slash = spec.find(['/', '\\']);
    if let Some(colon) = colon {
        if slash.is_none_or(|slash| colon < slash) {
            // 冒号先于任何斜杠：Windows 盘符路径，或 scp 风格 host:path（远程）。
            let bytes = spec.as_bytes();
            if cfg!(windows) && bytes.len() >= 2 && bytes[1] == b':' && bytes[0].is_ascii_alphabetic() {
                return Some(spec.to_string());
            }
            return None;
        }
    }
    Some(spec.to_string())
}

/// file:// 后的 authority/path 解析：file:///E:/x → E:/x、file://E:/x → E:/x、
/// file:///repos/x → /repos/x（file://localhost/repos/x 等价）。
fn local_file_url(rest: &str) -> Option<String> {
    let boundary = rest.find(['/', '\\'])?;
    let authority = &rest[..boundary];
    let mut path = &rest[boundary..];
    if authority.eq_ignore_ascii_case("localhost") {
        // 与空 authority 等价，path 保持不变。
    } else {
        let bytes = authority.as_bytes();
        if cfg!(windows) && bytes.len() == 2 && bytes[1] == b':' && bytes[0].is_ascii_alphabetic() {
            path = rest;
        } else if !authority.is_empty() {
            return None;
        }
    }
    let bytes = path.as_bytes();
    if cfg!(windows)
        && bytes.len() >= 3
        && (bytes[0] == b'/' || bytes[0] == b'\\')
        && bytes[2] == b':'
        && bytes[1].is_ascii_alphabetic()
    {
        path = &path[1..];
    }
    Some(percent_decode(path))
}

/// URL 百分号解码（与 git 的 url_decode 对齐）：非法序列按字面量保留。
/// 解码在授权之前进行，".." 逃逸由调用方的 resolve/require_path 拒绝。
fn percent_decode(value: &str) -> String {
    if !value.contains('%') {
        return value.to_string();
    }
    let bytes = value.as_bytes();
    let mut decoded = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%'
            && index + 2 < bytes.len()
            && bytes[index + 1].is_ascii_hexdigit()
            && bytes[index + 2].is_ascii_hexdigit()
        {
            let hex = |byte: u8| (byte as char).to_digit(16).unwrap() as u8;
            decoded.push(hex(bytes[index + 1]) * 16 + hex(bytes[index + 2]));
            index += 3;
        } else {
            decoded.push(bytes[index]);
            index += 1;
        }
    }
    String::from_utf8_lossy(&decoded).into_owned()
}

/// push/fetch/pull 的传输目标候选。git 把 <repository> 当作位置参数（--multiple 时全部
/// 位置参数都是远程；fetch --all 无位置参数则枚举全部 remote）；裸调用使用上游/推送远程。
/// 位置参数之前的选项必须能确定是否取值，否则返回 None（fail closed）——
/// 防止把选项值（如 --shallow-exclude ./x 的 ./x）误读成 <repository> 造成越界放行。
/// 与 scripts/git-policy.ts 的 transportCandidates 一致。
#[derive(Debug, PartialEq)]
pub enum TransportCandidates {
    All,
    Upstream,
    Explicit(Vec<String>),
}

/// 确定取值的 push/fetch/pull 长选项（跳过其单独的值）。
const TRANSPORT_VALUE_OPTIONS: &[&str] = &[
    "--depth",
    "--deepen",
    "--shallow-since",
    "--shallow-exclude",
    "--refmap",
    "--jobs",
    "--server-option",
    "--upload-pack",
    "--receive-pack",
    "--exec",
    "--negotiation-tip",
    "--submodule-prefix",
    "--repo",
    "--into-name",
];

/// 确定不取值的 push/fetch/pull 长选项（= 形式同样合法，如 --force-with-lease=<ref>:<oid>）；
/// 不在两表内的选项一律放弃放行。
const TRANSPORT_FLAG_OPTIONS: &[&str] = &[
    "--all",
    "--multiple",
    "--tags",
    "--force",
    "--delete",
    "--set-upstream",
    "--force-with-lease",
    "--no-force-with-lease",
    "--force-if-includes",
    "--prune",
    "--prune-tags",
    "--no-prune",
    "--dry-run",
    "--no-tags",
    "--atomic",
    "--quiet",
    "--verbose",
    "--progress",
    "--porcelain",
    "--ipv4",
    "--ipv6",
    "--follow-tags",
    "--unshallow",
    "--update-shallow",
    "--stdin",
    "--mirror",
    "--signed",
    "--no-signed",
    "--thin",
    "--no-thin",
    "--recurse-submodules",
    "--no-recurse-submodules",
    "--no-verify",
    "--write-fetch-head",
    "--no-write-fetch-head",
    "--no-show-forced-updates",
    "--auto-maintenance",
    "--no-auto-maintenance",
    "--no-write-commit-graph",
    // pull 透传的 merge 形态选项（均不取单独的值）。
    "--rebase",
    "--no-rebase",
    "--commit",
    "--no-commit",
    "--squash",
    "--no-squash",
    "--ff",
    "--no-ff",
    "--ff-only",
    "--log",
    "--no-log",
    "--stat",
    "--no-stat",
    "--compact-summary",
    "--signoff",
    "--no-verify-signatures",
    "--verify-signatures",
    "--allow-unrelated-histories",
    "--overwrite-ignore",
    "--no-overwrite-ignore",
    "--edit",
    "--no-edit",
    "--autostash",
    "--no-autostash",
    "--fork-point",
    "--no-fork-point",
];

/// 确定不取值的短选项；值选项只有 -o（server/push option，getopt 语义）。
const TRANSPORT_SHORT_FLAGS: &[char] = &['q', 'v', 'f', 'n', 'd', 't', 'p', '4', '6'];

/// 返回 Ok(true) 表示该短选项簇以 -o 结尾、消耗下一个参数；Err 表示含未知选项。
fn transport_short_options(cluster: &str) -> Result<bool, ()> {
    let flags: Vec<char> = cluster.chars().collect();
    for (index, flag) in flags.iter().enumerate() {
        if *flag == 'o' {
            return Ok(index + 1 == flags.len());
        }
        if !TRANSPORT_SHORT_FLAGS.contains(flag) {
            return Err(());
        }
    }
    Ok(false)
}

pub fn transport_candidates(rest: &[String]) -> Option<TransportCandidates> {
    let mut all = false;
    let mut multiple = false;
    let mut positionals: Vec<String> = Vec::new();
    let mut iterator = rest.iter();
    while let Some(argument) = iterator.next() {
        if argument == "--" {
            // git parse-options：-- 之后的第一个参数就是 <repository>。
            return Some(match iterator.next() {
                Some(value) => TransportCandidates::Explicit(vec![value.clone()]),
                None if all => TransportCandidates::All,
                None => TransportCandidates::Upstream,
            });
        }
        if !argument.starts_with('-') {
            if multiple {
                positionals.push(argument.clone());
                continue;
            }
            return Some(TransportCandidates::Explicit(vec![argument.clone()]));
        }
        if argument.starts_with("--") {
            let (name, inline) = match argument.split_once('=') {
                Some((name, value)) => (name, Some(value)),
                None => (argument.as_str(), None),
            };
            if TRANSPORT_VALUE_OPTIONS.contains(&name) {
                if inline.is_none() {
                    iterator.next();
                }
                continue;
            }
            if TRANSPORT_FLAG_OPTIONS.contains(&name) {
                all |= name == "--all";
                multiple |= name == "--multiple";
                continue;
            }
            return None;
        }
        match transport_short_options(&argument[1..]) {
            Ok(true) => {
                iterator.next();
            }
            Ok(false) => {}
            Err(()) => return None,
        }
    }
    if all {
        return Some(TransportCandidates::All);
    }
    if !positionals.is_empty() {
        return Some(TransportCandidates::Explicit(positionals));
    }
    Some(TransportCandidates::Upstream)
}

/// clone 源是本地路径（file 传输，必须先授权）还是远程 URL。
/// scp 风格 host:path 视作远程（由 GIT_ALLOW_PROTOCOL 约束），与 git 的
/// url_is_local_not_ssh 对齐；file: 前缀按本地处理（调用方解析后授权，
/// 无法解析的形态在 validate 纯层直接拒绝）。
pub fn is_local_clone_source(source: &str) -> bool {
    if source.to_ascii_lowercase().starts_with("file:") {
        return true;
    }
    if source.contains("://") {
        return false;
    }
    if source.starts_with('/')
        || source.starts_with('\\')
        || source.starts_with('.')
        || source.starts_with('~')
    {
        return true;
    }
    let bytes = source.as_bytes();
    if bytes.len() >= 2 && bytes[1] == b':' && cfg!(windows) && bytes[0].is_ascii_alphabetic() {
        return true;
    }
    match source.find(':') {
        None => true,
        Some(colon) => source[..colon].contains('/'),
    }
}

/// git bisect 子命令约束：`run`（执行任意外部命令）、`replay`（读取并重放外部文件）、
/// `visualize`/`view`（拉起图形界面/pager）以及未列出的子命令（含 help）一律拒绝（fail closed）。
/// 放行的子命令其参数只允许纯位置 rev：`--` 之后的参数 git 按修订/路径解析，同样只放行
/// 非选项形态；`--term-*` 等任何选项在纯层直接拒绝。rev 的真实性由服务层在调用前用
/// `rev-parse --verify --end-of-options <rev>^{commit}` 双端校验。与 scripts/git-policy.ts 一致。
fn safe_bisect(rest: &[String]) -> Result<(), String> {
    const SUBCOMMANDS: &[&str] = &[
        "start", "bad", "good", "new", "old", "skip", "reset", "log", "terms",
    ];
    let Some(sub) = rest.first() else {
        return Err("Missing bisect subcommand".into());
    };
    if !SUBCOMMANDS.contains(&sub.as_str()) {
        return Err(format!("Unsupported bisect subcommand: {sub}"));
    }
    for argument in &rest[1..] {
        if argument == "--" {
            break;
        }
        if argument.starts_with('-') {
            return Err(format!("Unsupported bisect option: {argument}"));
        }
    }
    Ok(())
}

pub fn validate(args: &[String]) -> Result<(), String> {
    let index = command_index(args)?;
    let name = args[index].as_str();
    if name == "--version" && args.len() != index + 1 {
        return Err("Invalid version arguments".into());
    }
    if name == "config" && !safe_config(&args[index + 1..]) {
        return Err("Unsupported Git configuration access".into());
    }
    if name == "bisect" {
        safe_bisect(&args[index + 1..])?;
    }
    let mut skip_value = false;
    for argument in &args[index + 1..] {
        if skip_value {
            // 取值 flag 的值不再免检：仍执行下方全部选项检查，
            // 且不再把它当作下一个 flag 的值级联跳过（堵住跳检走私）。
            skip_value = false;
        } else {
            if argument == "--" || argument == "--end-of-options" {
                break;
            }
            if short_option(name, argument)? {
                skip_value = true;
            }
        }
        let option = argument.split('=').next().unwrap_or(argument);
        let blocked = [
            "--upload-pack",
            "--receive-pack",
            "--exec",
            "--ext-diff",
            "--textconv",
            "--template",
            "--separate-git-dir",
            "--unsafe-paths",
            "--output",
            "--config",
            "--config-env",
            "--strategy",
            "--contents",
            "--file",
        ];
        if (option.starts_with("--")
            && option.len() > 2
            && blocked.iter().any(|blocked| blocked.starts_with(option)))
            || (name == "rebase" && argument.starts_with("-x"))
            || (matches!(name, "clone" | "init") && argument.starts_with("-c"))
            || (matches!(name, "merge" | "rebase") && argument.starts_with("-s"))
            || (matches!(name, "push" | "fetch" | "pull" | "clone") && argument.starts_with("-u"))
            || (argument.starts_with("--pathspec-from-file")
                && argument != "--pathspec-from-file=-")
        {
            return Err(format!("Unsupported Git option: {option}"));
        }
    }
    // --no-index 的操作数形态校验（授权在调用方）。
    no_index_operands(args, index)?;
    // init / worktree move 的目标会在工作目录之外落盘：纯校验先挡绝对路径与 .. 上溯。
    if name == "init"
        && init_target(args, index)
            .is_some_and(|target| escapes_working_directory(&target))
    {
        return Err("Git init target must stay inside the working directory".into());
    }
    if worktree_move_targets(args, index)
        .iter()
        .any(|target| escapes_working_directory(target))
    {
        return Err("Worktree target must stay inside the working directory".into());
    }
    if name == "clone" {
        let separator = args[index + 1..]
            .iter()
            .position(|value| value == "--")
            .map(|offset| offset + index + 1);
        if let Some(source) = separator.and_then(|separator| args.get(separator + 1)) {
            // file:// 源只有能解析为本地路径时才交给调用方按授权表放行；
            // 无法解析的形态（非本地 host 等，git 会按 ssh 处理）维持纯层拒绝。
            if source.len() >= 5
                && source.get(..5).is_some_and(|prefix| prefix.eq_ignore_ascii_case("file:"))
                && local_transport_path(source).is_none()
            {
                return Err("Unsupported clone protocol: file".into());
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn args(values: &[&str]) -> Vec<String> {
        values.iter().map(|value| value.to_string()).collect()
    }
    #[test]
    fn gates_bisect_subcommands_fail_closed() {
        let hash = "a".repeat(40);
        // 放行：向导真实使用的形态（位置 rev、-- 后的路径限定、无参数子命令）。
        for values in [
            vec!["bisect", "start", hash.as_str(), "HEAD~9"],
            vec!["bisect", "start", "HEAD", "HEAD~3", "--", "src/"],
            vec!["bisect", "bad"],
            vec!["bisect", "good", hash.as_str()],
            vec!["bisect", "new", "HEAD"],
            vec!["bisect", "old", hash.as_str()],
            vec!["bisect", "skip", hash.as_str()],
            vec!["bisect", "skip", "--", hash.as_str()],
            vec!["bisect", "reset"],
            vec!["bisect", "log"],
            vec!["bisect", "terms"],
        ] {
            assert!(validate(&args(&values)).is_ok(), "{values:?}");
        }
        // 拒绝：任意命令执行、外部文件重放、图形/pager、未知子命令与裸调用。
        for values in [
            vec!["bisect"],
            vec!["bisect", "help"],
            vec!["bisect", "run", "make test"],
            vec!["bisect", "run"],
            vec!["bisect", "replay", "saved-log.txt"],
            vec!["bisect", "visualize"],
            vec!["bisect", "visualize", "--", "HEAD"],
            vec!["bisect", "view", "HEAD"],
            vec!["bisect", "bisect-run"],
            vec!["bisect", "start", "--term-new=broken", "HEAD"],
            vec!["bisect", "start", "--term-old=works", "HEAD", "HEAD~5"],
            vec!["bisect", "bad", "--term-good=x"],
            vec!["bisect", "good", "-P", "rev"],
            vec!["bisect", "log", "--output=evil"],
            vec!["bisect", "reset", "-q", "--foo"],
        ] {
            assert!(validate(&args(&values)).is_err(), "{values:?}");
        }
    }
    #[test]
    fn blocks_execution_overrides_and_scope_bypasses() {
        for values in [
            vec!["-c", "core.sshCommand=bad", "fetch"],
            vec!["-C", "elsewhere", "status"],
            vec!["fetch", "--upload-pa=bad"],
            vec!["rebase", "-xbad", "HEAD"],
            vec!["config", "--global", "user.name", "name"],
            vec!["config", "--local", "core.hooksPath", "elsewhere"],
            vec![
                "config",
                "--local",
                "--replace-all",
                "--",
                "core.sshCommand",
                "bad",
                "--get",
            ],
            vec!["-c", "sequence.editor=bad", "rebase", "-i", "HEAD"],
            vec!["clone", "-c", "core.sshCommand=bad", "--", "url", "target"],
            vec!["clone", "-ccore.sshCommand=bad", "--", "url", "target"],
            vec![
                "clone",
                "-qnc",
                "core.sshCommand=bad",
                "--",
                "url",
                "target",
            ],
            vec!["init", "-c", "core.sshCommand=bad"],
            vec!["merge", "-s", "custom", "HEAD"],
            vec!["merge", "-scustom", "HEAD"],
            vec!["merge", "-nsfoobar", "HEAD"],
            vec!["merge", "--strategy=custom", "HEAD"],
            vec!["rebase", "--str=custom", "HEAD"],
        ] {
            assert!(validate(&args(&values)).is_err(), "{values:?}");
        }
    }
    #[test]
    fn blocks_smuggled_values_behind_value_taking_flags() {
        // 跳检走私向量：log 的 -m 是开关不取值，--output 必须仍被检查。
        for values in [
            vec!["log", "-m", "--format=x", "-m", "--output=evil", "-1"],
            vec!["log", "-m", "--output=evil"],
            // 取值 flag 的值本身也要过全部选项检查。
            vec!["commit", "-m", "--exec=evil"],
            vec!["merge", "-m", "--strategy=evil"],
            vec!["tag", "-m", "--output=evil"],
            vec!["update-ref", "-m", "--upload-pack=evil", "refs/heads/x"],
        ] {
            assert!(validate(&args(&values)).is_err(), "{values:?}");
        }
    }
    #[test]
    fn blocks_arbitrary_file_access_options() {
        for values in [
            vec!["hash-object", "-w", "outside"],
            vec!["hash-object", "-woutside"],
            vec!["commit", "-F", "outside"],
            vec!["commit", "--file=outside"],
            vec!["commit", "--fil=outside"],
            vec!["commit", "-t", "outside"],
            vec!["commit", "-C", "HEAD"],
            vec!["tag", "-F", "outside"],
            vec!["merge", "-F", "outside"],
            vec!["blame", "--contents", "outside"],
            vec!["blame", "--cont=x", "file"],
            vec!["commit", "--pathspec-from-file=outside"],
            vec!["commit", "--pathspec-from-file", "outside"],
            vec!["add", "--pathspec-from-file=outside"],
            // clone 的 file:// 源与 init / worktree move 的越界目标。
            vec!["clone", "--", "file://outside/repo", "target"],
            vec!["clone", "--", "FILE://outside/repo", "target"],
            vec!["init", "/tmp/evil"],
            vec!["init", ".."],
            vec!["init", "-b", "main", ".."],
            vec!["init", "--", "../evil"],
            vec!["worktree", "move", "wt", "/tmp/evil"],
            vec!["worktree", "move", "wt", "../evil"],
            vec!["diff", "--no-index", "outside", "other"],
            vec!["diff", "--no-index", "--", "outside"],
            vec!["diff", "--no-index", "--", "a", "b", "c"],
            vec!["diff", "--no-index", "--", "/tmp/secret", "b"],
            vec!["diff", "--no-index", "--", "a", "../secret"],
        ] {
            assert!(validate(&args(&values)).is_err(), "{values:?}");
        }
    }
    #[test]
    fn allows_app_operations_and_literal_messages() {
        let hash_a = "a".repeat(40);
        let hash_b = "b".repeat(40);
        for values in [
            vec!["-c", "core.quotepath=false", "status", "-z"],
            vec!["-c", "core.editor=true", "rebase", "--continue"],
            vec!["config", "--local", "branch.main.pushRemote", "origin"],
            vec!["config", "--get", "core.ignorecase"],
            vec!["config", "--local", "-z", "--get-regexp", "^auugit\\."],
            vec!["commit", "-m", "hello world"],
            vec!["commit", "-m", "-- high priority"],
            vec!["merge", "--signoff", "--end-of-options", "main"],
            vec!["tag", "-a", "v1", "-m", "release", hash_a.as_str()],
            vec!["stash", "push", "-u", "-m", "wip"],
            vec![
                "update-ref",
                "-m",
                "AuuGit Redo",
                "refs/heads/x",
                hash_a.as_str(),
                hash_b.as_str(),
            ],
            vec!["log", "-n", "5", "--format=%h"],
            vec!["log", "--all", "--topo-order", "--max-count=60", "--"],
            vec!["reflog", "show", "--all", "-n", "150", "--format=%H"],
            vec!["checkout", "-b", "feature"],
            vec!["switch", "--track", "-c", "x", "refs/remotes/origin/x"],
            vec!["hash-object", "--no-filters", "--", "file"],
            vec!["blame", "--line-porcelain", "--", "file"],
            vec![
                "--literal-pathspecs",
                "commit",
                "--only",
                "-m",
                "message",
                "--pathspec-from-file=-",
                "--pathspec-file-nul",
            ],
            vec!["add", "--pathspec-from-file=-", "--pathspec-file-nul"],
            vec!["init", "-b", "main"],
            vec!["init", "."],
            vec!["worktree", "add", "-b", "review", "--", "dest", "main"],
            vec!["diff", "--no-index", "--no-color", "--", "nul", "file"],
            vec!["diff", "--no-index", "--", "/dev/null", "file"],
            vec!["clone", "-qbbranch-containing-c", "--", "url", "target"],
            vec!["clone", "--", "-c-is-a-url", "target"],
            vec!["clone", "--", "https://example.invalid/repo.git", "target"],
        ] {
            assert!(validate(&args(&values)).is_ok(), "{values:?}");
        }
        assert!(valid_editor(&format!(
            "printf '%s\\n' 'pick {}' 'fixup {}' > \"$1\"; :",
            "a".repeat(40),
            "b".repeat(40)
        )));
    }
    #[test]
    fn rejects_future_multi_key_config_writes() {
        for values in [
            vec!["config", "--local", "user.name", "a", "user.email", "b"],
            vec![
                "config",
                "--local",
                "--replace-all",
                "--",
                "auugit.x",
                "v",
                "core.hooksPath",
                "evil",
            ],
            vec!["config", "--list", "a", "b", "c"],
        ] {
            assert!(validate(&args(&values)).is_err(), "{values:?}");
        }
        assert!(validate(&args(&["config", "--get", "core.ignorecase", "pat"])).is_ok());
    }
    #[test]
    fn classifies_local_clone_sources_and_devices() {
        assert!(is_null_device("nul"));
        assert!(is_null_device("NUL"));
        assert!(is_null_device("/dev/null"));
        assert!(!is_null_device("nul:"));
        assert!(!is_null_device("C:/x"));
        assert!(is_local_clone_source("/repos/x"));
        assert!(is_local_clone_source("./x"));
        assert!(is_local_clone_source("plain-dir"));
        assert!(!is_local_clone_source("https://example.invalid/r.git"));
        assert!(!is_local_clone_source("ssh://example.invalid/r.git"));
        assert!(!is_local_clone_source("git@example.invalid:r.git"));
        assert!(is_local_clone_source("file://outside/repo"));
        if cfg!(windows) {
            assert!(is_local_clone_source("C:/repos/x"));
            assert!(is_local_clone_source("C:x"));
            assert!(!is_local_clone_source("host:r.git"));
        }
    }
    #[test]
    fn extracts_no_index_operands_and_init_targets() {
        let operands = no_index_operands(
            &args(&["diff", "--no-index", "--no-color", "--", "nul", "a/b"]),
            0,
        )
        .unwrap();
        assert_eq!(operands, ["nul", "a/b"]);
        assert!(no_index_operands(&args(&["check-ignore", "--no-index", "-z"]), 0)
            .unwrap()
            .is_empty());
        assert_eq!(init_target(&args(&["init", "-b", "main"]), 0), None);
        assert_eq!(
            init_target(&args(&["init", "-b", "main", "sub"]), 0),
            Some("sub".into())
        );
        assert_eq!(init_target(&args(&["init", "--", "sub"]), 0), Some("sub".into()));
        assert_eq!(
            worktree_move_targets(&args(&["worktree", "move", "wt", "dest"]), 0),
            ["wt", "dest"]
        );
        assert!(worktree_move_targets(&args(&["worktree", "add", "--", "dest"]), 0).is_empty());
    }
    #[test]
    fn classifies_local_transport_targets() {
        assert_eq!(local_transport_path("plain"), Some("plain".into()));
        assert_eq!(local_transport_path("./x"), Some("./x".into()));
        assert_eq!(local_transport_path("/repos/x"), Some("/repos/x".into()));
        assert_eq!(local_transport_path("https://example.invalid/r.git"), None);
        assert_eq!(local_transport_path("ssh://example.invalid/r.git"), None);
        assert_eq!(local_transport_path("git@example.invalid:r.git"), None);
        assert_eq!(local_transport_path("host:r.git"), None);
        // file:<path>（单斜杠）git 按 ssh 处理，非本地 file 传输。
        assert_eq!(local_transport_path("file:E:/x"), None);
        // 非本地 host：git 不走本地 file 传输。
        assert_eq!(local_transport_path("file://example.invalid/x"), None);
        assert_eq!(local_transport_path("file://"), None);
        assert_eq!(
            local_transport_path("FILE://localhost/repos/x"),
            Some("/repos/x".into())
        );
        assert_eq!(
            local_transport_path("file:///repos/a%20b"),
            Some("/repos/a b".into())
        );
        // 解码后的 .. 逃逸由调用方的 resolve/require_path 拒绝，这里只验证解码。
        assert_eq!(
            local_transport_path("file:///repos/%2E%2E"),
            Some("/repos/..".into())
        );
        assert_eq!(local_transport_path("file:///a%zz"), Some("/a%zz".into()));
        if cfg!(windows) {
            assert_eq!(local_transport_path("C:/repos/x"), Some("C:/repos/x".into()));
            assert_eq!(local_transport_path(r"C:\repos\x"), Some(r"C:\repos\x".into()));
            assert_eq!(
                local_transport_path("file://E:/repos/x"),
                Some("E:/repos/x".into())
            );
            assert_eq!(
                local_transport_path("file:///E:/repos/x"),
                Some("E:/repos/x".into())
            );
            assert_eq!(
                local_transport_path(r"file://E:\repos\x"),
                Some(r"E:\repos\x".into())
            );
        } else {
            assert_eq!(local_transport_path("C:/repos/x"), None);
            assert_eq!(
                local_transport_path("file:///E:/repos/x"),
                Some("/E:/repos/x".into())
            );
        }
    }
    #[test]
    fn extracts_transport_candidates_conservatively() {
        use TransportCandidates::{All, Explicit, Upstream};
        assert_eq!(transport_candidates(&args(&["--all"])), Some(All));
        assert_eq!(
            transport_candidates(&args(&["origin"])),
            Some(Explicit(vec!["origin".into()]))
        );
        // 首个位置参数之后是 refspec，不再参与远程判定。
        assert_eq!(
            transport_candidates(&args(&["--prune", "origin", "refs/heads/main"])),
            Some(Explicit(vec!["origin".into()]))
        );
        assert_eq!(
            transport_candidates(&args(&["+main:main"])),
            Some(Explicit(vec!["+main:main".into()]))
        );
        assert_eq!(
            transport_candidates(&args(&["--multiple", "a", "b"])),
            Some(Explicit(vec!["a".into(), "b".into()]))
        );
        assert_eq!(transport_candidates(&args(&[])), Some(Upstream));
        assert_eq!(transport_candidates(&args(&["--rebase"])), Some(Upstream));
        assert_eq!(
            transport_candidates(&args(&["--", "origin", "main"])),
            Some(Explicit(vec!["origin".into()]))
        );
        // 取值选项的值不是 <repository>；其余位置照常解析。
        assert_eq!(
            transport_candidates(&args(&["--depth", "1", "origin"])),
            Some(Explicit(vec!["origin".into()]))
        );
        assert_eq!(
            transport_candidates(&args(&["--shallow-exclude", "./inside", "origin"])),
            Some(Explicit(vec!["origin".into()]))
        );
        assert_eq!(
            transport_candidates(&args(&["--jobs=2", "origin"])),
            Some(Explicit(vec!["origin".into()]))
        );
        assert_eq!(
            transport_candidates(&args(&["-qf", "origin"])),
            Some(Explicit(vec!["origin".into()]))
        );
        assert_eq!(
            transport_candidates(&args(&["-o", "x", "origin"])),
            Some(Explicit(vec!["origin".into()]))
        );
        assert_eq!(
            transport_candidates(&args(&["-qovalue", "origin"])),
            Some(Explicit(vec!["origin".into()]))
        );
        // 未知选项（含未知取值选项）放弃放行；-- 之前无远程则按裸调用处理。
        assert_eq!(transport_candidates(&args(&["--unknown", "origin"])), None);
        assert_eq!(transport_candidates(&args(&["--refmapx", "origin"])), None);
        assert_eq!(transport_candidates(&args(&["-s", "ort", "origin"])), None);
        assert_eq!(transport_candidates(&args(&["--"])), Some(Upstream));
    }
}
