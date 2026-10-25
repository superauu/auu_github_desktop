//! 外部 diff/merge 工具集成（F4）。
//!
//! 安全模型（与 git_binary.rs / repository_access.rs 的"前端不可信"约定一致）：
//! 1. 工具配置只存后端拥有的文件（app 数据目录 external-tools.json，仿照
//!    git-executables.json / repository-access.json 的读写约定），前端仅经 IPC
//!    拿到镜像，localStorage 不持有任何可执行配置。
//! 2. launch IPC 只收 toolId + mode + repoPath + filePath：后端自查配置、自拼
//!    argv，绝不把程序路径/参数暴露给前端，也绝不经 shell。std::process::Command
//!    直连 spawn，argv 元素按字面传递——因此模板禁止引号/分号/换行：不经 shell
//!    意味着这些元字符不会被解析成"引用/命令分隔"，只会按字面进入目标工具的
//!    argv，与用户带着 shell 直觉写出的期望行为不同，配置期直接拒绝以快速失败。
//! 3. 路径授权：repoPath 过 repository_access 授权根；filePath 复用 repo_file 的
//!    解析（拒 `..`、绝对路径、`.git` 组件，最终路径必须落在仓库内）。
//! 4. HEAD blob / index 三阶段副本写到 std::env::temp_dir()/auugit-ext/ 下，随机
//!    文件名保留原扩展名，启动前顺手清理超过 24h 的旧文件；缺失的版本（untracked
//!    无 HEAD blob、add/add 无 base、一侧删除缺 stage）按 git merge-tool 惯例传
//!    空文件，而不是让启动失败。

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, SystemTime};
use tauri::Manager;

/// git difftool/mergetool 惯例占位符。
const MODES: [&str; 2] = ["diff", "merge"];
const MAX_TOOLS: usize = 16;
const IDENT_MAX_BYTES: usize = 32;
/// 临时副本的保留期：外部工具可能长时间挂起，只清理确实陈旧的文件。
const STALE_TEMP: Duration = Duration::from_secs(24 * 60 * 60);
const BLOB_TIMEOUT: Duration = Duration::from_secs(15);

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ExternalTool {
    pub id: String,
    pub name: String,
    pub program: String,
    pub args: String,
    pub mode: String,
}

fn valid_identifier(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= IDENT_MAX_BYTES
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'_' || byte == b'-')
}

/// diff 语义固定为 working 文件 vs HEAD 版本：模板必须提供两侧路径，且不存在
/// base/merged 概念；merge 语义只需要可编辑的 $MERGED，$LOCAL/$REMOTE/$BASE 均
/// 可选（例如"只打开冲突工作区文件"的极简配置也应合法）。
fn required_and_forbidden(mode: &str) -> (&'static [&'static str], &'static [&'static str]) {
    match mode {
        "diff" => (&["$LOCAL", "$REMOTE"], &["$BASE", "$MERGED"]),
        _ => (&["$MERGED"], &[]),
    }
}

fn validate_template(mode: &str, template: &str) -> Result<(), String> {
    if template.split_whitespace().next().is_none() {
        return Err("Arguments template cannot be empty".into());
    }
    // 不经 shell：元字符按字面传递，拒绝引号/分号/控制字符避免"看似 shell 转义、
    // 实际字面传入"的模板混进配置。
    if template
        .chars()
        .any(|character| matches!(character, '"' | '\'' | ';') || character.is_control())
    {
        return Err(
            "Arguments template cannot contain quotes, semicolons or control characters".into(),
        );
    }
    let (required, forbidden) = required_and_forbidden(mode);
    for placeholder in forbidden {
        if template.contains(placeholder) {
            return Err(format!("{mode} template cannot use {placeholder}"));
        }
    }
    for placeholder in required {
        if !template.contains(placeholder) {
            return Err(format!("{mode} template must contain {placeholder}"));
        }
    }
    Ok(())
}

