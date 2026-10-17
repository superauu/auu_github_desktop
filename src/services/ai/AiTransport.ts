export function awaitAiResponse<T>(pending: Promise<T>, signal?: AbortSignal | null): Promise<T> {
  if (!signal) return pending;
  if (signal.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'));
  return new Promise((resolve, reject) => {
    const abort = () => reject(new DOMException('Aborted', 'AbortError'));
    signal.addEventListener('abort', abort, { once: true });
    pending.then(value => { signal.removeEventListener('abort', abort); resolve(value); }, error => { signal.removeEventListener('abort', abort); reject(error); });
  });
}
let openCodeSession: string | undefined;
export async function requestAiCompletion(url: string, init: RequestInit): Promise<Response> {
  const parsed = new URL(url);
  if (parsed.username || parsed.password || (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)))) {
    throw new Error('AI endpoint must use HTTPS or a local HTTP address');
  }
  if (init.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  const headers = new Headers(init.headers);
  if (parsed.hostname === 'opencode.ai' && /^\/(?:inference|zen)\/go(?:\/|$)/.test(parsed.pathname)) {
    openCodeSession ||= crypto.randomUUID();
    headers.set('x-opencode-session', openCodeSession);
  }
  const extraHeaders: Record<string, string> = {};
  for (const name of ['x-api-key', 'anthropic-version', 'x-opencode-session']) {
    const value = headers.get(name);
    if (value) extraHeaders[name] = value;
  }
  const authorization = headers.get('Authorization') || '';
  if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
    const { invoke } = await import('@tauri-apps/api/core');
    const pending = invoke<string>('request_ai_completion', { url, authorization, extraHeaders, body: String(init.body || '') })
      .catch((error: unknown) => { throw error instanceof Error ? error : new Error(String(error)); });
    const text = await awaitAiResponse(pending, init.signal);
    if (init.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    return new Response(text, { headers: { 'Content-Type': 'application/json' } });
  }
  if (typeof window !== 'undefined') {
    return fetch('/api/ai/completion', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-AuuGit-Request': '1' },
      body: JSON.stringify({ url, authorization, extraHeaders, body: String(init.body || '') }), signal: init.signal,
      redirect: 'error',
    });
  }
  return fetch(url, { ...init, headers, redirect: 'error' });
}
