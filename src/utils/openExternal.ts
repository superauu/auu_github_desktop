/**
 * 外部链接打开（桌面端 Tauri WebView 的 window.open / <a target="_blank"> 不可靠，
 * 统一走 shell open（系统默认浏览器）；web 预览回落 window.open。
 */
export async function openExternalUrl(url: string): Promise<void> {
  if (!url) return;
  if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
    const { open } = await import('@tauri-apps/plugin-shell');
    await open(url);
    return;
  }
  window.open(url, '_blank', 'noopener');
}
