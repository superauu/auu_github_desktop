export function awaitAiResponse<T>(pending: Promise<T>, signal?: AbortSignal | null): Promise<T> {
  if (!signal) return pending;
  if (signal.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'));
  return new Promise((resolve, reject) => {
    const abort = () => reject(new DOMException('Aborted', 'AbortError'));
    signal.addEventListener('abort', abort, { once: true });
    pending.then(value => { signal.removeEventListener('abort', abort); resolve(value); }, error => { signal.removeEventListener('abort', abort); reject(error); });
  });
}
export async function requestAiCompletion(url: string, init: RequestInit): Promise<Response> {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname))) {
    throw new Error('AI endpoint must use HTTPS or a local HTTP address');
  }
  if (init.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
    const { invoke } = await import('@tauri-apps/api/core');
    const authorization = new Headers(init.headers).get('Authorization') || '';
    const pending = invoke<string>('request_ai_completion', { url, authorization, body: String(init.body || '') });
    const text = await awaitAiResponse(pending, init.signal);
    if (init.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    return new Response(text, { headers: { 'Content-Type': 'application/json' } });
  }
  return fetch(url, { ...init, redirect: 'error' });
}
