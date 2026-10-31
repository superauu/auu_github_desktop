/**
 * 集成凭证存取（PRD §6.4）：token 只进 OS Keyring（Rust 层条目
 * `auugit / integration_token:<connectionId>`，connectionId 合法性由 Rust fail-closed 校验），
 * 绝不落 localStorage / settings / 日志。dev（浏览器）回落内存 Map，仅会话内有效。
 */
const DEV_TOKENS = new Map<string, string>();

const isTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

async function invokeKeyring<T>(command: string, args: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(command, args);
}

export async function storeIntegrationToken(connectionId: string, token: string): Promise<void> {
  if (!isTauri()) {
    DEV_TOKENS.set(connectionId, token);
    return;
  }
  await invokeKeyring('store_integration_token', { connectionId, token });
}

export async function getIntegrationToken(connectionId: string): Promise<string | null> {
  if (!isTauri()) return DEV_TOKENS.get(connectionId) ?? null;
  try {
    return await invokeKeyring<string | null>('get_integration_token', { connectionId });
  } catch {
    return null;
  }
}

export async function deleteIntegrationToken(connectionId: string): Promise<void> {
  if (!isTauri()) {
    DEV_TOKENS.delete(connectionId);
    return;
  }
  await invokeKeyring('delete_integration_token', { connectionId });
}
