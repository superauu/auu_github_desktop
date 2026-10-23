use serde::{Deserialize, Serialize};
use std::io::{Read, Write};
use std::path::Path;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GitCommandResult {
    pub exit_code: i32,
    pub stdout: String,
    pub stderr: String,
}

fn stop_process(child: &mut std::process::Child) {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        let _ = Command::new("taskkill.exe")
            .args(["/PID", &child.id().to_string(), "/T", "/F"])
            .creation_flags(0x08000000)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
    }
    let _ = child.kill();
    let _ = child.wait();
}

fn collect_output<R: Read + Send + 'static>(
    reader: R,
) -> std::sync::mpsc::Receiver<Result<Vec<u8>, String>> {
    let (sender, receiver) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        let mut bytes = Vec::new();
        let result = reader
            .take(32 * 1024 * 1024 + 1)
            .read_to_end(&mut bytes)
            .map_err(|e| e.to_string())
            .and_then(|_| {
                if bytes.len() > 32 * 1024 * 1024 {
                    Err("Git output too large".into())
                } else {
                    Ok(bytes)
                }
            });
        let _ = sender.send(result);
    });
    receiver
}

pub(crate) struct GitBytesResult {
    pub exit_code: i32,
    pub stdout: Vec<u8>,
    pub stderr: Vec<u8>,
}

pub(crate) fn run_git_bytes(
    args: Vec<String>,
    cwd: String,
    git_binary: Option<String>,
    stdin: Option<String>,
    timeout: Duration,
) -> Result<GitBytesResult, String> {
    let binary = git_binary
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| "git".into());
    let name = Path::new(&binary)
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("")
        .to_lowercase();
    if name != "git" && name != "git.exe" {
        return Err("Expected a Git executable".into());
    }
    let mut command = Command::new(&binary);
    command
        .args(args)
        .current_dir(cwd)
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GCM_INTERACTIVE", "Never")
        .env("GIT_ALLOW_PROTOCOL", "https:http:ssh:git:file")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    let mut child = command
        .spawn()
        .map_err(|e| format!("Unable to start Git: {}", e))?;
    let stdout = collect_output(child.stdout.take().ok_or("Missing stdout")?);
    let stderr = collect_output(child.stderr.take().ok_or("Missing stderr")?);
    let mut input = child.stdin.take().ok_or("Missing stdin")?;
    let writer = std::thread::spawn(move || {
        if let Some(content) = stdin {
            input
                .write_all(content.as_bytes())
                .map_err(|e| e.to_string())?;
        }
        Ok::<(), String>(())
    });
    let deadline = Instant::now() + timeout;
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) if Instant::now() < deadline => std::thread::sleep(Duration::from_millis(25)),
            Ok(None) => {
                stop_process(&mut child);
                return Err("Git command timed out".into());
            }
            Err(error) => {
                stop_process(&mut child);
                return Err(error.to_string());
            }
        }
    };
    let stdout = stdout
        .recv_timeout(Duration::from_secs(2))
        .map_err(|e| e.to_string())??;
    let stderr = stderr
        .recv_timeout(Duration::from_secs(2))
        .map_err(|e| e.to_string())??;
    if status.success() {
        writer.join().map_err(|_| "Git input writer failed")??;
    }
    Ok(GitBytesResult {
        exit_code: status.code().unwrap_or(-1),
        stdout,
        stderr,
    })
}

pub(crate) fn run_git(
    args: Vec<String>,
    cwd: String,
    git_binary: Option<String>,
    stdin: Option<String>,
) -> Result<GitCommandResult, String> {
    let result = run_git_bytes(args, cwd, git_binary, stdin, Duration::from_secs(15 * 60))?;
    Ok(GitCommandResult {
        exit_code: result.exit_code,
        stdout: String::from_utf8_lossy(&result.stdout).into_owned(),
        stderr: String::from_utf8_lossy(&result.stderr).into_owned(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn blob_reads_preserve_non_utf8_bytes() {
        let directory = tempfile::tempdir().unwrap();
        let cwd = directory.path().to_string_lossy().into_owned();
        assert_eq!(
            run_git(vec!["init".into()], cwd.clone(), None, None)
                .unwrap()
                .exit_code,
            0
        );
        let bytes = [137, 80, 78, 71, 13, 10, 26, 10, 0xff, 0, 0xfe];
        std::fs::write(directory.path().join("image.png"), bytes).unwrap();
        let object = run_git(
            vec!["hash-object".into(), "-w".into(), "image.png".into()],
            cwd.clone(),
            None,
            None,
        )
        .unwrap();
        assert_eq!(object.exit_code, 0);
        let blob = run_git_bytes(
            vec![
                "cat-file".into(),
                "blob".into(),
                object.stdout.trim().into(),
            ],
            cwd,
            None,
            None,
            Duration::from_secs(15),
        )
        .unwrap();
        assert_eq!(blob.exit_code, 0);
        assert_eq!(blob.stdout, bytes);
    }
}