/// 配置校验（set 时）：id/name 仅 [a-zA-Z0-9_-]{1,32}；program 必须是已存在的
/// 绝对路径文件（spawn 按字面使用该路径，相对路径会被解析到不可预期的 cwd）。
pub fn validate_tool(tool: &ExternalTool) -> Result<(), String> {
    if !valid_identifier(&tool.id) {
        return Err("Tool id must be 1-32 characters of letters, digits, '_' or '-'".into());
    }
    if !valid_identifier(&tool.name) {
        return Err("Tool name must be 1-32 characters of letters, digits, '_' or '-'".into());
    }
    if !MODES.contains(&tool.mode.as_str()) {
        return Err("Tool mode must be diff or merge".into());
    }
    let program = Path::new(&tool.program);
    if !program.is_absolute() {
        return Err("Tool program must be an absolute path".into());
    }
    if !fs::metadata(program).map(|info| info.is_file()).unwrap_or(false) {
        return Err("Tool program must be an existing file".into());
    }
    validate_template(&tool.mode, &tool.args)
}

/// 模板 → argv：先按简单空白分词，再在词内整体替换占位符。替换值成为单个 argv
/// 元素的一部分——路径含空格也不会被拆开，因为从不存在 shell 分词这一步。
pub fn build_argv<S: AsRef<str>>(
    template: &str,
    replacements: &[(&str, S)],
) -> Result<Vec<String>, String> {
    let mut argv = Vec::new();
    for token in template.split_whitespace() {
        let mut value = token.to_string();
        for (placeholder, replacement) in replacements {
            let replacement = replacement.as_ref();
            if value.contains(placeholder) {
                value = value.replace(placeholder, replacement);
            }
        }
        // 防御性复检：配置文件被手改时绕过了 validate_template，这里再拦一次。
        if value
            .chars()
            .any(|character| matches!(character, '"' | '\'') || character.is_control())
        {
            return Err("Arguments template contains unsupported characters".into());
        }
        argv.push(value);
    }
    if argv.is_empty() {
        return Err("Arguments template cannot be empty".into());
    }
    Ok(argv)
}

fn temp_root() -> PathBuf {
    std::env::temp_dir().join("auugit-ext")
}

/// 随机文件名：纳秒时间戳 + 进程号 + 进程内计数，保留原扩展名（部分工具按扩展
/// 名识别文件类型）。
fn temp_file_name(extension: &str) -> String {
    static COUNTER: AtomicU64 = AtomicU64::new(0);
    let nanos = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or(0);
    let sequence = COUNTER.fetch_add(1, Ordering::Relaxed);
    format!("auugit-{nanos:x}-{:x}-{sequence:x}{extension}", std::process::id())
}

fn extension_of(path: &str) -> String {
    let name = path.rsplit(['/', '\\']).next().unwrap_or("");
    match name.rsplit_once('.') {
        Some((_, extension)) if !extension.is_empty() && extension.len() <= 16 => {
            format!(".{}", extension)
        }
        _ => String::new(),
    }
}

/// 清理超过 max_age 的临时副本（外部工具读完后无人认领；失败忽略——清理不阻塞启动）。
fn cleanup_stale(directory: &Path, max_age: Duration, now: SystemTime) {
    let Ok(entries) = fs::read_dir(directory) else { return };
    for entry in entries.flatten() {
        let Ok(metadata) = entry.metadata() else { continue };
        if !metadata.is_file() {
            continue;
        }
        // 修改时间在未来（时钟回拨）按 age 0 处理：保留。
        let stale = now
            .duration_since(metadata.modified().unwrap_or(now))
            .unwrap_or(Duration::ZERO)
            > max_age;
        if stale {
            let _ = fs::remove_file(entry.path());
        }
    }
}

/// 把字节写为临时副本并返回路径：随机文件名保留原扩展名，写完即关闭句柄
/// （外部工具稍后才读），文件由 cleanup_stale 在 24h 后兜底回收。
fn write_temp_copy(directory: &Path, file_path: &str, bytes: &[u8]) -> Result<PathBuf, String> {
    fs::create_dir_all(directory).map_err(|error| error.to_string())?;
    let target = directory.join(temp_file_name(&extension_of(file_path)));
    fs::write(&target, bytes).map_err(|error| error.to_string())?;
    Ok(target)
}

