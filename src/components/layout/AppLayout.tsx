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
import { ShortcutCheatSheet } from './ShortcutCheatSheet';
import { useLayoutStore, DEFAULT_LAYOUT } from '@/stores/layoutStore';
import { useI18n } from '@/i18n';
import { useRepoStore } from '@/stores/repoStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { checkAndInstallUpdate } from '@/services/updater/UpdateService';

export const AppLayout: React.FC = () => {
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [repoDialogOpen, setRepoDialogOpen] = useState(false);
  const [repoDialogMode, setRepoDialogMode] = useState<'open' | 'clone' | 'init'>('open');
  const [githubAuthOpen, setGithubAuthOpen] = useState(false);
  const [cheatSheetOpen, setCheatSheetOpen] = useState(false);

  const {
    leftSidebarWidth,
    setLeftSidebarWidth,
    rightPaneWidth,
    setRightPaneWidth,
    toggleEmbeddedTerminal,
  } = useLayoutStore();
  const { isLeftSidebarCollapsed, isRightPaneCollapsed, currentRepo, fetchRemote, pull, push, setActiveTab } = useRepoStore();
  const { compactMode, autoFetchInterval } = useSettingsStore();
  const { t } = useI18n();

  const isTypingTarget = (target: EventTarget | null): boolean => {
    const el = target as HTMLElement | null;
    if (!el) return false;
    const tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
  };

  // Global Shortcuts（速查浮层：按 ?）
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+` 切换内嵌终端（输入框内也允许）
      if ((e.ctrlKey || e.metaKey) && (e.key === '`' || e.code === 'Backquote')) {
        e.preventDefault();
        toggleEmbeddedTerminal();
        return;
      }

      if (isTypingTarget(e.target)) return;

      // Ctrl+K 命令面板
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setCommandPaletteOpen((v) => !v);
        return;
      }

      // Ctrl+, 打开设置
      if ((e.ctrlKey || e.metaKey) && e.key === ',') {
        e.preventDefault();
        setSettingsOpen(true);
        return;
      }

      // ? 快捷键速查
      if (e.key === '?') {
        e.preventDefault();
        setCheatSheetOpen(true);
        return;
      }

      // Git 操作
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.shiftKey && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault();
        fetchRemote().catch(() => {});
        return;
      }
      if (mod && !e.shiftKey && (e.key === 'l' || e.key === 'L')) {
        e.preventDefault();
        pull().catch(() => {});
        return;
      }
      if (mod && !e.shiftKey && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault();
        push().catch(() => {});
        return;
      }

      // Alt+1~4 切换视图
      if (e.altKey && ['1', '2', '3', '4'].includes(e.key)) {
        e.preventDefault();
        const views = ['changes', 'history', 'pullRequests', 'actions'] as const;
        setActiveTab(views[Number(e.key) - 1]);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleEmbeddedTerminal, fetchRemote, pull, push, setActiveTab]);

  // Apply compact mode on mount
  // 启动后静默检查应用更新（仅桌面端）
  useEffect(() => {
    const timer = setTimeout(() => {
      checkAndInstallUpdate(true);
    }, 15000);
    return () => clearTimeout(timer);
  }, []);
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

      {/* Keyboard Shortcut Cheat Sheet (?) */}
      <ShortcutCheatSheet open={cheatSheetOpen} onOpenChange={setCheatSheetOpen} />
    </div>
  );
};

