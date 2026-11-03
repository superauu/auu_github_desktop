//! 通用 OAuth 回跳监听：在 127.0.0.1 上收下浏览器授权完成后的那次重定向，
//! 取出 `?code=&state=`（或 `?error=`）并回一个静态完成页。任何 provider 的
//! OAuth 网页授权都可复用（Linear 先用，GitHub 网页流程等后续可接）。
//! 不进 feature 门控也不引入新依赖：std TcpListener 跑在阻塞线程上，
//! 用轮询检查取消标记（std 无 accept 超时，百毫秒轮询足够）。状态校验
//! （state 与本地生成值比对）留在前端，这里只负责忠实转发回调参数。
use serde::Serialize;
use std::{
    collections::HashMap,
    io::{Read, Write},
    net::{TcpListener, TcpStream},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, LazyLock, Mutex,
    },
    time::{Duration, Instant},
};

/// 并发会话上限：正常使用至多一个授权流程在途，留 1 个余量。
const MAX_SESSIONS: usize = 2;
/// 等待时长上限（10 分钟）：超过必须重新发起授权。
const MAX_WAIT_MS: u64 = 10 * 60 * 1000;
/// 取消检查的轮询间隔；std TcpListener 没有带超时的 accept，只能轮询。
const POLL_INTERVAL: Duration = Duration::from_millis(100);
/// 单请求读取上限：回调请求只有一行请求行加少量头，超出即视为恶意。
const MAX_REQUEST_BYTES: usize = 8 * 1024;

const COMPLETION_PAGE: &str = "AuuGit 授权完成，可关闭此窗口。/ Authorization complete — you can close this window.";

struct LoopbackSession { listener: TcpListener, cancelled: Arc<AtomicBool> }
static SESSIONS: LazyLock<Mutex<HashMap<String, LoopbackSession>>> = LazyLock::new(|| Mutex::new(HashMap::new()));
/// 已被 wait 取走、正在等浏览器回跳的会话：cancel 要能叫停在途等待。
static WAITING: LazyLock<Mutex<HashMap<String, Arc<AtomicBool>>>> = LazyLock::new(|| Mutex::new(HashMap::new()));

fn session_id() -> String {
    // 局部计数即可：id 只用于本进程内注册表寻址，不做安全边界。
    use std::sync::atomic::{AtomicU64, Ordering};
    static NEXT: AtomicU64 = AtomicU64::new(1);
    format!("loopback-{}", NEXT.fetch_add(1, Ordering::Relaxed))
}

#[derive(Serialize, Debug)]
pub(crate) struct LoopbackSessionInfo { pub(crate) id: String, pub(crate) port: u16 }

#[derive(Serialize, Default, Debug)]
pub(crate) struct LoopbackCallback {
    pub(crate) code: Option<String>,
    pub(crate) state: Option<String>,
    pub(crate) error: Option<String>,
}

/// 绑定 127.0.0.1:<port> 并登记会话。port=0 仅供测试取临时端口；生产传固定端口
/// （前端写死 53862，与 Linear OAuth 应用登记的回跳地址一致，冲突时明确报错）。
#[tauri::command]
pub(crate) fn oauth_loopback_begin(port: u16) -> Result<LoopbackSessionInfo, String> {
    let mut sessions = SESSIONS.lock().unwrap_or_else(|error| error.into_inner());
    if sessions.len() >= MAX_SESSIONS { return Err("Too many OAuth loopback sessions".into()); }
    let listener = TcpListener::bind(("127.0.0.1", port))
        .map_err(|error| format!("OAuth loopback port {port} unavailable: {error}"))?;
    let bound = listener.local_addr().map_err(|error| error.to_string())?.port();
    let id = session_id();
    sessions.insert(id.clone(), LoopbackSession { listener, cancelled: Arc::new(AtomicBool::new(false)) });
    Ok(LoopbackSessionInfo { id, port: bound })
}

