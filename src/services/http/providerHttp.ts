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
const MAX_RESPONSE_BYTES = 32 * 1024 * 1024;
let sequence = 0;
export interface ProviderRequestOptions { signal?: AbortSignal; timeoutMs?: number }

async function boundedBody(response: Response): Promise<string> {
  if (response.type === 'opaqueredirect') throw new Error('Provider redirects are not followed');
  if (Number(response.headers.get('content-length')) > MAX_RESPONSE_BYTES) {
    await response.body?.cancel();
    throw new Error('Provider response too large');
  }
  if (!response.body) return response.text();
  const reader = response.body.getReader(), decoder = new TextDecoder('utf-8', { fatal: true });
  let size = 0, text = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_RESPONSE_BYTES) throw new Error('Provider response too large');
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally { reader.releaseLock(); }
}

/** Browser keeps standard fetch cancellation; desktop providers share the native transport. */
export async function providerFetch(url: string, init: RequestInit = {}): Promise<Response> {
  if (!isTauriRuntime()) {
    const signal = AbortSignal.any([AbortSignal.timeout(30_000), ...(init.signal ? [init.signal] : [])]);
    signal.throwIfAborted();
    const response = await fetch(url, { ...init, signal, redirect: 'manual' });
    const body = await boundedBody(response);
    return new Response([204, 205, 304].includes(response.status) ? null : body, { status: response.status, headers: response.headers });
  }
  init.signal?.throwIfAborted();
  const response = await providerHttpRequest(init.method || 'GET', url, Object.fromEntries(new Headers(init.headers).entries()), typeof init.body === 'string' ? init.body : undefined, { signal: init.signal ?? undefined });
  init.signal?.throwIfAborted();
  return new Response(response.status === 204 || response.status === 205 || response.status === 304 ? null : response.body, { status: response.status, headers: response.headers });
}

export async function providerHttpRequest(
  method: string,
  url: string,
  headers: Record<string, string>,
  body?: string,
  options: ProviderRequestOptions = {},
): Promise<ProviderHttpResponse> {
  const parsed = new URL(url);
  if (!/^https?:$/.test(parsed.protocol) || parsed.username || parsed.password || parsed.hash) throw new Error('Invalid provider URL');
  const signal = AbortSignal.any([AbortSignal.timeout(options.timeoutMs ?? 30_000), ...(options.signal ? [options.signal] : [])]);
  signal.throwIfAborted();
  if (isTauriRuntime()) {
    const { invoke } = await import('@tauri-apps/api/core');
    signal.throwIfAborted();
    const id = `provider-${Date.now()}-${++sequence}`;
    let cancel: () => void = () => {};
    try {
      return await new Promise<ProviderHttpResponse>((resolve, reject) => {
        cancel = () => {
          void invoke('cancel_provider_http_request', { id }).catch(() => {});
          reject(signal.reason);
        };
        signal.addEventListener('abort', cancel, { once: true });
        void invoke<ProviderHttpResponse>('provider_http_request', { request: { id, method, url, headers, body: body ?? null } }).then(resolve, reject);
        if (signal.aborted) cancel();
      });
    } finally { signal.removeEventListener('abort', cancel); }
  }
  const response = await fetch(url, { method, headers, body, signal, redirect: 'manual' });
  const headerMap: Record<string, string> = {};
  response.headers.forEach((value, name) => {
    headerMap[name.toLowerCase()] = value;
  });
  return { status: response.status, headers: headerMap, body: await boundedBody(response) };
}
