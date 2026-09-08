import React, { useState, useEffect } from 'react';
import { Header } from './Header';
import { LeftSidebar } from './LeftSidebar';
import { CenterStage } from './CenterStage';
import { RightPane } from './RightPane';
import { StatusBar } from './StatusBar';
import { CommandPalette } from '@/components/command/CommandPalette';
import { SettingsDialog } from '@/components/settings/SettingsDialog';
import { RepositoryDialog } from '@/features/repository/RepositoryDialog';
import { GitHubAuthDialog } from '@/components/github/GitHubAuthDialog';
import { ToastContainer } from '@/components/ui/ToastContainer';
import { ResizeHandle } from '@/components/ui/ResizeHandle';
import { useLayoutStore, DEFAULT_LAYOUT } from '@/stores/layoutStore';
import { useI18n } from '@/i18n';
import { useRepoStore } from '@/stores/repoStore';
import { useSettingsStore } from '@/stores/settingsStore';

export const AppLayout: React.FC = () => {
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [repoDialogOpen, setRepoDialogOpen] = useState(false);
  const [repoDialogMode, setRepoDialogMode] = useState<'open' | 'clone' | 'init'>('open');
  const [githubAuthOpen, setGithubAuthOpen] = useState(false);

  const {
    leftSidebarWidth,
    setLeftSidebarWidth,
    rightPaneWidth,
    setRightPaneWidth,
    toggleEmbeddedTerminal,
  } = useLayoutStore();
  const { isLeftSidebarCollapsed, isRightPaneCollapsed, currentRepo, fetchRemote } = useRepoStore();
  const { compactMode, autoFetchInterval } = useSettingsStore();
  const { t } = useI18n();

  // Global Shortcut: Ctrl+` toggles embedded terminal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === '`' || e.code === 'Backquote')) {
        e.preventDefault();
        toggleEmbeddedTerminal();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleEmbeddedTerminal]);

  // Apply compact mode on mount
  useEffect(() => {
    if (compactMode) {
      document.documentElement.classList.add('compact-mode');
    } else {
      document.documentElement.classList.remove('compact-mode');
    }
  }, [compactMode]);

  // Background Auto Fetch timer
  useEffect(() => {
    if (!currentRepo || autoFetchInterval === 'never') return;

    let intervalMs = 10 * 60 * 1000;
    if (autoFetchInterval === '5m') intervalMs = 5 * 60 * 1000;
    if (autoFetchInterval === '10m') intervalMs = 10 * 60 * 1000;
    if (autoFetchInterval === '30m') intervalMs = 30 * 60 * 1000;

    const timer = setInterval(() => {
      fetchRemote().catch((err) => {
        console.warn('Auto fetch failed silently:', err);
      });
    }, intervalMs);

    return () => clearInterval(timer);
  }, [currentRepo, autoFetchInterval, fetchRemote]);

  const handleOpenRepoDialog = (mode: 'open' | 'clone' | 'init' = 'open') => {
    setRepoDialogMode(mode);
    setRepoDialogOpen(true);
  };

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-background text-foreground select-none font-sans">
      {/* Top Header & Action Toolbar */}
      <Header
        onOpenCommandPalette={() => setCommandPaletteOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenRepoDialog={() => handleOpenRepoDialog('open')}
        onOpenGitHubAuth={() => setGithubAuthOpen(true)}
      />

      {/* Main 3-Column Work Area */}
      <div className="flex-1 flex overflow-hidden relative">
        <LeftSidebar />
        {!isLeftSidebarCollapsed && (
          <ResizeHandle
            currentSize={leftSidebarWidth}
            onSizeChange={setLeftSidebarWidth}
            minSize={160}
            maxSize={480}
            defaultSize={DEFAULT_LAYOUT.leftSidebarWidth}
            title={t('layout.resizeLeft')}
          />
        )}
        <CenterStage
          onOpenRepoDialog={() => handleOpenRepoDialog('open')}
          onCloneRepoDialog={() => handleOpenRepoDialog('clone')}
          onInitRepoDialog={() => handleOpenRepoDialog('init')}
          onOpenGitHubAuth={() => setGithubAuthOpen(true)}
        />
        {!isRightPaneCollapsed && (
          <>
            <ResizeHandle
              currentSize={rightPaneWidth}
              onSizeChange={setRightPaneWidth}
              minSize={220}
              maxSize={650}
              defaultSize={DEFAULT_LAYOUT.rightPaneWidth}
              reverse
              title={t('layout.resizeRight')}
            />
            <RightPane />
          </>
        )}
      </div>

      {/* Bottom Status Bar */}
      <StatusBar />

      {/* Global Modals & Dialogs */}
      <CommandPalette
        open={commandPaletteOpen}
        onOpenChange={setCommandPaletteOpen}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenRepoDialog={() => handleOpenRepoDialog('open')}
      />

      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        onOpenGitHubAuth={() => setGithubAuthOpen(true)}
      />

      <RepositoryDialog
        open={repoDialogOpen}
        onOpenChange={setRepoDialogOpen}
        initialMode={repoDialogMode}
      />

      <GitHubAuthDialog
        open={githubAuthOpen}
        onOpenChange={setGithubAuthOpen}
      />

      {/* Global Floating Toast Notifications */}
      <ToastContainer />
    </div>
  );
};

