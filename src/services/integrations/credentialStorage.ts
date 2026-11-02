export interface CredentialStorage {
  read(profileId: string | null): Promise<string | null>;
  write(token: string, profileId: string | null): Promise<void>;
  remove(profileId: string | null): Promise<void>;
}
/** 命令和旧存储键由插件声明。宿主不假定任何平台的凭证格式。 */
export function createCredentialStorage(config: { read: string; write: string; remove: string; args?: Record<string, string>; legacyKey?: string }): CredentialStorage {
  const memory = new Map<string, string>();
  let writes = Promise.resolve();
  const key = (id: string | null) => id || 'default';
  const native = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
  const invoke = async <T>(command: string, args: Record<string, unknown>): Promise<T> => {
    const { invoke: call } = await import('@tauri-apps/api/core'); return call<T>(command, args);
  };
  const args = (profileId: string | null) => ({ ...config.args, profileId });
  const write = async (token: string, id: string | null) => {
    writes = writes.catch(() => {}).then(async () => {
      // 只有原生端迁移完成才能删除旧 localStorage 明文键；浏览器预览的内存Map
      // 随页面销毁，先删旧键会把令牌弄丢。
      if (native()) {
        await invoke(config.write, { ...args(id), token });
        if (config.legacyKey) localStorage.removeItem(config.legacyKey);
      } else memory.set(key(id), token);
    });
    await writes;
  };
  return {
    write,
    async read(id) {
      await writes.catch(() => {});
      const token = native() ? await invoke<string | null>(config.read, args(id)) : memory.get(key(id));
      if (token) return token;
      const legacy = config.legacyKey && key(id) === 'default' ? localStorage.getItem(config.legacyKey) : null;
      if (legacy) { await write(legacy, id); return legacy; }
      return null;
    },
    async remove(id) {
      memory.delete(key(id));
      if (config.legacyKey) localStorage.removeItem(config.legacyKey);
      writes = writes.catch(() => {}).then(async () => { if (native()) await invoke(config.remove, args(id)); });
      await writes;
    },
  };
}
