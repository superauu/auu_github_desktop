/**
 * Provider HTTP 传输（中立位置：errors / forge 等所有外部集成共用）。
 *
 * 桌面端走 Rust 代理 `provider_http_request`——WebView 的 connect-src CSP
 * 无法枚举所有平台与自托管地址（PRD §6.4 硬化）；web 预览模式直连
 * fetch（浏览器无 CSP，开发场景用官方云）。
 */

export interface ProviderHttpResponse {
  status: number;
  /** 全量响应头（小写键）——分页依赖 Link 头。 */
  headers: Record<string, string>;
  body: string;
}

const isTauriRuntime = (): boolean => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export async function providerHttpRequest(
  method: string,
  url: string,
  headers: Record<string, string>,
  body?: string,
): Promise<ProviderHttpResponse> {
  if (isTauriRuntime()) {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke<ProviderHttpResponse>('provider_http_request', {
      request: { method, url, headers, body: body ?? null },
    });
  }
  const response = await fetch(url, { method, headers, body });
  const headerMap: Record<string, string> = {};
  response.headers.forEach((value, name) => {
    headerMap[name.toLowerCase()] = value;
  });
  return { status: response.status, headers: headerMap, body: await response.text() };
}
