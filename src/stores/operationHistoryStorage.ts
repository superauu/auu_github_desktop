import type { OperationEntry } from './toastStore';

export const OPERATION_HISTORY_KEY = 'auugit-operation-history';
const MAX_SIZE = 1_000_000, MAX_AGE = 30 * 86400_000;
export function redactOperationText(text: string) {
  return text.replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?(?:-----END [^-]*PRIVATE KEY-----|$)/g, '[redacted key]')
    .replace(/(https?:\/\/)[^\s/@]+(?::[^\s/@]*)?@/gi, '$1[redacted]@')
    .replace(/\b(?:gh[pousr]_[a-z\d_]{12,}|github_pat_[a-z\d_]{12,}|sk-[a-z\d_-]{16,})\b/gi, '[redacted]')
    .replace(/\b(Bearer|Basic)\s+[a-z\d+/=_\-.]+/gi, '$1 [redacted]')
    .replace(/((?:access_token|refresh_token|api[_-]?key|password|token|secret|authorization)["']?\s*[:=]\s*["']?)[^\s&"'<>]+/gi, '$1[redacted]');
}
function normalize(value: unknown): OperationEntry | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Partial<OperationEntry>;
  if (typeof item.id !== 'string' || item.id.length > 150 || !['success', 'error', 'info', 'warning'].includes(item.type || '')
    || typeof item.title !== 'string' || typeof item.createdAt !== 'number' || !Number.isFinite(item.createdAt)
    || item.createdAt < Date.now() - MAX_AGE || item.createdAt > Date.now() + 300_000) return null;
  return { id: item.id, type: item.type!, title: redactOperationText(item.title).slice(0, 1000), createdAt: item.createdAt,
    ...(typeof item.description === 'string' ? { description: redactOperationText(item.description).slice(0, 8000) } : {}),
    ...(typeof item.repoPath === 'string' && item.repoPath.length <= 32768 && !item.repoPath.includes('\0') ? { repoPath: item.repoPath } : {}),
    ...(typeof item.elapsedMs === 'number' && Number.isFinite(item.elapsedMs) && item.elapsedMs >= 0 ? { elapsedMs: item.elapsedMs } : {}),
  };
}
export function loadOperationHistory(): { history: OperationEntry[]; failed: boolean } {
  try {
    const raw = localStorage.getItem(OPERATION_HISTORY_KEY);
    if (!raw) return { history: [], failed: false };
    if (raw.length > MAX_SIZE) throw Error('Oversized history');
    const value = JSON.parse(raw);
    if (value?.version !== 1 || !Array.isArray(value.entries) || value.entries.length > 100) throw Error('Invalid history');
    const seen = new Set<string>();
    const history = value.entries.map(normalize).filter((item: OperationEntry | null): item is OperationEntry => !!item && !seen.has(item.id) && !!seen.add(item.id));
    return { history: history.sort((a: OperationEntry, b: OperationEntry) => b.createdAt - a.createdAt), failed: false };
  } catch { return { history: [], failed: true }; }
}
export function saveOperationHistory(history: OperationEntry[]): boolean {
  try {
    const entries = history.slice(0, 100).map(normalize).filter((item): item is OperationEntry => !!item);
    let raw = JSON.stringify({ version: 1, entries });
    while (raw.length > MAX_SIZE && entries.length) { entries.pop(); raw = JSON.stringify({ version: 1, entries }); }
    if (entries.length) localStorage.setItem(OPERATION_HISTORY_KEY, raw);
    else localStorage.removeItem(OPERATION_HISTORY_KEY);
    return true;
  } catch { return false; }
}
