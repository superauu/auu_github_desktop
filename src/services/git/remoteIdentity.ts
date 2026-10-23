export function parseGitHubRemote(url: string): { owner: string; repo: string } | undefined {
  const match = url.match(/^(?:https?:\/\/|ssh:\/\/(?:[^@/]+@)?)github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/i)
    || url.match(/^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?\/?$/i);
  return match ? { owner: match[1], repo: match[2] } : undefined;
}
