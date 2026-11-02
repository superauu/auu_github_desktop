/** Stable instance identity shared by accounts, bindings, clients and links. */
import { LocalizedError } from '@/i18n';
export function normalizeServerUrl(value: string): string {
  if (/%(?:2f|5c|2e)/i.test(value) || /[\\\s]/.test(value)) throw new LocalizedError('connections.errors.invalidServerUrl');
  const url = new URL(value);
  if (!/^https?:$/.test(url.protocol) || !url.hostname || url.username || url.password || url.search || url.hash) throw new LocalizedError('connections.errors.invalidServerUrl');
  const path = url.pathname.replace(/\/+$/, '');
  if (path.includes('//')) throw new LocalizedError('connections.errors.invalidServerUrl');
  return `${url.origin}${path}`;
}
export function instanceRelativePath(value: string, server: string): string | null {
  try {
    const url = new URL(value), base = new URL(normalizeServerUrl(server));
    if (url.origin !== base.origin || url.username || url.password || /%(?:2f|5c|2e)/i.test(url.pathname)) return null;
    const prefix = base.pathname.replace(/\/+$/, '');
    if (prefix && !url.pathname.startsWith(`${prefix}/`)) return null;
    return url.pathname.slice(prefix.length);
  } catch { return null; }
}
