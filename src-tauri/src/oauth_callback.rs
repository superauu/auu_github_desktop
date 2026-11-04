//! 通用 OAuth 回跳监听：在 127.0.0.1 上收下浏览器授权完成后的那次重定向，
//! 取出 `?code=&state=`（或 `?error=`）并回一个完成页。任何 provider 的
//! OAuth 网页授权都可复用（Linear 先用，GitHub 网页流程等后续可接）。
//! 完成页是通用的：provider 展示名与界面语言由前端在 begin 时传入，
//! 文案跟随用户选择的语言，成功/失败/无效回调各有一套版式。
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

/// 完成页语言的取值口径与应用设置一致：只认 "en"，其余一律中文（应用默认语言）。
#[derive(Clone, Copy, PartialEq, Eq)]
enum PageLang { Zh, En }

impl PageLang {
    fn from_language(language: Option<&str>) -> Self {
        if language == Some("en") { Self::En } else { Self::Zh }
    }

    fn attribute(self) -> &'static str {
        match self { Self::Zh => "zh-CN", Self::En => "en" }
    }
}

/// 完成页的三种结局：授权成功、provider 返回错误、非授权流程的误访问。
#[derive(Clone, Copy)]
enum PageKind { Success, Error, Invalid }

struct LoopbackSession {
    listener: TcpListener,
    cancelled: Arc<AtomicBool>,
    lang: PageLang,
    provider: String,
}
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
/// `language` 决定完成页文案（前端传 settings.language），`provider` 是完成页上的
/// 平台展示名（如 "Linear"），两者都只影响回给浏览器的静态页。
#[tauri::command]
pub(crate) fn oauth_loopback_begin(port: u16, language: Option<String>, provider: Option<String>) -> Result<LoopbackSessionInfo, String> {
    let mut sessions = SESSIONS.lock().unwrap_or_else(|error| error.into_inner());
    if sessions.len() >= MAX_SESSIONS { return Err("Too many OAuth loopback sessions".into()); }
    let listener = TcpListener::bind(("127.0.0.1", port))
        .map_err(|error| format!("OAuth loopback port {port} unavailable: {error}"))?;
    let bound = listener.local_addr().map_err(|error| error.to_string())?.port();
    let id = session_id();
    // provider 只用于展示：去空白并限长，异常值不至于把页面撑坏。
    let provider: String = provider.unwrap_or_default().trim().chars().take(60).collect();
    sessions.insert(id.clone(), LoopbackSession {
        listener,
        cancelled: Arc::new(AtomicBool::new(false)),
        lang: PageLang::from_language(language.as_deref()),
        provider,
    });
    Ok(LoopbackSessionInfo { id, port: bound })
}

