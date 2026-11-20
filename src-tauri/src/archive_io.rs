use std::path::Path;
use std::time::Duration;

use tauri_plugin_dialog::DialogExt;

use crate::file_io;
use crate::git_policy;
use crate::git_process::{lock_or_recover, run_git_bytes};

/// 归档导出的文件面：保存对话框由用户显式驱动，路径不进仓库授权表；
/// `git archive --format` 的二进制产物在 Rust 侧直接落盘（不经前端 UTF-8 字符串通道，
/// 与 format-patch 的文本通道不同构）。缓冲上限 1 GiB：run_git_bytes 走内存缓冲。
const MAX_ARCHIVE_BYTES: usize = 1024 * 1024 * 1024;

struct ArchiveDialogText {
    save_title: &'static str,
    filter_name: &'static str,
}

fn text(language: Option<&str>) -> ArchiveDialogText {
    if language == Some("en") {
        ArchiveDialogText {
            save_title: "Save the archive",
            filter_name: "Archives",
        }
    } else {
        ArchiveDialogText {
            save_title: "保存归档文件",
            filter_name: "归档文件",
        }
    }
}

#[tauri::command(async)]
pub fn pick_archive_save_path(
    app: tauri::AppHandle,
    language: Option<String>,
    default_name: String,
) -> Result<Option<String>, String> {
    // 保存名由前端生成（仓库-短哈希.zip），只做形态防御：拒空、拒路径分隔与父目录。
    let name = default_name.trim();
    if name.is_empty()
        || name.starts_with('-')
        || name.contains(['/', '\\'])
        || name.contains("..")
    {
        return Err("Invalid archive file name".into());
    }
    let text = text(language.as_deref());
    let Some(selected) = app
        .dialog()
        .file()
        .set_title(text.save_title)
        .add_filter(text.filter_name, &["zip", "gz"])
        .set_file_name(name)
        .blocking_save_file()
    else {
        return Ok(None);
    };
    let path = selected.into_path().map_err(|error| error.to_string())?;
    Ok(Some(crate::normalize_display_path(&path)))
}

/// 命令参数的纯校验：格式、tree-ish 形态与目标扩展名一致性（不含策略层与可执行校验）。
fn validate_archive_request(format: &str, treeish: &str, target: &str) -> Result<(), String> {
    let format = format.trim();
    if !matches!(format, "zip" | "tar.gz") {
        return Err("Unsupported archive format".into());
    }
    let treeish = treeish.trim();
    if treeish.is_empty() || treeish.starts_with('-') || treeish.contains(char::is_whitespace) {
        return Err("Invalid tree-ish".into());
    }
    let target_path = Path::new(target);
    let extension_matches = match format {
        "zip" => target_path
            .extension()
            .and_then(|value| value.to_str())
            .map(|value| value.eq_ignore_ascii_case("zip"))
            .unwrap_or(false),
        "tar.gz" => target.to_ascii_lowercase().ends_with(".tar.gz"),
        _ => false,
    };
    if !extension_matches {
        return Err("Archive target extension does not match the format".into());
    }
    Ok(())
}

#[tauri::command(async)]
pub fn export_archive(
    repo_path: String,
    treeish: String,
    format: String,
    target: String,
    git_binary: Option<String>,
) -> Result<(), String> {
    // 窄形态校验（格式/tree-ish/目标扩展名），策略层窄校验另经 safe_archive 锁定。
    validate_archive_request(&format, &treeish, &target)?;
    let format = format.trim();
    let treeish = treeish.trim();
    let binary = git_binary.unwrap_or_else(|| "git".into());
    let executable = Path::new(&binary)
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_lowercase();
    if executable != "git" && executable != "git.exe" {
        return Err("Invalid Git executable".into());
    }
    git_policy::validate(&[
        "archive".to_string(),
        format!("--format={format}"),
        treeish.to_string(),
    ])?;
    let result = run_git_bytes(
        vec!["archive".into(), format!("--format={format}"), treeish.to_string()],
        repo_path,
        Some(binary),
        None,
        Duration::from_secs(15 * 60),
    )?;
    if result.exit_code != 0 {
        return Err(String::from_utf8_lossy(&result.stderr).into_owned());
    }
    if result.stdout.len() > MAX_ARCHIVE_BYTES {
        return Err("Archive exceeds the 1 GiB limit".into());
    }
    let _guard = lock_or_recover(&file_io::FILE_WRITES);
    std::fs::write(Path::new(&target), &result.stdout).map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::validate_archive_request;

    #[test]
    fn archive_requests_match_format_extension_and_reject_awkward_treeishes() {
        assert!(validate_archive_request("zip", "HEAD", "C:/out/repo-main.zip").is_ok());
        assert!(validate_archive_request("zip", "HEAD", "C:/out/repo-main.ZIP").is_ok());
        assert!(validate_archive_request("tar.gz", "v1.0.0", "C:/out/repo.tar.gz").is_ok());
        // 格式与扩展名不一致、未知格式、非法 tree-ish。
        assert!(validate_archive_request("zip", "HEAD", "C:/out/repo.tar.gz").is_err());
        assert!(validate_archive_request("tar.gz", "HEAD", "C:/out/repo.zip").is_err());
        assert!(validate_archive_request("tar", "HEAD", "C:/out/repo.tar").is_err());
        assert!(validate_archive_request("zip", "-evil", "C:/out/repo.zip").is_err());
        assert!(validate_archive_request("zip", "HEAD extra", "C:/out/repo.zip").is_err());
        assert!(validate_archive_request("zip", "", "C:/out/repo.zip").is_err());
    }
}
