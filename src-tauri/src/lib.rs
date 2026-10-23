use serde::{Deserialize, Serialize};
use std::fs;
#[cfg(target_os = "windows")]
use std::process::Command;
use std::path::{Path, PathBuf, Component};
use std::time::Duration;
mod file_io;
mod git_process;
use git_process::{run_git, run_git_bytes, GitCommandResult};
mod repository_access;
mod git_policy;
mod git_binary;
use file_io::{atomic_write, read_bytes, read_text, FILE_WRITES, MAX_FILE_BYTES};

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

#[tauri::command]
async fn execute_git(args: Vec<String>, mut cwd: String, git_binary: Option<String>, stdin: Option<String>) -> Result<GitCommandResult, String> {
    git_policy::validate(&args)?;
    if args != ["--version"] && args != ["-c", "core.quotepath=false", "--version"] {
        let command = git_policy::command(&args)?;
        if command == "clone" {
            let separator = args.iter().position(|value| value == "--").ok_or("Clone requires an explicit destination")?;
            if args.len() != separator + 3 { return Err("Invalid clone arguments".into()); }
            repository_access::require(&args[separator + 2])?;
            cwd = std::env::current_dir().map_err(|error| error.to_string())?.to_string_lossy().into_owned();
        } else { repository_access::require(&cwd)?; }
        if command == "worktree" && args.iter().position(|value| value == command)
            .and_then(|index| args.get(index + 1)).is_some_and(|value| value == "add") {
            let separator = args.iter().position(|value| value == "--").ok_or("Worktree requires an explicit destination")?;
            repository_access::require(args.get(separator + 1).ok_or("Missing worktree destination")?)?;
        }
    }
    tauri::async_runtime::spawn_blocking(move || run_git(args, cwd, git_binary, stdin)).await.map_err(|e| e.to_string())?
}

fn repo_file(repo_path: String, file_path: String) -> Result<PathBuf, String> {
    let relative = Path::new(&file_path);
    if file_path.is_empty() || relative.components().any(|part| match part {
        Component::ParentDir | Component::RootDir | Component::Prefix(_) => true,
        Component::Normal(name) => name.to_string_lossy().eq_ignore_ascii_case(".git"),
        _ => false,
    }) { return Err("Invalid repository file path".into()); }
    let root = repository_access::require(&repo_path)?;
    let candidate = root.join(relative);
    let mut ancestor = candidate.as_path();
    while !ancestor.exists() { ancestor = ancestor.parent().ok_or("Missing parent directory")?; }
    let suffix = candidate.strip_prefix(ancestor).map_err(|e| e.to_string())?;
    let canonical = fs::canonicalize(ancestor).map_err(|e| e.to_string())?;
    let resolved = if suffix.as_os_str().is_empty() { canonical } else { canonical.join(suffix) };
    if !resolved.starts_with(&root) { return Err("Path outside repository".into()); }
    if resolved.strip_prefix(&root).map_err(|e| e.to_string())?.components()
        .any(|part| matches!(part, Component::Normal(name) if name.to_string_lossy().eq_ignore_ascii_case(".git"))) {
        return Err("Invalid repository file path".into());
    }
    Ok(resolved)
}

#[tauri::command(async)]
fn read_file_content(repo_path: String, file_path: String, allow_missing: Option<bool>) -> Result<String, String> {
    match read_text(&repo_file(repo_path, file_path)?) {
        Ok(content) => Ok(content),
        Err(error) if allow_missing == Some(true) && error.kind() == std::io::ErrorKind::NotFound => Ok(String::new()),
        Err(error) => Err(error.to_string()),
    }
}

