use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::Path;
use std::sync::Mutex;

pub const MAX_FILE_BYTES: u64 = 8 * 1024 * 1024;
pub static FILE_WRITES: Mutex<()> = Mutex::new(());

pub fn read_bytes(path: &Path, limit: u64) -> std::io::Result<Vec<u8>> {
    let file = File::open(path)?;
    if !file.metadata()?.is_file() {
        return Err(std::io::Error::other("Expected a regular file"));
    }
    if file.metadata()?.len() > limit {
        return Err(std::io::Error::other("File exceeds 8 MiB"));
    }
    let mut bytes = Vec::new();
    file.take(limit + 1).read_to_end(&mut bytes)?;
    if bytes.len() as u64 > limit {
        return Err(std::io::Error::other("File exceeds 8 MiB"));
    }
    Ok(bytes)
}

pub fn read_text(path: &Path) -> std::io::Result<String> {
    String::from_utf8(read_bytes(path, MAX_FILE_BYTES)?)
        .map_err(|error| std::io::Error::new(std::io::ErrorKind::InvalidData, error))
}

/// Caller holds FILE_WRITES. Stage the complete contents before checking the destination again.
/// The final check detects external changes during staging; filesystems do not offer a portable CAS.
pub fn atomic_write(path: &Path, content: &str, expected: Option<&str>) -> Result<(), String> {
    if content.len() as u64 > MAX_FILE_BYTES {
        return Err("File exceeds 8 MiB".into());
    }
    let before = match read_text(path) {
        Ok(value) => Some(value),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
        Err(error) => return Err(error.to_string()),
    };
    if expected.is_some_and(|value| before.as_deref().unwrap_or("") != value) {
        return Err("File changed on disk; reload before saving".into());
    }
    let parent = path.parent().ok_or("Missing parent directory")?;
    let mut temporary =
        tempfile::NamedTempFile::new_in(parent).map_err(|error| error.to_string())?;
    temporary
        .write_all(content.as_bytes())
        .map_err(|error| error.to_string())?;
    if let Ok(metadata) = fs::metadata(path) {
        temporary
            .as_file()
            .set_permissions(metadata.permissions())
            .map_err(|error| error.to_string())?;
    }
    temporary
        .as_file()
        .sync_all()
        .map_err(|error| error.to_string())?;
    let current = match read_text(path) {
        Ok(value) => Some(value),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
        Err(error) => return Err(error.to_string()),
    };
    if current != before {
        return Err("File changed on disk; reload before saving".into());
    }
    temporary
        .persist(path)
        .map_err(|error| error.error.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn refuses_large_and_non_utf8_files() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("file");
        File::create(&path)
            .unwrap()
            .set_len(MAX_FILE_BYTES + 1)
            .unwrap();
        assert!(read_text(&path).unwrap_err().to_string().contains("8 MiB"));
        fs::write(&path, [0xff]).unwrap();
        assert_eq!(
            read_text(&path).unwrap_err().kind(),
            std::io::ErrorKind::InvalidData
        );
    }

    #[test]
    fn rejects_stale_edits_and_atomically_replaces_existing_files() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("file");
        fs::write(&path, "external edit").unwrap();
        assert!(atomic_write(&path, "new", Some("old")).is_err());
        assert_eq!(read_text(&path).unwrap(), "external edit");
        atomic_write(&path, "new\n", Some("external edit")).unwrap();
        assert_eq!(read_text(&path).unwrap(), "new\n");
        assert_eq!(fs::read_dir(directory.path()).unwrap().count(), 1);
        fs::remove_file(&path).unwrap();
        atomic_write(&path, "created", Some("")).unwrap();
        assert_eq!(read_text(&path).unwrap(), "created");
    }
}
