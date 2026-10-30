use crate::git_process::{run_git_bytes_index, GitCommandResult};
use std::time::Duration;

fn oid(value: &str) -> bool {
    matches!(value.len(), 40 | 64) && value.bytes().all(|byte| byte.is_ascii_hexdigit())
}

pub(crate) fn validate(args: &[String], tree: &str) -> Result<(), String> {
    if tree != "empty" && !oid(tree) { return Err("Invalid temporary index tree".into()); }
    let index = crate::git_policy::command_index(args)?;
    let rest: Vec<&str> = args[index..].iter().map(String::as_str).collect();
    let allowed = match rest.as_slice() {
        ["write-tree"] => true,
        ["apply", "--cached", "--whitespace=nowarn", "-"] => true,
        ["commit", "-m", _] => true,
        ["restore", "--staged", source, "--pathspec-from-file=-", "--pathspec-file-nul"] => source.strip_prefix("--source=").is_some_and(oid),
        _ => false,
    };
    if allowed { Ok(()) } else { Err("Unsupported temporary index command".into()) }
}

/// Only an object ID crosses IPC. The index pathname is generated here and
/// cannot be supplied by the webview. The real index is never opened for writing.
pub(crate) fn run(args: Vec<String>, cwd: String, binary: Option<String>, input: Option<String>, tree: &str) -> Result<GitCommandResult, String> {
    validate(&args, tree)?;
    let directory = tempfile::Builder::new().prefix("auugit-index-").tempdir().map_err(|error| error.to_string())?;
    let index = directory.path().join("index");
    let execute = |args: Vec<String>, stdin: Option<String>| {
        run_git_bytes_index(args, cwd.clone(), binary.clone(), stdin, Duration::from_secs(15 * 60), None, Some(&index))
    };
    let initial = execute(vec!["read-tree".into(), if tree == "empty" { "--empty".into() } else { tree.into() }], None)?;
    if initial.exit_code != 0 { return Err(String::from_utf8_lossy(&initial.stderr).into_owned()); }
    let result = execute(args, input)?;
    let index_tree = if result.exit_code == 0 {
        let snapshot = execute(vec!["write-tree".into()], None)?;
        if snapshot.exit_code != 0 { return Err(String::from_utf8_lossy(&snapshot.stderr).into_owned()); }
        Some(String::from_utf8_lossy(&snapshot.stdout).trim().to_string())
    } else { None };
    Ok(GitCommandResult { exit_code: result.exit_code, stdout: String::from_utf8_lossy(&result.stdout).into_owned(), stderr: String::from_utf8_lossy(&result.stderr).into_owned(), index_tree })
}

#[cfg(test)]
mod tests {
    use super::*;
    fn args(values: &[&str]) -> Vec<String> { values.iter().map(|value| (*value).into()).collect() }
    #[test]
    fn object_ids_cannot_be_paths_or_inject_worktree_writes() {
        assert!(validate(&args(&["apply", "--cached", "--whitespace=nowarn", "-"]), "empty").is_ok());
        assert!(validate(&args(&["commit", "-m", "reviewed"]), &"a".repeat(40)).is_ok());
        for tree in ["HEAD", "../index", "C:/index", "--empty", "a\0b"] { assert!(validate(&args(&["write-tree"]), tree).is_err()); }
        for command in [vec!["apply", "-"], vec!["restore", "--worktree", "."], vec!["read-tree", "-u", "HEAD"], vec!["commit", "--all", "-m", "x"], vec!["reset", "--hard"]] {
            assert!(validate(&args(&command), "empty").is_err());
        }
    }

    #[test]
    fn native_commits_use_the_snapshot_and_preserve_the_real_index_and_worktree() {
        use std::{fs, process::Command};
        let directory = tempfile::tempdir().unwrap();
        let cwd = crate::normalize_display_path(directory.path());
        let git = |values: &[&str]| {
            let output = Command::new("git").args(values).current_dir(&cwd).output().unwrap();
            assert!(output.status.success(), "{}", String::from_utf8_lossy(&output.stderr));
            String::from_utf8(output.stdout).unwrap()
        };
        git(&["init", "-b", "main"]);
        git(&["config", "user.name", "Index Test"]);
        git(&["config", "user.email", "index@example.invalid"]);
        git(&["config", "commit.gpgSign", "false"]);
        git(&["config", "core.autocrlf", "false"]);
        fs::write(directory.path().join("a.txt"), "base\n").unwrap();
        fs::write(directory.path().join("b.txt"), "base\n").unwrap();
        git(&["add", "-A"]); git(&["commit", "-m", "initial"]);
        let base = git(&["rev-parse", "HEAD^{tree}"]);
        fs::write(directory.path().join("a.txt"), "staged a\n").unwrap();
        fs::write(directory.path().join("b.txt"), "staged b\n").unwrap();
        git(&["add", "-A"]);
        let staged = git(&["write-tree"]);
        fs::write(directory.path().join("a.txt"), "working a\n").unwrap();
        let entries = git(&["ls-files", "--stage", "-z"]);
        let flags = git(&["ls-files", "-v", "-z"]);
        let source = format!("--source={}", staged.trim());
        let selected = run(args(&["--literal-pathspecs", "restore", "--staged", &source, "--pathspec-from-file=-", "--pathspec-file-nul"]), cwd.clone(), None, Some("a.txt\0".into()), base.trim()).unwrap();
        assert_eq!(selected.exit_code, 0, "{}", selected.stderr);
        let tree = selected.index_tree.unwrap();
        let committed = run(args(&["commit", "-m", "only staged a"]), cwd.clone(), None, None, &tree).unwrap();
        assert_eq!(committed.exit_code, 0, "{}", committed.stderr);
        assert_eq!(committed.index_tree, Some(tree));
        assert_eq!(git(&["show", "HEAD:a.txt"]), "staged a\n");
        assert_eq!(git(&["show", "HEAD:b.txt"]), "base\n");
        assert_eq!(git(&["ls-files", "--stage", "-z"]), entries);
        assert_eq!(git(&["ls-files", "-v", "-z"]), flags);
        assert_eq!(fs::read_to_string(directory.path().join("a.txt")).unwrap(), "working a\n");
    }
}
