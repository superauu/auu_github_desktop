/**
 * 本机 OAuth 回跳（通用）：桌面端 Rust 在 127.0.0.1 起一次性 HTTP 监听，
 * 收下浏览器授权后的重定向并回一个完成页。任何外部平台（Linear、GitHub…）
 * 的网页授权都可复用——provider 只影响完成页上的展示名，页面文案跟随当前
 * 界面语言（settings.language），成功/失败各有一套版式。
 */
import { tNow } from '@/i18n';
import { useSettingsStore } from '@/stores/settingsStore';

export interface OAuthLoopbackSession { id: string; port: number }
export interface OAuthLoopbackCallback { code: string | null; state: string | null; error: string | null }

const isTauriRuntime = (): boolean => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

/** web 预览没有 Rust 回跳命令：给明确错误而不是静默挂起。 */
async function invokeLoopback<T>(command: string, args: Record<string, unknown>): Promise<T> {
  if (!isTauriRuntime()) throw new Error(tNow('connections.errors.oauthDesktopOnly'));
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(command, args);
}

/** 打开回跳监听；provider 是完成页上的展示名（如 "Linear"），语言取当前设置。 */
export function beginOAuthLoopback(port: number, provider: string): Promise<OAuthLoopbackSession> {
  return invokeLoopback('oauth_loopback_begin', { port, provider, language: useSettingsStore.getState().language });
}

/** 阻塞至浏览器回跳到达或超时；state 仍需调用方与本地生成值比对。 */
export function waitOAuthLoopback(id: string, timeoutMs: number): Promise<OAuthLoopbackCallback> {
  return invokeLoopback('oauth_loopback_wait', { id, timeoutMs });
}

/** 取消会话；已被 wait 消费时不再存在，忽略即可。 */
export async function cancelOAuthLoopback(id: string): Promise<void> {
  await invokeLoopback('oauth_loopback_cancel', { id }).catch(() => { /* 会话可能已被 wait 消费 */ });
}