fn git_blob(args: Vec<String>, repo: &str) -> Result<Option<Vec<u8>>, String> {
    let result =
        crate::git_process::run_git_bytes(args, repo.to_string(), None, None, BLOB_TIMEOUT)?;
    // 非零退出 = 该版本/阶段不存在（untracked、add/add 无 base、一侧删除等）：
    // 按 git merge-tool 惯例传空文件，而不是让启动失败。
    Ok((result.exit_code == 0).then_some(result.stdout))
}

fn store_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|error| error.to_string())
        .map(|directory| directory.join("external-tools.json"))
}

/// 后端拥有的配置文件：解析失败向上报错（与 git-executables.json 一致），绝不静默清空。
fn read_tools(store: &Path) -> Result<Vec<ExternalTool>, String> {
    match fs::read(store) {
        Ok(bytes) => serde_json::from_slice(&bytes).map_err(|error| error.to_string()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(Vec::new()),
        Err(error) => Err(error.to_string()),
    }
}

/// Caller holds FILE_WRITES（与 git_binary.rs / repository_access.rs 相同的写闸约定）。
fn write_tools(store: &Path, tools: &mut Vec<ExternalTool>) -> Result<(), String> {
    tools.sort_by_key(|tool| tool.name.to_lowercase());
    fs::create_dir_all(store.parent().ok_or("Missing application data directory")?)
        .map_err(|error| error.to_string())?;
    crate::file_io::atomic_write(
        store,
        &serde_json::to_string(tools).map_err(|error| error.to_string())?,
        None,
    )
}

fn sorted(mut tools: Vec<ExternalTool>) -> Vec<ExternalTool> {
    tools.sort_by_key(|tool| tool.name.to_lowercase());
    tools
}

#[tauri::command(async)]
pub fn get_external_tools(app: tauri::AppHandle) -> Result<Vec<ExternalTool>, String> {
    Ok(sorted(read_tools(&store_path(&app)?)?))
}

/// 新增或按 id 覆盖保存，返回排序后的完整列表（前端 store 只做镜像）。
#[tauri::command(async)]
pub fn set_external_tool(app: tauri::AppHandle, tool: ExternalTool) -> Result<Vec<ExternalTool>, String> {
    validate_tool(&tool)?;
    let store = store_path(&app)?;
    let _guard = crate::file_io::FILE_WRITES
        .lock()
        .map_err(|error| error.to_string())?;
    let mut tools = read_tools(&store)?;
    match tools.iter_mut().find(|existing| existing.id == tool.id) {
        Some(existing) => *existing = tool,
        None => {
            if tools.len() >= MAX_TOOLS {
                return Err("Too many external tools configured".into());
            }
            tools.push(tool);
        }
    }
    write_tools(&store, &mut tools)?;
    Ok(tools)
}

#[tauri::command(async)]
pub fn remove_external_tool(app: tauri::AppHandle, tool_id: String) -> Result<Vec<ExternalTool>, String> {
    let store = store_path(&app)?;
    let _guard = crate::file_io::FILE_WRITES
        .lock()
        .map_err(|error| error.to_string())?;
    let mut tools = read_tools(&store)?;
    tools.retain(|tool| tool.id != tool_id);
    write_tools(&store, &mut tools)?;
    Ok(tools)
}

fn find_tool(app: &tauri::AppHandle, tool_id: &str, mode: &str) -> Result<ExternalTool, String> {
    read_tools(&store_path(app)?)?
        .into_iter()
        .find(|tool| tool.id == tool_id)
        .ok_or_else(|| "External tool not found".into())
        .and_then(|tool| {
            if tool.mode == mode {
                Ok(tool)
            } else {
                Err("Tool is not configured for this mode".into())
            }
        })
}

/// launch 命令不收任意程序/参数：只收 toolId + mode + repoPath + filePath，后端
/// 自己查配置、自己拼 argv、不经 shell 直接 spawn，spawn 后不等待退出立即返回。
#[tauri::command(async)]
pub fn launch_external_tool(
    app: tauri::AppHandle,
    tool_id: String,
    mode: String,
    repo_path: String,
    file_path: String,
) -> Result<(), String> {
    if !MODES.contains(&mode.as_str()) {
        return Err("Invalid external tool mode".into());
    }
    let tool = find_tool(&app, &tool_id, &mode)?;
    // repo_file 内部含 repository_access::require 授权 + 仓库内相对路径解析。
    let root = crate::repository_access::require(&repo_path)?;
    let local = crate::repo_file(repo_path, file_path.clone())?;
    let local = crate::normalize_display_path(&local);
    let repo = crate::normalize_display_path(&root);

    let directory = temp_root();
    cleanup_stale(&directory, STALE_TEMP, SystemTime::now());
    let relative = file_path.replace('\\', "/");
    let replacements: Vec<(&str, String)> = match mode.as_str() {
        "diff" => {
            // working 文件 vs HEAD 版本：HEAD blob 写临时副本作 $REMOTE，working
            // 文件绝对路径作 $LOCAL。HEAD 不存在该文件（untracked / 空仓库）→ 空副本。
            let remote = git_blob(
                vec!["cat-file".into(), "blob".into(), format!("HEAD:{relative}")],
                &repo,
            )?
            .unwrap_or_default();
            let remote = write_temp_copy(&directory, &relative, &remote)?;
            vec![("$LOCAL", local), ("$REMOTE", crate::normalize_display_path(&remote))]
        }
        "merge" => {
            // index 三阶段：:1: base（add/add 冲突时不存在）、:2: ours、:3: theirs；
            // working 文件路径作 $MERGED。两侧 stage 都缺失说明并非冲突文件。
            let base = git_blob(vec!["show".into(), format!(":1:{relative}")], &repo)?;
            let ours = git_blob(vec!["show".into(), format!(":2:{relative}")], &repo)?;
            let theirs = git_blob(vec!["show".into(), format!(":3:{relative}")], &repo)?;
            if ours.is_none() && theirs.is_none() {
                return Err("File is not in a conflicted state".into());
            }
            let base = write_temp_copy(&directory, &relative, &base.unwrap_or_default())?;
            let ours = write_temp_copy(&directory, &relative, &ours.unwrap_or_default())?;
            let theirs = write_temp_copy(&directory, &relative, &theirs.unwrap_or_default())?;
            vec![
                ("$BASE", crate::normalize_display_path(&base)),
                ("$LOCAL", crate::normalize_display_path(&ours)),
                ("$REMOTE", crate::normalize_display_path(&theirs)),
                ("$MERGED", local),
            ]
        }
        _ => return Err("Invalid external tool mode".into()),
    };
    let argv = build_argv(&tool.args, &replacements)?;
    spawn_tool(&tool.program, &argv, &root)
}

/// 直接 spawn，不经 shell：argv 元素按字面传递。stdio 全部置空避免子进程继承
/// 管道；Windows 加 CREATE_NO_WINDOW 防止弹出控制台。后台线程 reap 子进程，
/// 避免长期运行的桌面应用积累僵尸进程；不等待退出、立即返回。
fn spawn_tool(program: &str, argv: &[String], cwd: &Path) -> Result<(), String> {
    let mut command = std::process::Command::new(program);
    command
        .args(argv)
        .current_dir(cwd)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null());
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    let child = command
        .spawn()
        .map_err(|error| format!("Unable to start external tool: {error}"))?;
    std::thread::spawn(move || {
        let mut child = child;
        let _ = child.wait();
    });
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tool(id: &str, mode: &str, args: &str, program: &str) -> ExternalTool {
        ExternalTool {
            id: id.into(),
            name: id.into(),
            program: program.into(),
            args: args.into(),
            mode: mode.into(),
        }
    }

    fn valid_program() -> String {
        // 静态持有 TempDir：static 在进程生命周期内不会 Drop，目录因此一直存在。
        static DIRECTORY: std::sync::OnceLock<tempfile::TempDir> = std::sync::OnceLock::new();
        let name = if cfg!(windows) { "tool.exe" } else { "tool" };
        let directory = DIRECTORY.get_or_init(|| {
            let directory = tempfile::tempdir().unwrap();
            fs::write(directory.path().join(name), "stub").unwrap();
            directory
        });
        directory.path().join(name).to_string_lossy().into_owned()
    }

    #[test]
    fn accepts_a_valid_tool_configuration() {
        let program = valid_program();
        assert!(validate_tool(&tool("vscode", "diff", "$LOCAL $REMOTE", &program)).is_ok());
        assert!(validate_tool(&tool(
            "bc4",
            "merge",
            "$LOCAL $BASE $REMOTE $MERGED",
            &program
        ))
        .is_ok());
        // merge 模板的 $LOCAL/$REMOTE/$BASE 均可选：极简"只打开冲突文件"配置合法。
        assert!(validate_tool(&tool("marker", "merge", "$MERGED", &program)).is_ok());
    }

    #[test]
    fn rejects_invalid_identifiers_modes_and_programs() {
        let program = valid_program();
        for id in ["", &"x".repeat(33), "has space", "中文", "dot.name", "slash/"] {
            assert!(validate_tool(&tool(id, "diff", "$LOCAL $REMOTE", &program)).is_err(), "{id}");
        }
        assert!(validate_tool(&tool("ok", "diff", "$LOCAL $REMOTE", &program)).is_ok());
        assert!(validate_tool(&tool("ok", "compare", "$LOCAL $REMOTE", &program)).is_err());
        assert!(validate_tool(&tool("ok", "diff", "$LOCAL $REMOTE", "relative/tool.exe")).is_err());
        assert!(validate_tool(&tool("ok", "diff", "$LOCAL $REMOTE", "C:\\definitely\\missing.exe")).is_err());
        // 指向目录同样拒绝。
        let directory = tempfile::tempdir().unwrap();
        assert!(validate_tool(&tool(
            "ok",
            "diff",
            "$LOCAL $REMOTE",
            directory.path().to_string_lossy().as_ref()
        ))
        .is_err());
    }

    #[test]
    fn rejects_templates_with_shell_metacharacters_or_missing_placeholders() {
        let program = valid_program();
        for args in [
            "",
            "   ",
            "\"$LOCAL\" \"$REMOTE\"",
            "'$LOCAL'",
            "$LOCAL; $REMOTE",
            "$LOCAL\n$REMOTE",
            "a\tb\u{0}c",
        ] {
            assert!(validate_tool(&tool("ok", "diff", args, &program)).is_err(), "{args:?}");
        }
        // diff 模板必须提供两侧路径，且不能引用不存在的 base/merged。
        assert!(validate_tool(&tool("ok", "diff", "$LOCAL", &program)).is_err());
        assert!(validate_tool(&tool("ok", "diff", "$REMOTE", &program)).is_err());
        assert!(validate_tool(&tool("ok", "diff", "$LOCAL $BASE $REMOTE", &program)).is_err());
        assert!(validate_tool(&tool("ok", "diff", "$LOCAL $MERGED", &program)).is_err());
        // merge 模板必须有 $MERGED。
        assert!(validate_tool(&tool("ok", "merge", "$LOCAL $REMOTE", &program)).is_err());
    }

    #[test]
    fn argv_tokens_keep_replaced_paths_as_single_elements() {
        let argv = build_argv(
            "$LOCAL $REMOTE --base=$BASE --merged=$MERGED",
            &[
                ("$LOCAL", r"C:\repo with spaces\a.txt"),
                ("$REMOTE", "/tmp/auugit-ext/auugit-1.txt"),
                ("$BASE", "/tmp/auugit-ext/auugit-base.txt"),
                ("$MERGED", "/repo/conflict.txt"),
            ],
        )
        .unwrap();
        assert_eq!(
            argv,
            vec![
                r"C:\repo with spaces\a.txt",
                "/tmp/auugit-ext/auugit-1.txt",
                "--base=/tmp/auugit-ext/auugit-base.txt",
                "--merged=/repo/conflict.txt",
            ]
        );
        // 未知 token 按字面保留。
        assert_eq!(
            build_argv("--wait --diff", &[] as &[(&str, &str)]).unwrap(),
            vec!["--wait", "--diff"]
        );
        // 手改配置带进引号/控制字符时，构造期兜底拒绝（防 shell 语义误解）。
        assert!(build_argv("\"$LOCAL\"", &[("$LOCAL", "a b")]).is_err());
        assert!(build_argv("a\u{7}b", &[] as &[(&str, &str)]).is_err());
        assert!(build_argv("   ", &[] as &[(&str, &str)]).is_err());
    }

    #[test]
    fn launch_file_paths_reject_traversal_and_stay_inside_the_repository() {
        let directory = tempfile::tempdir().unwrap();
        let root = directory.path().to_path_buf();
        fs::create_dir_all(root.join("src")).unwrap();
        fs::write(root.join("src/file.txt"), "content").unwrap();
        crate::repository_access::roots()
            .lock()
            .unwrap()
            .insert(crate::repository_access::resolve(&root).unwrap());
    let root_string = root.to_string_lossy().into_owned();
    // repo_file 与 launch 使用同一套解析：合法相对路径必须落在仓库内。
    let resolved = crate::repo_file(root_string.clone(), "src/file.txt".into()).unwrap();
    assert!(resolved.starts_with(crate::repository_access::resolve(&root).unwrap()));
    for invalid in [
        "../outside.txt",
        "src/../../outside.txt",
        "/etc/passwd",
        ".git/config",
        "node_modules/.git/config",
        "",
    ] {
        assert!(crate::repo_file(root_string.clone(), invalid.into()).is_err(), "{invalid}");
    }
    // 未授权仓库整体拒绝（launch 的第一步授权）。
    assert!(crate::repository_access::require("Z:\\not\\authorized").is_err());
    crate::repository_access::roots()
        .lock()
        .unwrap()
        .remove(&crate::repository_access::resolve(&root).unwrap());
    assert!(crate::repo_file(root_string, "src/file.txt".into()).is_err());
    }

    #[test]
    fn stale_temp_copies_are_cleaned_and_fresh_ones_kept() {
        let directory = tempfile::tempdir().unwrap();
        let fresh = directory.path().join("auugit-fresh.txt");
        let stale = directory.path().join("auugit-stale.txt");
        fs::write(&fresh, b"fresh").unwrap();
        fs::write(&stale, b"stale").unwrap();
        let nested = directory.path().join("nested");
        fs::create_dir_all(&nested).unwrap(); // 目录不清理（只清理文件）
        // now 取写入完成之后（NTFS mtime 有合并粒度，新文件可能拿到早于写入
        // 调用的修改时间）；"陈旧"用把 now 推到保留期之后来模拟，不依赖改 mtime。
        let after_writes = SystemTime::now();
        cleanup_stale(directory.path(), STALE_TEMP, after_writes);
        assert!(fresh.exists());
        assert!(stale.exists());
        assert!(nested.exists());
        cleanup_stale(
            directory.path(),
            STALE_TEMP,
            after_writes + STALE_TEMP + Duration::from_secs(60),
        );
        assert!(!fresh.exists());
        assert!(!stale.exists());
        assert!(nested.exists());
    }

    #[test]
    fn temp_names_are_unique_and_preserve_extensions() {
        assert_eq!(extension_of("src/a b.txt"), ".txt");
        assert_eq!(extension_of("C:\\repo\\image.PNG"), ".PNG");
        assert_eq!(extension_of("noext"), "");
        assert_eq!(extension_of("trailing."), "");
        // 超长扩展名直接丢弃（扩展名仅用于让工具识别类型，不值得为它兜底）。
        assert_eq!(extension_of("file.verylongextensionname"), "");
        let first = temp_file_name(".txt");
        let second = temp_file_name(".txt");
        assert_ne!(first, second);
        assert!(first.starts_with("auugit-") && first.ends_with(".txt"));
    }

    #[test]
    fn read_tools_tolerate_missing_files_and_roundtrip_sorted() {
        let directory = tempfile::tempdir().unwrap();
        let store = directory.path().join("external-tools.json");
        assert_eq!(read_tools(&store).unwrap(), Vec::<ExternalTool>::new());
        let program = valid_program();
        let mut tools = vec![
            tool("zeta", "merge", "$MERGED", &program),
            tool("alpha", "diff", "$LOCAL $REMOTE", &program),
        ];
        write_tools(&store, &mut tools).unwrap();
        let loaded = read_tools(&store).unwrap();
        assert_eq!(loaded.iter().map(|tool| tool.id.as_str()).collect::<Vec<_>>(), ["alpha", "zeta"]);
        // 损坏的配置向上报错，绝不静默清空。
        fs::write(&store, b"{broken").unwrap();
        assert!(read_tools(&store).is_err());
    }
}
