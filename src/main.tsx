import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './app/App';
import './index.css';
import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
import '@fontsource-variable/orbitron';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { crashReportingDsn, isDesktopShell } from './services/crash/CrashReportingService';
import { useSettingsStore } from './stores/settingsStore';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary><App /></ErrorBoundary>
  </React.StrictMode>
);

// 崩溃上报（严格 opt-in）：客户端常驻、beforeSend 读实时开关——关闭时事件在本地被
// 丢弃，不产生网络请求。DSN 由编译期注入；浏览器预览不启用。异步初始化，不阻塞渲染。
if (crashReportingDsn && isDesktopShell()) {
  void import('@sentry/browser').then(({ init, getCurrentScope, setUser }) => {
    init({
      dsn: crashReportingDsn,
      release: `auugit@${__APP_VERSION__}`,
      beforeSend: event => (useSettingsStore.getState().crashReports ? event : null),
    });
    getCurrentScope().setTag('shell', 'tauri');
    setUser(null);
  }).catch(() => { /* 上报 SDK 加载失败不影响应用 */ });
}
