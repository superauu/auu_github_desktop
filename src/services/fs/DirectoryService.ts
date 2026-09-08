import { tNow } from '@/i18n';
export interface DirectoryValidationResult {
  exists: boolean;
  isDirectory: boolean;
  isGitRepo: boolean;
  name?: string;
  fullPath?: string;
}

export interface DirectoryEntry {
  name: string;
  path: string;
  hasGit: boolean;
}

export interface ListDirsResult {
  currentPath: string;
  parentPath: string | null;
  hasGit: boolean;
  directories: DirectoryEntry[];
}

export async function pickFolderNative(): Promise<string | null> {
  const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
  if (isTauri) {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({
        directory: true,
        multiple: false,
        title: '选择 Git 仓库目录',
      });
      if (typeof selected === 'string') return selected;
      return null;
    } catch (e) {
      console.warn('Tauri open dialog error, fallback to HTTP API:', e);
    }
  }

  try {
    const res = await fetch('/api/dialog/pick-folder', { method: 'POST' });
    if (!res.ok) throw new Error(tNow('err.dirPickerFailed'));
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      throw new Error(tNow('err.dirNoBackend'));
    }
    const data = await res.json();
    return data.path || null;
  } catch (err: any) {
    console.error('Pick folder failed:', err);
    throw err;
  }
}

export async function validateDirectoryPath(path: string): Promise<DirectoryValidationResult> {
  if (!path || !path.trim()) {
    return { exists: false, isDirectory: false, isGitRepo: false };
  }
  const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
  if (isTauri) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const result = await invoke<DirectoryValidationResult>('validate_directory', { path: path.trim() });
      return result;
    } catch (e) {
      console.warn('Tauri validate_directory failed, fallback to HTTP:', e);
    }
  }

  try {
    const res = await fetch('/api/fs/validate-path', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: path.trim() }),
    });
    if (!res.ok) return { exists: false, isDirectory: false, isGitRepo: false };
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return { exists: false, isDirectory: false, isGitRepo: false };
    }
    return await res.json();
  } catch {
    return { exists: false, isDirectory: false, isGitRepo: false };
  }
}

export async function listDirectories(path?: string): Promise<ListDirsResult> {
  const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
  if (isTauri) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const result = await invoke<ListDirsResult>('list_directories', { path: path || null });
      return result;
    } catch (e) {
      console.warn('Tauri list_directories failed, fallback to HTTP:', e);
    }
  }

  const url = path ? `/api/fs/list-dirs?path=${encodeURIComponent(path)}` : '/api/fs/list-dirs';
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(tNow('err.dirListFailed'));
  }
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new Error(tNow('err.dirNoBackend'));
  }
  return res.json();
}
