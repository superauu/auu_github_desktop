import React, { useEffect } from 'react';
import { useThemeStore } from '@/stores/themeStore';
import { useRepoStore } from '@/stores/repoStore';
import { AppLayout } from '@/components/layout/AppLayout';

export const App: React.FC = () => {
  const { initTheme } = useThemeStore();
  const { setCurrentRepo } = useRepoStore();

  useEffect(() => {
    // Initialize theme system
    initTheme();

    // Default load current workspace repo for instant rich presentation
    setCurrentRepo({
      id: 'auu-git-client-workspace',
      name: 'auu_github_desktop',
      path: 'E:/code/auu_github_desktop',
      currentBranch: 'main',
      lastOpenedAt: Date.now(),
    });
  }, [initTheme, setCurrentRepo]);

  return <AppLayout />;
};
