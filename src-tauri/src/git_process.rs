use serde::{Deserialize, Serialize};
use std::io::{Read, Write};
use std::process::{Command, Stdio};
use std::sync::{Condvar, Mutex};
use std::time::{Duration, Instant};

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GitCommandResult {
    pub exit_code: i32,
    pub stdout: String,
    pub stderr: String,
}

/// 默认传输白名单。git://（git daemon 协议）无加密无认证且主流托管已弃用，与 file
/// 一并排除：file 仅对已授权的本地源经 LOCAL_PROTOCOLS 按次放行，git:// 无放行通道。
pub(crate) const DEFAULT_PROTOCOLS: &str = "https:http:ssh";
pub(crate) const LOCAL_PROTOCOLS: &str = "https:http:ssh:file";

const MAX_STDIN_BYTES: usize = 8 * 1024 * 1024;
const MAX_OUTPUT_BYTES: usize = 32 * 1024 * 1024;
const MAX_CONCURRENT_GIT: u32 = 8;
/// 进程退出后输出管道的宽限期：hook 派生的驻留子进程继承管道导致永不 EOF。
const OUTPUT_GRACE: Duration = Duration::from_secs(2);

static ACTIVE: Mutex<u32> = Mutex::new(0);
static IDLE: Condvar = Condvar::new();

/// 中毒自动恢复的锁获取：持锁线程 panic 后静态锁永久中毒会让全部后续命令失败，
/// 各模块的静态锁一律经此函数获取（ poison 语义下 into_inner 的数据仍是完整的）。
pub(crate) fn lock_or_recover<T>(lock: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    lock.lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

/// 全局并发闸：限制同时运行的 Git 子进程数，防止 IPC 洪泛耗尽资源。
struct GitSlot;

impl Drop for GitSlot {
    fn drop(&mut self) {
        let mut active = lock_or_recover(&ACTIVE);
        *active -= 1;
        IDLE.notify_one();
    }
}

fn acquire_slot() -> GitSlot {
    let mut active = lock_or_recover(&ACTIVE);
    while *active >= MAX_CONCURRENT_GIT {
        active = IDLE
            .wait(active)
            .unwrap_or_else(|poisoned| poisoned.into_inner());
    }
    *active += 1;
    GitSlot
}

fn stop_process(child: &mut std::process::Child) {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        // 绝对路径解析防工作目录劫持（CreateProcess 搜索顺序含应用/当前目录）；
        // SystemRoot 缺失等环境异常时退回裸名，保证超时强杀本身不被阻断。
        let taskkill = match std::env::var_os("SystemRoot") {
            Some(root) => std::path::PathBuf::from(root).join("System32/taskkill.exe"),
            None => std::path::PathBuf::from("taskkill.exe"),
        };
        let _ = Command::new(taskkill)
            .args(["/PID", &child.id().to_string(), "/T", "/F"])
            .creation_flags(0x08000000)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
    }
    let _ = child.kill();
    let _ = child.wait();
}

enum StreamEvent {
    Chunk(Vec<u8>),
    End(Result<(), String>),
}

/// 分块流式收集输出： EOF 永不到来时（驻留子进程占用管道）也能抢救已收到的部分。
fn collect_output<R: Read + Send + 'static>(mut reader: R) -> std::sync::mpsc::Receiver<StreamEvent> {
    let (sender, receiver) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        let mut buffer = [0u8; 64 * 1024];
        let mut total = 0usize;
        loop {
            match reader.read(&mut buffer) {
                Ok(0) => {
                    let _ = sender.send(StreamEvent::End(Ok(())));
                    return;
                }
                Ok(read) => {
                    total += read;
                    if total > MAX_OUTPUT_BYTES {
                        let _ = sender.send(StreamEvent::End(Err("Git output too large".into())));
                        return;
                    }
                    if sender.send(StreamEvent::Chunk(buffer[..read].to_vec())).is_err() {
                        return;
                    }
                }
                Err(error) => {
                    let _ = sender.send(StreamEvent::End(Err(error.to_string())));
                    return;
                }
            }
        }
    });
    receiver
}

