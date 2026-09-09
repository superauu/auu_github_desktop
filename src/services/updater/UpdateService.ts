import { tNow } from '@/i18n';
import { toast } from '@/stores/toastStore';

const isTauri = (): boolean =>
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

/**
 * 检查并安装更新（仅桌面端）。
 * - 有更新：toast 提示后自动下载安装，重启应用生效
 * - 无更新/浏览器模式/检查失败：静默
 */
export async function checkAndInstallUpdate(silent: boolean = true): Promise<void> {
  if (!isTauri()) return;
  try {
    const { check } = await import('@tauri-apps/plugin-updater');
    const update = await check();
    if (!update) {
      if (!silent) toast.info(tNow('update.upToDate'));
      return;
    }

    toast.info(
      tNow('update.available').replace('{v}', update.version),
      tNow('update.downloading')
    );
    await update.downloadAndInstall();
    toast.success(tNow('update.installed'), tNow('update.restartHint'));
  } catch (err: any) {
    // 私有仓库下 latest.json 拉取会 404，静默即可；手动检查时给出提示
    if (!silent) {
      toast.error(tNow('update.checkFailed'), err?.message);
    } else {
      console.warn('检查更新失败:', err?.message || err);
    }
  }
}
