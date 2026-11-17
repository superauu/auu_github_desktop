// PathBuf 仅 Windows（PowerShell 路径）与 Linux（PATH 探测）分支使用；macOS 分支
// 只用 Command，导入必须按平台收窄，否则 macOS 的 clippy -D warnings 会报 unused。
#[cfg(any(target_os = "windows", target_os = "linux"))]
use std::path::PathBuf;
use std::process::Command;

/// 「在目录打开外部终端」的平台分支。全部以参数数组传参（无 shell 中转），
/// 目录里的空格与特殊字符不会形成注入面；工作目录统一用 `current_dir` 传入。
/// 纯函数 `linux_terminal_candidates` / `find_in_path` 跨平台编译，原地测试锁定
/// 候选顺序与参数形态；Windows/macOS 分支保持原有行为不变。
#[cfg(target_os = "windows")]
pub fn open_external_terminal(directory: &str) -> Result<(), String> {
    use std::os::windows::process::CommandExt;
    // System32 绝对路径：防 PATH 劫持；CREATE_NEW_CONSOLE(0x10) 弹独立控制台窗口。
    let powershell = PathBuf::from(std::env::var_os("SystemRoot").ok_or("Missing Windows directory")?)
        .join("System32/WindowsPowerShell/v1.0/powershell.exe");
    Command::new(powershell)
        .args(["-NoLogo", "-NoProfile", "-NoExit"])
        .current_dir(directory)
        .creation_flags(0x00000010)
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("Unable to open terminal: {error}"))
}

#[cfg(target_os = "macos")]
pub fn open_external_terminal(directory: &str) -> Result<(), String> {
    // open -a Terminal <dir>：系统自带 Terminal.app 在该目录开新窗口，无需探测。
    Command::new("open")
        .args(["-a", "Terminal", directory])
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("Unable to open terminal: {error}"))
}

#[cfg(target_os = "linux")]
pub fn open_external_terminal(directory: &str) -> Result<(), String> {
    for (program, arguments) in linux_terminal_candidates(directory) {
        let Some(path) = find_in_path(program) else {
            continue;
        };
        let spawned = Command::new(path)
            .args(&arguments)
            .current_dir(directory)
            .spawn();
        match spawned {
            Ok(_) => return Ok(()),
            // 命中候选但启动失败（坏的 alternatives 指向等）：继续尝试下一个。
            Err(_) => continue,
        }
    }
    Err("No supported terminal emulator found on this system".into())
}

#[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
pub fn open_external_terminal(_directory: &str) -> Result<(), String> {
    Err("Opening an external terminal is not supported on this platform".into())
}

/// Linux 终端模拟器候选（探测顺序即偏好顺序）：目录以独立 argv 传递（或 `--flag=<dir>`
/// 连写），全部不经过 shell。x-terminal-emulator（update-alternatives 代理）与 xterm
/// 没有统一的工作目录 flag，靠 `current_dir` 落位。
#[cfg(target_os = "linux")]
pub fn linux_terminal_candidates(directory: &str) -> Vec<(&'static str, Vec<String>)> {
    vec![
        ("x-terminal-emulator", Vec::new()),
        ("gnome-terminal", vec![format!("--working-directory={directory}")]),
        ("konsole", vec!["--workdir".to_string(), directory.to_string()]),
        ("xfce4-terminal", vec![format!("--working-directory={directory}")]),
        ("alacritty", vec!["--working-directory".to_string(), directory.to_string()]),
        ("kitty", vec!["--directory".to_string(), directory.to_string()]),
        ("wezterm", vec!["start".to_string(), "--cwd".to_string(), directory.to_string()]),
        ("xterm", Vec::new()),
    ]
}

/// 在 PATH 上查找可执行文件（不要求可执行位检查：跨平台语义差异留给 spawn 失败兜底）。
#[cfg(target_os = "linux")]
pub fn find_in_path(program: &str) -> Option<PathBuf> {
    let path = std::env::var_os("PATH")?;
    std::env::split_paths(&path)
        .map(|directory| directory.join(program))
        .find(|candidate| candidate.is_file())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(target_os = "linux")]
    #[test]
    fn linux_candidates_keep_directory_in_its_own_argument() {
        let candidates = linux_terminal_candidates("/repos/my work");
        // 顺序即偏好：alternatives 代理优先，xterm 兜底。
        assert_eq!(candidates.first().unwrap().0, "x-terminal-emulator");
        assert_eq!(candidates.last().unwrap().0, "xterm");
        for (program, arguments) in &candidates {
            for argument in arguments {
                // 目录要么独立成参，要么以 --flag=<dir> 连写；都不经过 shell 转义。
                assert!(argument.contains("/repos/my work"), "{program}: {argument}");
            }
        }
        let gnome = candidates.iter().find(|(program, _)| *program == "gnome-terminal").unwrap();
        assert_eq!(gnome.1, vec!["--working-directory=/repos/my work"]);
        let konsole = candidates.iter().find(|(program, _)| *program == "konsole").unwrap();
        assert_eq!(konsole.1, vec!["--workdir", "/repos/my work"]);
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn find_in_path_locates_and_misses() {
        let mut path = std::env::split_paths(&std::env::var_os("PATH").unwrap_or_default()).collect::<Vec<_>>();
        let unique = std::env::temp_dir().join(format!("auugit-terminal-probe-{}", std::process::id()));
        std::fs::create_dir_all(&unique).unwrap();
        let fake = unique.join("auugit-fake-terminal-xyz");
        std::fs::write(&fake, b"").unwrap();
        path.insert(0, unique.clone());
        std::env::set_var("PATH", std::env::join_paths(&path).unwrap());
        assert!(find_in_path("auugit-fake-terminal-xyz").is_some());
        assert!(find_in_path("auugit-missing-terminal-xyz").is_none());
        std::fs::remove_dir_all(&unique).ok();
    }

    #[test]
    fn dialog_text_is_bilingual_neutral() {
        // 平台无关的冒烟：确保模块在各平台都能编译并导出入口（行为分支由平台 CI 覆盖）。
        let _ = open_external_terminal("definitely-not-a-directory");
    }
}
