import { useSettingsStore } from '@/stores/settingsStore';
import { authorizeGitBinary } from '@/services/fs/RepositoryAccess';
import { normalizeInvokeError } from './invokeError';
export const isImagePath = (path: string) => /\.(png|jpe?g|gif|webp|bmp)$/i.test(path);
export async function readGitImage(repoPath: string, filePath: string, revision: string): Promise<string | null> {
  const gitBinary = useSettingsStore.getState().gitCliPath || 'git';
  if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
    await authorizeGitBinary(gitBinary);
    const { invoke } = await import('@tauri-apps/api/core');
    try {
      return await invoke<string | null>('read_git_image', { repoPath, filePath, revision, gitBinary });
    } catch (error) {
      throw normalizeInvokeError(error, 'Unable to load image');
    }
  }
  const response = await fetch('/api/git-image', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-AuuGit-Request': '1' }, body: JSON.stringify({ repoPath, filePath, revision, gitBinary }) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Unable to load image');
  return result.dataUrl;
}
