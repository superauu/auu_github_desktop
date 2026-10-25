import { useShallow } from 'zustand/react/shallow';
import { useWorkspaceLayout } from '@/hooks/useWorkspaceLayout';
import { ModalSurface } from '@/components/ui/ModalSurface';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { RemoteOperationDialog } from '@/features/git/RemoteOperationDialog';
import { pushFromUi } from '@/services/git/RemoteActions';
import { useRemoteDialogStore } from '@/stores/remoteDialogStore';
import React, { useState, useEffect, lazy, Suspense } from 'react';
import { Header } from './Header';
import { LeftSidebar } from './LeftSidebar';
import { CenterStage } from './CenterStage';
import { RightPane } from './RightPane';
import { StatusBar } from './StatusBar';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { CommandPalette } from '@/components/command/CommandPalette';
import { ToastContainer } from '@/components/ui/ToastContainer';
import { ResizeHandle } from '@/components/ui/ResizeHandle';
import { ShortcutCheatSheet } from './ShortcutCheatSheet';
import { useLayoutStore, DEFAULT_LAYOUT } from '@/stores/layoutStore';
import { useI18n } from '@/i18n';
import { useRepoStore } from '@/stores/repoStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { checkForUpdates } from '@/services/updater/UpdateService';
import { createExternalChangePoller } from '@/services/git/ExternalChangePoller';
import { getPendingGitWrites } from '@/services/git/GitQueue';
import { UpdateDialog } from './UpdateDialog';
import { gitService } from '@/services/git/GitService';
import { toast } from '@/stores/toastStore';
import { useWindowChrome } from '@/hooks/useWindowChrome';
import { isRepositoryAccessCancelled } from '@/services/fs/RepositoryAccess';

// 稀用全局弹窗按需加载，削减首屏主包：设置/仓库/登录/操作历史/恢复中心。
// CommandPalette 保持常驻——ReleaseNotesDialog 寄宿其内（面板关闭后仍需挂载）；
// UpdateDialog 需启动即自动检查更新，不能延迟挂载。
const SettingsDialog = lazy(() => import('@/components/settings/SettingsDialog').then(m => ({ default: m.SettingsDialog })));
const RepositoryDialog = lazy(() => import('@/features/repository/RepositoryDialog').then(m => ({ default: m.RepositoryDialog })));
const GitHubAuthDialog = lazy(() => import('@/components/github/GitHubAuthDialog').then(m => ({ default: m.GitHubAuthDialog })));
const OperationHistoryDialog = lazy(() => import('./OperationHistoryDialog').then(m => ({ default: m.OperationHistoryDialog })));
const RecoveryCenterDialog = lazy(() => import('@/features/git/RecoveryCenterDialog').then(m => ({ default: m.RecoveryCenterDialog })));

