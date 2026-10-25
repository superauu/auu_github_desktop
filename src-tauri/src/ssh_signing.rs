//! SSH 提交签名支持（第三梯队）。
//!
//! 安全模型（与 external_tools.rs / git_binary.rs 的"前端不可信"约定一致）：
//! 1. ssh-keygen 探测不经 shell：后端自己遍历 PATH 与系统兜底目录。
//! 2. 私钥内容永不出后端：list/generate 只返回 .pub 公钥信息。
//! 3. 生成密钥前置存在性检查——ssh-keygen 对已存在的密钥文件会交互式询问覆盖，
//!    直接 spawn 会挂起，必须先拒绝。
//! 4. 签名配置（user.signingkey / gpg.format / commit.gpgsign）走既有 execute_git
//!    管线（git_policy::safe_config 白名单），本模块不重复实现。

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SshPublicKeyInfo {
    pub name: String,
    pub path: String,
    pub content: String,
    pub fingerprint: String,
}

const NAME_MAX_BYTES: usize = 64;
const COMMENT_MAX_BYTES: usize = 256;

/// 密钥名校验：[A-Za-z0-9._-]{1,64} 且不以 . 开头（拒绝 .ssh 内隐藏文件形态与
/// 以点开头的穿越花招；斜杠/反斜杠/盘符天然不在字符集内）。
pub fn valid_key_name(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= NAME_MAX_BYTES
        && !name.starts_with('.')
        && name.bytes().all(|byte| {
            byte.is_ascii_alphanumeric() || byte == b'.' || byte == b'_' || byte == b'-'
        })
}

pub fn valid_comment(comment: &str) -> bool {
    comment.len() <= COMMENT_MAX_BYTES && !comment.chars().any(char::is_control)
}

fn ssh_directory() -> Result<PathBuf, String> {
    let home = std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .ok_or("Missing home directory")?;
    Ok(PathBuf::from(&home).join(".ssh"))
}

fn executable_in(directory: &Path, stem: &str) -> Option<PathBuf> {
    let candidate = if cfg!(windows) {
        directory.join(format!("{stem}.exe"))
    } else {
        directory.join(stem)
    };
    fs::metadata(&candidate)
        .ok()
        .filter(|info| info.is_file())
        .map(|_| candidate)
}

/// PATH 遍历 + 系统兜底目录找 ssh-keygen（不经 shell；PATH 未命中时按平台兜底）。
pub fn find_ssh_keygen() -> Option<PathBuf> {
    if let Some(paths) = std::env::var_os("PATH") {
        for directory in std::env::split_paths(&paths) {
            if let Some(found) = executable_in(&directory, "ssh-keygen") {
                return Some(found);
            }
        }
    }
    let fallbacks: Vec<PathBuf> = if cfg!(windows) {
        vec![PathBuf::from(std::env::var_os("SystemRoot")?).join(r"System32\OpenSSH")]
    } else {
        vec![
            PathBuf::from("/usr/bin"),
            PathBuf::from("/usr/local/bin"),
            PathBuf::from("/opt/homebrew/bin"),
        ]
    };
    fallbacks
        .into_iter()
        .find_map(|directory| executable_in(&directory, "ssh-keygen"))
}

/// 无 shell spawn 的 ssh-keygen：stdio 全部置空（Windows 加 CREATE_NO_WINDOW）。
fn keygen_command(keygen: &Path) -> Command {
    let mut command = Command::new(keygen);
    command
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    command
}

/// `ssh-keygen -lf <pub>` 的指纹行；失败返回空串（指纹仅用于展示，不致命）。
fn fingerprint_of(keygen: &Path, public_key: &Path) -> String {
    let Ok(output) = keygen_command(keygen).arg("-lf").arg(public_key).output() else {
        return String::new();
    };
    if !output.status.success() {
        return String::new();
    }
    String::from_utf8_lossy(&output.stdout).trim().to_string()
}

/// 列举目录下的 *.pub 公钥（名称排序）；非 .pub、不可读的条目跳过。
pub fn list_public_keys_in(directory: &Path, keygen: Option<&Path>) -> Vec<SshPublicKeyInfo> {
    let mut keys = Vec::new();
    let Ok(entries) = fs::read_dir(directory) else {
        return keys;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|value| value.to_str()) != Some("pub") {
            continue;
        }
        let Some(name) = path.file_stem().and_then(|value| value.to_str()) else {
            continue;
        };
        let Ok(content) = fs::read_to_string(&path) else {
            continue;
        };
        let fingerprint = keygen
            .map(|keygen| fingerprint_of(keygen, &path))
            .unwrap_or_default();
        keys.push(SshPublicKeyInfo {
            name: name.to_string(),
            path: path.to_string_lossy().into_owned(),
            content: content.trim_end().to_string(),
            fingerprint,
        });
    }
    keys.sort_by_key(|key| key.name.to_lowercase());
    keys
}

