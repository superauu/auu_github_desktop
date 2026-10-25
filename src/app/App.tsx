import React, { useEffect } from 'react';
import { useThemeStore } from '@/stores/themeStore';
import { restoreSavedRepository } from '@/services/git/RepositorySession';
import { useGitHubStore } from '@/stores/githubStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { initNotifications } from '@/services/notifications/NotificationService';
import { AppLayout } from '@/components/layout/AppLayout';
import { AppTextContextMenu } from '@/components/ui/AppTextContextMenu';

export const App: React.FC = () => {
  const { initTheme } = useThemeStore();
  const { initAuth } = useGitHubStore();

  useEffect(() => {
    // Initialize theme system; the returned cleanup removes the matchMedia
    // listener so StrictMode's double mount cannot leak it.
    const disposeTheme = initTheme();
    void useSettingsStore.getState().initSecrets();

    // Initialize GitHub auth state
    initAuth();

    let cancelled = false;
    void restoreSavedRepository(() => cancelled);
    return () => {
      cancelled = true;
      disposeTheme?.();
    };
  }, [initTheme, initAuth]);

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

