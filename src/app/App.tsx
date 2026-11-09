import React, { useEffect } from 'react';
import { useThemeStore } from '@/stores/themeStore';
import { restoreSavedRepository } from '@/services/git/RepositorySession';
import { startIntegrationRuntime } from '@/services/integrations/runtime';
import { startTaskService } from '@/services/integrations/taskService';
import { useTaskStore } from '@/stores/taskStore';
import { useCiStore } from '@/stores/ciStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { initNotifications } from '@/services/notifications/NotificationService';
import { AppLayout } from '@/components/layout/AppLayout';
import { AppTextContextMenu } from '@/components/ui/AppTextContextMenu';

export const App: React.FC = () => {
  useEffect(() => {
    // 初始化只消费 store action（稳定引用），经 getState() 调用而不订阅整店：
    // App 是根组件，Provider 的轮询更新不应触发全树重渲染。
    const disposeTheme = useThemeStore.getState().initTheme();
    void useSettingsStore.getState().initSecrets();

    const disposeIntegrations = startIntegrationRuntime();
    // 独立任务连接（Linear）：恢复连接并绑定第二条客户端通道（导航门控在启动即生效）。
    void useTaskStore.getState().restoreConnections();
    const disposeTaskService = startTaskService();
    useCiStore.getState().restoreConnections();

    let cancelled = false;
    void restoreSavedRepository(() => cancelled);
    return () => {
      cancelled = true;
      disposeIntegrations();
      disposeTaskService();
      disposeTheme?.();
    };
  }, []);

  useEffect(() => {
    // System notifications (T4): only activates inside Tauri with granted permission.
    // initNotifications resolves asynchronously; the StrictMode double mount must
    // dispose the first subscription instead of leaking it.
    let cancelled = false;
    let dispose: (() => void) | null = null;
    void initNotifications().then((cleanup) => {
      if (cancelled) cleanup();
      else dispose = cleanup;
    });
    return () => {
      cancelled = true;
      dispose?.();
    };
  }, []);

  return <><AppLayout /><AppTextContextMenu /></>;
};

