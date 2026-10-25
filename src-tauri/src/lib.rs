use serde::{Deserialize, Serialize};
use std::fs;
#[cfg(target_os = "windows")]
use std::process::Command;
use std::path::{Path, PathBuf, Component};
use std::time::Duration;
mod file_io;
mod git_process;
use git_process::{run_git, run_git_bytes, run_git_protocols, GitCommandResult, LOCAL_PROTOCOLS};
mod repository_access;
mod repository_dialog;
mod git_policy;
mod git_binary;
mod external_tools;
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
async fn execute_git(args: Vec<String>, mut cwd: String, git_binary: Option<String>, stdin: Option<String>) -> Result<GitCommandResult, String> {
    git_policy::validate(&args)?;
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
            if matches!(command, "push" | "fetch" | "pull") {
                // 远程目标与 clone 源同构：实际放行在 spawn_blocking 内解析——需跑只读
                // git remote get-url / rev-parse @{u}，不能阻塞异步运行时线程。
                transport = true;
            }
        }
    }
    tauri::async_runtime::spawn_blocking(move || {
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
// 优先走 keyring；无对应条目时返回 Ok(None)，不视为错误。
// 多账号 Profile：默认账号（profileId 为 None / "default" / 空串）沿用旧条目 "github_token"，
// 保证老用户无缝迁移不做凭据拷贝；其余 Profile 使用 "github_token:<profileId>" 按账号隔离。
fn github_token_entry_name(profile_id: Option<&str>) -> String {
    match profile_id {
        Some(id) if !id.is_empty() && id != "default" => format!("github_token:{}", id),
        _ => "github_token".to_string(),
    }
}

fn github_token_entry(profile_id: Option<&str>) -> Result<keyring::Entry, String> {
    keyring::Entry::new("auugit", &github_token_entry_name(profile_id)).map_err(|e| e.to_string())
}

#[tauri::command(async)]
fn store_github_token(token: String, profile_id: Option<String>) -> Result<(), String> {
    let entry = github_token_entry(profile_id.as_deref())?;
    entry.set_password(&token).map_err(|e| e.to_string())
}

#[tauri::command(async)]
fn get_github_token(profile_id: Option<String>) -> Result<Option<String>, String> {
    let entry = github_token_entry(profile_id.as_deref())?;
    match entry.get_password() {
        Ok(token) => Ok(Some(token)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command(async)]
fn delete_github_token(profile_id: Option<String>) -> Result<(), String> {
    let entry = github_token_entry(profile_id.as_deref())?;
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
            external_tools::get_external_tools,
            external_tools::set_external_tool,
            external_tools::remove_external_tool,
            external_tools::launch_external_tool,
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

#[cfg(test)]
mod tests {
    use super::*;
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
    fn github_token_entry_names_isolate_profiles_and_keep_legacy_default() {
        // 旧用户迁移：无 profileId / "default" / 空串都必须落在原有条目上
        assert_eq!(github_token_entry_name(None), "github_token");
        assert_eq!(github_token_entry_name(Some("default")), "github_token");
        assert_eq!(github_token_entry_name(Some("")), "github_token");
        // 其余 Profile 按账号隔离
        assert_eq!(
            github_token_entry_name(Some("0f2a4c8e6b1d4f3a9c8e7b2d1a0f9e8c")),
            "github_token:0f2a4c8e6b1d4f3a9c8e7b2d1a0f9e8c"
        );
    }
}
