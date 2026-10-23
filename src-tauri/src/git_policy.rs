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

fn command_index(args: &[String]) -> Result<usize, String> {
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
    if read {
        return true;
    }
    let Some(key) = positional.first() else {
        return false;
    };
    matches!(key.as_str(), "user.name" | "user.email")
        || key.starts_with("auugit.")
        || (key.starts_with("branch.")
            && [".remote", ".merge", ".pushremote"]
                .iter()
                .any(|suffix| key.ends_with(suffix)))
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
            skip_value = false;
            continue;
        }
        if argument == "--" || argument == "--end-of-options" {
            break;
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
        ];
        if (option.starts_with("--")
            && option.len() > 2
            && blocked.iter().any(|blocked| blocked.starts_with(option)))
            || (name == "rebase" && argument.starts_with("-x"))
            || (matches!(name, "push" | "fetch" | "pull" | "clone") && argument.starts_with("-u"))
        {
            return Err(format!("Unsupported Git option: {option}"));
        }
        if matches!(
            argument.as_str(),
            "-m" | "--message"
                | "--format"
                | "--pretty"
                | "--author"
                | "--grep"
                | "-b"
                | "-B"
                | "-n"
                | "--max-count"
                | "--file"
        ) {
            skip_value = true;
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
        ] {
            assert!(validate(&args(&values)).is_err(), "{values:?}");
        }
    }
    #[test]
    fn allows_app_operations_and_literal_messages() {
        for values in [
            vec!["-c", "core.quotepath=false", "status", "-z"],
            vec!["-c", "core.editor=true", "rebase", "--continue"],
            vec!["config", "--local", "branch.main.pushRemote", "origin"],
            vec!["config", "--get", "core.ignorecase"],
            vec!["commit", "-m", "--exec=literal message"],
        ] {
            assert!(validate(&args(&values)).is_ok(), "{values:?}");
        }
        assert!(valid_editor(&format!(
            "printf '%s\\n' 'pick {}' 'fixup {}' > \"$1\"; :",
            "a".repeat(40),
            "b".repeat(40)
        )));
    }
}
