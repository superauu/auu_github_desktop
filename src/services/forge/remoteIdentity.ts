import type { ForgeKind } from './types';

/**
 * 解析任意 forge 远程地址为 { host, ownerPath, repo }：
 * - https://host/group[/sub…]/repo(.git)
 * - ssh://[user@]host/group[/sub…]/repo(.git)、git:// 同形
 * - scp 形式 [user@]host:group[/sub…]/repo(.git)
 *
 * ownerPath 保留嵌套分组（GitLab subgroup；Gitea 组织）形态；GitHub 兼容
 * parseGitHubRemote 的两段形态。已知公共托管域名直接给出 kind；自建域名
 * （GitLab CE/极狐、Gitea/Forgejo）的 kind 由调用方对照已连接账号的服务器域名
 * 解析——本函数不做网络请求。
 */
export interface ForgeRemote {
  host: string;
  /** 命名空间路径：GitHub 是 owner；GitLab 可能是 group/subgroup。 */
  ownerPath: string;
  repo: string;
  kind?: ForgeKind;
}

const KNOWN_HOSTS: Record<string, ForgeKind> = {
  'github.com': 'github',
  'gitlab.com': 'gitlab',
};

export function parseForgeRemote(url: string): ForgeRemote | undefined {
  const trimmed = url.trim();
  if (!trimmed) return undefined;
  // https / ssh / git scheme 形式（host 可带端口）。
  const scheme = /^(?:https?|ssh|git):\/\/(?:[^@/\s]+@)?([^/:]+)(?::\d+)?\/(.+?)\/?$/i.exec(trimmed);
  if (scheme) return build(scheme[1], scheme[2]);
  // scp 形式 [user@]host:path：主机必须含点（或 localhost），排除 Windows 盘符（E:/x）。
  const scp = /^(?:[^@/\s]+@)?((?:[a-z0-9-]+\.)+[a-z]{2,}|localhost):(.+?)\/?$/i.exec(trimmed);
  if (scp) return build(scp[1], scp[2]);
  return undefined;
}

function build(host: string, rawPath: string): ForgeRemote | undefined {
  const path = rawPath.replace(/\.git$/i, '').replace(/^\/+|\/+$/g, '');
  const segments = path.split('/').filter(Boolean);
  if (segments.length < 2) return undefined;
  const repo = segments.pop() as string;
  if (!repo) return undefined;
  const normalizedHost = host.toLowerCase();
  return {
    host: normalizedHost,
    ownerPath: segments.join('/'),
    repo,
    kind: KNOWN_HOSTS[normalizedHost],
  };
}
