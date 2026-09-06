import React, { useEffect } from 'react';
import { useThemeStore } from '@/stores/themeStore';
import { useRepoStore } from '@/stores/repoStore';
import { useGitHubStore } from '@/stores/githubStore';
import { AppLayout } from '@/components/layout/AppLayout';

export const App: React.FC = () => {
  const { initTheme } = useThemeStore();
  const { setCurrentRepo } = useRepoStore();
  const { initAuth } = useGitHubStore();

  useEffect(() => {
    // Initialize theme system
    initTheme();

    // Initialize GitHub auth / demo state
    initAuth();

    // Default load current workspace repo
    setCurrentRepo({
      id: 'auu-git-client-workspace',
      name: 'auu_github_desktop',
      path: 'E:/code/auu_github_desktop',
      currentBranch: 'master',
      lastOpenedAt: Date.now(),
    });
  }, [initTheme, setCurrentRepo, initAuth]);

  return <AppLayout />;
};