/// 在 directory 下生成名为 name 的无口令 ed25519 密钥对，返回公钥信息。
/// 校验与存在性检查都成功后才 spawn ssh-keygen（argv 按字面传递，不经 shell）。
pub fn generate_key_in(
    directory: &Path,
    keygen: &Path,
    name: &str,
    comment: &str,
) -> Result<SshPublicKeyInfo, String> {
    if !valid_key_name(name) {
        return Err("Key name must be 1-64 characters of letters, digits, '.', '_' or '-', and cannot start with '.'".into());
    }
    if !valid_comment(comment) {
        return Err("Invalid key comment".into());
    }
    let private_path = directory.join(name);
    let public_path = directory.join(format!("{name}.pub"));
    // ssh-keygen 对已存在文件会交互式询问覆盖（无人应答即挂起）：前置拒绝。
    if private_path.exists() || public_path.exists() {
        return Err("A key with this name already exists".into());
    }
    fs::create_dir_all(directory).map_err(|error| error.to_string())?;
    let mut command = keygen_command(keygen);
    command
        .arg("-t")
        .arg("ed25519")
        .arg("-N")
        .arg("")
        .arg("-f")
        .arg(&private_path);
    if !comment.is_empty() {
        command.arg("-C").arg(comment);
    }
    let output = command
        .output()
        .map_err(|error| format!("Unable to run ssh-keygen: {error}"))?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }
    let content = fs::read_to_string(&public_path).map_err(|error| error.to_string())?;
    Ok(SshPublicKeyInfo {
        name: name.to_string(),
        path: public_path.to_string_lossy().into_owned(),
        content: content.trim_end().to_string(),
        fingerprint: fingerprint_of(keygen, &public_path),
    })
}

#[tauri::command(async)]
pub fn detect_ssh_keygen() -> Option<String> {
    find_ssh_keygen().map(|path| path.to_string_lossy().into_owned())
}

#[tauri::command(async)]
pub fn list_ssh_public_keys() -> Result<Vec<SshPublicKeyInfo>, String> {
    let directory = ssh_directory()?;
    let keygen = find_ssh_keygen();
    Ok(list_public_keys_in(&directory, keygen.as_deref()))
}

#[tauri::command(async)]
pub fn generate_ssh_signing_key(name: String, comment: String) -> Result<SshPublicKeyInfo, String> {
    let keygen = find_ssh_keygen().ok_or("ssh-keygen was not found")?;
    generate_key_in(&ssh_directory()?, &keygen, &name, &comment)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_key_names_fail_closed() {
        for name in [
            "",
            &"x".repeat(65),
            ".hidden",
            "../escape",
            "sub/dir",
            r"win\path",
            "C:drive",
            "中文",
            "space name",
            "semi;colon",
        ] {
            assert!(!valid_key_name(name), "{name}");
        }
        for name in ["auugit-signing", "id_ed25519", "key.2026", "a"] {
            assert!(valid_key_name(name), "{name}");
        }
        for comment in ["", "user@host", &"x".repeat(256)] {
            assert!(valid_comment(comment), "{comment}");
        }
        for comment in [&"x".repeat(257), "bad\u{1}control", "line\nbreak"] {
            assert!(!valid_comment(comment), "{comment:?}");
        }
    }

    #[test]
    fn lists_only_public_keys_sorted_by_name() {
        let directory = tempfile::tempdir().unwrap();
        fs::write(directory.path().join("zeta.pub"), "ssh-ed25519 AAAA zeta\n").unwrap();
        fs::write(
            directory.path().join("alpha.pub"),
            "ssh-ed25519 AAAA alpha\n",
        )
        .unwrap();
        fs::write(directory.path().join("alpha"), "PRIVATE").unwrap();
        fs::write(directory.path().join("notes.txt"), "not a key").unwrap();
        let keys = list_public_keys_in(directory.path(), None);
        assert_eq!(
            keys.iter().map(|key| key.name.as_str()).collect::<Vec<_>>(),
            ["alpha", "zeta"]
        );
        // 私钥内容绝不出现在列举结果里；内容做尾部换行规整。
        assert_eq!(keys[0].content, "ssh-ed25519 AAAA alpha");
        assert_eq!(keys[0].fingerprint, "");
        // 目录不存在时返回空列表而不是报错。
        assert!(list_public_keys_in(Path::new("Z:/definitely/missing"), None).is_empty());
    }

    #[test]
    fn generation_rejects_bad_names_and_existing_keys_before_spawning() {
        let directory = tempfile::tempdir().unwrap();
        // 校验失败/已存在都在 spawn 之前返回：传一个不存在的 keygen 路径也能得到
        // 明确错误（而不是执行错误），证明没有走到子进程。
        let missing_keygen = PathBuf::from("Z:/definitely/missing/ssh-keygen.exe");
        assert!(generate_key_in(directory.path(), &missing_keygen, "../escape", "").is_err());
        assert!(generate_key_in(directory.path(), &missing_keygen, ".hidden", "").is_err());
        assert!(
            generate_key_in(directory.path(), &missing_keygen, "key", &"x".repeat(257)).is_err()
        );
        fs::write(directory.path().join("exists"), "private stub").unwrap();
        fs::write(directory.path().join("pubonly.pub"), "pub stub").unwrap();
        assert!(generate_key_in(directory.path(), &missing_keygen, "exists", "").is_err());
        assert!(generate_key_in(directory.path(), &missing_keygen, "pubonly", "").is_err());
    }
}
