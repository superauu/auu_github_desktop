const pending = new Map<string, Promise<void>>();
const approvedBinaries = new Map<string, Promise<void>>();
export async function authorizeGitBinary(path: string): Promise<void> {
  if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window) || /^(git|git\.exe)$/i.test(path)) return;
  let request = approvedBinaries.get(path);
  if (!request) {
    request = (async () => {
      const { invoke } = await import('@tauri-apps/api/core');
      try { await invoke('authorize_git_binary', { path }); }
      catch (error) { throw error instanceof Error ? error : new Error(String(error)); }
    })();
    approvedBinaries.set(path, request);
  }
  try { await request; }
  catch (error) { if (approvedBinaries.get(path) === request) approvedBinaries.delete(path); throw error; }
}

export async function listRepositoryPermissions(): Promise<string[]> {
  if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) return [];
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<string[]>('list_repository_permissions');
}

export async function revokeRepositoryPermission(path: string, openPaths: string[]): Promise<string[]> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<string[]>('revoke_repository_permission', { path, openPaths });
}
export async function authorizeRepository(path: string): Promise<void> {
  if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
    let request = pending.get(path);
    if (!request) {
      request = (async () => {
        const { invoke } = await import('@tauri-apps/api/core');
        try { await invoke('authorize_repository', { path }); }
        catch (error) { throw error instanceof Error ? error : new Error(String(error)); }
      })();
      pending.set(path, request);
    }
    try { await request; }
    finally { if (pending.get(path) === request) pending.delete(path); }
  }
}