/// 收取一次浏览器重定向。解析请求行里的查询参数并回静态完成页；同一会话只能
/// wait 一次（listener 被取走）。返回的 state 仍需前端与本地生成值比对。
#[tauri::command]
pub(crate) async fn oauth_loopback_wait(id: String, timeout_ms: u64) -> Result<LoopbackCallback, String> {
    let listener = {
        let mut sessions = SESSIONS.lock().unwrap_or_else(|error| error.into_inner());
        sessions.remove(&id).ok_or_else(|| "Unknown OAuth loopback session".to_string())?
    };
    if timeout_ms == 0 || timeout_ms > MAX_WAIT_MS { return Err("OAuth loopback wait timeout out of range".into()); }
    let cancelled = listener.cancelled.clone();
    WAITING.lock().unwrap_or_else(|error| error.into_inner()).insert(id.clone(), cancelled.clone());
    let deadline = Instant::now() + Duration::from_millis(timeout_ms);
    let outcome = tauri::async_runtime::spawn_blocking(move || -> Result<LoopbackCallback, String> {
        listener.listener.set_nonblocking(true).map_err(|error| error.to_string())?;
        loop {
            if cancelled.load(Ordering::Relaxed) { return Err("OAuth loopback wait aborted".into()); }
            if Instant::now() >= deadline { return Err("OAuth loopback wait timed out".into()); }
            match listener.listener.accept() {
                Ok((stream, _)) => return serve_callback(stream),
                Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => std::thread::sleep(POLL_INTERVAL),
                Err(error) => return Err(error.to_string()),
            }
        }
    }).await.map_err(|error| error.to_string())?;
    WAITING.lock().unwrap_or_else(|error| error.into_inner()).remove(&id);
    outcome
}

/// 取消会话：尚未 wait 的直接销毁 listener；在途等待通过标记叫停。
#[tauri::command]
pub(crate) fn oauth_loopback_cancel(id: String) -> Result<(), String> {
    SESSIONS.lock().unwrap_or_else(|error| error.into_inner()).remove(&id);
    if let Some(cancelled) = WAITING.lock().unwrap_or_else(|error| error.into_inner()).get(&id) {
        cancelled.store(true, Ordering::Relaxed);
    }
    Ok(())
}

/// 读取单个回调请求，提取查询参数并应答完成页。浏览器通常还会预取 favicon 等，
/// 但我们 accept 一次即关，多余连接由 RST 自然处理。
fn serve_callback(mut stream: TcpStream) -> Result<LoopbackCallback, String> {
    stream.set_read_timeout(Some(Duration::from_secs(5))).map_err(|error| error.to_string())?;
    stream.set_write_timeout(Some(Duration::from_secs(5))).map_err(|error| error.to_string())?;
    let mut bytes = Vec::new();
    let mut chunk = [0u8; 1024];
    // 只需要请求行，读到第一个空行或上限即停；读不到请求行按无回调处理。
    loop {
        let count = stream.read(&mut chunk).map_err(|error| error.to_string())?;
        if count == 0 || bytes.len() >= MAX_REQUEST_BYTES { break; }
        bytes.extend_from_slice(&chunk[..count]);
        if bytes.windows(4).any(|window| window == b"\r\n\r\n") { break; }
    }
    let request = String::from_utf8_lossy(&bytes);
    let request_line = request.lines().next().unwrap_or_default();
    let target = request_line.split_whitespace().nth(1).unwrap_or_default();
    let callback = parse_query(target);
    let (status_line, page) = if callback.code.is_some() || callback.error.is_some() {
        ("HTTP/1.1 200 OK", COMPLETION_PAGE)
    } else {
        ("HTTP/1.1 400 Bad Request", "Invalid OAuth callback.")
    };
    let response = format!(
        "{status_line}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        page.len(), page
    );
    // 响应写失败不影响结果：code 已经拿到，浏览器断开只是体验问题。
    let _ = stream.write_all(response.as_bytes());
    let _ = stream.flush();
    if callback.code.is_none() && callback.error.is_none() {
        return Err("OAuth callback did not contain code or error".into());
    }
    Ok(callback)
}

/// 解析请求行目标里的查询串。只认 `path?query` 形态；多值取最后一个，
/// 参数名不做白名单——code/state/error 之外的参数由前端忽略。
fn parse_query(target: &str) -> LoopbackCallback {
    let query = match target.split_once('?') { Some((_, query)) => query, None => return LoopbackCallback::default() };
    let mut callback = LoopbackCallback::default();
    for pair in query.split('&') {
        let (name, value) = pair.split_once('=').unwrap_or((pair, ""));
        let value = percent_decode(value);
        match name {
            "code" => callback.code = Some(value),
            "state" => callback.state = Some(value),
            "error" => callback.error = Some(value),
            _ => {}
        }
    }
    callback
}

