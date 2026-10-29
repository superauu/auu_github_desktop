import React, { useEffect } from 'react';
import { useThemeStore } from '@/stores/themeStore';
import { restoreSavedRepository } from '@/services/git/RepositorySession';
import { useGitHubStore } from '@/stores/githubStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { initNotifications } from '@/services/notifications/NotificationService';
import { AppLayout } from '@/components/layout/AppLayout';
import { AppTextContextMenu } from '@/components/ui/AppTextContextMenu';

export const App: React.FC = () => {
  useEffect(() => {
    // 初始化只消费 store action（稳定引用），经 getState() 调用而不订阅整店：
    // App 是根组件，订阅 githubStore 会让 CI watch 的每 15s commitChecks 写入全树重渲染。
    const disposeTheme = useThemeStore.getState().initTheme();
    void useSettingsStore.getState().initSecrets();

    // Initialize GitHub auth state
    void useGitHubStore.getState().initAuth();

    let cancelled = false;
    void restoreSavedRepository(() => cancelled);
    return () => {
      cancelled = true;
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

