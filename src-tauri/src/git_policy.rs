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

pub fn command(args: &[String]) -> Result<&str, String> {
    Ok(&args[command_index(args)?])
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

/// clone 源是本地路径（file 传输，必须先授权）还是远程 URL。
/// scp 风格 host:path 视作远程（由 GIT_ALLOW_PROTOCOL 约束），与 git 的
/// url_is_local_not_ssh 对齐；file: 前缀按本地处理（调用方直接拒绝）。
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

pub fn validate(args: &[String]) -> Result<(), String> {
    let index = command_index(args)?;
    let name = args[index].as_str();
    if name == "--version" && args.len() != index + 1 {
        return Err("Invalid version arguments".into());
    }
    if name == "config" && !safe_config(&args[index + 1..]) {
        return Err("Unsupported Git configuration access".into());
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
            if source.to_ascii_lowercase().starts_with("file:") {
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
}
