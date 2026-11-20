import { useSettingsStore } from '@/stores/settingsStore';

/**
 * 归档导出：`git archive --format=zip|tar.gz` 的二进制产物不经前端字符串通道，
 * 由 Rust 侧（archive_io::export_archive）执行并直写用户保存对话框确认的路径。
 * 桌面端以外没有保存对话框，pick 返回 null（调用方静默跳过，与补丁导出同构）。
 */
const isTauri = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

async function invokeCommand<T>(command: string, args: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(command, args);
}

export const archiveService = {
  async pickArchiveSavePath(defaultName: string): Promise<string | null> {
    if (!isTauri()) return null;
    return invokeCommand<string | null>('pick_archive_save_path', { language: useSettingsStore.getState().language, defaultName });
  },

  async exportArchive(repoPath: string, treeish: string, format: 'zip' | 'tar.gz', target: string): Promise<void> {
    return invokeCommand<void>('export_archive', { repoPath, treeish, format, target });
  },
};
