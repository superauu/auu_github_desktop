/**
 * 外部链接打开（桌面端 Tauri WebView 的 window.open / <a target="_blank"> 不可靠，
 * 且 shell 插件的 open 校验器是 github.com 专用白名单）——统一走自建 Rust 命令
 * `open_external_url`（http(s) fail-closed 校验，系统默认浏览器）；
 * web 预览回落 window.open。
 */
export async function openExternalUrl(url: string): Promise<void> {
  if (!url) return;
  if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('open_external_url', { url });
    return;
  }
  window.open(url, '_blank', 'noopener');
}