export const AppLayout: React.FC = () => {
  const windowChrome = useWindowChrome();
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'appearance' | 'ai' | 'git' | 'github'>('appearance');
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const { navigationOverlay, inspectorOverlay, panels } = useWorkspaceLayout();
  const [repoDialogOpen, setRepoDialogOpen] = useState(false);
  const [repoDialogMode, setRepoDialogMode] = useState<'open' | 'clone' | 'init'>('open');
  const [githubAuthOpen, setGithubAuthOpen] = useState(false);
  const [cheatSheetOpen, setCheatSheetOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [recoveryPath, setRecoveryPath] = useState<string | null>(null);

  const {
    setLeftSidebarWidth,
    setRightPaneWidth,
    toggleEmbeddedTerminal,
    navigationPinned,
  } = useLayoutStore();
  const { isLeftSidebarCollapsed, isRightPaneCollapsed, activeTab, toggleLeftSidebar, toggleRightPane, currentRepo, fetchRemote, pull, setActiveTab, checkExternalChanges } = useRepoStore(useShallow(state => ({ isLeftSidebarCollapsed: state.isLeftSidebarCollapsed, isRightPaneCollapsed: state.isRightPaneCollapsed, activeTab: state.activeTab, toggleLeftSidebar: state.toggleLeftSidebar, toggleRightPane: state.toggleRightPane, currentRepo: state.currentRepo, fetchRemote: state.fetchRemote, pull: state.pull, setActiveTab: state.setActiveTab, checkExternalChanges: state.checkExternalChanges })));
  const { compactMode, autoFetchInterval } = useSettingsStore();
  const { t } = useI18n();

  useEffect(() => { setNavigationOpen(false); }, [activeTab, currentRepo?.path]);
  useEffect(() => { setNavigationOpen(false); }, [navigationPinned]);
  useEffect(() => { setInspectorOpen(false); }, [currentRepo?.path]);
  useEffect(() => { if (!['changes', 'history'].includes(activeTab)) setInspectorOpen(false); }, [activeTab]);

  useEffect(() => {
    const openSettings = (event: Event) => {
      if ((event as CustomEvent).detail !== 'git') return;
      useRemoteDialogStore.getState().settle(null);
      setCommandPaletteOpen(false); setInspectorOpen(false);
      setSettingsTab('git'); setSettingsOpen(true);
    };
    window.addEventListener('auugit:open-settings', openSettings);
    return () => window.removeEventListener('auugit:open-settings', openSettings);
  }, []);

  const isTypingTarget = (target: EventTarget | null): boolean => {
    const el = target as HTMLElement | null;
    if (!el) return false;
    const tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
  };

  // Global Shortcuts（速查浮层：按 ?）
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+` 切换内嵌终端：放在 dialog guard 之前，弹窗内也能呼出（终端是开发辅助）
      if ((e.ctrlKey || e.metaKey) && (e.key === '`' || e.code === 'Backquote')) {
        e.preventDefault();
        toggleEmbeddedTerminal();
        return;
      }

      if (document.querySelector('[role="dialog"][data-state="open"]')) return;

      // Ctrl+K 命令面板：放在 isTypingTarget 之前，输入框内也要能呼出
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setCommandPaletteOpen((v) => !v);
        return;
      }

      if (isTypingTarget(e.target)) return;

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
        pushFromUi().catch(error => toast.error(t('header.pushFailed'), error?.message));
        return;
      }

      // Alt+1~5 切换视图
      if (e.altKey && ['1', '2', '3', '4', '5'].includes(e.key)) {
        e.preventDefault();
        const views = ['changes', 'history', 'pullRequests', 'actions', 'forge'] as const;
        setActiveTab(views[Number(e.key) - 1]);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleEmbeddedTerminal, fetchRemote, pull, setActiveTab, t]);

  // Apply compact mode on mount
  // 启动后静默检查应用更新（仅桌面端）
  useEffect(() => {
    const timer = setTimeout(() => {
      void checkForUpdates(true);
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

  // Active windows poll at 10s; idle windows back off. Focus changes are debounced.
  useEffect(() => {
    if (!currentRepo) return;
    const poller = createExternalChangePoller({ check: checkExternalChanges,
      canCheck: () => document.visibilityState === 'visible' && getPendingGitWrites(currentRepo.path) === 0 });
    const wake = () => { if (document.visibilityState === 'visible') poller.wake(); };
    window.addEventListener('focus', wake);
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('pointerdown', poller.touch, { passive: true });
    window.addEventListener('keydown', poller.touch);
    return () => {
      poller.stop();
      window.removeEventListener('focus', wake);
      document.removeEventListener('visibilitychange', wake);
      window.removeEventListener('pointerdown', poller.touch);
      window.removeEventListener('keydown', poller.touch);
    };
  }, [currentRepo?.path, checkExternalChanges]);
  // Background Auto Fetch timer
  useEffect(() => {
    if (!currentRepo || autoFetchInterval === 'never') return;

    let intervalMs = 10 * 60 * 1000;
    if (autoFetchInterval === '5m') intervalMs = 5 * 60 * 1000;
    if (autoFetchInterval === '10m') intervalMs = 10 * 60 * 1000;
    if (autoFetchInterval === '30m') intervalMs = 30 * 60 * 1000;

    const timer = setInterval(() => {
      if (document.visibilityState !== 'visible' || getPendingGitWrites(currentRepo.path) > 0) return;
      fetchRemote().catch((err) => {
        console.warn('Auto fetch failed silently:', err);
      });
    }, intervalMs);

    return () => clearInterval(timer);
  }, [currentRepo?.path, autoFetchInterval, fetchRemote]);

  const handleOpenRepoDialog = (mode: 'open' | 'clone' | 'init' = 'open') => {
    setRepoDialogMode(mode);
    setRepoDialogOpen(true);
  };
  const openRecovery = async (path: string) => {
    try {
      if (useRepoStore.getState().currentRepo?.path !== path) {
        const repo = await gitService.openRepository(path);
        if (!await useRepoStore.getState().setCurrentRepo(repo)) return;
      }
      setHistoryOpen(false); setRecoveryPath(path);
    } catch (error) { if (!isRepositoryAccessCancelled(error)) toast.error(t('operationLog.recoveryFailed'), error instanceof Error ? error.message : String(error)); }
  };

  return (
    <div className="app-shell h-screen w-screen flex flex-col overflow-hidden text-foreground select-none font-sans" data-window-maximized={windowChrome.maximized} data-window-focused={windowChrome.focused}>
      {/* Top Header & Action Toolbar */}
      <ErrorBoundary>
        <Header
          windowChrome={windowChrome}
          navigationOverlay={navigationOverlay}
          inspectorOverlay={inspectorOverlay}
          onToggleNavigation={() => navigationOverlay ? setNavigationOpen(!navigationOpen) : toggleLeftSidebar()}
          onToggleInspector={() => inspectorOverlay ? setInspectorOpen(!inspectorOpen) : toggleRightPane()}
          onOpenCommandPalette={() => setCommandPaletteOpen(true)}
          onOpenSettings={() => { setSettingsTab('appearance'); setSettingsOpen(true); }}
          onOpenAccountSettings={() => { setSettingsTab('github'); setSettingsOpen(true); }}
          onOpenRepoDialog={() => handleOpenRepoDialog('open')}
          onOpenGitHubAuth={() => setGithubAuthOpen(true)}
        />
      </ErrorBoundary>

      {/* Main 3-Column Work Area */}
      <div className="app-workspace flex-1 min-h-0 flex overflow-hidden relative">
        {!navigationOverlay && <ErrorBoundary><LeftSidebar /></ErrorBoundary>}
        {navigationOverlay && navigationOpen && <ModalSurface label={t('composer.navigation')} onDismiss={() => setNavigationOpen(false)} className="fixed inset-0 z-40 bg-black/35 flex">
          <div className="glass-surface h-full w-72 flex flex-col shadow-2xl border-r border-border">
            <ErrorBoundary><LeftSidebar inDrawer onNavigate={() => setNavigationOpen(false)} /></ErrorBoundary>
          </div>
        </ModalSurface>}
        {!navigationOverlay && !isLeftSidebarCollapsed && (
          <ResizeHandle
            className="glass-resize"
            currentSize={panels.left}
            onSizeChange={setLeftSidebarWidth}
            minSize={160}
            maxSize={500}
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
        {!inspectorOverlay && !isRightPaneCollapsed && ['changes', 'history'].includes(activeTab) && currentRepo && (
            <ResizeHandle
              className="glass-resize"
              currentSize={panels.right}
              onSizeChange={setRightPaneWidth}
              minSize={220}
              maxSize={650}
              defaultSize={DEFAULT_LAYOUT.rightPaneWidth}
              reverse
              title={t('layout.resizeRight')}
            />
        )}
        <ErrorBoundary><RightPane overlay={inspectorOverlay} open={inspectorOpen} onClose={() => setInspectorOpen(false)} onOpenAiSettings={() => { setSettingsTab('ai'); setSettingsOpen(true); }} /></ErrorBoundary>
      </div>

      {/* Bottom Status Bar */}
      <StatusBar onOpenHistory={() => setHistoryOpen(true)} />
      {historyOpen && (
        <ErrorBoundary><Suspense fallback={null}>
          <OperationHistoryDialog onClose={() => setHistoryOpen(false)} onRecovery={path => { void openRecovery(path); }} />
        </Suspense></ErrorBoundary>
      )}
      {recoveryPath && (
        <ErrorBoundary><Suspense fallback={null}>
          <RecoveryCenterDialog repoPath={recoveryPath} onClose={() => setRecoveryPath(null)} />
        </Suspense></ErrorBoundary>
      )}
      <UpdateDialog />

      {/* Global Modals & Dialogs */}
      <CommandPalette
        open={commandPaletteOpen}
        onOpenChange={setCommandPaletteOpen}
        onOpenSettings={() => { setSettingsTab('appearance'); setSettingsOpen(true); }}
        onOpenRepoDialog={() => handleOpenRepoDialog('open')}
        onOpenGitHubAuth={() => setGithubAuthOpen(true)}
      />

      {settingsOpen && (
        <ErrorBoundary><Suspense fallback={null}>
          <SettingsDialog
            initialTab={settingsTab}
            open={settingsOpen}
            onOpenChange={setSettingsOpen}
            onOpenGitHubAuth={() => setGithubAuthOpen(true)}
          />
        </Suspense></ErrorBoundary>
      )}

      {repoDialogOpen && (
        <ErrorBoundary><Suspense fallback={null}>
          <RepositoryDialog
            open={repoDialogOpen}
            onOpenChange={setRepoDialogOpen}
            initialMode={repoDialogMode}
          />
        </Suspense></ErrorBoundary>
      )}

      {githubAuthOpen && (
        <ErrorBoundary><Suspense fallback={null}>
          <GitHubAuthDialog
            open={githubAuthOpen}
            onOpenChange={setGithubAuthOpen}
          />
        </Suspense></ErrorBoundary>
      )}

      {/* Global Floating Toast Notifications */}
      <ToastContainer />
      <ConfirmDialog />
      <RemoteOperationDialog />

      {/* Keyboard Shortcut Cheat Sheet (?) */}
      <ShortcutCheatSheet open={cheatSheetOpen} onOpenChange={setCheatSheetOpen} />
    </div>
  );
};

