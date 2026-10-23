export function errorGuidance(error: string) {
  const text = error.toLowerCase();
  if (/spawn .*enoent|git.*not (found|recognized)|cannot find.*git|找不到.*git/.test(text)) return 'git';
  if (/directoryunavailable|目录.*(不存在|不可用)|not a git repository|cannot change to|no such file or directory|指定的路径/.test(text)) return 'directory';
  if (/non-fast-forward|fetch first|rejected.*behind|tip of your current branch is behind/.test(text)) return 'rejected';
  if (/authentication failed|permission denied|could not read username|bad credentials|http (401|403)|status.? (401|403)/.test(text)) return 'auth';
  if (/index\.lock|another git process|unable to create.*lock/.test(text)) return 'lock';
  if (/conflict|unmerged files|resolve.*index/.test(text)) return 'conflict';
  if (/could not resolve host|failed to connect|network|connection (refused|reset)|timed? ?out|failed to fetch|http 50[234]/.test(text)) return 'network';
  return 'generic';
}

export function openGitSettings() {
  window.dispatchEvent(new CustomEvent('auugit:open-settings', { detail: 'git' }));
}