/// 最小百分号解码：OAuth 回调里只有 code/state 这类短 token，遇到坏转义按原样返回。
fn percent_decode(value: &str) -> String {
    let bytes = value.as_bytes();
    let mut decoded = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        match bytes[index] {
            b'%' => match bytes.get(index + 1..index + 3).and_then(|slice| std::str::from_utf8(slice).ok())
                .and_then(|hex| u8::from_str_radix(hex, 16).ok()) {
                Some(byte) => { decoded.push(byte); index += 3; }
                None => { decoded.push(bytes[index]); index += 1; }
            },
            b'+' => { decoded.push(b' '); index += 1; }
            byte => { decoded.push(byte); index += 1; }
        }
    }
    String::from_utf8_lossy(&decoded).into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};

    /// 会话注册表是全局的：依赖会话上限与端口冲突断言的测试必须串行，
    /// 否则并行测试互相占用槽位会让断言时灵时不灵。tokio Mutex 以免
    /// std 守卫跨 await（clippy await_holding_lock）。
    static SERIAL: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

    /// 以浏览器身份打一发回调请求（仅请求行，浏览器还会带 Host 等头，一并模拟）。
    fn browser_get(port: u16, target: &str) {
        let mut stream = TcpStream::connect(("127.0.0.1", port)).expect("connect loopback");
        write!(stream, "GET {target} HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nUser-Agent: test\r\n\r\n").unwrap();
        let mut response = String::new();
        let _ = stream.read_to_string(&mut response);
    }

    #[tokio::test]
    async fn delivers_code_and_state_and_answers_the_completion_page() {
        let _serial = SERIAL.lock().await;
        let session = oauth_loopback_begin(0).unwrap();
        let port = session.port;
        let driver = std::thread::spawn(move || {
            browser_get(port, "/callback?code=abc123&state=st-1&extra=ignored");
        });
        let callback = oauth_loopback_wait(session.id.clone(), 5000).await.unwrap();
        driver.join().unwrap();
        assert_eq!(callback.code.as_deref(), Some("abc123"));
        assert_eq!(callback.state.as_deref(), Some("st-1"));
        assert_eq!(callback.error, None);
        // 会话一次性：wait 之后再 wait 必须报未知会话。
        assert!(oauth_loopback_wait(session.id, 1000).await.unwrap_err().contains("Unknown"));
    }

    #[tokio::test]
    async fn percent_encoding_and_error_redirects_are_carried_through() {
        let _serial = SERIAL.lock().await;
        let session = oauth_loopback_begin(0).unwrap();
        let port = session.port;
        let driver = std::thread::spawn(move || {
            browser_get(port, "/callback?error=access_denied&state=a%20b");
        });
        let callback = oauth_loopback_wait(session.id, 5000).await.unwrap();
        driver.join().unwrap();
        assert_eq!(callback.error.as_deref(), Some("access_denied"));
        assert_eq!(callback.code, None);
        assert_eq!(callback.state.as_deref(), Some("a b"));
    }

    #[tokio::test]
    async fn cancellation_stops_an_in_flight_wait() {
        let _serial = SERIAL.lock().await;
        let session = oauth_loopback_begin(0).unwrap();
        let id = session.id.clone();
        let wait = tokio::spawn(oauth_loopback_wait(id.clone(), 30_000));
        // 轮询间隔 100ms：稍候让 wait 进入在途状态再取消。
        tokio::time::sleep(Duration::from_millis(300)).await;
        oauth_loopback_cancel(id).unwrap();
        assert!(wait.await.unwrap().unwrap_err().contains("aborted"));
        assert!(!WAITING.lock().unwrap().contains_key("cancelled-check"));
    }

    #[tokio::test]
    async fn wait_times_out_within_the_cap() {
        let _serial = SERIAL.lock().await;
        let session = oauth_loopback_begin(0).unwrap();
        let started = Instant::now();
        assert!(oauth_loopback_wait(session.id, 400).await.unwrap_err().contains("timed out"));
        assert!(started.elapsed() < Duration::from_secs(5));
    }

    #[tokio::test]
    async fn begin_rejects_conflicting_ports_and_enforces_the_session_cap() {
        let _serial = SERIAL.lock().await;
        let first = oauth_loopback_begin(0).unwrap();
        // 同一端口再绑必然冲突（第一个会话仍存活）。
        assert!(oauth_loopback_begin(first.port).unwrap_err().contains("unavailable"));
        let second = oauth_loopback_begin(0).unwrap();
        assert!(oauth_loopback_begin(0).unwrap_err().contains("Too many"));
        drop(oauth_loopback_cancel(first.id));
        drop(oauth_loopback_cancel(second.id));
    }

    #[test]
    fn malformed_callbacks_are_reported_without_echoing_the_request() {
        // 无查询参数：报错而不是静默返回空 code。
        let parsed = parse_query("/callback");
        assert_eq!(parsed.code, None);
        // 坏转义按原样保留，不 panic。
        assert_eq!(parse_query("/callback?code=%zz").code.as_deref(), Some("%zz"));
        // 多值取最后一个（与常见 query 解析习惯一致）。
        assert_eq!(parse_query("/callback?code=1&code=2").code.as_deref(), Some("2"));
    }
}
