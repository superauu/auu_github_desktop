use serde::{Deserialize, Serialize};
use std::fs;
use std::process::Command;

/// 去除 Windows canonicalize 返回的 \\?\ 前缀（含 UNC 形式）。
/// 前端会把路径中的反斜杠统一成正斜杠，而 "//?/E:/" 形式 Win32 不识别，
/// 会导致以该路径作为 cwd 的 git 命令全部启动失败。
fn normalize_display_path(p: &std::path::Path) -> String {
    let s = p.to_string_lossy().to_string();
    if let Some(rest) = s.strip_prefix(r"\\?\UNC\") {
        return format!(r"\\{}", rest);
    }
    if let Some(rest) = s.strip_prefix(r"\\?\") {
        return rest.to_string();
    }
    s
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GitCommandResult {
    pub exit_code: i32,
    pub stdout: String,
    pub stderr: String,
}

#[tauri::command]
fn execute_git(
    args: Vec<String>,
    cwd: String,
    git_binary: Option<String>,
) -> Result<GitCommandResult, String> {
    let binary = git_binary
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "git".to_string());

    let mut cmd = Command::new(&binary);
    cmd.args(&args);
    cmd.current_dir(&cwd);

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    match cmd.output() {
        Ok(output) => {
            let exit_code = output.status.code().unwrap_or(-1);
            let stdout = String::from_utf8_lossy(&output.stdout).to_string();
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
            Ok(GitCommandResult {
                exit_code,
                stdout,
                stderr,
            })
        }
        Err(e) => Err(format!("无法启动 Git 命令 ({}): {}", binary, e)),
    }
}

#[tauri::command]
fn read_file_content(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| format!("读取文件失败 ({}): {}", path, e))
}

#[tauri::command]
fn write_file_content(path: String, content: String) -> Result<(), String> {
    fs::write(&path, content).map_err(|e| format!("写入文件失败 ({}): {}", path, e))
}

#[tauri::command]
fn request_github_device_code(client_id: String, scope: String) -> Result<String, String> {
    let payload = format!("client_id={}&scope={}", client_id, scope);
    let mut cmd = Command::new("curl.exe");
    cmd.args([
        "-s",
        "-X",
        "POST",
        "https://github.com/login/device/code",
        "-H",
        "Accept: application/json",
        "-d",
        &payload,
    ]);

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    match cmd.output() {
        Ok(output) => {
            let res = String::from_utf8_lossy(&output.stdout).to_string();
            Ok(res)
        }
        Err(e) => Err(format!("请求 GitHub 设备码失败: {}", e)),
    }
}

#[tauri::command]
fn poll_github_device_token(client_id: String, device_code: String) -> Result<String, String> {
    let payload = format!(
        "client_id={}&device_code={}&grant_type=urn:ietf:params:oauth:grant-type:device_code",
        client_id, device_code
    );
    let mut cmd = Command::new("curl.exe");
    cmd.args([
        "-s",
        "-X",
        "POST",
        "https://github.com/login/oauth/access_token",
        "-H",
        "Accept: application/json",
        "-d",
        &payload,
    ]);

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    match cmd.output() {
        Ok(output) => {
            let res = String::from_utf8_lossy(&output.stdout).to_string();
            Ok(res)
        }
        Err(e) => Err(format!("轮询 GitHub 令牌失败: {}", e)),
    }
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DirectoryValidationResult {
    pub exists: bool,
    pub is_directory: bool,
    pub is_git_repo: bool,
    pub name: Option<String>,
    pub full_path: Option<String>,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DirectoryEntry {
    pub name: String,
    pub path: String,
    pub has_git: bool,
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ListDirsResult {
    pub current_path: String,
    pub parent_path: Option<String>,
    pub has_git: bool,
    pub directories: Vec<DirectoryEntry>,
}

#[tauri::command]
fn validate_directory(path: String) -> Result<DirectoryValidationResult, String> {
    let p = std::path::Path::new(&path);
    if !p.exists() {
        return Ok(DirectoryValidationResult {
            exists: false,
            is_directory: false,
            is_git_repo: false,
            name: None,
            full_path: None,
        });
    }
    let is_directory = p.is_dir();
    let is_git_repo = is_directory && p.join(".git").exists();
    let name = p.file_name().map(|n| n.to_string_lossy().to_string());
    let full_path = p
        .canonicalize()
        .ok()
        .map(|cp| normalize_display_path(&cp))
        .or(Some(path));

    Ok(DirectoryValidationResult {
        exists: true,
        is_directory,
        is_git_repo,
        name,
        full_path,
    })
}

#[tauri::command]
fn list_directories(path: Option<String>) -> Result<ListDirsResult, String> {
    let target = match path {
        Some(ref p) if !p.trim().is_empty() => std::path::PathBuf::from(p),
        _ => std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from(".")),
    };

    let canonical = target.canonicalize().unwrap_or(target.clone());
    let has_git = canonical.join(".git").exists();
    let parent_path = canonical.parent().map(normalize_display_path);

    let mut directories = Vec::new();
    if let Ok(entries) = fs::read_dir(&canonical) {
        for entry in entries.flatten() {
            if let Ok(ft) = entry.file_type() {
                if ft.is_dir() {
                    let entry_path = entry.path();
                    let name = entry_path
                        .file_name()
                        .map(|n| n.to_string_lossy().to_string())
                        .unwrap_or_default();
                    if !name.starts_with('.') {
                        let has_git = entry_path.join(".git").exists();
                        directories.push(DirectoryEntry {
                            name,
                            path: normalize_display_path(&entry_path),
                            has_git,
                        });
                    }
                }
            }
        }
    }
    directories.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));

    Ok(ListDirsResult {
        current_path: canonical.to_string_lossy().to_string(),
        parent_path,
        has_git,
        directories,
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        // ===== GitHub Token 系统凭据管理器（Windows Credential Manager） =====
// 优先走 keyring；无对应条目时返回 Ok(None)，不视为错误
fn github_token_entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new("auugit", "github_token").map_err(|e| e.to_string())
}

#[tauri::command]
fn store_github_token(token: String) -> Result<(), String> {
    let entry = github_token_entry()?;
    entry.set_password(&token).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_github_token() -> Result<Option<String>, String> {
    let entry = github_token_entry()?;
    match entry.get_password() {
        Ok(token) => Ok(Some(token)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn delete_github_token() -> Result<(), String> {
    let entry = github_token_entry()?;
    match entry.delete_credential() {
        Ok(_) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

.invoke_handler(tauri::generate_handler![
            store_github_token,
            get_github_token,
            delete_github_token,
            execute_git,
            read_file_content,
            write_file_content,
            request_github_device_code,
            poll_github_device_token,
            validate_directory,
            list_directories,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
