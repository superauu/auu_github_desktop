//! Hidden, isolated WebView exercises the real IPC transport and credential store.
#[path = "../src/provider_http.rs"]
mod provider_http;
#[path = "../src/plugins/legacy_credentials.rs"]
mod legacy_credentials;
use std::path::PathBuf;

struct SmokeState(PathBuf);
#[tauri::command]
fn report_integration_smoke(app: tauri::AppHandle, state: tauri::State<'_, SmokeState>, report: serde_json::Value) -> Result<(), String> {
    std::fs::write(&state.0, report.to_string()).map_err(|error| error.to_string())?;
    app.exit(if report["success"].as_bool() == Some(true) { 0 } else { 1 });
    Ok(())
}
fn main() {
    let root = PathBuf::from(std::env::var("AUUGIT_INTEGRATION_SMOKE_ROOT").expect("smoke root")).canonicalize().expect("existing smoke root");
    assert!(root.starts_with(std::env::temp_dir().canonicalize().unwrap()));
    assert!(root.file_name().unwrap().to_string_lossy().starts_with("auugit-integration-smoke-"));
    let script = std::fs::read_to_string(root.join("smoke.js")).expect("built smoke script");
    let config = std::env::var("AUUGIT_INTEGRATION_SMOKE_CONFIG").expect("smoke configuration");
    let settings: serde_json::Value = serde_json::from_str(&config).expect("valid smoke configuration");
    let endpoint = reqwest::Url::parse(settings["server"].as_str().expect("loopback endpoint")).unwrap();
    assert_eq!(endpoint.host_str(), Some("127.0.0.1"));
    let profile = settings["profile"].as_str().expect("isolated credential profile");
    assert!(profile.starts_with("native-smoke-") && profile.bytes().all(|byte| byte.is_ascii_alphanumeric() || byte == b'-'));
    if std::env::args().any(|arg| arg == "--cleanup") {
        legacy_credentials::delete_forge_token("gitlab".into(), Some(profile.into())).expect("clean smoke credential");
        return;
    }
    let report = root.join("result.json");
    tauri::Builder::default()
        .manage(SmokeState(report.clone()))
        .invoke_handler(tauri::generate_handler![
            provider_http::provider_http_request, provider_http::cancel_provider_http_request,
            legacy_credentials::store_forge_token, legacy_credentials::get_forge_token, legacy_credentials::delete_forge_token,
            report_integration_smoke,
        ])
        .setup(move |app| {
            if app.config().identifier != "com.auu.gitclient.integration-smoke" { return Err("isolated smoke identity required".into()); }
            let initialization = format!(r#"
                window.__AUUGIT_SMOKE_CONFIG__ = {config};
                const reportBootError = error => {{
                    const send = () => window.__TAURI_INTERNALS__?.invoke
                        ? window.__TAURI_INTERNALS__.invoke('report_integration_smoke', {{ report: {{ success: false, error: String(error?.message || error) }} }})
                        : setTimeout(send, 20);
                    send();
                }};
                window.addEventListener('error', event => reportBootError(event.error || event.message));
                window.addEventListener('unhandledrejection', event => reportBootError(event.reason));
                const startSmoke = () => {{ try {{ {script} }} catch (error) {{ reportBootError(error); }} }};
                if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startSmoke, {{ once: true }});
                else startSmoke();
            "#);
            tauri::WebviewWindowBuilder::new(app, "main", tauri::WebviewUrl::App("index.html".into()))
                .visible(false).icon(tauri::image::Image::new_owned(vec![20, 180, 210, 255], 1, 1))?
                .initialization_script(initialization).build()?;
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_secs(60));
                if !report.exists() {
                    let _ = std::fs::write(report, r#"{"success":false,"error":"WebView smoke timed out"}"#);
                    handle.exit(1);
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!()).expect("integration smoke runtime");
}
