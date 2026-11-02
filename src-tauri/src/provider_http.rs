//! Shared provider transport: no redirects, bounded bodies and cancellable requests.
use serde::{Deserialize, Serialize};
use std::{collections::HashMap, sync::{LazyLock, Mutex}, time::{Duration, Instant}};
use tokio::sync::watch;

const MAX_RESPONSE_BYTES: usize = 32 * 1024 * 1024;
const MAX_REQUESTS: usize = 512;
static CLIENT: LazyLock<reqwest::Client> = LazyLock::new(|| {
    reqwest::Client::builder().timeout(Duration::from_secs(30))
        .connect_timeout(Duration::from_secs(10)).redirect(reqwest::redirect::Policy::none())
        .user_agent("AuuGit").build().expect("provider HTTP client")
});

struct RequestSlot { cancel: watch::Sender<bool>, started: bool, created: Instant }
static REQUESTS: LazyLock<Mutex<HashMap<String, RequestSlot>>> = LazyLock::new(|| Mutex::new(HashMap::new()));

#[derive(Deserialize)]
pub(crate) struct ProviderHttpRequest {
    pub(crate) id: String,
    pub(crate) method: String,
    pub(crate) url: String,
    #[serde(default)]
    pub(crate) headers: HashMap<String, String>,
    #[serde(default)]
    pub(crate) body: Option<String>,
}
#[derive(Serialize, Debug)]
pub(crate) struct ProviderHttpResponse { pub(crate) status: u16, pub(crate) headers: HashMap<String, String>, pub(crate) body: String }

