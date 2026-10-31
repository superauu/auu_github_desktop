/**
 * 仓库稳定标识（PRD §5.3）：IssueGitLink / 项目映射的持久化键。
 *
 * 规则：规范化 remote origin URL 优先（scp/ssh/https 三种形态归一到同一个键、
 * 去末尾 .git、host 小写、去用户信息），无 remote 时回退工作区路径（`path:` 前缀）。
 * 不得只依赖路径——用户移动仓库目录后凭 remote URL 重新关联。
 */

/**
 * 任意形态的 origin URL → 规范化键；无法解析时返回 null（由调用方回退路径）。
 * 例：`https://GitHub.com/Owner/Repo.git/`、`git@github.com:Owner/Repo.git`、
 * `ssh://git@github.com/Owner/Repo.git` → `github.com/Owner/Repo`（host 小写，路径保留原大小写）。
 */
export function normalizeRemoteUrl(url: string | null | undefined): string | null {
  const trimmed = (url ?? '').trim();
  if (!trimmed) return null;
  // scp 形态：git@host:path（path 可带 .git）——归一成 host/path，与 https 形态同键。
  const scp = trimmed.match(/^git@([^:/]+):(.+)$/i);
  if (scp) {
    const host = scp[1].toLowerCase();
    const path = scp[2].replace(/\/+$/, '').replace(/\.git$/i, '');
    return path ? `${host}/${path}` : null;
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:' && parsed.protocol !== 'ssh:') return null;
    const path = parsed.pathname.replace(/\/+$/, '').replace(/\.git$/i, '');
    if (!path) return null;
    return `${parsed.host.toLowerCase()}${path}`;
  } catch {
    return null;
  }
}

/** 持久化键：remote 可解析则用规范化 URL，否则 `path:` + 工作区路径（统一正斜杠、去尾分隔符）。 */
export function computeRepoKey(originUrl: string | null | undefined, workspacePath: string): string {
  const normalized = normalizeRemoteUrl(originUrl);
  if (normalized) return normalized;
  const fallback = workspacePath.replace(/[\\/]+$/, '').replace(/\\/g, '/');
  return `path:${fallback}`;
}
