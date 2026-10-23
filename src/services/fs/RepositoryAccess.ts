const pending = new Map<string, Promise<void>>();
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