fn drain_output(receiver: std::sync::mpsc::Receiver<StreamEvent>) -> Result<Vec<u8>, String> {
    let mut bytes = Vec::new();
    let deadline = Instant::now() + OUTPUT_GRACE;
    loop {
        let remaining = deadline.saturating_duration_since(Instant::now());
        match receiver.recv_timeout(remaining) {
            Ok(StreamEvent::Chunk(chunk)) => bytes.extend_from_slice(&chunk),
            Ok(StreamEvent::End(result)) => {
                result?;
                return Ok(bytes);
            }
            Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {
                // 进程已退出但管道被驻留子进程占住：带着已抢救的输出返回，而不是整条命令报错。
                return Ok(bytes);
            }
            Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => return Ok(bytes),
        }
    }
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
    run_git_bytes_protocols(args, cwd, git_binary, stdin, timeout, None)
}

pub(crate) fn run_git_bytes_protocols(
    args: Vec<String>,
    cwd: String,
    git_binary: Option<String>,
    stdin: Option<String>,
    timeout: Duration,
    protocols: Option<&str>,
) -> Result<GitBytesResult, String> {
    if stdin.as_ref().is_some_and(|content| content.len() > MAX_STDIN_BYTES) {
        return Err("Git input exceeds 8 MiB".into());
    }
    let _slot = acquire_slot();
    let binary = crate::git_binary::resolve(git_binary.as_deref())?;
    let mut command = Command::new(&binary);
    command
        .args(args)
        .current_dir(cwd)
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GCM_INTERACTIVE", "Never")
        .env("GIT_ALLOW_PROTOCOL", protocols.unwrap_or(DEFAULT_PROTOCOLS))
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
    let stdout = drain_output(stdout)?;
    let stderr = drain_output(stderr)?;
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
    run_git_protocols(args, cwd, git_binary, stdin, None)
}

