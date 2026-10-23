use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use tauri::Manager;
use tauri_plugin_dialog::DialogExt;

static ROOTS: OnceLock<Mutex<HashSet<PathBuf>>> = OnceLock::new();
fn roots() -> &'static Mutex<HashSet<PathBuf>> {
    ROOTS.get_or_init(Mutex::default)
}

// Resolve existing ancestors as well, so cloning into a new folder cannot bypass the scope via a link.
pub fn resolve(path: &Path) -> Result<PathBuf, String> {
    let absolute = if path.is_absolute() {
        path.to_path_buf()
    } else {
        std::env::current_dir()
            .map_err(|error| error.to_string())?
            .join(path)
    };
    if absolute
        .components()
        .any(|part| matches!(part, std::path::Component::ParentDir))
    {
        return Err("Parent-directory components are not allowed".into());
    }
    let mut ancestor = absolute.as_path();
    while !ancestor.exists() {
        ancestor = ancestor.parent().ok_or("Missing parent directory")?;
    }
    let suffix = absolute
        .strip_prefix(ancestor)
        .map_err(|error| error.to_string())?;
    Ok(fs::canonicalize(ancestor)
        .map_err(|error| error.to_string())?
        .join(suffix))
}

pub fn require(path: &str) -> Result<PathBuf, String> {
    let resolved = resolve(Path::new(path))?;
    if !roots()
        .lock()
        .map_err(|error| error.to_string())?
        .contains(&resolved)
    {
        return Err("Open or select this repository in AuuGit before accessing it".into());
    }
    Ok(resolved)
}

fn grant(app: &tauri::AppHandle, path: PathBuf) -> Result<(), String> {
    let store = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("repository-access.json");
    let guard = crate::file_io::FILE_WRITES
        .lock()
        .map_err(|error| error.to_string())?;
    let mut saved: HashSet<PathBuf> = match fs::read(&store) {
        Ok(bytes) => serde_json::from_slice(&bytes).map_err(|error| error.to_string())?,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => HashSet::new(),
        Err(error) => return Err(error.to_string()),
    };
    saved.insert(path);
    fs::create_dir_all(store.parent().ok_or("Missing application data directory")?)
        .map_err(|error| error.to_string())?;
    crate::file_io::atomic_write(
        &store,
        &serde_json::to_string(&saved).map_err(|error| error.to_string())?,
        None,
    )?;
    drop(guard);
    roots()
        .lock()
        .map_err(|error| error.to_string())?
        .extend(saved);
    Ok(())
}

#[tauri::command(async)]
pub fn authorize_repository(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let resolved = resolve(Path::new(&path))?;
    if resolved.exists() && !resolved.is_dir() {
        return Err("Expected a repository directory".into());
    }
    let store = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("repository-access.json");
    // Only native code writes this list. Frontend storage is not an authorization source.
    if let Ok(bytes) = fs::read(store) {
        let saved: HashSet<PathBuf> =
            serde_json::from_slice(&bytes).map_err(|error| error.to_string())?;
        roots()
            .lock()
            .map_err(|error| error.to_string())?
            .extend(saved);
    }
    if roots()
        .lock()
        .map_err(|error| error.to_string())?
        .contains(&resolved)
    {
        return Ok(());
    }
    let accepted = app
        .dialog()
        .message(format!(
            "Allow AuuGit to access this repository directory?\n\n{}",
            crate::normalize_display_path(&resolved)
        ))
        .title("AuuGit — Repository access")
        .buttons(tauri_plugin_dialog::MessageDialogButtons::OkCancel)
        .blocking_show();
    if !accepted {
        return Err("Repository access was cancelled".into());
    }
    grant(&app, resolved)
}

#[tauri::command(async)]
pub fn pick_repository_folder(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let Some(selected) = app
        .dialog()
        .file()
        .set_title("Select a repository directory")
        .blocking_pick_folder()
    else {
        return Ok(None);
    };
    let path = selected.into_path().map_err(|error| error.to_string())?;
    let resolved = resolve(&path)?;
    grant(&app, resolved.clone())?;
    Ok(Some(crate::normalize_display_path(&resolved)))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_unapproved_roots_and_resolves_new_descendants() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().to_string_lossy();
        assert!(require(&path).is_err());
        let resolved = resolve(directory.path()).unwrap();
        roots().lock().unwrap().insert(resolved.clone());
        assert_eq!(require(&path).unwrap(), resolved);
        let child = directory.path().join("new").join("repository");
        assert!(require(&child.to_string_lossy()).is_err());
        assert_eq!(resolve(&child).unwrap(), resolved.join("new/repository"));
        assert!(resolve(&directory.path().join("../outside")).is_err());
        roots().lock().unwrap().remove(&resolved);
    }
}