/// 收取一次浏览器重定向。解析请求行里的查询参数并回静态完成页；同一会话只能
/// wait 一次（listener 被取走）。返回的 state 仍需前端与本地生成值比对。
#[tauri::command]
pub(crate) async fn oauth_loopback_wait(id: String, timeout_ms: u64) -> Result<LoopbackCallback, String> {
    let LoopbackSession { listener, cancelled, lang, provider } = {
        let mut sessions = SESSIONS.lock().unwrap_or_else(|error| error.into_inner());
        sessions.remove(&id).ok_or_else(|| "Unknown OAuth loopback session".to_string())?
    };
    if timeout_ms == 0 || timeout_ms > MAX_WAIT_MS { return Err("OAuth loopback wait timeout out of range".into()); }
    WAITING.lock().unwrap_or_else(|error| error.into_inner()).insert(id.clone(), cancelled.clone());
    let deadline = Instant::now() + Duration::from_millis(timeout_ms);
    let outcome = tauri::async_runtime::spawn_blocking(move || -> Result<LoopbackCallback, String> {
        listener.set_nonblocking(true).map_err(|error| error.to_string())?;
        loop {
            if cancelled.load(Ordering::Relaxed) { return Err("OAuth loopback wait aborted".into()); }
            if Instant::now() >= deadline { return Err("OAuth loopback wait timed out".into()); }
            match listener.accept() {
                Ok((stream, _)) => {
                    // 浏览器常有预连接/探测连接（favicon、预取）：没有回调参数的连接
                    // 应答 400 后继续等，真正的重定向在后续连接里。
                    match serve_callback(stream, lang, &provider) {
                        Ok(Some(callback)) => return Ok(callback),
                        Ok(None) => continue,
                        Err(error) => return Err(error),
                    }
                }
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

// ---- 完成页 -----------------------------------------------------------------
// 纯静态 HTML（无脚本、无外链资源）：浏览器回跳后看到的就是这一页。
// 暗色炭灰 + 青色点缀，与应用主题一致；成功/失败/无效三种状态共用一套版式。

const PAGE_STYLE: &str = r##"
* { box-sizing: border-box }
html, body { min-height: 100% }
body {
  margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 28px 20px;
  background:
    radial-gradient(90% 60% at 50% -10%, rgba(99, 232, 241, .09), transparent 65%),
    radial-gradient(120% 80% at 50% 120%, rgba(255, 255, 255, .03), transparent 60%),
    #0d1013;
  color: #e2e7ec; font: 15px/1.6 Inter, -apple-system, "Segoe UI", "Microsoft YaHei UI", "PingFang SC", "Noto Sans SC", sans-serif;
  -webkit-font-smoothing: antialiased;
}
.card {
  width: min(440px, 100%); padding: 38px 34px 28px; text-align: center;
  border: 1px solid rgba(255, 255, 255, .07); border-radius: 18px;
  background: linear-gradient(180deg, rgba(255, 255, 255, .045), rgba(255, 255, 255, 0) 42%), #16191e;
  box-shadow: 0 30px 70px -30px rgba(0, 0, 0, .8), inset 0 1px 0 rgba(255, 255, 255, .05);
}
.card[data-status="ok"] { --accent: #63e8f1; --accent-soft: rgba(99, 232, 241, .1); --accent-line: rgba(99, 232, 241, .35); --accent-glow: rgba(99, 232, 241, .45) }
.card[data-status="error"] { --accent: #ff6b8a; --accent-soft: rgba(255, 107, 138, .1); --accent-line: rgba(255, 107, 138, .34); --accent-glow: rgba(255, 107, 138, .4) }
.card[data-status="invalid"] { --accent: #93a1ae; --accent-soft: rgba(147, 161, 174, .1); --accent-line: rgba(147, 161, 174, .3); --accent-glow: rgba(147, 161, 174, .28) }
.brand { display: flex; align-items: center; justify-content: center; gap: 9px; margin-bottom: 30px }
.brand svg { width: 22px; height: 22px; filter: drop-shadow(0 0 8px rgba(99, 232, 241, .45)) }
.brand span { font-size: 14px; font-weight: 600; letter-spacing: .14em; color: #cfd6dc }
.status {
  width: 66px; height: 66px; margin: 0 auto 20px; display: grid; place-items: center; border-radius: 50%;
  background: var(--accent-soft); border: 1px solid var(--accent-line); box-shadow: 0 0 34px -6px var(--accent-glow);
}
.status svg { width: 30px; height: 30px; fill: none; stroke: var(--accent); stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round }
.status path { stroke-dasharray: 40; stroke-dashoffset: 40; animation: draw .55s cubic-bezier(.2, .8, .2, 1) .12s forwards }
@keyframes draw { to { stroke-dashoffset: 0 } }
h1 { margin: 0 0 10px; font-size: 22px; line-height: 1.3; font-weight: 600; letter-spacing: -.01em }
p { margin: 0 }
.lead { color: #c3ccd4 }
.detail {
  display: inline-block; max-width: 100%; margin-top: 14px; padding: 3px 9px; border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, .07); background: rgba(255, 255, 255, .05); color: #aab5be;
  font: 12px/1.5 ui-monospace, "JetBrains Mono", "Cascadia Mono", Menlo, Consolas, monospace; overflow-wrap: anywhere;
}
.hint { margin-top: 14px; color: #96a1ac; font-size: 13.5px }
footer {
  display: flex; align-items: center; justify-content: center; gap: 7px; margin-top: 30px; padding-top: 18px;
  border-top: 1px solid rgba(255, 255, 255, .05); color: #717d88; font-size: 12px;
}
footer .dot { width: 5px; height: 5px; border-radius: 50%; background: currentColor; opacity: .7 }
@media (max-width: 480px) { .card { padding: 30px 22px 24px; border-radius: 14px } h1 { font-size: 20px } }
@media (prefers-reduced-motion: reduce) { .status path { animation: none; stroke-dashoffset: 0 } }
"##;

const BRAND_MARK: &str = r##"<svg viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="brand" x1="0" y1="0" x2="24" y2="24"><stop stop-color="#8ff3f8"/><stop offset="1" stop-color="#21c7d9"/></linearGradient></defs><rect width="24" height="24" rx="7" fill="url(#brand)"/><path d="M12 6.2 17 17.6h-2.7l-.9-2.2H10.6l-.9 2.2H7L12 6.2Z" fill="#0b1013"/></svg>"##;

const ICON_SUCCESS: &str = r##"<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5.2 12.4 10 17.2 18.8 7.2"/></svg>"##;
const ICON_ERROR: &str = r##"<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 8l8 8"/><path d="M16 8l-8 8"/></svg>"##;
const ICON_INVALID: &str = r##"<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 2.4-3 4"/><path d="M11.9 17.2v.2"/></svg>"##;

/// 生成完成页。`provider` / `error` 都可能来自外部输入，进 HTML 前必须转义。
fn callback_page(lang: PageLang, kind: PageKind, provider: &str, error: Option<&str>) -> String {
    let provider = escape_html(&provider.chars().take(60).collect::<String>());
    let detail = error.map(|error| escape_html(&error.chars().take(120).collect::<String>()));
    let (status, icon, tab, title, lead, hint) = match (lang, kind) {
        (PageLang::Zh, PageKind::Success) => (
            "ok", ICON_SUCCESS, "授权完成 · AuuGit", "授权完成",
            if provider.is_empty() { "AuuGit 已完成授权。".to_string() } else { format!("AuuGit 已成功连接 {provider}。") },
            "可以关闭此窗口，回到 AuuGit 继续操作。",
        ),
        (PageLang::Zh, PageKind::Error) => (
            "error", ICON_ERROR, "授权未完成 · AuuGit", "授权未完成",
            if provider.is_empty() { "这次授权没有完成。".to_string() } else { format!("没有完成与 {provider} 的连接。") },
            "请关闭此窗口，回到 AuuGit 重试。",
        ),
        (PageLang::Zh, PageKind::Invalid) => (
            "invalid", ICON_INVALID, "无效的回调 · AuuGit", "无效的回调",
            "这个页面只能由授权流程打开。".to_string(),
            "请回到 AuuGit 重新发起连接。",
        ),
        (PageLang::En, PageKind::Success) => (
            "ok", ICON_SUCCESS, "Authorization complete · AuuGit", "Authorization complete",
            if provider.is_empty() { "AuuGit is now authorized.".to_string() } else { format!("AuuGit is now connected to {provider}.") },
            "You can close this window and return to the app.",
        ),
        (PageLang::En, PageKind::Error) => (
            "error", ICON_ERROR, "Authorization incomplete · AuuGit", "Authorization incomplete",
            if provider.is_empty() { "The authorization did not complete.".to_string() } else { format!("AuuGit could not finish connecting to {provider}.") },
            "Close this window and try again in AuuGit.",
        ),
        (PageLang::En, PageKind::Invalid) => (
            "invalid", ICON_INVALID, "Invalid callback · AuuGit", "Invalid callback",
            "This page is only reached from an authorization flow.".to_string(),
            "Return to AuuGit and start the connection again.",
        ),
    };
    let detail = match detail {
        Some(detail) => format!(r##"<p class="detail">{detail}</p>"##),
        None => String::new(),
    };
    let footer = match lang { PageLang::Zh => "本机回跳 · 127.0.0.1", PageLang::En => "Local callback · 127.0.0.1" };
    format!(
        r##"<!doctype html>
<html lang="{html_lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="robots" content="noindex">
<title>{tab}</title>
<style>{PAGE_STYLE}</style>
</head>
<body>
<main class="card" data-status="{status}">
  <div class="brand">{BRAND_MARK}<span>AuuGit</span></div>
  <div class="status" role="img" aria-label="{title}">{icon}</div>
  <h1>{title}</h1>
  <p class="lead">{lead}</p>
  {detail}
  <p class="hint">{hint}</p>
  <footer><span class="dot"></span>{footer}</footer>
</main>
</body>
</html>
"##,
        html_lang = lang.attribute(),
    )
}

/// 最小 HTML 转义：完成页会把 provider 名与错误码写进文本节点。
fn escape_html(value: &str) -> String {
    let mut escaped = String::with_capacity(value.len());
    for character in value.chars() {
        match character {
            '&' => escaped.push_str("&amp;"),
            '<' => escaped.push_str("&lt;"),
            '>' => escaped.push_str("&gt;"),
            '"' => escaped.push_str("&quot;"),
            '\'' => escaped.push_str("&#39;"),
            other => escaped.push(other),
        }
    }
    escaped
}

/// 读取单个回调请求，提取查询参数并应答完成页。
/// 返回 `Ok(None)` 表示这条连接没有回调参数（浏览器预连接/favicon 探测）：
/// 已应答 400，调用方应继续 accept 等真正的重定向。
///
/// Windows 坑：accept 出来的流**继承监听器的非阻塞模式**，浏览器重定向的数据
/// 往往还没抵达，`read` 会立即返回 WSAEWOULDBLOCK（os error 10035）——必须把
/// 流切回阻塞模式再读，靠 5 秒读超时兜底，否则就撞上「非阻止性套接字操作」。
fn serve_callback(mut stream: TcpStream, lang: PageLang, provider: &str) -> Result<Option<LoopbackCallback>, String> {
    stream.set_nonblocking(false).map_err(|error| error.to_string())?;
    stream.set_read_timeout(Some(Duration::from_secs(5))).map_err(|error| error.to_string())?;
    stream.set_write_timeout(Some(Duration::from_secs(5))).map_err(|error| error.to_string())?;
    let mut bytes = Vec::new();
    let mut chunk = [0u8; 1024];
    // 只需要请求行，读到第一个空行/EOF/读超时即停；超时多半是探测连接，按无回调处理。
    loop {
        match stream.read(&mut chunk) {
            Ok(0) | Err(_) => break,
            Ok(count) => {
                bytes.extend_from_slice(&chunk[..count]);
                if bytes.len() >= MAX_REQUEST_BYTES || bytes.windows(4).any(|window| window == b"\r\n\r\n") { break; }
            }
        }
    }
    let request = String::from_utf8_lossy(&bytes);
    let request_line = request.lines().next().unwrap_or_default();
    let target = request_line.split_whitespace().nth(1).unwrap_or_default();
    let callback = parse_query(target);
    let has_callback = callback.code.is_some() || callback.error.is_some();
    let page = if !has_callback {
        // 浏览器预连接/favicon 探测，或用户手输了地址：给一页说明而不是空白 400。
        callback_page(lang, PageKind::Invalid, "", None)
    } else if let Some(error) = callback.error.as_deref() {
        callback_page(lang, PageKind::Error, provider, Some(error))
    } else {
        callback_page(lang, PageKind::Success, provider, None)
    };
    let status_line = if has_callback { "HTTP/1.1 200 OK" } else { "HTTP/1.1 400 Bad Request" };
    let response = format!(
        "{status_line}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nCache-Control: no-store\r\nReferrer-Policy: no-referrer\r\nX-Content-Type-Options: nosniff\r\nContent-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'\r\nConnection: close\r\n\r\n{}",
        page.len(), page
    );
    // 响应写失败不影响结果：code 已经拿到，浏览器断开只是体验问题。
    let _ = stream.write_all(response.as_bytes());
    let _ = stream.flush();
    if has_callback { Ok(Some(callback)) } else { Ok(None) }
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
    /// 返回完整响应（含头部与完成页正文）。
    fn browser_get(port: u16, target: &str) -> String {
        let mut stream = TcpStream::connect(("127.0.0.1", port)).expect("connect loopback");
        write!(stream, "GET {target} HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nUser-Agent: test\r\n\r\n").unwrap();
        let mut response = String::new();
        let _ = stream.read_to_string(&mut response);
        response
    }

    #[tokio::test]
    async fn delivers_code_and_state_and_answers_the_completion_page() {
        let _serial = SERIAL.lock().await;
        let session = oauth_loopback_begin(0, None, None).unwrap();
        let port = session.port;
        let driver = std::thread::spawn(move || {
            browser_get(port, "/callback?code=abc123&state=st-1&extra=ignored")
        });
        let callback = oauth_loopback_wait(session.id.clone(), 5000).await.unwrap();
        let page = driver.join().unwrap();
        assert_eq!(callback.code.as_deref(), Some("abc123"));
        assert_eq!(callback.state.as_deref(), Some("st-1"));
        assert_eq!(callback.error, None);
        // 未指定语言时完成页按应用默认语言（中文）渲染。
        assert!(page.contains("授权完成"));
        // 会话一次性：wait 之后再 wait 必须报未知会话。
        assert!(oauth_loopback_wait(session.id, 1000).await.unwrap_err().contains("Unknown"));
    }

    /// 完成页跟随 begin 时传入的界面语言与 provider 展示名：英文界面下整页无中文。
    #[tokio::test]
    async fn completion_page_is_rendered_in_the_requested_language() {
        let _serial = SERIAL.lock().await;
        let session = oauth_loopback_begin(0, Some("en".into()), Some("Linear".into())).unwrap();
        let port = session.port;
        let driver = std::thread::spawn(move || browser_get(port, "/callback?code=abc&state=st"));
        oauth_loopback_wait(session.id, 5000).await.unwrap();
        let page = driver.join().unwrap();
        assert!(page.contains(r#"lang="en""#));
        assert!(page.contains("Authorization complete"));
        assert!(page.contains("AuuGit is now connected to Linear."));
        assert!(!page.contains("授权"));
    }

    /// 浏览器预连接/探测连接先行（无回调参数），真重定向在第二条连接上：
    /// wait 必须跳过探测连接继续等，而不是把 10035/无参数当致命错误。
    #[tokio::test]
    async fn probe_connections_are_skipped_until_the_real_redirect_arrives() {
        let _serial = SERIAL.lock().await;
        let session = oauth_loopback_begin(0, None, None).unwrap();
        let port = session.port;
        let driver = std::thread::spawn(move || {
            // 探测连接：连上后不发数据就关（模拟浏览器预连接）。
            let probe = TcpStream::connect(("127.0.0.1", port)).expect("connect probe");
            let _ = probe;
            std::thread::sleep(Duration::from_millis(150));
            browser_get(port, "/callback?code=later-1&state=st-2");
        });
        let callback = oauth_loopback_wait(session.id, 8000).await.unwrap();
        driver.join().unwrap();
        assert_eq!(callback.code.as_deref(), Some("later-1"));
        assert_eq!(callback.state.as_deref(), Some("st-2"));
    }

    #[tokio::test]
    async fn percent_encoding_and_error_redirects_are_carried_through() {
        let _serial = SERIAL.lock().await;
        let session = oauth_loopback_begin(0, None, None).unwrap();
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
        let session = oauth_loopback_begin(0, None, None).unwrap();
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
        let session = oauth_loopback_begin(0, None, None).unwrap();
        let started = Instant::now();
        assert!(oauth_loopback_wait(session.id, 400).await.unwrap_err().contains("timed out"));
        assert!(started.elapsed() < Duration::from_secs(5));
    }

    #[tokio::test]
    async fn begin_rejects_conflicting_ports_and_enforces_the_session_cap() {
        let _serial = SERIAL.lock().await;
        let first = oauth_loopback_begin(0, None, None).unwrap();
        // 同一端口再绑必然冲突（第一个会话仍存活）。
        assert!(oauth_loopback_begin(first.port, None, None).unwrap_err().contains("unavailable"));
        let second = oauth_loopback_begin(0, None, None).unwrap();
        assert!(oauth_loopback_begin(0, None, None).unwrap_err().contains("Too many"));
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

    #[test]
    fn completion_page_follows_language_and_escapes_dynamic_text() {
        let zh = callback_page(PageLang::Zh, PageKind::Success, "Linear", None);
        assert!(zh.contains(r#"lang="zh-CN""#));
        assert!(zh.contains("授权完成"));
        assert!(zh.contains("AuuGit 已成功连接 Linear。"));
        // 无 provider 时不留下空占位。
        assert!(callback_page(PageLang::Zh, PageKind::Success, "", None).contains("AuuGit 已完成授权。"));

        let en = callback_page(PageLang::En, PageKind::Error, "Linear", Some("access_denied"));
        assert!(en.contains(r#"lang="en""#));
        assert!(en.contains("Authorization incomplete"));
        assert!(en.contains("AuuGit could not finish connecting to Linear."));
        assert!(en.contains("access_denied"));
        assert!(!en.contains("授权"));

        // provider 名与错误码都来自外部输入：必须转义，不能把标签带进页面。
        let hostile = callback_page(PageLang::En, PageKind::Error, "<img src=x onerror=alert(1)>", Some("<script>"));
        assert!(hostile.contains("&lt;img src=x onerror=alert(1)&gt;"));
        assert!(!hostile.contains("<img"));
        assert!(!hostile.contains("<script>"));
    }
}
