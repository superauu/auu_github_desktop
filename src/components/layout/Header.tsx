import React from 'react';
import {
  GitBranch as GitBranchIcon,
  RefreshCw,
  ArrowDown,
  ArrowUp,
  Search,
  Settings as SettingsIcon,
  Sun,
  Moon,
  FolderGit2,
  ChevronDown,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Github,
} from 'lucide-react';
import { useRepoStore } from '@/stores/repoStore';
import { useThemeStore, ThemeMode } from '@/stores/themeStore';
import { useGitHubStore } from '@/stores/githubStore';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/stores/toastStore';

interface HeaderProps {
  onOpenCommandPalette?: () => void;
  onOpenSettings?: () => void;
  onOpenRepoDialog?: () => void;
  onOpenGitHubAuth?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenCommandPalette,
  onOpenSettings,
  onOpenRepoDialog,
  onOpenGitHubAuth,
}) => {
  const {
    currentRepo,
    status,
    isLeftSidebarCollapsed,
    isRightPaneCollapsed,
    toggleLeftSidebar,
    toggleRightPane,
    recentRepos,
    setCurrentRepo,
    refreshAll,
  } = useRepoStore();

  const { theme, resolvedTheme, setTheme } = useThemeStore();
  const { user, isAuthenticated, isDemoMode } = useGitHubStore();
  const [showRepoMenu, setShowRepoMenu] = React.useState(false);

  const cycleTheme = () => {
    const modes: ThemeMode[] = ['system', 'dark', 'light'];
    const nextIndex = (modes.indexOf(theme) + 1) % modes.length;
    setTheme(modes[nextIndex]);
    toast.info(
      modes[nextIndex] === 'system'
        ? '已恢复为系统自适应主题'
        : modes[nextIndex] === 'dark'
        ? '已切换为深色暗黑主题'
        : '已切换为明亮浅色主题'
    );
  };

  const handleFetch = async () => {
    toast.info('正在获取远程更新 (git fetch)...');
    await refreshAll();
    toast.success('远程更新获取完成', '本地引用与 Ahead/Behind 状态已刷新');
  };

  const handlePull = () => {
    toast.info('正在拉取远程更新 (git pull)...');
  };

  const handlePush = () => {
    toast.info('正在推送本地提交到远程 (git push)...');
  };

  return (
    <TooltipProvider delayDuration={300}>
      <header className="h-11 border-b border-border/80 glass-header px-3 flex items-center justify-between select-none z-30 shrink-0">
        {/* Left Section: Logo & Repo Switcher */}
        <div className="flex items-center gap-2 min-w-0">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                onClick={toggleLeftSidebar}
              >
                {isLeftSidebarCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {isLeftSidebarCollapsed ? '展开左侧边栏' : '收起左侧边栏'}
            </TooltipContent>
          </Tooltip>

          {/* Logo */}
          <div className="flex items-center gap-2 mr-2">
            <img src="/logo.svg" alt="Auu Git" className="h-5 w-5 rounded drop-shadow-sm" />
            <span className="font-semibold text-xs tracking-tight bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent hidden sm:inline-block">
              Auu Git
            </span>
          </div>

          <div className="h-4 w-[1px] bg-border/60 mx-0.5" />

          {/* Repository Selector */}
          <div className="relative">
            <button
              onClick={() => setShowRepoMenu(!showRepoMenu)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs hover:bg-accent/80 transition-colors border border-transparent hover:border-border/50 text-left group"
            >
              <FolderGit2 className="h-3.5 w-3.5 text-primary shrink-0" />
              <div className="flex flex-col leading-none">
                <span className="font-medium text-foreground max-w-[130px] truncate text-xs">
                  {currentRepo ? currentRepo.name : '未打开仓库'}
                </span>
              </div>
              {currentRepo && (
                <Badge variant="outline" className="h-4 px-1.5 text-[10px] font-mono gap-1 bg-accent/40 text-foreground border-border/70">
                  <GitBranchIcon className="h-2.5 w-2.5 text-indigo-400" />
                  <span className="max-w-[70px] truncate">{currentRepo.currentBranch || 'master'}</span>
                </Badge>
              )}
              <ChevronDown className="h-3 w-3 text-muted-foreground group-hover:text-foreground transition-transform" />
            </button>

            {/* Repo Dropdown Menu */}
            {showRepoMenu && (
              <div
                className="absolute left-0 top-full mt-1 w-64 rounded-xl border border-border bg-popover/95 p-1.5 shadow-2xl z-50 animate-in fade-in-50 zoom-in-95 backdrop-blur-xl"
                onMouseLeave={() => setShowRepoMenu(false)}
              >
                <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  当前仓库
                </div>
                <div className="px-2 py-1.5 text-xs font-medium text-foreground bg-accent/40 rounded-lg flex items-center justify-between">
                  <span className="truncate">{currentRepo?.name || '无'}</span>
                  {currentRepo && <Badge variant="success" className="h-4 text-[9px]">已加载</Badge>}
                </div>

                <div className="my-1.5 border-t border-border/60" />

                <button
                  onClick={() => {
                    setShowRepoMenu(false);
                    onOpenRepoDialog?.();
                  }}
                  className="w-full text-left px-2 py-1.5 text-xs text-foreground hover:bg-accent rounded-md flex items-center gap-2"
                >
                  <FolderGit2 className="h-3.5 w-3.5 text-primary" />
                  <span>打开其他本地仓库...</span>
                </button>

                {recentRepos.length > 0 && (
                  <>
                    <div className="px-2 pt-2 pb-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                      最近打开
                    </div>
                    <div className="max-h-36 overflow-y-auto space-y-0.5">
                      {recentRepos.map((repo) => (
                        <button
                          key={repo.path}
                          onClick={() => {
                            setCurrentRepo(repo);
                            setShowRepoMenu(false);
                            toast.success(`已切换至仓库: ${repo.name}`);
                          }}
                          className="w-full text-left px-2 py-1 text-xs text-foreground/80 hover:text-foreground hover:bg-accent rounded-md flex items-center justify-between"
                        >
                          <span className="truncate max-w-[170px]">{repo.name}</span>
                          <span className="text-[10px] text-muted-foreground font-mono">{repo.currentBranch}</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Center Section: Quick Git Actions (Fetch, Pull, Push) */}
        {currentRepo && (
          <div className="hidden md:flex items-center gap-1 bg-secondary/50 border border-border/60 rounded-lg p-0.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={handleFetch}
                  className="gap-1 text-muted-foreground hover:text-foreground h-7 px-2"
                >
                  <RefreshCw className="h-3 w-3" />
                  <span>Fetch</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">获取远程变更并刷新状态 (Ctrl+Shift+F)</TooltipContent>
            </Tooltip>

            <div className="h-3 w-[1px] bg-border/80" />

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={handlePull}
                  className="gap-1 text-muted-foreground hover:text-foreground h-7 px-2"
                >
                  <ArrowDown className="h-3 w-3 text-cyan-400" />
                  <span>Pull</span>
                  {status && status.behind > 0 && (
                    <Badge variant="info" className="h-3.5 px-1 text-[9px]">{status.behind}</Badge>
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">拉取远程提交 (Ctrl+L)</TooltipContent>
            </Tooltip>

            <div className="h-3 w-[1px] bg-border/80" />

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={handlePush}
                  className="gap-1 text-muted-foreground hover:text-foreground h-7 px-2"
                >
                  <ArrowUp className="h-3 w-3 text-emerald-400" />
                  <span>Push</span>
                  {status && status.ahead > 0 && (
                    <Badge variant="success" className="h-3.5 px-1 text-[9px]">{status.ahead}</Badge>
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">推送本地提交 (Ctrl+P)</TooltipContent>
            </Tooltip>
          </div>
        )}

        {/* Right Section: Command Palette, Theme, Settings, Right Pane Toggle */}
        <div className="flex items-center gap-1.5">
          {/* Command Palette Trigger */}
          <Button
            variant="outline"
            size="sm"
            onClick={onOpenCommandPalette}
            className="h-7 px-2.5 gap-2 text-muted-foreground hover:text-foreground text-xs font-normal border-border/70 hidden sm:flex items-center rounded-lg"
          >
            <Search className="h-3 w-3" />
            <span className="text-[11px]">命令搜索...</span>
            <kbd className="pointer-events-none inline-flex h-4 select-none items-center gap-0.5 rounded border border-border bg-muted/60 px-1 font-mono text-[9px] font-medium text-muted-foreground">
              <span className="text-[10px]">⌘</span>K
            </kbd>
          </Button>

          {/* GitHub Status Indicator */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={onOpenGitHubAuth}
                className="h-7 w-7 text-muted-foreground hover:text-foreground relative"
              >
                {isAuthenticated && user ? (
                  <img
                    src={user.avatar_url}
                    alt={user.login}
                    className="w-4 h-4 rounded-full border border-primary/50"
                  />
                ) : (
                  <Github className="h-3.5 w-3.5 text-muted-foreground" />
                )}
                {isDemoMode && !isAuthenticated && (
                  <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-amber-400 ring-2 ring-background" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {isAuthenticated && user
                ? `GitHub 已连接: @${user.login} (点击管理)`
                : isDemoMode
                ? 'GitHub 演示模式已启用 (点击管理连接)'
                : '连接 GitHub 开发者账号'}
            </TooltipContent>
          </Tooltip>

          {/* Theme Switcher */}
          <div className="relative">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-foreground"
                  onClick={cycleTheme}
                >
                  {resolvedTheme === 'dark' ? (
                    <Moon className="h-3.5 w-3.5 text-indigo-400" />
                  ) : (
                    <Sun className="h-3.5 w-3.5 text-amber-500" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                主题: {theme === 'system' ? '系统自适应' : theme === 'dark' ? '深色暗黑' : '明亮浅色'}
              </TooltipContent>
            </Tooltip>
          </div>

          {/* Settings Button */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                onClick={onOpenSettings}
              >
                <SettingsIcon className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">首选项设置</TooltipContent>
          </Tooltip>

          <div className="h-4 w-[1px] bg-border/60 mx-0.5" />

          {/* Right Pane Toggle */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                onClick={toggleRightPane}
              >
                {isRightPaneCollapsed ? <PanelRightOpen className="h-4 w-4" /> : <PanelRightClose className="h-4 w-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {isRightPaneCollapsed ? '展开检查面板' : '收起检查面板'}
            </TooltipContent>
          </Tooltip>
        </div>
      </header>
    </TooltipProvider>
  );
};
