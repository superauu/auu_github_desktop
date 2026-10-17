import { useShallow } from 'zustand/react/shallow';
import React, { useEffect } from 'react';
import { useThemeStore } from '@/stores/themeStore';
import { useRepoStore } from '@/stores/repoStore';
import { useGitHubStore } from '@/stores/githubStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { AppLayout } from '@/components/layout/AppLayout';

export const App: React.FC = () => {
  const { initTheme } = useThemeStore();
  const { setCurrentRepo } = useRepoStore(useShallow(state => ({ setCurrentRepo: state.setCurrentRepo })));
  const { initAuth } = useGitHubStore();

  useEffect(() => {
    // Initialize theme system
    initTheme();
    void useSettingsStore.getState().initSecrets();

    // Initialize GitHub auth state
    initAuth();

    // Restore previously opened repo
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

    // 首次打开或未记录活跃仓库时，保持 null 呈现迎新欢迎界面
    setCurrentRepo(null);
  }, [initTheme, setCurrentRepo, initAuth]);

  return <AppLayout />;
};