/// 与 run_git 相同，但可对该次调用放行额外传输协议（仅限已授权的本地 clone 源）。
pub(crate) fn run_git_protocols(
    args: Vec<String>,
    cwd: String,
    git_binary: Option<String>,
    stdin: Option<String>,
    protocols: Option<&str>,
) -> Result<GitCommandResult, String> {
    let result = run_git_bytes_protocols(
        args,
        cwd,
        git_binary,
        stdin,
        Duration::from_secs(15 * 60),
        protocols,
    )?;
    Ok(GitCommandResult {
        exit_code: result.exit_code,
        stdout: String::from_utf8_lossy(&result.stdout).into_owned(),
        stderr: String::from_utf8_lossy(&result.stderr).into_owned(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn init_repo(source: &std::path::Path) {
        std::fs::create_dir_all(source).unwrap();
        let cwd = source.to_string_lossy().into_owned();
        run_git(vec!["init".into(), "-b".into(), "main".into()], cwd.clone(), None, None).unwrap();
        std::fs::write(source.join("file.txt"), "base\n").unwrap();
        run_git(vec!["add".into(), "--".into(), "file.txt".into()], cwd.clone(), None, None).unwrap();
        run_git(vec!["config".into(), "user.name".into(), "t".into()], cwd.clone(), None, None).unwrap();
        run_git(vec!["config".into(), "user.email".into(), "t@t".into()], cwd.clone(), None, None).unwrap();
        run_git(vec!["commit".into(), "-m".into(), "base".into()], cwd, None, None).unwrap();
    }

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

    #[test]
    fn large_outputs_stream_intact() {
        let directory = tempfile::tempdir().unwrap();
        let cwd = directory.path().to_string_lossy().into_owned();
        run_git(vec!["init".into()], cwd.clone(), None, None).unwrap();
        let bytes: Vec<u8> = (0..256 * 1024).map(|index| (index % 251) as u8).collect();
        std::fs::write(directory.path().join("large.bin"), &bytes).unwrap();
        let object = run_git(
            vec![
                "hash-object".into(),
                "--no-filters".into(),
                // 直连 run_git 不经过策略层；必须 -w 落盘对象，cat-file 才有对象可读。
                "-w".into(),
                "--".into(),
                "large.bin".into(),
            ],
            cwd.clone(),
            None,
            None,
        )
        .unwrap();
        let hash = object.stdout.trim().to_string();
        let blob = run_git_bytes(
            vec!["cat-file".into(), "blob".into(), hash],
            cwd,
            None,
            None,
            Duration::from_secs(15),
        )
        .unwrap();
        assert_eq!(blob.exit_code, 0);
        assert_eq!(blob.stdout, bytes);
    }

    #[test]
    fn oversized_stdin_is_rejected_before_spawning() {
        let directory = tempfile::tempdir().unwrap();
        let error = run_git(
            vec!["hash-object".into(), "--stdin".into()],
            directory.path().to_string_lossy().into_owned(),
            None,
            Some("x".repeat(MAX_STDIN_BYTES + 1)),
        )
        .unwrap_err();
        assert!(error.contains("8 MiB"), "{error}");
    }

    #[test]
    fn git_daemon_protocol_is_rejected_by_default() {
        let directory = tempfile::tempdir().unwrap();
        let result = run_git(
            vec!["ls-remote".into(), "git://localhost/auugit-denied".into()],
            directory.path().to_string_lossy().into_owned(),
            None,
            None,
        )
        .unwrap();
        // git 在连接前就按 GIT_ALLOW_PROTOCOL 拒绝，断言不依赖网络可达性。
        assert_ne!(result.exit_code, 0, "{}", result.stderr);
        assert!(result.stderr.contains("not allowed"), "{}", result.stderr);
    }

    #[test]
    fn local_clone_sources_need_the_local_protocol_grant() {
        let directory = tempfile::tempdir().unwrap();
        let source = directory.path().join("source");
        init_repo(&source);
        let blocked = run_git_protocols(
            vec![
                "clone".into(),
                "--".into(),
                source.to_string_lossy().into_owned(),
                directory.path().join("blocked").to_string_lossy().into_owned(),
            ],
            directory.path().to_string_lossy().into_owned(),
            None,
            None,
            None,
        )
        .unwrap();
        assert_ne!(blocked.exit_code, 0, "{}", blocked.stderr);
        let allowed = run_git_protocols(
            vec![
                "clone".into(),
                "--".into(),
                source.to_string_lossy().into_owned(),
                directory.path().join("allowed").to_string_lossy().into_owned(),
            ],
            directory.path().to_string_lossy().into_owned(),
            None,
            None,
            Some(LOCAL_PROTOCOLS),
        )
        .unwrap();
        assert_eq!(allowed.exit_code, 0, "{}", allowed.stderr);
    }

    #[test]
    fn local_push_targets_need_the_local_protocol_grant() {
        let directory = tempfile::tempdir().unwrap();
        let source = directory.path().join("source");
        init_repo(&source);
        let clone = |target: &std::path::Path| {
            run_git_protocols(
                vec![
                    "clone".into(),
                    "--bare".into(),
                    "--".into(),
                    source.to_string_lossy().into_owned(),
                    target.to_string_lossy().into_owned(),
                ],
                directory.path().to_string_lossy().into_owned(),
                None,
                None,
                Some(LOCAL_PROTOCOLS),
            )
            .unwrap()
        };
        let work = directory.path().join("work");
        let bare = directory.path().join("mirror.git");
        assert_eq!(clone(&work).exit_code, 0);
        assert_eq!(clone(&bare).exit_code, 0);
        std::fs::write(work.join("file.txt"), "change\n").unwrap();
        let cwd = work.to_string_lossy().into_owned();
        run_git(vec!["add".into(), "--".into(), "file.txt".into()], cwd.clone(), None, None).unwrap();
        run_git(vec!["commit".into(), "-m".into(), "change".into()], cwd.clone(), None, None).unwrap();
        let push = vec![
            "push".into(),
            bare.to_string_lossy().into_owned(),
            "refs/heads/main:refs/heads/main".into(),
        ];
        let blocked = run_git_protocols(push.clone(), cwd.clone(), None, None, None).unwrap();
        assert_ne!(blocked.exit_code, 0, "{}", blocked.stderr);
        let allowed = run_git_protocols(push, cwd, None, None, Some(LOCAL_PROTOCOLS)).unwrap();
        assert_eq!(allowed.exit_code, 0, "{}", allowed.stderr);
    }
}
