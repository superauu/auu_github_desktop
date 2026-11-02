//! GitHub native protocol contribution. Excluded when plugin-github is disabled.
use crate::{http_client, response_text};

#[tauri::command]
pub(crate) async fn request_github_device_code(client_id: String, scope: String) -> Result<String, String> {
    let response = http_client()?.post("https://github.com/login/device/code").header("Accept", "application/json")
        .form(&[("client_id", client_id), ("scope", scope)]).send().await.map_err(|e| e.to_string())?;
    response_text(response).await
}

#[tauri::command]
pub(crate) async fn poll_github_device_token(client_id: String, device_code: String) -> Result<String, String> {
    let response = http_client()?.post("https://github.com/login/oauth/access_token").header("Accept", "application/json")
        .form(&[("client_id", client_id), ("device_code", device_code), ("grant_type", "urn:ietf:params:oauth:grant-type:device_code".into())])
        .send().await.map_err(|e| e.to_string())?;
    response_text(response).await
}

#[tauri::command]
pub(crate) async fn get_github_job_logs(owner: String, repo: String, job_id: u64, token: Option<String>) -> Result<String, String> {
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
        // 错误消息只保留主机名：签名 URL 的 query 带授权凭据，不能进错误串或日志。
        return response_text(client.get(url).send().await.map_err(|e| format!("Job log download failed ({})", e.url().and_then(reqwest::Url::host_str).unwrap_or("unknown host")))?).await;
    }
    response_text(response).await
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
pub(crate) fn store_github_token(token: String, profile_id: Option<String>) -> Result<(), String> {
    let entry = github_token_entry(profile_id.as_deref())?;
    entry.set_password(&token).map_err(|e| e.to_string())
}

#[tauri::command(async)]
pub(crate) fn get_github_token(profile_id: Option<String>) -> Result<Option<String>, String> {
    let entry = github_token_entry(profile_id.as_deref())?;
    match entry.get_password() {
        Ok(token) => Ok(Some(token)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command(async)]
pub(crate) fn delete_github_token(profile_id: Option<String>) -> Result<(), String> {
    let entry = github_token_entry(profile_id.as_deref())?;
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
