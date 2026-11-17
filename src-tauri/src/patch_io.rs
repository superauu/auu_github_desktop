use std::path::Path;

use tauri_plugin_dialog::DialogExt;

use crate::file_io;
use crate::git_process::lock_or_recover;

/// 补丁交换的文件读写面：选择对话框由用户显式驱动，路径不进入仓库授权表；
/// 内容读写统一走 file_io 的 8 MiB / UTF-8 窄通道（读 read_text、写 atomic_write）。
/// format-patch --stdout 的产物由前端经 save 对话框落盘，服务端不落地临时文件。
struct PatchDialogText {
    pick_title: &'static str,
    save_title: &'static str,
    filter_name: &'static str,
}

fn text(language: Option<&str>) -> PatchDialogText {
    if language == Some("en") {
        PatchDialogText {
            pick_title: "Open a patch file",
            save_title: "Save the patch file",
            filter_name: "Patch files",
        }
    } else {
        PatchDialogText {
            pick_title: "打开补丁文件",
            save_title: "保存补丁文件",
            filter_name: "补丁文件",
        }
    }
}

#[tauri::command(async)]
pub fn pick_patch_file(app: tauri::AppHandle, language: Option<String>) -> Result<Option<String>, String> {
    let text = text(language.as_deref());
    let Some(selected) = app
        .dialog()
        .file()
        .set_title(text.pick_title)
        .add_filter(text.filter_name, &["patch", "diff"])
        .blocking_pick_file()
    else {
        return Ok(None);
    };
    let path = selected.into_path().map_err(|error| error.to_string())?;
    Ok(Some(crate::normalize_display_path(&path)))
}

#[tauri::command(async)]
pub fn pick_patch_save_path(
    app: tauri::AppHandle,
    language: Option<String>,
    default_name: String,
) -> Result<Option<String>, String> {
    // 保存名由前端生成（仓库-短哈希.patch），只做形态防御：拒空、拒路径分隔与父目录。
    let name = default_name.trim();
    if name.is_empty()
        || name.starts_with('-')
        || name.contains(['/', '\\'])
        || name.contains("..")
    {
        return Err("Invalid patch file name".into());
    }
    let text = text(language.as_deref());
    let Some(selected) = app
        .dialog()
        .file()
        .set_title(text.save_title)
        .add_filter(text.filter_name, &["patch", "diff"])
        .set_file_name(name)
        .blocking_save_file()
    else {
        return Ok(None);
    };
    let path = selected.into_path().map_err(|error| error.to_string())?;
    Ok(Some(crate::normalize_display_path(&path)))
}

#[tauri::command(async)]
pub fn read_patch_file(path: String) -> Result<String, String> {
    file_io::read_text(Path::new(&path)).map_err(|error| error.to_string())
}

#[tauri::command(async)]
pub fn write_patch_file(path: String, content: String) -> Result<(), String> {
    let target = Path::new(&path);
    if target.is_dir() {
        return Err("Expected a file path".into());
    }
    let _guard = lock_or_recover(&file_io::FILE_WRITES);
    file_io::atomic_write(target, &content, None)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn save_name_shape_rejects_paths_and_parent_segments() {
        // pick_patch_save_path 的名称校验语义：这里锁定判定条件本身（命令层使用同一组条件）。
        for name in ["", "  ", "-lead", "a/b.patch", "a\\b.patch", "..patch", "x/../y.patch"] {
            let invalid = name.is_empty()
                || name.trim().is_empty()
                || name.starts_with('-')
                || name.contains(['/', '\\'])
                || name.contains("..");
            assert!(invalid, "{name}");
        }
        let valid = "repo-abc1234.patch";
        assert!(!valid.starts_with('-') && !valid.contains(['/', '\\']) && !valid.contains(".."));
    }

    #[test]
    fn write_rejects_directories() {
        let directory = tempfile::tempdir().unwrap();
        assert!(write_patch_file(directory.path().to_string_lossy().to_string(), "x".into()).is_err());
    }

    #[test]
    fn dialog_text_follows_the_explicit_app_language() {
        assert_eq!(text(Some("en")).pick_title, "Open a patch file");
        assert_eq!(text(Some("zh")).pick_title, "打开补丁文件");
        assert_eq!(text(None).save_title, "保存补丁文件");
    }
}