#[tauri::command(async)]
fn read_git_image(repo_path: String, file_path: String, revision: String, git_binary: Option<String>) -> Result<Option<String>, String> {
    use base64::Engine;
    let path = repo_file(repo_path.clone(), file_path.clone())?;
    let bytes = if revision == "WORKTREE" {
        match fs::metadata(&path) {
            Ok(info) if info.len() > 8 * 1024 * 1024 => return Err("Image exceeds 8 MiB".into()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
            Err(error) => return Err(error.to_string()),
            _ => (),
        }
        read_bytes(&path, MAX_FILE_BYTES).map_err(|e| e.to_string())?
    } else {
        if revision != "INDEX" && !(matches!(revision.len(), 40 | 64) && revision.bytes().all(|b| b.is_ascii_hexdigit())) { return Err("Invalid image revision".into()); }
        let binary = git_binary.unwrap_or_else(|| "git".into());
        let name = Path::new(&binary).file_name().and_then(|s| s.to_str()).unwrap_or("").to_lowercase();
        if name != "git" && name != "git.exe" { return Err("Invalid Git executable".into()); }
        let spec = format!("{}:{}", if revision == "INDEX" { "" } else { &revision }, file_path.replace('\\', "/"));
        let size = run_git_bytes(vec!["cat-file".into(), "-s".into(), spec.clone()], repo_path.clone(), Some(binary.clone()), None, Duration::from_secs(15))?;
        if size.exit_code != 0 { return Ok(None); }
        if String::from_utf8_lossy(&size.stdout).trim().parse::<u64>().map_err(|e| e.to_string())? > 8 * 1024 * 1024 { return Err("Image exceeds 8 MiB".into()); }
        let result = run_git_bytes(vec!["cat-file".into(), "blob".into(), spec], repo_path, Some(binary), None, Duration::from_secs(15))?;
        if result.exit_code != 0 { return Err(String::from_utf8_lossy(&result.stderr).into_owned()); }
        result.stdout
    };
    if bytes.len() > 8 * 1024 * 1024 { return Err("Image exceeds 8 MiB".into()); }
    let mime = if bytes.starts_with(&[137,80,78,71,13,10,26,10]) { "image/png" }
        else if bytes.starts_with(&[255,216]) { "image/jpeg" }
        else if bytes.starts_with(b"GIF") { "image/gif" }
        else if bytes.starts_with(b"RIFF") && bytes.get(8..12) == Some(b"WEBP") { "image/webp" }
        else if bytes.starts_with(b"BM") { "image/bmp" } else { return Err("Unsupported raster image".into()); };
    Ok(Some(format!("data:{};base64,{}", mime, base64::engine::general_purpose::STANDARD.encode(bytes))))
}

// Only these two Git-owned destinations are exposed, including linked worktree excludes.
#[tauri::command(async)]
fn ignore_file(repo_path: String, scope: String, git_binary: Option<String>, content: Option<String>, expected_content: Option<String>, remove: Option<bool>) -> Result<serde_json::Value, String> {
    repository_access::require(&repo_path)?;
    let _guard = FILE_WRITES.lock().map_err(|e| e.to_string())?;
    let path = match scope.as_str() {
        "shared" => repo_file(repo_path.clone(), ".gitignore".into())?,
        "local" => {
            let result = run_git(vec!["rev-parse".into(), "--path-format=absolute".into(), "--git-path".into(), "info/exclude".into()], repo_path, git_binary, None)?;
            if result.exit_code != 0 { return Err(result.stderr); }
            PathBuf::from(result.stdout.trim_end_matches(['\r', '\n']))
        }
        _ => return Err("Invalid ignore scope".into()),
    };
    let exists = path.exists();
    let actual = match read_text(&path) {
        Ok(value) => value,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => String::new(),
        Err(error) => return Err(error.to_string()),
    };
    if remove == Some(true) {
        if expected_content.as_ref() != Some(&actual) { return Err("Ignore rules changed on disk; reload before saving".into()); }
        if exists { fs::remove_file(path).map_err(|e| e.to_string())?; }
        Ok(serde_json::json!({ "content": "", "exists": false }))
    } else if let Some(content) = content {
        if expected_content.as_ref() != Some(&actual) { return Err("Ignore rules changed on disk; reload before saving".into()); }
        if let Some(parent) = path.parent() { fs::create_dir_all(parent).map_err(|e| e.to_string())?; }
        atomic_write(&path, &content, expected_content.as_deref())?;
        Ok(serde_json::json!({ "content": content, "exists": true }))
    } else { Ok(serde_json::json!({ "content": actual, "exists": exists })) }
}

#[tauri::command(async)]
fn write_file_content(repo_path: String, file_path: String, content: String, expected_content: Option<String>) -> Result<(), String> {
    let _guard = FILE_WRITES.lock().map_err(|e| e.to_string())?;
    let path = repo_file(repo_path, file_path)?;
    atomic_write(&path, &content, expected_content.as_deref())
}

#[tauri::command(async)]
fn open_terminal(repo_path: String) -> Result<(), String> {
    let directory = repository_access::require(&repo_path)?;
    if !directory.is_dir() { return Err("Repository directory is unavailable".into()); }
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        let powershell = PathBuf::from(std::env::var_os("SystemRoot").ok_or("Missing Windows directory")?)
            .join("System32/WindowsPowerShell/v1.0/powershell.exe");
        Command::new(powershell).args(["-NoLogo", "-NoProfile", "-NoExit"])
            .current_dir(normalize_display_path(&directory)).creation_flags(0x00000010)
            .spawn().map_err(|error| format!("Unable to open terminal: {error}"))?;
        Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    { let _ = directory; Err("Opening an external terminal is currently supported on Windows only".into()) }
}

#[tauri::command(async)]
fn paths_exist(repo_path: String, git_binary: Option<String>) -> Result<Vec<bool>, String> {
    repository_access::require(&repo_path)?;
    let mut args = vec!["rev-parse".into(), "--path-format=absolute".into()];
    for name in ["rebase-merge", "rebase-apply", "CHERRY_PICK_HEAD", "MERGE_HEAD"] {
        args.extend(["--git-path".into(), name.into()]);
    }
    let result = run_git(args, repo_path, git_binary, None)?;
    let paths: Vec<_> = result.stdout.lines().collect();
    if result.exit_code != 0 || paths.len() != 4 || paths.iter().any(|path| !Path::new(path).is_absolute()) {
        return Err("Unable to resolve repository operation paths".into());
    }
    Ok(paths.iter().map(|path| Path::new(path).exists()).collect())
}

fn http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder().timeout(Duration::from_secs(20)).connect_timeout(Duration::from_secs(10))
        .redirect(reqwest::redirect::Policy::none()).user_agent("AuuGit").build().map_err(|e| e.to_string())
}
async fn response_text(mut response: reqwest::Response) -> Result<String, String> {
    let status = response.status();
    if response.content_length().unwrap_or(0) > 32 * 1024 * 1024 { return Err("Response too large".into()); }
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|e| e.to_string())? {
        if bytes.len() + chunk.len() > 32 * 1024 * 1024 { return Err("Response too large".into()); }
        bytes.extend_from_slice(&chunk);
    }
    let text = String::from_utf8(bytes).map_err(|e| e.to_string())?;
    if !status.is_success() { return Err(format!("HTTP {}: {}", status, text)); }
    Ok(text)
}

