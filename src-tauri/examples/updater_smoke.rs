//! Headless opt-in updater exercise. The JS runner supplies an isolated app
//! identity, ephemeral signing key, loopback endpoint and temporary install root.
use std::path::PathBuf;
use tauri_plugin_updater::UpdaterExt;

fn main() {
    let root = PathBuf::from(std::env::var("AUUGIT_UPDATER_SMOKE_ROOT").expect("smoke root"));
    let root = root.canonicalize().expect("existing smoke root");
    assert!(root.starts_with(std::env::temp_dir().canonicalize().unwrap()));
    assert!(root.file_name().unwrap().to_string_lossy().starts_with("auugit-updater-smoke-"));
    let reject = std::env::var_os("AUUGIT_UPDATER_SMOKE_REJECT").is_some();
    let result = root.join(if reject { "tampered-result.json" } else { "install-result.json" });
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(move |app| {
            if app.config().identifier != "com.auu.gitclient.quality-smoke" {
                return Err("updater smoke requires its isolated application identity".into());
            }
            let config: serde_json::Value = serde_json::from_str(&std::env::var("TAURI_CONFIG")?)?;
            let from_version = config["version"].as_str().ok_or("source version")?.to_owned();
            let expected_version = std::env::var("AUUGIT_UPDATER_SMOKE_VERSION")?;
            for endpoint in config["plugins"]["updater"]["endpoints"].as_array().ok_or("smoke endpoints")? {
                let url = reqwest::Url::parse(endpoint.as_str().ok_or("endpoint URL")?)?;
                if url.host_str() != Some("127.0.0.1") { return Err("only loopback smoke endpoints are allowed".into()); }
            }
            let handle = app.handle().clone();
            let updater = handle.updater_builder()
                .executable_path(root.join("installed/auugit-quality-smoke.exe"))
                .installer_arg(format!("/D={}", root.join("installed").display()))
                .restart_after_install(false)
                .build()?;
            tauri::async_runtime::spawn(async move {
                let outcome = async {
                    let update = updater.check().await?.ok_or("newer smoke update was not discovered")?;
                    if update.current_version != from_version || update.version != expected_version {
                        return Err("unexpected smoke update versions".into());
                    }
                    let bytes = match update.download(|_, _| {}, || {}).await {
                        Ok(bytes) => {
                            if reject { return Err("tampered update unexpectedly verified".into()); }
                            bytes
                        }
                        Err(error) if reject => {
                            let message = error.to_string();
                            if !message.to_lowercase().contains("signature") { return Err(format!("unexpected rejection: {message}").into()); }
                            std::fs::write(&result, serde_json::json!({ "stage": "signature-rejected", "error": message }).to_string())?;
                            return Ok::<(), Box<dyn std::error::Error + Send + Sync>>(());
                        }
                        Err(error) => return Err(error.into()),
                    };
                    std::fs::write(&result, serde_json::json!({ "stage": "verified-install-requested", "bytes": bytes.len(), "version": update.version }).to_string())?;
                    update.install(bytes)?; // Windows starts NSIS and exits this helper.
                    Ok(())
                }.await;
                if let Err(error) = outcome {
                    let _ = std::fs::write(&result, serde_json::json!({ "stage": "failed", "error": error.to_string() }).to_string());
                    handle.exit(1);
                } else {
                    handle.exit(0);
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("updater smoke runtime");
}
