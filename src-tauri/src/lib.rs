use serde::{Deserialize, Serialize};
use std::fs;
#[cfg(target_os = "windows")]
use std::process::Command;
use std::path::{Path, PathBuf, Component};
use std::time::Duration;
mod plugins;
mod provider_http;
#[cfg(test)]
use provider_http::validate_provider_request;
mod file_io;
mod git_process;
mod temp_index;
use git_process::{
    lock_or_recover, run_git, run_git_bytes, run_git_protocols, GitCommandResult, LOCAL_PROTOCOLS,
};
mod repository_access;
mod repository_dialog;
mod git_policy;
mod git_binary;
mod external_tools;
mod ssh_signing;
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

/// push/fetch/pull 的传输目标解析为已授权根内的本地路径时，对该次调用放行本地传输
/// （与 clone 源的授权同构，授权模型不变：只有用户批准的目录可写）。
/// 远程名先经只读 `git remote get-url --all` 解析（展开 insteadOf，push 侧优先 pushurl，
/// --all 覆盖多值 URL 的全部推送目标）；解析失败、目标越界或命令形态不确定时一律
/// 返回 None：回落默认白名单，由 git 自然报传输错误（fail closed）。
fn transport_grant(args: &[String], cwd: &str, git_binary: Option<&str>) -> Option<&'static str> {
    let index = git_policy::command_index(args).ok()?;
    let command = args[index].as_str();
    if !matches!(command, "push" | "fetch" | "pull") {
        return None;
    }
    let urls = match git_policy::transport_candidates(&args[index + 1..])? {
        git_policy::TransportCandidates::All => all_remote_urls(cwd, git_binary)?,
        git_policy::TransportCandidates::Upstream => {
            let name = upstream_remote_name(command, cwd, git_binary)?;
            remote_urls(command == "push", &name, cwd, git_binary)?
        }
        git_policy::TransportCandidates::Explicit(names) => {
            let mut urls = Vec::new();
            for name in &names {
                match remote_urls(command == "push", name, cwd, git_binary) {
                    Some(mut found) => urls.append(&mut found),
                    // 不是 remote 名：按本地路径处理（相对路径按 spawn cwd 解析）。
                    None => urls.push(name.clone()),
                }
            }
            urls
        }
    };
    let root = repository_access::resolve(Path::new(cwd)).ok()?;
    let mut granted = false;
    for url in &urls {
        // 本地路径目标必须落在授权根内；远程 URL 由默认白名单约束，无需放行。
        if let Some(path) = git_policy::local_transport_path(url) {
            let target = if Path::new(&path).is_absolute() { PathBuf::from(&path) } else { root.join(&path) };
            repository_access::require_path(target.to_string_lossy().as_ref()).ok()?;
            granted = true;
        }
    }
    granted.then_some(LOCAL_PROTOCOLS)
}

/// `git remote get-url --all [--push] <name>`：返回该 remote 的全部传输目标 URL。
fn remote_urls(push: bool, name: &str, cwd: &str, git_binary: Option<&str>) -> Option<Vec<String>> {
    let mut arguments = vec!["remote".into(), "get-url".into(), "--all".into()];
    if push { arguments.push("--push".into()); }
    arguments.push(name.into());
    let result = run_git(arguments, cwd.to_string(), git_binary.map(str::to_string), None).ok()?;
    if result.exit_code != 0 { return None; }
    let urls: Vec<String> = result.stdout.lines().map(str::trim).filter(|url| !url.is_empty()).map(String::from).collect();
    (!urls.is_empty()).then_some(urls)
}

/// fetch --all：枚举全部 remote 的 URL（任一解析失败即放弃放行）。
fn all_remote_urls(cwd: &str, git_binary: Option<&str>) -> Option<Vec<String>> {
    let listing = run_git(vec!["remote".into()], cwd.to_string(), git_binary.map(str::to_string), None).ok()?;
    if listing.exit_code != 0 { return None; }
    let mut urls = Vec::new();
    for name in listing.stdout.lines().map(str::trim).filter(|name| !name.is_empty()) {
        urls.append(&mut remote_urls(false, name, cwd, git_binary)?);
    }
    Some(urls)
}

