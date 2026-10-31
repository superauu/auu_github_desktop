// 崩溃报告（严格 opt-in）：默认关闭；开启后仅上传错误堆栈、应用版本与系统类型，
// Rust 侧上报前会把用户主目录替换为 ~。浏览器预览（非 Tauri）不启用。
// node 测试环境（esbuild bundle）里 import.meta.env 不存在，必须用可选链取值。
export const crashReportingDsn = (import.meta.env?.VITE_AUUGIT_SENTRY_DSN as string | undefined)?.trim() || '';

export const isDesktopShell = () => typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

/** 立即把前端开关同步给 Rust 门控（桌面端）；改动即时生效，无需重启。 */
export function syncCrashReporting(enabled: boolean): void {
  if (!isDesktopShell()) return;
  void import('@tauri-apps/api/core').then(({ invoke }) => invoke('set_crash_reporting', { enabled })).catch(() => { /* 桌面同步失败时由下次启动兜底 */ });
}

/**
 * 发送一条测试事件验证端到端链路（Sentry Issues 页可见）。
 * 只在「DSN 存在 + 桌面壳」时可用；开关由设置行的渲染条件保证，此处不重复读 store
 * （settingsStore 反向依赖本服务，避免循环引用）。
 */
export async function sendCrashReportTestEvent(): Promise<boolean> {
  if (!crashReportingDsn || !isDesktopShell()) return false;
  const Sentry = await import('@sentry/browser');
  Sentry.getCurrentScope().setTag('source', 'settings-test');
  Sentry.captureMessage('AuuGit crash reporting test event', 'info');
  return true;
}
