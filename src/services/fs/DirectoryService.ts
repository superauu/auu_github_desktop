import { tNow } from '@/i18n';
import { listRepositoryPermissions } from './RepositoryAccess';
import { useSettingsStore } from '@/stores/settingsStore';
export interface DirectoryValidationResult {
  exists: boolean;
  isDirectory: boolean;
  isGitRepo: boolean;
  name?: string;
  fullPath?: string;
  requiresAuthorization?: boolean;
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
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke<string | null>('pick_repository_folder', { language: useSettingsStore.getState().language });
  }

  try {
    const res = await fetch('/api/dialog/pick-folder', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-AuuGit-Request': '1' } });
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

export async function validateDirectoryPath(path: string, strict = false): Promise<DirectoryValidationResult> {
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
      if (strict) throw e;
      return { exists: false, isDirectory: false, isGitRepo: false, requiresAuthorization: true };
    }
  }

  try {
    const res = await fetch('/api/fs/validate-path', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-AuuGit-Request': '1' },
      body: JSON.stringify({ path: path.trim() }),
    });
    if (!res.ok) throw new Error(tNow('err.dirNoBackend'));
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      throw new Error(tNow('err.dirNoBackend'));
    }
    return await res.json();
  } catch (error) {
    if (strict) throw error;
    return { exists: false, isDirectory: false, isGitRepo: false };
  }
}

export async function listDirectories(path?: string): Promise<ListDirsResult> {
  const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
  if (isTauri) {
    const { invoke } = await import('@tauri-apps/api/core');
    const initial = path || (await listRepositoryPermissions())[0];
    if (!initial) throw new Error(tNow('permissions.chooseFolder'));
    return invoke<ListDirsResult>('list_directories', { path: initial });
  }

  const url = path ? `/api/fs/list-dirs?path=${encodeURIComponent(path)}` : '/api/fs/list-dirs';
  const res = await fetch(url, { headers: { 'X-AuuGit-Request': '1' } });
  if (!res.ok) {
    throw new Error(tNow('err.dirListFailed'));
  }
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new Error(tNow('err.dirNoBackend'));
  }
  return res.json();
}
