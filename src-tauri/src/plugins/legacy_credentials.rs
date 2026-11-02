/// 多平台托管（GitLab / Gitea）的凭据条目名：与 GitHub 同构的 "<service>_token[:<profileId>]"
/// 槽位；service 白名单外一律拒绝（fail closed）。GitHub 沿用既有条目（见上），不迁移。
fn forge_service(service: &str) -> Result<&'static str, String> {
    match service {
        "gitlab" | "gitea" => Ok(if service == "gitlab" { "gitlab" } else { "gitea" }),
        _ => Err("Unsupported forge service".into()),
    }
}

fn forge_token_entry(service: &str, profile_id: Option<&str>) -> Result<keyring::Entry, String> {
    let name = forge_service(service)?;
    let entry = match profile_id {
        Some(id) if !id.is_empty() && id != "default" => format!("{}_token:{}", name, id),
        _ => format!("{}_token", name),
    };
    keyring::Entry::new("auugit", &entry).map_err(|e| e.to_string())
}

#[tauri::command(async)]
pub(crate) fn store_forge_token(token: String, service: String, profile_id: Option<String>) -> Result<(), String> {
    let entry = forge_token_entry(&service, profile_id.as_deref())?;
    entry.set_password(&token).map_err(|e| e.to_string())
}

#[tauri::command(async)]
pub(crate) fn get_forge_token(service: String, profile_id: Option<String>) -> Result<Option<String>, String> {
    let entry = forge_token_entry(&service, profile_id.as_deref())?;
    match entry.get_password() {
        Ok(token) => Ok(Some(token)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command(async)]
pub(crate) fn delete_forge_token(service: String, profile_id: Option<String>) -> Result<(), String> {
    let entry = forge_token_entry(&service, profile_id.as_deref())?;
    match entry.delete_credential() {
        Ok(_) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}


#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn forge_token_entries_isolate_services_and_profiles_fail_closed() {
        // GitLab / Gitea 与 GitHub 同构的槽位命名；profileId 规则一致。
        assert_eq!(forge_service("gitlab").unwrap(), "gitlab");
        assert_eq!(forge_service("gitea").unwrap(), "gitea");
        for service in ["gitlab", "gitea"] {
            assert!(forge_token_entry(service, None).is_ok());
            assert!(forge_token_entry(service, Some("default")).is_ok());
        }
        // service 白名单外（含大小写变体与 GitHub 本身——GitHub 走既有命令）拒绝。
        for bad in ["github", "GitHub", "", "gitlab.com", "bitbucket"] {
            assert!(forge_service(bad).is_err(), "{bad}");
        }
    }

}