#[tauri::command]
async fn request_github_device_code(client_id: String, scope: String) -> Result<String, String> {
    let response = http_client()?.post("https://github.com/login/device/code").header("Accept", "application/json")
        .form(&[("client_id", client_id), ("scope", scope)]).send().await.map_err(|e| e.to_string())?;
    response_text(response).await
}

#[tauri::command]
async fn poll_github_device_token(client_id: String, device_code: String) -> Result<String, String> {
    let response = http_client()?.post("https://github.com/login/oauth/access_token").header("Accept", "application/json")
        .form(&[("client_id", client_id), ("device_code", device_code), ("grant_type", "urn:ietf:params:oauth:grant-type:device_code".into())])
        .send().await.map_err(|e| e.to_string())?;
    response_text(response).await
}

#[tauri::command]
async fn request_ai_completion(url: String, authorization: String, body: String, extra_headers: Option<std::collections::HashMap<String, String>>) -> Result<String, String> {
    let parsed = reqwest::Url::parse(&url).map_err(|e| e.to_string())?;
    let local = matches!(parsed.host_str(), Some("localhost" | "127.0.0.1" | "[::1]" | "::1"));
    if (parsed.scheme() != "https" && !(parsed.scheme() == "http" && local)) || !parsed.username().is_empty() || parsed.password().is_some() {
        return Err("AI endpoint must use HTTPS or local HTTP".into());
    }
    let payload: serde_json::Value = serde_json::from_str(&body).map_err(|e| e.to_string())?;
    let mut request = http_client()?.post(parsed).header("User-Agent", concat!("AuuGit/", env!("CARGO_PKG_VERSION"))).timeout(Duration::from_secs(60)).json(&payload);
    if !authorization.is_empty() { request = request.header("Authorization", authorization); }
    for (name, value) in extra_headers.unwrap_or_default() {
        match name.as_str() {
            "x-api-key" | "anthropic-version" | "x-opencode-session" => { request = request.header(name, value); }
            _ => return Err("Unsupported AI request header".into()),
        }
    }
    let response = request.send().await.map_err(|e| e.to_string())?;
    response_text(response).await
}

