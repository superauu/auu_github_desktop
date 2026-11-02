import { getHostingPlugin, enabledHostingPlugins } from './plugins';
import type { GitRemote, RepositoryInfo } from '@/services/git/types';
import { parseForgeRemote } from './remoteIdentity';
import { normalizeServerUrl, instanceRelativePath } from './serverUrl';

export interface HostingConnection {
  id: string;
  providerId: string;
  server: string;
  enabled: boolean;
}
export interface HostingBinding {
  providerId: string;
  server: string;
  host: string;
  ownerPath: string;
  repo: string;
  remoteName: string;
  connectionId: string | null;
}
/** 显式配置失效时不偷偷回退到别的远程；无 origin 且多个候选时保持未绑定。 */
export function selectCollaborationRemote(remotes: readonly GitRemote[], preference = 'auto'): GitRemote | undefined {
  if (preference !== 'auto') return remotes.find(remote => remote.name === preference);
  const origin = remotes.find(remote => remote.name === 'origin');
  if (origin) return origin;
  const candidates = remotes.filter(remote => parseForgeRemote(remote.fetchUrl));
  return candidates.length === 1 ? candidates[0] : undefined;
}
export function repositoryRemote(repo: RepositoryInfo): GitRemote | undefined {
  // 新快照中的空绑定是权威结果，不能恢复已删除的旧远程。
  if (repo.collaborationRemote !== undefined) return repo.collaborationRemote ?? undefined;
  if (repo.remoteUrl) return { name: 'origin', fetchUrl: repo.remoteUrl, pushUrl: repo.remoteUrl };
  return enabledHostingPlugins().map(plugin => plugin.legacyRepositoryRemote?.(repo)).find(Boolean);
}
export function resolveHostingBinding(remote: GitRemote | undefined, connections: readonly HostingConnection[]): HostingBinding | null {
  if (!remote) return null;
  const identity = parseForgeRemote(remote.fetchUrl);
  if (!identity) return null;
  const matching = connections.flatMap(connection => {
    if (!connection.enabled || !getHostingPlugin(connection.providerId)) return [];
    try {
      const server = normalizeServerUrl(connection.server);
      const project = remoteIdentityAtServer(remote.fetchUrl, server);
      return project && (!identity.kind || connection.providerId === identity.kind) ? [{ ...connection, server, project }] : [];
    } catch { return []; }
  });
  // 远程 URL 来自 git remote，可能是任意字符串（如含空格），new URL 必须防抛。
  const isHttpRemote = /^https?:/i.test(remote.fetchUrl);
  const safeUrl = <T,>(value: string, read: (url: URL) => T, fallback: T): T => {
    try { return read(new URL(value)); } catch { return fallback; }
  };
  if (isHttpRemote) {
    const longest = Math.max(0, ...matching.map(connection => safeUrl(connection.server, url => url.pathname.length, 0)));
    for (let index = matching.length - 1; index >= 0; index--) if (safeUrl(matching[index].server, url => url.pathname.length, 0) < longest) matching.splice(index, 1);
  } else if (new Set(matching.map(connection => connection.server)).size > 1) return null;
  // 未知自建域名且多个平台声称该主机时不猜测平台。
  if (!identity.kind && new Set(matching.map(connection => connection.providerId)).size !== 1) return null;
  const connection = matching[0];
  if (!connection && isHttpRemote && safeUrl(remote.fetchUrl, url => url.port, '')) return null;
  const providerId = identity.kind ?? connection?.providerId;
  if (!providerId) return null;
  if (!getHostingPlugin(providerId)) return null;
  return {
    providerId, host: identity.host, server: connection?.server ?? `https://${identity.host}`,
    ownerPath: connection?.project.ownerPath ?? identity.ownerPath, repo: connection?.project.repo ?? identity.repo, remoteName: remote.name,
    connectionId: connection?.id ?? null,
  };
}
export function remoteIdentityAtServer(url: string, server: string) {
  try {
  const identity = parseForgeRemote(url);
  if (!identity || identity.host !== new URL(server).hostname.toLowerCase()) return null;
  if (!/^https?:/i.test(url)) return identity;
  const path = instanceRelativePath(url, server);
  const segments = path?.replace(/\.git\/?$/, '').split('/').filter(Boolean);
  if (!segments || segments.length < 2) return null;
  return { ...identity, ownerPath: segments.slice(0, -1).map(decodeURIComponent).join('/'), repo: decodeURIComponent(segments.at(-1)!) };
  } catch { return null; }
}
/** 比较实际推送目的地，避免 origin(fork) 的推送触发 upstream 的 CI 监听。 */
export function matchesHostingRemote(url: string, binding: HostingBinding): boolean {
  const remote = remoteIdentityAtServer(url, binding.server);
  if (!remote || remote.host !== binding.host) return false;
  const insensitive = getHostingPlugin(binding.providerId)?.caseInsensitivePaths === true;
  const normalize = (value: string) => insensitive ? value.toLowerCase() : value;
  return normalize(remote.ownerPath) === normalize(binding.ownerPath) && normalize(remote.repo) === normalize(binding.repo);
}