fn valid_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= 128 && id.bytes().all(|byte| byte.is_ascii_alphanumeric() || b"-_".contains(&byte))
}
pub(crate) fn validate_provider_request(method: &str, url: &str, headers: &HashMap<String, String>) -> Result<(), String> {
    let parsed = reqwest::Url::parse(url).map_err(|_| "Invalid provider URL".to_string())?;
    if !matches!(parsed.scheme(), "http" | "https") || parsed.host_str().is_none()
        || !parsed.username().is_empty() || parsed.password().is_some() || parsed.fragment().is_some() {
        return Err("Provider URL must use HTTP(S) without credentials or fragments".into());
    }
    reqwest::Method::from_bytes(method.as_bytes()).map_err(|error| error.to_string())?;
    for (name, value) in headers {
        reqwest::header::HeaderName::from_bytes(name.as_bytes()).map_err(|error| error.to_string())?;
        reqwest::header::HeaderValue::from_str(value).map_err(|error| error.to_string())?;
        if matches!(name.to_ascii_lowercase().as_str(), "host" | "content-length" | "transfer-encoding" | "connection") {
            return Err("Transport headers are managed by the host".into());
        }
    }
    Ok(())
}
fn prune(requests: &mut HashMap<String, RequestSlot>) {
    requests.retain(|_, slot| slot.started || slot.created.elapsed() < Duration::from_secs(60));
}
struct RequestGuard(String);
impl Drop for RequestGuard {
    fn drop(&mut self) { REQUESTS.lock().unwrap_or_else(|error| error.into_inner()).remove(&self.0); }
}
fn register(id: &str) -> Result<(RequestGuard, watch::Receiver<bool>), String> {
    if !valid_id(id) { return Err("Invalid provider request ID".into()); }
    let mut requests = REQUESTS.lock().unwrap_or_else(|error| error.into_inner());
    prune(&mut requests);
    if requests.get(id).is_some_and(|slot| slot.started) { return Err("Duplicate provider request ID".into()); }
    if !requests.contains_key(id) && requests.len() >= MAX_REQUESTS { return Err("Too many provider requests".into()); }
    let slot = requests.entry(id.into()).or_insert_with(|| RequestSlot { cancel: watch::channel(false).0, started: false, created: Instant::now() });
    slot.started = true;
    Ok((RequestGuard(id.into()), slot.cancel.subscribe()))
}
#[tauri::command]
pub(crate) fn cancel_provider_http_request(id: String) -> Result<(), String> {
    if !valid_id(&id) { return Err("Invalid provider request ID".into()); }
    let mut requests = REQUESTS.lock().unwrap_or_else(|error| error.into_inner());
    prune(&mut requests);
    if !requests.contains_key(&id) && requests.len() >= MAX_REQUESTS { return Err("Too many provider requests".into()); }
    // Retain early cancellation: IPC cancellation can arrive before request registration.
    let slot = requests.entry(id).or_insert_with(|| RequestSlot { cancel: watch::channel(true).0, started: false, created: Instant::now() });
    slot.cancel.send_replace(true);
    Ok(())
}
async fn read_response(mut response: reqwest::Response, limit: usize) -> Result<ProviderHttpResponse, String> {
    if response.content_length().is_some_and(|length| length > limit as u64) { return Err("Provider response too large".into()); }
    let status = response.status().as_u16();
    let headers = response.headers().iter().filter_map(|(name, value)| value.to_str().ok().map(|value| (name.to_string(), value.to_string()))).collect();
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|error| error.to_string())? {
        if chunk.len() > limit.saturating_sub(bytes.len()) { return Err("Provider response too large".into()); }
        bytes.extend_from_slice(&chunk);
    }
    let body = String::from_utf8(bytes).map_err(|_| "Provider response is not UTF-8".to_string())?;
    Ok(ProviderHttpResponse { status, headers, body })
}
#[tauri::command]
pub(crate) async fn provider_http_request(request: ProviderHttpRequest) -> Result<ProviderHttpResponse, String> {
    validate_provider_request(&request.method, &request.url, &request.headers)?;
    let (_guard, mut cancelled) = register(&request.id)?;
    if *cancelled.borrow() { return Err("Provider request aborted".into()); }
    let operation = async {
        let method = reqwest::Method::from_bytes(request.method.as_bytes()).map_err(|error| error.to_string())?;
        let mut pending = CLIENT.request(method, &request.url);
        for (name, value) in &request.headers {
            let mut value = reqwest::header::HeaderValue::from_str(value).map_err(|error| error.to_string())?;
            value.set_sensitive(true);
            pending = pending.header(name, value);
        }
        if let Some(body) = request.body { pending = pending.body(body); }
        read_response(pending.send().await.map_err(|error| error.to_string())?, MAX_RESPONSE_BYTES).await
    };
    tokio::select! {
        biased;
        _ = cancelled.changed() => Err("Provider request aborted".into()),
        result = operation => result,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{io::{Read, Write}, net::TcpListener, sync::atomic::{AtomicU64, Ordering}, thread};
    static NEXT: AtomicU64 = AtomicU64::new(1);
    fn id() -> String { format!("http-test-{}", NEXT.fetch_add(1, Ordering::Relaxed)) }
    fn request(id: String, url: String) -> ProviderHttpRequest {
        ProviderHttpRequest { id, method: "GET".into(), url, headers: HashMap::new(), body: None }
    }
    fn server(response: &'static str) -> (String, thread::JoinHandle<String>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let url = format!("http://{}", listener.local_addr().unwrap());
        let handle = thread::spawn(move || {
            let (mut socket, _) = listener.accept().unwrap();
            socket.set_read_timeout(Some(Duration::from_secs(3))).unwrap();
            let mut bytes = [0; 4096]; let count = socket.read(&mut bytes).unwrap();
            socket.write_all(response.as_bytes()).unwrap();
            String::from_utf8_lossy(&bytes[..count]).to_string()
        });
        (url, handle)
    }
    #[test]
    fn urls_and_headers_are_validated() {
        for url in ["file:///etc/passwd", "https://user:secret@example.com/", "https://example.com/#fragment", "https://"] {
            assert!(validate_provider_request("GET", url, &HashMap::new()).is_err());
        }
        for name in ["Host", "Content-Length", "Transfer-Encoding", "Connection"] {
            assert!(validate_provider_request("GET", "https://example.com", &HashMap::from([(name.into(), "x".into())])).is_err());
        }
    }
    #[tokio::test]
    async fn redirects_never_forward_provider_credentials() {
        let (url, handle) = server("HTTP/1.1 302 Found\r\nLocation: http://127.0.0.1:1/stolen\r\nContent-Length: 0\r\n\r\n");
        let mut input = request(id(), url); input.headers.insert("PRIVATE-TOKEN".into(), "synthetic-test-token".into());
        assert_eq!(provider_http_request(input).await.unwrap().status, 302);
        assert!(handle.join().unwrap().to_lowercase().contains("private-token: synthetic-test-token"));
    }
    #[tokio::test]
    async fn cancellation_before_registration_never_connects() {
        let id = id(); cancel_provider_http_request(id.clone()).unwrap();
        assert!(provider_http_request(request(id.clone(), "http://127.0.0.1:1".into())).await.unwrap_err().contains("aborted"));
        assert!(!REQUESTS.lock().unwrap().contains_key(&id));
    }
    #[tokio::test]
    async fn active_cancellation_drops_the_pending_request() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let url = format!("http://{}", listener.local_addr().unwrap());
        let id = id(); let active_id = id.clone();
        let handle = thread::spawn(move || {
            let (mut socket, _) = listener.accept().unwrap(); socket.set_read_timeout(Some(Duration::from_secs(3))).unwrap();
            let mut bytes = [0; 4096]; let _ = socket.read(&mut bytes).unwrap();
            cancel_provider_http_request(active_id).unwrap();
            socket.read(&mut bytes).unwrap_or(0)
        });
        assert!(provider_http_request(request(id.clone(), url)).await.unwrap_err().contains("aborted"));
        assert_eq!(handle.join().unwrap(), 0);
        assert!(!REQUESTS.lock().unwrap().contains_key(&id));
    }
    #[tokio::test]
    async fn bodies_are_bounded_with_and_without_content_length() {
        for response in ["HTTP/1.1 200 OK\r\nContent-Length: 9\r\n\r\n123456789", "HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n9\r\n123456789\r\n0\r\n\r\n"] {
            let (url, handle) = server(response);
            let response = CLIENT.get(url).send().await.unwrap();
            assert!(read_response(response, 8).await.unwrap_err().contains("too large")); handle.join().unwrap();
        }
    }
}