/// 裸 push/fetch/pull 的远程：@{push} / @{u} 展开 push.default 与上游配置；
/// remote 名可能含斜杠，对 `git remote` 列表做最长前缀匹配。
fn upstream_remote_name(command: &str, cwd: &str, git_binary: Option<&str>) -> Option<String> {
    let expression = if command == "push" { "@{push}" } else { "@{u}" };
    let tracking = run_git(
        vec!["rev-parse".into(), "--abbrev-ref".into(), "--symbolic-full-name".into(), expression.into()],
        cwd.to_string(),
        git_binary.map(str::to_string),
        None,
    ).ok()?;
    if tracking.exit_code != 0 { return None; }
    let tracking = tracking.stdout.trim();
    let listing = run_git(vec!["remote".into()], cwd.to_string(), git_binary.map(str::to_string), None).ok()?;
    if listing.exit_code != 0 { return None; }
    listing.stdout.lines().map(str::trim).filter(|name| !name.is_empty())
        .filter(|name| tracking.strip_prefix(*name).is_some_and(|rest| rest.starts_with('/')))
        .max_by_key(|name| name.len())
        .map(String::from)
}

#[tauri::command]
async fn execute_git(args: Vec<String>, mut cwd: String, git_binary: Option<String>, stdin: Option<String>, index_tree: Option<String>) -> Result<GitCommandResult, String> {
    git_policy::validate(&args)?;
    if let Some(tree) = index_tree.as_deref() { temp_index::validate(&args, tree)?; }
    // None = 默认收紧的传输白名单；仅已授权的本地 clone 源或 push/fetch/pull 的已授权本地远程对该次调用放行。
    let mut protocols: Option<&'static str> = None;
    let mut transport = false;
    if args != ["--version"] && args != ["-c", "core.quotepath=false", "--version"] {
        let index = git_policy::command_index(&args)?;
        let command = args[index].as_str();
        if command == "clone" {
            let separator = args.iter().position(|value| value == "--").ok_or("Clone requires an explicit destination")?;
            if args.len() != separator + 3 { return Err("Invalid clone arguments".into()); }
            repository_access::require(&args[separator + 2])?;
            let source = &args[separator + 1];
            if git_policy::is_local_clone_source(source) {
                // 本地路径源本身就是一次跨仓库读取：只允许已授权目录作为源。
                // file:// URL 先解析出文件系统路径（与 push/fetch/pull 的传输目标同构）；
                // 无法解析的形态已在 validate 纯层拒绝，此处兜底维持同样错误。
                let path = git_policy::local_transport_path(source).ok_or("Unsupported clone protocol: file")?;
                repository_access::require_path(&path)?;
                protocols = Some(LOCAL_PROTOCOLS);
            }
            cwd = std::env::current_dir().map_err(|error| error.to_string())?.to_string_lossy().into_owned();
        } else {
            let root = repository_access::require(&cwd)?;
            if command == "init" {
                // git init [<directory>] 会直接在目标位置创建 .git，与 clone 目标同样需要授权。
                if let Some(target) = git_policy::init_target(&args, index) {
                    let target_path = if Path::new(&target).is_absolute() { PathBuf::from(&target) } else { root.join(&target) };
                    repository_access::require(target_path.to_string_lossy().as_ref())?;
                }
            }
            if command == "diff" {
                // --no-index 绕过索引直接读盘：操作数必须是空设备或授权根内的路径。
                for operand in git_policy::no_index_operands(&args, index)? {
                    if git_policy::is_null_device(&operand) { continue; }
                    repository_access::require_path(root.join(&operand).to_string_lossy().as_ref())?;
                }
            }
            if command == "worktree" {
                match args.get(index + 1).map(String::as_str) {
                    Some("add") => {
                        let separator = args.iter().position(|value| value == "--").ok_or("Worktree requires an explicit destination")?;
                        repository_access::require(args.get(separator + 1).ok_or("Missing worktree destination")?)?;
                    }
                    // move 会把一个工作树（含 .git 指针）落盘到新位置，目标同样不得逃出授权边界。
                    Some("move") => {
                        for target in git_policy::worktree_move_targets(&args, index) {
                            repository_access::require_path(root.join(&target).to_string_lossy().as_ref())?;
                        }
                    }
                    _ => {}
                }
            }
            if command == "submodule" {
                // submodule add 的本地路径 <repository> 与 clone 源同构：跨仓库读取需先
                // 授权，且仅对该次调用放行本地传输；相对源按 spawn cwd（当前仓库根）解析。
                // 子模块目标路径本身落在父仓库工作区内，无需额外授权。update 走 .gitmodules
                // 里登记的 URL：https 等远程由默认白名单放行，本地 file:// 形态 v1 不放行
                // （fail closed，由 git 自然报传输错误）。
                if let Some(source) = git_policy::submodule_add_source(&args, index) {
                    if git_policy::is_local_clone_source(&source) {
                        let path = git_policy::local_transport_path(&source)
                            .ok_or("Unsupported clone protocol: file")?;
                        let target = if Path::new(&path).is_absolute() { PathBuf::from(&path) } else { root.join(&path) };
                        repository_access::require_path(target.to_string_lossy().as_ref())?;
                        protocols = Some(LOCAL_PROTOCOLS);
                    }
                }
            }
            if matches!(command, "push" | "fetch" | "pull") {
                // 远程目标与 clone 源同构：实际放行在 spawn_blocking 内解析——需跑只读
                // git remote get-url / rev-parse @{u}，不能阻塞异步运行时线程。
                transport = true;
            }
        }
    }
    tauri::async_runtime::spawn_blocking(move || {
        if let Some(tree) = index_tree { return temp_index::run(args, cwd, git_binary, stdin, &tree); }
        if transport {
            // 只读解析与传输命令顺序执行，各自短暂占用并发闸后即释放，不形成循环等待。
            protocols = protocols.or_else(|| transport_grant(&args, &cwd, git_binary.as_deref()));
        }
        run_git_protocols(args, cwd, git_binary, stdin, protocols)
    }).await.map_err(|e| e.to_string())?
}

