/**
 * 识别 GitHub 远程地址的常见形式：
 * - https://github.com/owner/repo(.git)
 * - ssh://[user@]github.com/owner/repo(.git)
 * - git://github.com/owner/repo(.git)
 * - git@github.com:owner/repo(.git) 与无用户名的 scp 形式 github.com:owner/repo(.git)
 */
export function parseGitHubRemote(url: string): { owner: string; repo: string } | undefined {
  const match = url.match(/^(?:https?:\/\/|ssh:\/\/(?:[^@/]+@)?|git:\/\/)github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/i)
    || url.match(/^(?:[^@/\s]+@)?github\.com:([^/]+)\/([^/]+?)(?:\.git)?\/?$/i);
  return match ? { owner: match[1], repo: match[2] } : undefined;
}
