import React, { useState } from 'react';
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
  Plus,
  GitMerge,
  RotateCcw,
  Archive,
  Inbox,
  Terminal,
  X,
  Workflow,
  ChevronRight,
} from 'lucide-react';
import { useRepoStore } from '@/stores/repoStore';
import { useThemeStore, ThemeMode } from '@/stores/themeStore';
import { useGitHubStore } from '@/stores/githubStore';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { CreateBranchModal } from '@/features/git/CreateBranchModal';
import { MergeBranchModal } from '@/features/git/MergeBranchModal';
import { toast } from '@/stores/toastStore';
import { cn } from '@/utils/cn';

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
    openTabs,
    closeTab,
    switchTab,
    fetchRemote,
    pull,
    push,
    undoLastCommit,
    openTerminal,
    stashPush,
    stashPop,
    setActiveTab,
    stashes,
    branches,
    checkoutBranch,
  } = useRepoStore();

  const { resolvedTheme, setTheme } = useThemeStore();
  const { user, isAuthenticated, isDemoMode } = useGitHubStore();
  const [showRepoMenu, setShowRepoMenu] = useState(false);
  const [showBranchMenu, setShowBranchMenu] = useState(false);
  const [branchFilter, setBranchFilter] = useState('');
  const [createBranchModalOpen, setCreateBranchModalOpen] = useState(false);
  const [mergeModalOpen, setMergeModalOpen] = useState(false);
  const [isUndoing, setIsUndoing] = useState(false);
  const [isStashing, setIsStashing] = useState(false);

  const cycleTheme = () => {
    const nextTheme: ThemeMode = resolvedTheme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    toast.info(
      nextTheme === 'dark' ? '已切换为深色暗黑主题' : '已切换为明亮浅色主题'
    );
  };

  const handleFetch = async () => {
    toast.info('正在获取远程更新 (git fetch)...');
    try {
      await fetchRemote();
      toast.success('远程更新获取完成', '本地引用与 Ahead/Behind 状态已刷新');
    } catch (err: any) {
      toast.error('Fetch 失败', err.message);
    }
  };

  const handlePull = async () => {
    toast.info('正在拉取远程更新 (git pull)...');
    try {
      await pull();
      toast.success('已成功拉取最新提交');
    } catch (err: any) {
      toast.error('Pull 失败', err.message);
    }
  };

  const handlePush = async () => {
    toast.info('正在推送本地提交到远程 (git push)...');
    try {
      await push();
      toast.success('已成功推送到远程仓库');
    } catch (err: any) {
      toast.error('Push 失败', err.message);
    }
  };

  const handleUndo = async () => {
    if (isUndoing) return;
    setIsUndoing(true);
    toast.info('正在安全撤销最新提交 (git reset --soft HEAD~1)...');
    try {
      await undoLastCommit();
      toast.success('已撤销上一次提交', '改动已安全放回工作区/暂存区');
    } catch (err: any) {
      toast.error('撤销提交失败', err.message);
    } finally {
      setIsUndoing(false);
    }
  };

  const handleQuickStash = async () => {
    if (isStashing) return;
    setIsStashing(true);
    try {
      await stashPush('GitKraken-style Quick Stash');
      toast.success('工作区变动已安全暂存 (Stash)');
    } catch (err: any) {
      toast.error('贮藏失败', err.message);
    } finally {
      setIsStashing(false);
    }
  };

  const handleQuickPop = async () => {
    try {
      await stashPop(0);
      toast.success('已恢复最新贮藏到工作区 (Stash Pop)');
    } catch (err: any) {
      toast.error('弹出贮藏失败', err.message);
    }
  };

  const handleOpenTerminal = async () => {
    try {
      await openTerminal();
      toast.success('已调起系统命令行终端');
    } catch (err: any) {
      toast.info('已复制仓库路径到剪贴板', currentRepo?.path);
    }
  };

  const aheadCount = status?.ahead || 0;
  const behindCount = status?.behind || 0;

  return (
    <TooltipProvider delayDuration={300}>
      <header className="flex flex-col border-b border-border/80 select-none z-30 shrink-0 bg-background/95 backdrop-blur-md">
        {/* Tier 1: GitKraken-style Multi-Repository Workspace Tabs */}
        <div className="h-8 bg-card/60 border-b border-border/40 px-2 flex items-center justify-between text-xs overflow-x-auto no-scrollbar">
          <div className="flex items-center gap-1 min-w-0">
            {/* Logo */}
            <div className="flex items-center gap-1.5 px-2 mr-1">
              <img src="/logo.svg" alt="Auu Git" className="h-4 w-4 rounded drop-shadow-sm" />
              <span className="font-semibold text-[11px] tracking-tight bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent hidden sm:inline-block">
                Auu Git
              </span>
            </div>

            {/* Repo Tabs */}
            {openTabs.map((repo) => {
              const isActive = currentRepo?.path === repo.path;
              return (
                <div
                  key={repo.path}
                  onClick={() => switchTab(repo.path)}
                  className={cn(
                    "h-6 px-2.5 rounded-t-md border-t border-x flex items-center gap-1.5 cursor-pointer text-xs transition-all group shrink-0",
                    isActive
                      ? "bg-background border-border text-foreground font-semibold shadow-xs"
                      : "bg-muted/30 border-transparent text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                  )}
                  title={repo.path}
                >
                  <FolderGit2 className={cn("h-3 w-3", isActive ? "text-primary" : "text-muted-foreground")} />
                  <span className="truncate max-w-[120px] text-[11px]">{repo.name}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      closeTab(repo.path);
                    }}
                    className="p-0.5 rounded hover:bg-accent/80 text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                    title="关闭标签页"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </div>
              );
            })}

            {/* New Repo Tab Button (+) */}
            <button
              onClick={() => onOpenRepoDialog?.()}
              className="h-6 w-6 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors"
              title="打开或添加本地仓库标签页 (+)"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Window / Global Quick Links */}
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground pr-1">
            <span className="opacity-60 hidden lg:inline-block font-mono">Git Client Pro</span>
          </div>
        </div>

        {/* Tier 2: GitKraken-style Main Git Action Ribbon Toolbar */}
        <div className="h-10 px-3 flex items-center justify-between text-xs bg-background/80">
          {/* Left: Quick Switcher: repository: auu_saas > branch: main */}
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

            {/* Quick Switcher: repository: auu_saas > branch: main */}
            <div className="flex items-center gap-1.5 min-w-0">
              {/* Repository Selector Dropdown */}
              <div className="relative">
                <button
                  onClick={() => {
                    setShowRepoMenu(!showRepoMenu);
                    setShowBranchMenu(false);
                  }}
                  className="flex items-center gap-1 px-2 py-1 rounded-md hover:bg-accent/60 transition-colors border border-transparent hover:border-border/60 text-left group"
                >
                  <span className="text-[11px] text-muted-foreground font-mono">repository</span>
                  <span className="font-semibold text-foreground text-xs truncate max-w-[110px]">
                    {currentRepo ? currentRepo.name : '未打开'}
                  </span>
                  <ChevronDown className="h-3 w-3 text-muted-foreground group-hover:text-foreground transition-transform ml-0.5" />
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

              {/* Separator */}
              <ChevronRight className="h-3 w-3 text-muted-foreground/50 shrink-0" />

              {/* Branch Selector Dropdown (GitKraken-style real branch switcher) */}
              <div className="relative">
                <button
                  onClick={() => {
                    setShowBranchMenu(!showBranchMenu);
                    setShowRepoMenu(false);
                  }}
                  className="flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-accent/60 transition-colors border border-transparent hover:border-border/60 text-left group"
                >
                  <span className="text-[11px] text-muted-foreground font-mono">branch</span>
                  <Badge variant="outline" className="h-4.5 px-1.5 text-[10px] font-mono gap-1 bg-accent/40 text-foreground border-border/70 group-hover:border-primary/40">
                    <GitBranchIcon className="h-2.5 w-2.5 text-indigo-400 shrink-0" />
                    <span className="max-w-[120px] truncate">{currentRepo?.currentBranch || 'master'}</span>
                  </Badge>
                  <ChevronDown className="h-3 w-3 text-muted-foreground group-hover:text-foreground transition-transform ml-0.5" />
                </button>

                {/* Branch Dropdown Menu */}
                {showBranchMenu && (
                  <div
                    className="absolute left-0 top-full mt-1 w-72 rounded-xl border border-border bg-popover/95 p-1.5 shadow-2xl z-50 animate-in fade-in-50 zoom-in-95 backdrop-blur-xl"
                    onMouseLeave={() => setShowBranchMenu(false)}
                  >
                    {/* Search Input */}
                    <div className="relative mb-1.5 px-1 pt-0.5">
                      <Search className="h-3 w-3 text-muted-foreground absolute left-3 top-2.5" />
                      <input
                        value={branchFilter}
                        onChange={(e) => setBranchFilter(e.target.value)}
                        placeholder="搜索并切换分支..."
                        className="w-full h-7 pl-7 pr-6 text-xs bg-secondary/40 border border-border/50 rounded-md focus:outline-none focus:ring-1 focus:ring-primary text-foreground placeholder:text-muted-foreground"
                        autoFocus
                      />
                      {branchFilter && (
                        <button
                          onClick={() => setBranchFilter('')}
                          className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </div>

                    {/* Local Branches List */}
                    <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center justify-between">
                      <span>本地分支</span>
                      <span className="font-mono text-[9px]">{branches.filter((b) => !b.isRemote).length}</span>
                    </div>

                    <div className="max-h-52 overflow-y-auto space-y-0.5 px-0.5">
                      {branches
                        .filter((b) => !b.isRemote)
                        .filter((b) => !branchFilter || b.name.toLowerCase().includes(branchFilter.toLowerCase()))
                        .map((branch) => (
                          <button
                            key={branch.name}
                            onClick={async () => {
                              if (branch.isCurrent) {
                                setShowBranchMenu(false);
                                return;
                              }
                              try {
                                await checkoutBranch(branch.name);
                                toast.success('已切换至分支', branch.name);
                              } catch (err: any) {
                                toast.error('切换分支失败', err?.message);
                              } finally {
                                setShowBranchMenu(false);
                              }
                            }}
                            className={cn(
                              "w-full text-left px-2 py-1.5 text-xs rounded-md flex items-center justify-between transition-colors",
                              branch.isCurrent
                                ? "bg-primary/15 text-primary font-medium cursor-default"
                                : "text-foreground/80 hover:text-foreground hover:bg-accent cursor-pointer"
                            )}
                          >
                            <div className="flex items-center gap-1.5 truncate min-w-0">
                              <GitBranchIcon className={cn("h-3 w-3 shrink-0", branch.isCurrent ? "text-primary" : "text-muted-foreground")} />
                              <span className="truncate">{branch.name}</span>
                            </div>
                            {branch.isCurrent && (
                              <span className="text-[9px] uppercase px-1 rounded bg-primary/20 text-primary font-bold font-mono shrink-0">
                                HEAD
                              </span>
                            )}
                          </button>
                        ))}
                      {branches.filter((b) => !b.isRemote).filter((b) => !branchFilter || b.name.toLowerCase().includes(branchFilter.toLowerCase())).length === 0 && (
                        <div className="px-2 py-2 text-center text-xs text-muted-foreground/60 italic">
                          未匹配到分支
                        </div>
                      )}
                    </div>

                    {/* Quick Action: New Branch */}
                    <div className="pt-1.5 mt-1 border-t border-border/50">
                      <button
                        onClick={() => {
                          setShowBranchMenu(false);
                          setCreateBranchModalOpen(true);
                        }}
                        className="w-full text-left px-2 py-1 text-xs text-primary hover:bg-primary/10 rounded-md flex items-center gap-1.5"
                      >
                        <Plus className="h-3 w-3" />
                        <span>创建新分支...</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Center: GitKraken-style Operations Ribbon (Undo, Redo, Pull, Push, Branch, Stash, Pop, Merge, Terminal) */}
          {currentRepo && (
            <div className="hidden md:flex items-center gap-1 bg-secondary/40 border border-border/60 rounded-lg p-0.5">
              {/* Undo */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={handleUndo}
                    disabled={isUndoing}
                    className="gap-1 text-muted-foreground hover:text-foreground h-7 px-2"
                  >
                    <RotateCcw className="h-3 w-3" />
                    <span>Undo</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">撤销最新一次提交 (git reset --soft HEAD~1)</TooltipContent>
              </Tooltip>

              <div className="h-3.5 w-[1px] bg-border/60" />

              {/* Fetch */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={handleFetch}
                    className="gap-1 text-muted-foreground hover:text-foreground h-7 px-2"
                  >
                    <RefreshCw className="h-3 w-3 text-cyan-400" />
                    <span>Fetch</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">获取远程最新引用 (git fetch)</TooltipContent>
              </Tooltip>

              {/* Pull */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={handlePull}
                    className="gap-1 text-muted-foreground hover:text-foreground h-7 px-2 relative"
                  >
                    <ArrowDown className="h-3 w-3 text-emerald-400" />
                    <span>Pull</span>
                    {behindCount > 0 && (
                      <span className="absolute -top-1 -right-1 bg-emerald-500 text-black text-[9px] font-bold rounded-full h-3.5 w-3.5 flex items-center justify-center">
                        {behindCount}
                      </span>
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">拉取远程提交 (git pull)</TooltipContent>
              </Tooltip>

              {/* Push */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={handlePush}
                    className="gap-1 text-muted-foreground hover:text-foreground h-7 px-2 relative"
                  >
                    <ArrowUp className="h-3 w-3 text-indigo-400" />
                    <span>Push</span>
                    {aheadCount > 0 && (
                      <span className="absolute -top-1 -right-1 bg-indigo-500 text-white text-[9px] font-bold rounded-full h-3.5 w-3.5 flex items-center justify-center shadow-sm">
                        {aheadCount}
                      </span>
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">推送本地提交至远程 (git push)</TooltipContent>
              </Tooltip>

              <div className="h-3.5 w-[1px] bg-border/60" />

              {/* Branch */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => setCreateBranchModalOpen(true)}
                    className="gap-1 text-muted-foreground hover:text-foreground h-7 px-2"
                  >
                    <GitBranchIcon className="h-3 w-3 text-amber-400" />
                    <span>Branch</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">新建分支 (git branch)</TooltipContent>
              </Tooltip>

              {/* Stash */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={handleQuickStash}
                    disabled={isStashing}
                    className="gap-1 text-muted-foreground hover:text-foreground h-7 px-2"
                  >
                    <Archive className="h-3 w-3 text-cyan-400" />
                    <span>Stash</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">贮藏当前未提交改动 (git stash)</TooltipContent>
              </Tooltip>

              {/* Pop */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={handleQuickPop}
                    disabled={stashes.length === 0}
                    className="gap-1 text-muted-foreground hover:text-foreground h-7 px-2"
                  >
                    <Inbox className="h-3 w-3 text-cyan-400" />
                    <span>Pop</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">恢复最新贮藏到工作区 (git stash pop)</TooltipContent>
              </Tooltip>

              {/* Merge */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => setMergeModalOpen(true)}
                    className="gap-1 text-purple-300 hover:text-purple-200 hover:bg-purple-500/20 h-7 px-2 font-medium"
                  >
                    <GitMerge className="h-3 w-3 text-purple-400" />
                    <span>Merge</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">合并指定分支到当前分支 (git merge)</TooltipContent>
              </Tooltip>

              <div className="h-3.5 w-[1px] bg-border/60" />

              {/* Terminal */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={handleOpenTerminal}
                    className="gap-1 text-muted-foreground hover:text-foreground h-7 px-2"
                  >
                    <Terminal className="h-3 w-3" />
                    <span>Terminal</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">在当前仓库路径唤起系统命令行终端</TooltipContent>
              </Tooltip>
            </div>
          )}

          {/* Right: Actions, Search, Theme, User, Collapse Right Pane */}
          <div className="flex items-center gap-1.5">
            {/* Quick Actions tab shortcut */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => setActiveTab('actions')}
                  className="h-7 px-2 gap-1 text-muted-foreground hover:text-foreground hidden sm:flex"
                >
                  <Workflow className="h-3.5 w-3.5 text-emerald-400" />
                  <span>Actions</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">查看 GitHub Actions CI 仪表盘</TooltipContent>
            </Tooltip>

            {/* Command Search */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-foreground"
                  onClick={onOpenCommandPalette}
                >
                  <Search className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">全局命令搜索 (Ctrl+K)</TooltipContent>
            </Tooltip>

            {/* Theme Toggle */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-foreground"
                  onClick={cycleTheme}
                >
                  {resolvedTheme === 'dark' ? <Sun className="h-3.5 w-3.5 text-amber-400" /> : <Moon className="h-3.5 w-3.5 text-indigo-400" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">切换色彩模式</TooltipContent>
            </Tooltip>

            {/* GitHub Auth Profile */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={onOpenGitHubAuth}
                  className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs hover:bg-accent transition-colors border border-border/50 text-foreground"
                >
                  {user?.avatar_url ? (
                    <img src={user.avatar_url} alt={user.login} className="h-4 w-4 rounded-full border border-border" />
                  ) : (
                    <Github className="h-3.5 w-3.5 text-foreground" />
                  )}
                  <span className="font-medium text-[11px] max-w-[70px] truncate hidden xl:inline-block">
                    {isAuthenticated ? user?.login : isDemoMode ? 'Demo' : '登录'}
                  </span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {isAuthenticated ? `已登录: ${user?.login}` : '管理 GitHub 账号凭证'}
              </TooltipContent>
            </Tooltip>

            {/* Settings Dialog */}
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
              <TooltipContent side="bottom">打开设置</TooltipContent>
            </Tooltip>

            {/* Right Pane Collapse Toggle */}
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
                {isRightPaneCollapsed ? '展开提交与检查面板' : '收起右侧面板'}
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      </header>

      {/* Modals */}
      <CreateBranchModal
        open={createBranchModalOpen}
        onOpenChange={setCreateBranchModalOpen}
      />
      <MergeBranchModal
        open={mergeModalOpen}
        onOpenChange={setMergeModalOpen}
      />
    </TooltipProvider>
  );
};
