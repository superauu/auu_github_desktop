use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use tauri::Manager;
use tauri_plugin_dialog::DialogExt;

static APPROVED: OnceLock<Mutex<HashSet<PathBuf>>> = OnceLock::new();
static DEFAULT: OnceLock<Option<PathBuf>> = OnceLock::new();

fn approved() -> &'static Mutex<HashSet<PathBuf>> {
    APPROVED.get_or_init(Mutex::default)
}

fn default_git() -> Option<PathBuf> {
    DEFAULT
        .get_or_init(|| {
            let name = if cfg!(windows) { "git.exe" } else { "git" };
            std::env::split_paths(&std::env::var_os("PATH").unwrap_or_default())
                .filter(|directory| directory.is_absolute())
                .map(|directory| directory.join(name))
                .find(|candidate| candidate.is_file())
                .and_then(|candidate| fs::canonicalize(candidate).ok())
        })
        .clone()
}

fn custom_path(value: &str) -> Result<PathBuf, String> {
    let path = Path::new(value);
    if !path.is_absolute()
        || !path.file_name().is_some_and(|name| {
            let name = name.to_string_lossy();
            name.eq_ignore_ascii_case("git") || name.eq_ignore_ascii_case("git.exe")
        })
    {
        return Err("Select an absolute path to a Git executable".into());
    }
    let path = fs::canonicalize(path).map_err(|error| error.to_string())?;
    if !path.is_file() {
        return Err("Expected a Git executable file".into());
    }
    Ok(path)
}

/// Frontend settings cannot grant permission to execute an arbitrary file named git.exe.
pub fn resolve(value: Option<&str>) -> Result<PathBuf, String> {
    let value = value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("git");
    if value.eq_ignore_ascii_case("git") || value.eq_ignore_ascii_case("git.exe") {
        return default_git().ok_or_else(|| "Git was not found on the system PATH".into());
    }
    let path = custom_path(value)?;
    if default_git().as_ref() == Some(&path)
        || approved()
            .lock()
            .map_err(|error| error.to_string())?
            .contains(&path)
    {
        return Ok(path);
    }
    Err("Approve this Git executable in Settings before using it".into())
}

#[tauri::command(async)]
pub fn authorize_git_binary(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let path = custom_path(path.trim())?;
    let store = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("git-executables.json");
    // Read persisted approvals only here; ordinary execution never accepts frontend storage as trust.
    let saved: HashSet<PathBuf> = match fs::read(&store) {
        Ok(bytes) => serde_json::from_slice(&bytes).map_err(|error| error.to_string())?,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => HashSet::new(),
        Err(error) => return Err(error.to_string()),
    };
    approved()
        .lock()
        .map_err(|error| error.to_string())?
        .extend(saved);
    if resolve(path.to_str()).is_ok() {
        return Ok(());
    }
    if !app
        .dialog()
        .message(format!(
            "Allow AuuGit to run this Git executable?\n\n{}",
            crate::normalize_display_path(&path)
        ))
        .title("AuuGit — Git executable")
        .buttons(tauri_plugin_dialog::MessageDialogButtons::OkCancel)
        .blocking_show()
    {
        return Err("Git executable approval was cancelled".into());
    }
    let _guard = crate::file_io::FILE_WRITES
        .lock()
        .map_err(|error| error.to_string())?;
    let mut saved: HashSet<PathBuf> = match fs::read(&store) {
        Ok(bytes) => serde_json::from_slice(&bytes).map_err(|error| error.to_string())?,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => HashSet::new(),
        Err(error) => return Err(error.to_string()),
    };
    saved.insert(path.clone());
    fs::create_dir_all(store.parent().ok_or("Missing application data directory")?)
        .map_err(|error| error.to_string())?;
    crate::file_io::atomic_write(
        &store,
        &serde_json::to_string(&saved).map_err(|error| error.to_string())?,
        None,
    )?;
    approved()
        .lock()
        .map_err(|error| error.to_string())?
        .insert(path);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_unapproved_executables_even_when_named_git() {
        let directory = tempfile::tempdir().unwrap();
        let binary = directory
            .path()
            .join(if cfg!(windows) { "git.exe" } else { "git" });
        fs::write(&binary, "not an executable").unwrap();
        assert!(resolve(binary.to_str()).is_err());
        assert!(resolve(Some("./git")).is_err());
        assert!(resolve(Some("elsewhere/git.exe")).is_err());
        assert!(resolve(Some("powershell.exe")).is_err());
        assert!(resolve(None).unwrap().is_absolute());
    }
}
