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
    const text = await pending;
    if (init.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    return new Response(text, { headers: { 'Content-Type': 'application/json' } });
  }
  return fetch(url, { ...init, redirect: 'error' });
}
