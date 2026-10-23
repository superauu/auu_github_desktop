import React, { useEffect } from 'react';
import { useThemeStore } from '@/stores/themeStore';
import { restoreSavedRepository } from '@/services/git/RepositorySession';
import { useGitHubStore } from '@/stores/githubStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { AppLayout } from '@/components/layout/AppLayout';

export const App: React.FC = () => {
  const { initTheme } = useThemeStore();
  const { initAuth } = useGitHubStore();

  useEffect(() => {
    // Initialize theme system
    initTheme();
    void useSettingsStore.getState().initSecrets();

    // Initialize GitHub auth state
    initAuth();

    let cancelled = false;
    void restoreSavedRepository(() => cancelled);
    return () => { cancelled = true; };
  }, [initTheme, initAuth]);

  return <AppLayout />;
};