/// 仓库内相对路径解析 + 授权：拒 `..`/绝对路径/`.git` 组件，最终路径必须落在
/// 授权仓库内。external_tools 的 launch 与本文件的读写命令共用同一套边界。
pub(crate) fn repo_file(repo_path: String, file_path: String) -> Result<PathBuf, String> {
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
    let _guard = lock_or_recover(&FILE_WRITES);
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
    let _guard = lock_or_recover(&FILE_WRITES);
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
    // 静态复用连接池：OAuth 轮询（设备码流程每 5s poll）与 AI 请求各自冷启动
    // TLS 握手纯属浪费；Client 克隆是 Arc 共享，按请求超时仍可由 RequestBuilder 覆盖。
    static CLIENT: std::sync::OnceLock<Result<reqwest::Client, String>> = std::sync::OnceLock::new();
    CLIENT
        .get_or_init(|| {
            reqwest::Client::builder().timeout(Duration::from_secs(20)).connect_timeout(Duration::from_secs(10))
                .redirect(reqwest::redirect::Policy::none()).user_agent("AuuGit").build().map_err(|e| e.to_string())
        })
        .clone()
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

fn header_value(value: &str) -> Result<reqwest::header::HeaderValue, String> {
    // 前端提供的头部值可能含非法字符：显式校验而不是让 reqwest 的 header() 直接 panic。
    reqwest::header::HeaderValue::from_bytes(value.as_bytes())
        .map_err(|_| "Invalid AI request header".into())
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
    if !authorization.is_empty() {
        let value = header_value(&authorization)?;
        request = request.header(reqwest::header::AUTHORIZATION, value);
    }
    for (name, value) in extra_headers.unwrap_or_default() {
        match name.as_str() {
            "x-api-key" | "anthropic-version" | "x-opencode-session" => {
                let Ok(name) = reqwest::header::HeaderName::from_bytes(name.as_bytes()) else {
                    return Err("Unsupported AI request header".into());
                };
                let value = header_value(&value)?;
                request = request.header(name, value);
            }
            _ => return Err("Unsupported AI request header".into()),
        }
    }
    let response = request.send().await.map_err(|e| e.to_string())?;
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

/// 集成凭证（错误追踪等外部平台，PRD docs/errors-integration-prd.md §6.2）：
/// 条目 "integration_token:<connectionId>"。connectionId 限定受限字符集
/// （字母数字/-/_，8–64 位），白名单外一律拒绝（fail closed），防止拼接出任意 keyring 条目。
fn integration_entry(connection_id: &str) -> Result<keyring::Entry, String> {
    let id = connection_id.trim();
    let valid = (8..=64).contains(&id.len())
        && id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_');
    if !valid {
        return Err("Invalid integration connection id".into());
    }
    keyring::Entry::new("auugit", &format!("integration_token:{}", id)).map_err(|e| e.to_string())
}

#[tauri::command(async)]
fn store_integration_token(token: String, connection_id: String) -> Result<(), String> {
    let entry = integration_entry(&connection_id)?;
    entry.set_password(&token).map_err(|e| e.to_string())
}

#[tauri::command(async)]
fn get_integration_token(connection_id: String) -> Result<Option<String>, String> {
    let entry = integration_entry(&connection_id)?;
    match entry.get_password() {
        Ok(token) => Ok(Some(token)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command(async)]
fn delete_integration_token(connection_id: String) -> Result<(), String> {
    let entry = integration_entry(&connection_id)?;
    match entry.delete_credential() {
        Ok(_) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

/// 用系统默认程序打开外部链接（浏览器）：http(s) 白名单 + 拒绝空白/控制字符，
/// fail closed。走 opener 插件（shell 插件的 Rust open API 已弃用）；
/// 不经过 shell 插件 open 的 IPC 校验器——那是 github.com 专用白名单，
/// 会拒绝其他集成平台的链接。
fn validate_external_url(url: &str) -> Result<(), String> {
    if !(url.starts_with("https://") || url.starts_with("http://")) {
        return Err("Only http(s) URLs are allowed".into());
    }
    if url.chars().any(|c| c.is_whitespace() || c.is_control()) {
        return Err("URL must not contain whitespace or control characters".into());
    }
    Ok(())
}

#[tauri::command(async)]
fn open_external_url(app: tauri::AppHandle, url: String) -> Result<(), String> {
    validate_external_url(&url)?;
    use tauri_plugin_opener::OpenerExt;
    app.opener().open_url(url, None::<&str>).map_err(|e| e.to_string())
}

/// 本地路径白名单：仅绝对路径（Windows 原生盘符/UNC 或 POSIX `/` 根）、拒绝控制字符
/// （空白合法——目录名可含空格）。前端 shell 插件 open 会撞 github.com 专用 IPC
/// 校验器，本地文件打开必须走本命令。
fn validate_local_path(path: &str) -> Result<(), String> {
    if path.is_empty() {
        return Err("Path must not be empty".into());
    }
    // Windows 的 is_absolute 不认 `/` 根路径；测试与跨平台路径形态都按 POSIX 根放行。
    if !std::path::Path::new(path).is_absolute() && !path.starts_with('/') {
        return Err("Only absolute paths are allowed".into());
    }
    if path.chars().any(|c| c.is_control()) {
        return Err("Path must not contain control characters".into());
    }
    Ok(())
}

#[tauri::command(async)]
fn open_local_path(app: tauri::AppHandle, path: String) -> Result<(), String> {
    validate_local_path(&path)?;
    use tauri_plugin_opener::OpenerExt;
    app.opener().open_path(path, None::<&str>).map_err(|e| e.to_string())
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

// ---------------------------------------------------------------------------
// 崩溃上报（严格 opt-in）：DSN 经编译期 AUUGIT_SENTRY_DSN 注入，未注入时客户端
// 完全不创建。开关存于前端设置（默认关），通过 set_crash_reporting 翻译成进程内
// 原子量；before_send 在开关关闭时丢弃事件、开启时清洗本地路径后再上报。
// ---------------------------------------------------------------------------
static CRASH_REPORTS_ENABLED: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

#[tauri::command]
fn set_crash_reporting(enabled: bool) {
    CRASH_REPORTS_ENABLED.store(enabled, std::sync::atomic::Ordering::Relaxed);
}

fn user_home_dirs() -> Vec<String> {
    let mut homes = Vec::new();
    for key in ["USERPROFILE", "HOME"] {
        if let Ok(home) = std::env::var(key) { if !home.trim().is_empty() { homes.push(home); } }
    }
    homes
}

fn scrub_json_value(value: &mut serde_json::Value, homes: &[String]) -> bool {
    use serde_json::Value;
    let mut changed = false;
    match value {
        Value::String(text) => {
            let mut next = text.clone();
            for home in homes {
                if next.contains(home.as_str()) { next = next.replace(home.as_str(), "~"); changed = true; }
            }
            if changed { *text = next; }
        }
        Value::Array(items) => for item in items { changed |= scrub_json_value(item, homes); },
        Value::Object(map) => for (_, item) in map.iter_mut() { changed |= scrub_json_value(item, homes); },
        _ => {}
    }
    changed
}

/// 上报前的最后一道闸：开关关闭丢弃；开启则把事件里出现的用户主目录替换为 `~`。
pub(crate) fn prepare_crash_event(enabled: bool, mut event: sentry::protocol::Event<'static>) -> Option<sentry::protocol::Event<'static>> {
    if !enabled { return None; }
    let homes = user_home_dirs();
    if !homes.is_empty() {
        if let Ok(mut value) = serde_json::to_value(&event) {
            scrub_json_value(&mut value, &homes);
            if let Ok(clean) = serde_json::from_value::<sentry::protocol::Event<'static>>(value) { event = clean; }
        }
    }
    Some(event)
}

fn init_crash_reporting() {
    let Some(dsn) = option_env!("AUUGIT_SENTRY_DSN").map(str::trim).filter(|dsn| !dsn.is_empty()) else { return };
    // ClientOptions 是 #[non_exhaustive]（0.49 起不能用结构体字面量 + ..Default 组合），走 default 后赋值。
    let mut options = sentry::ClientOptions::default();
    options.release = Some(std::borrow::Cow::Owned(format!("auugit@{}", env!("CARGO_PKG_VERSION"))));
    options.before_send = Some(std::sync::Arc::new(|event| {
        prepare_crash_event(CRASH_REPORTS_ENABLED.load(std::sync::atomic::Ordering::Relaxed), event)
    }));
    let guard = sentry::init((dsn, options));
    // 进程级常驻客户端：guard 释放会阻断退出并终止上报，这里有意让其存活到进程结束。
    std::mem::forget(guard);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    init_crash_reporting();
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
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
            set_crash_reporting,
            #[cfg(feature = "plugin-github")]
            plugins::github::store_github_token,
            #[cfg(feature = "plugin-github")]
            plugins::github::get_github_token,
            #[cfg(feature = "plugin-github")]
            plugins::github::delete_github_token,
            plugins::legacy_credentials::store_forge_token,
            plugins::legacy_credentials::get_forge_token,
            plugins::legacy_credentials::delete_forge_token,
            store_integration_token,
            get_integration_token,
            delete_integration_token,
            provider_http::provider_http_request,
            provider_http::cancel_provider_http_request,
            open_external_url,
            open_local_path,
            execute_git,
            open_terminal,
            repository_access::authorize_repository,
            repository_access::pick_repository_folder,
            repository_access::list_repository_permissions,
            repository_access::revoke_repository_permission,
            git_binary::authorize_git_binary,
            external_tools::get_external_tools,
            external_tools::set_external_tool,
            external_tools::remove_external_tool,
            external_tools::launch_external_tool,
            ssh_signing::detect_ssh_keygen,
            ssh_signing::list_ssh_public_keys,
            ssh_signing::generate_ssh_signing_key,
            paths_exist,
            request_ai_completion,
            #[cfg(feature = "plugin-github")]
            plugins::github::get_github_job_logs,
            store_ai_key,
            get_ai_key,
            read_file_content,
            read_git_image,
            write_file_content,
            ignore_file,
            #[cfg(feature = "plugin-github")]
            plugins::github::request_github_device_code,
            #[cfg(feature = "plugin-github")]
            plugins::github::poll_github_device_token,
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn crash_events_are_dropped_while_disabled_and_scrubbed_when_enabled() {
        let home = std::env::var("USERPROFILE").or_else(|_| std::env::var("HOME")).unwrap_or_else(|_| r"C:\Users\fixture".to_string());
        let frame = sentry::protocol::Stacktrace {
            frames: vec![sentry::protocol::Frame {
                abs_path: Some(format!("{home}\\src\\lib.rs")),
                ..Default::default()
            }],
            ..Default::default()
        };
        let exception = sentry::protocol::Exception {
            ty: "panic".into(),
            value: Some("boom".into()),
            stacktrace: Some(frame),
            ..Default::default()
        };
        let event = sentry::protocol::Event {
            exception: vec![exception].into(),
            ..Default::default()
        };
        assert!(prepare_crash_event(false, event.clone()).is_none(), "开关关闭时必须丢弃事件");
        let shipped = prepare_crash_event(true, event).expect("开关开启时应放行");
        let serialized = serde_json::to_string(&shipped).unwrap();
        assert!(!serialized.contains(&home), "上报内容不得包含用户主目录原文");
        assert!(serialized.contains("~"), "主目录应被替换为 ~");
        assert!(serialized.contains("lib.rs"), "调用栈文件名保留以便定位");
    }

    #[test]
    fn generated_updater_platforms_match_the_native_updater_contract() {
        // Shared with the JS manifest generator tests. macOS targets must use
        // `darwin`, which is the name the installed updater actually requests.
        let release: tauri_plugin_updater::RemoteRelease = serde_json::from_str(include_str!(
            "../../tests/fixtures/updater-latest.json"
        ))
        .unwrap();
        for platform in ["windows-x86_64", "darwin-aarch64", "darwin-x86_64", "linux-x86_64"] {
            assert!(release.download_url(platform).is_ok(), "missing {platform}");
            assert!(release.signature(platform).is_ok(), "missing signature for {platform}");
        }
    }
    #[test]
    fn rejects_unsafe_ai_header_values_instead_of_panicking() {
        assert!(header_value("Bearer token").is_ok());
        assert!(header_value("sk-abc123_xyz").is_ok());
        // CRLF 注入与控制字符必须返回错误，而不是让 reqwest panic。
        assert!(header_value("Bearer\r\ninjected: 1").is_err());
        assert!(header_value("Bearer\ninjected: 1").is_err());
        assert!(header_value("\n").is_err());
        assert!(header_value("\u{1}").is_err());
        assert!(header_value("\u{7f}").is_err());
    }

    #[test]
    fn integration_token_entries_validate_connection_ids_fail_closed() {
        // uuid 风格 id 与受限字符集 id 放行。
        assert!(integration_entry("0f2a4c8e-6b1d-4f3a-9c8e-7b2d1a0f9e8c").is_ok());
        assert!(integration_entry("conn-ab12cd34").is_ok());
        // 注入形态与异常输入一律拒绝：冒号会切出相邻 keyring 条目、路径分隔符、
        // 空白、非 ASCII、超长；首尾空白被 trim 后按剩余长度判定。
        for bad in ["", "   ", "a:b", "../escape", "a/b", "a\\b", "连接id", "a b", "x".repeat(65).as_str()] {
            assert!(integration_entry(bad).is_err(), "{bad}");
        }
    }

    #[test]
    fn provider_http_requests_are_restricted_to_http_s_with_safe_headers() {
        use std::collections::HashMap;
        assert!(validate_provider_request("GET", "https://sentry.io/api/0/organizations/", &HashMap::new()).is_ok());
        assert!(validate_provider_request("PUT", "http://self-hosted.local/api/0/issues/1/", &HashMap::new()).is_ok());
        // 请求目标白名单外（非 http(s)）拒绝。
        for bad_url in ["ftp://x", "file:///etc/passwd", "javascript:alert(1)", "sentry.io", ""] {
            assert!(validate_provider_request("GET", bad_url, &HashMap::new()).is_err(), "{bad_url}");
        }
        let mut headers = HashMap::new();
        headers.insert("Authorization".to_string(), "Bearer token".to_string());
        assert!(validate_provider_request("GET", "https://x.io/", &headers).is_ok());
        // 头值 CRLF 注入与控制字符 fail closed。
        headers.insert("X-Evil".to_string(), "value\r\nInjected: 1".to_string());
        assert!(validate_provider_request("GET", "https://x.io/", &headers).is_err());
        headers.insert("X-Evil".to_string(), "bad\u{1}value".to_string());
        assert!(validate_provider_request("GET", "https://x.io/", &headers).is_err());
    }

    #[test]
    fn external_urls_are_restricted_to_http_s_without_whitespace_or_controls() {
        assert!(validate_external_url("https://auu-tz.sentry.io/issues/782178159/").is_ok());
        assert!(validate_external_url("http://localhost:5173/").is_ok());
        for bad in ["ftp://x", "file:///C:/x", "javascript:alert(1)", "sentry.io", "", "https://x.io/a b", "https://x.io/\n"] {
            assert!(validate_external_url(bad).is_err(), "{bad}");
        }
    }

    #[test]
    fn local_paths_must_be_absolute_without_controls() {
        // 平台相关：Windows 盘符路径只在 Windows 上算绝对（POSIX 的 is_absolute 不认），
        // `/` 根路径两边都放行；含空格的目录合法（与 URL 不同）。
        if cfg!(windows) {
            assert!(validate_local_path("E:\\code\\auu github\\src\\lib.rs").is_ok());
        } else {
            assert!(validate_local_path("/home/user/my file.rs").is_ok());
        }
        for bad in ["", "src/lib.rs", "./src/lib.rs", "E:\\code\\a\u{1}b", "/tmp/\n"] {
            assert!(validate_local_path(bad).is_err(), "{bad}");
        }
    }
}