#[tauri::command]
async fn get_github_job_logs(owner: String, repo: String, job_id: u64, token: Option<String>) -> Result<String, String> {
    if !owner.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') || !repo.chars().all(|c| c.is_ascii_alphanumeric() || "-_.".contains(c)) {
        return Err("Invalid repository name".into());
    }
    let client = http_client()?;
    let mut request = client.get(format!("https://api.github.com/repos/{}/{}/actions/jobs/{}/logs", owner, repo, job_id));
    if let Some(token) = token { request = request.bearer_auth(token); }
    let response = request.send().await.map_err(|e| e.to_string())?;
    if response.status().is_redirection() {
        let location = response.headers().get(reqwest::header::LOCATION).ok_or("Missing logs location")?.to_str().map_err(|e| e.to_string())?;
        let url = reqwest::Url::parse(location).map_err(|e| e.to_string())?;
        if url.scheme() != "https" { return Err("Invalid logs location".into()); }
        // Signed download URLs do not receive the GitHub bearer credential.
        return response_text(client.get(url).send().await.map_err(|e| e.to_string())?).await;
    }
    response_text(response).await
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

#[tauri::command(async)]
fn validate_directory(path: String) -> Result<DirectoryValidationResult, String> {
    let resolved = repository_access::require_path(&path)?;
    let p = resolved.as_path();
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

#[tauri::command(async)]
fn list_directories(path: Option<String>) -> Result<ListDirsResult, String> {
    let target = match path {
        Some(ref p) if !p.trim().is_empty() => std::path::PathBuf::from(p),
        _ => std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from(".")),
    };

    let canonical = repository_access::require_path(&target.to_string_lossy())?;
    let has_git = canonical.join(".git").exists();
    let parent_path = canonical.parent().filter(|parent| repository_access::require_path(&parent.to_string_lossy()).is_ok()).map(normalize_display_path);

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
    directories.sort_by_key(|entry| entry.name.to_lowercase());

    Ok(ListDirsResult {
        current_path: normalize_display_path(&canonical),
        parent_path,
        has_git,
        directories,
    })
}

// GitHub tokens use the platform's native credential store.
// 优先走 keyring；无对应条目时返回 Ok(None)，不视为错误
fn github_token_entry() -> Result<keyring::Entry, String> {
    keyring::Entry::new("auugit", "github_token").map_err(|e| e.to_string())
}

#[tauri::command(async)]
fn store_github_token(token: String) -> Result<(), String> {
    let entry = github_token_entry()?;
    entry.set_password(&token).map_err(|e| e.to_string())
}

#[tauri::command(async)]
fn get_github_token() -> Result<Option<String>, String> {
    let entry = github_token_entry()?;
    match entry.get_password() {
        Ok(token) => Ok(Some(token)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command(async)]
fn delete_github_token() -> Result<(), String> {
    let entry = github_token_entry()?;
    match entry.delete_credential() {
        Ok(_) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command(async)]
fn store_ai_key(key: String) -> Result<(), String> {
    let entry = keyring::Entry::new("auugit", "ai_api_key").map_err(|e| e.to_string())?;
    if key.is_empty() {
        match entry.delete_credential() { Ok(()) | Err(keyring::Error::NoEntry) => Ok(()), Err(e) => Err(e.to_string()) }
    } else { entry.set_password(&key).map_err(|e| e.to_string()) }
}
#[tauri::command(async)]
fn get_ai_key() -> Result<Option<String>, String> {
    let entry = keyring::Entry::new("auugit", "ai_api_key").map_err(|e| e.to_string())?;
    match entry.get_password() { Ok(key) => Ok(Some(key)), Err(keyring::Error::NoEntry) => Ok(None), Err(e) => Err(e.to_string()) }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build());
    #[cfg(desktop)]
    let builder = builder.plugin(
        tauri_plugin_window_state::Builder::default()
            .with_state_flags(
                tauri_plugin_window_state::StateFlags::POSITION
                    | tauri_plugin_window_state::StateFlags::SIZE
                    | tauri_plugin_window_state::StateFlags::MAXIMIZED
                    | tauri_plugin_window_state::StateFlags::VISIBLE,
            )
            .build(),
    );
    builder
        .invoke_handler(tauri::generate_handler![
            store_github_token,
            get_github_token,
            delete_github_token,
            execute_git,
            open_terminal,
            repository_access::authorize_repository,
            repository_access::pick_repository_folder,
            repository_access::list_repository_permissions,
            repository_access::revoke_repository_permission,
            git_binary::authorize_git_binary,
            paths_exist,
            request_ai_completion,
            get_github_job_logs,
            store_ai_key,
            get_ai_key,
            read_file_content,
            read_git_image,
            write_file_content,
            ignore_file,
            request_github_device_code,
            poll_github_device_token,
            validate_directory,
            list_directories,
            restart_application,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[tauri::command]
fn restart_application(app: tauri::AppHandle) {
    app.restart();
}
