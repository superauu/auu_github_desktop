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

    // Restore previously opened repo or default to current workspace repo
    try {
      const saved = localStorage.getItem('auu_git_last_active_repo');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.path) {
          setCurrentRepo(parsed);
          return;
        }
      }
    } catch {}

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

