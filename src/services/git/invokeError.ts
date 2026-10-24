/**
 * Normalizes errors surfaced by Tauri 2 `invoke` rejections.
 *
 * Tauri rejects with either a plain string (Rust error payloads) or a
 * serialized object, so `err?.message` is frequently undefined on those paths
 * and callers end up throwing errors without any message. This helper keeps
 * typed Error instances intact and turns every other rejection shape into an
 * Error carrying the most useful message available (service-layer messages
 * stay English by project convention).
 */
export function normalizeInvokeError(error: unknown, fallback: string): Error {
  if (error instanceof Error && error.message) return error;
  return new Error(describeInvokeError(error) || fallback);
}

function describeInvokeError(error: unknown): string {
  if (typeof error === 'string') return error.trim();
  if (error && typeof error === 'object') {
    const candidate = error as { message?: unknown; error?: unknown; code?: unknown };
    if (typeof candidate.message === 'string' && candidate.message.trim()) return candidate.message;
    if (typeof candidate.error === 'string' && candidate.error.trim()) return candidate.error;
    if (typeof candidate.code === 'string' && candidate.code.trim()) return candidate.code;
    try { return JSON.stringify(error) ?? ''; } catch { return ''; }
  }
  if (error === undefined || error === null) return '';
  return String(error);
}
