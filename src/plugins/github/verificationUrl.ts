export function validateGitHubUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.port || url.username || url.password) {
    throw new Error('Invalid GitHub verification URL');
  }
  return url.href;
}
