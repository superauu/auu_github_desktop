import React, { useState } from 'react';
import {
  GitBranch as GitBranchIcon,
  RefreshCw,
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
  RotateCcw,
  RotateCw,
  ArrowDownToLine,
  ArrowUpToLine,
  GitPullRequest,
  Archive,
  Inbox,
  Terminal,
  Workflow,
  ChevronRight,
  Plus,
  X,
} from 'lucide-react';
import { useRepoStore } from '@/stores/repoStore';
import { useLayoutStore } from '@/stores/layoutStore';
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
    fetchRemote,
    pull,
    push,
    undoLastCommit,
    redoStack,
    redoLastCommit,
    commits,
    stashPush,
    stashPop,
    setActiveTab,
    stashes,
    branches,
    checkoutBranch,
  } = useRepoStore();

  const { toggleEmbeddedTerminal, isEmbeddedTerminalOpen } = useLayoutStore();
  const { resolvedTheme, setTheme } = useThemeStore();
  const { user, isAuthenticated, isDemoMode } = useGitHubStore();
  const [showRepoMenu, setShowRepoMenu] = useState(false);
  const [showBranchMenu, setShowBranchMenu] = useState(false);
  const [branchFilter, setBranchFilter] = useState('');
  const [createBranchModalOpen, setCreateBranchModalOpen] = useState(false);
  const [mergeModalOpen, setMergeModalOpen] = useState(false);
  const [isUndoing, setIsUndoing] = useState(false);
  const [isRedoing, setIsRedoing] = useState(false);
  const [isStashing, setIsStashing] = useState(false);
  const [showPullMenu, setShowPullMenu] = useState(false);

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

  const handleRedo = async () => {
    if (isRedoing || redoStack.length === 0) return;
    const targetItem = redoStack[0];
    if (targetItem.branch !== currentBranchName) {
      toast.warning('无法重做', `该提交属于分支: ${targetItem.branch}`);
      return;
    }

    setIsRedoing(true);
    toast.info(`正在重做恢复提交: ${targetItem.commitSubject}...`);
    try {
      await redoLastCommit();
      toast.success('已成功重做恢复提交', `${targetItem.commitSubject} (${targetItem.commitHash.slice(0, 7)})`);
    } catch (err: any) {
      toast.error('重做失败', err?.message);
    } finally {
      setIsRedoing(false);
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
    toggleEmbeddedTerminal();
    toast.info(!isEmbeddedTerminalOpen ? '已调起内嵌命令行终端' : '已收起内嵌终端');
  };

  const aheadCount = status?.ahead || 0;
  const behindCount = status?.behind || 0;
  const hasChanges = status ? !status.isClean : false;
  const currentBranchName =
    branches.find((b) => b.isCurrent)?.name ||
    status?.currentBranch ||
    currentRepo?.currentBranch ||
    'main';
  const canUndo = commits.length > 0;
  const canRedo = redoStack.length > 0 && redoStack[0].branch === currentBranchName;
  const nextRedoItem = redoStack[0];

  return (
    <TooltipProvider delayDuration={300}>
      <header className="flex flex-col border-b border-border/80 select-none z-30 shrink-0 bg-background/95 dark:bg-[#0b0d14]/95 backdrop-blur-md">
        {/* Single Main Action Toolbar */}
        <div className="h-11 px-3 flex items-center justify-between text-xs bg-background/80">
          {/* Left: Branding Logo + Sidebar Toggle + Repo/Branch Dropdowns */}
          <div className="flex items-center gap-2 min-w-0">
            {/* App Branding: Auu Git Desktop */}
            <div className="flex items-center gap-1.5 pr-1 shrink-0">
              <img src="/logo.svg" alt="Auu Git" className="h-4 w-4 rounded drop-shadow-sm" />
              <span className="font-bold text-[12px] tracking-tight bg-gradient-to-r from-slate-900 via-slate-800 to-sky-600 dark:from-white dark:via-slate-100 dark:to-sky-400 bg-clip-text text-transparent hidden sm:inline-block">
                Auu Git Desktop
              </span>
            </div>

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
                    <span className="max-w-[140px] truncate">{currentBranchName}</span>
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
                        .map((branch) => {
                          const isCurrentBranch = branch.isCurrent || branch.name === currentBranchName;
                          return (
                            <button
                              key={branch.name}
                              onClick={async () => {
                                if (isCurrentBranch) {
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
                                isCurrentBranch
                                  ? "bg-primary/15 text-primary font-medium cursor-default"
                                  : "text-foreground/80 hover:text-foreground hover:bg-accent cursor-pointer"
                              )}
                            >
                              <div className="flex items-center gap-1.5 truncate min-w-0">
                                <GitBranchIcon className={cn("h-3 w-3 shrink-0", isCurrentBranch ? "text-primary" : "text-muted-foreground")} />
                                <span className="truncate">{branch.name}</span>
                              </div>
                              {isCurrentBranch && (
                                <span className="text-[9px] uppercase px-1 rounded bg-primary/20 text-primary font-bold font-mono shrink-0">
                                  HEAD
                                </span>
                              )}
                            </button>
                          );
                        })}
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

          {/* Center: GitKraken-style Operations Ribbon (Undo, Redo, Pull, Push, Branch, Stash, Pop, | Terminal) */}
          {currentRepo && (
            <div className="hidden md:flex items-center gap-0.5 sm:gap-1 py-0.5">
              {/* Undo */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={handleUndo}
                    disabled={isUndoing || !canUndo}
                    className="flex flex-col items-center justify-center min-w-[42px] px-2 py-0.5 rounded text-slate-700 hover:text-sky-600 hover:bg-sky-50 dark:text-sky-400 dark:hover:text-sky-300 dark:hover:bg-accent/50 transition-colors disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed group"
                  >
                    <span className="text-[10px] leading-tight group-hover:underline">Undo</span>
                    <RotateCcw className="h-3.5 w-3.5 mt-0.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  {canUndo ? '撤销最新一次提交 (git reset --soft HEAD~1)' : '当前分支暂无提交可撤销'}
                </TooltipContent>
              </Tooltip>

              {/* Redo */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={handleRedo}
                    disabled={isRedoing || !canRedo}
                    className={cn(
                      "flex flex-col items-center justify-center min-w-[42px] px-2 py-0.5 rounded transition-colors group",
                      canRedo
                        ? "text-slate-700 hover:text-sky-600 hover:bg-sky-50 dark:text-sky-400 dark:hover:text-sky-300 dark:hover:bg-accent/50 cursor-pointer"
                        : "text-muted-foreground/40 cursor-not-allowed"
                    )}
                  >
                    <span className={cn("text-[10px] leading-tight", canRedo && "group-hover:underline")}>Redo</span>
                    <RotateCw className="h-3.5 w-3.5 mt-0.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  {canRedo && nextRedoItem
                    ? `重做并恢复提交: ${nextRedoItem.commitSubject} (${nextRedoItem.commitHash.slice(0, 7)})`
                    : '暂无可重做的操作 (Redo)'}
                </TooltipContent>
              </Tooltip>

              {/* Pull with Dropdown */}
              <div className="relative">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={handlePull}
                      className="flex flex-col items-center justify-center min-w-[46px] px-2 py-0.5 rounded text-slate-700 hover:text-sky-600 hover:bg-sky-50 dark:text-sky-400 dark:hover:text-sky-300 dark:hover:bg-accent/50 transition-colors relative group"
                    >
                      <span className="text-[10px] leading-tight group-hover:underline">Pull</span>
                      <div className="flex items-center justify-center mt-0.5 gap-0.5">
                        <ArrowDownToLine className="h-3.5 w-3.5" />
                        <span
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowPullMenu(!showPullMenu);
                          }}
                          className="hover:bg-accent/80 rounded p-0.5 -mr-1 cursor-pointer"
                          title="更多拉取选项"
                        >
                          <ChevronDown className="h-2.5 w-2.5" />
                        </span>
                      </div>
                      {behindCount > 0 && (
                        <span className="absolute -top-1 -right-0.5 bg-emerald-500 text-black text-[8px] font-bold rounded-full h-3.5 w-3.5 flex items-center justify-center shadow-xs">
                          {behindCount}
                        </span>
                      )}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">从远程拉取最新提交 (git pull)</TooltipContent>
                </Tooltip>

                {/* Pull Dropdown Options */}
                {showPullMenu && (
                  <div
                    className="absolute left-0 top-full mt-1 w-48 rounded-xl border border-border bg-popover/95 p-1.5 shadow-2xl z-50 animate-in fade-in-50 zoom-in-95 backdrop-blur-xl"
                    onMouseLeave={() => setShowPullMenu(false)}
                  >
                    <button
                      onClick={() => {
                        setShowPullMenu(false);
                        handlePull();
                      }}
                      className="w-full text-left px-2 py-1.5 text-xs text-foreground hover:bg-accent rounded-md flex items-center justify-between"
                    >
                      <span>Pull (git pull)</span>
                      <ArrowDownToLine className="h-3 w-3 text-sky-400" />
                    </button>
                    <button
                      onClick={async () => {
                        setShowPullMenu(false);
                        toast.info('正在执行变基拉取 (git pull --rebase)...');
                        try {
                          await pull();
                          toast.success('变基拉取完成');
                        } catch (err: any) {
                          toast.error('变基拉取失败', err?.message);
                        }
                      }}
                      className="w-full text-left px-2 py-1.5 text-xs text-foreground hover:bg-accent rounded-md flex items-center justify-between"
                    >
                      <span>Pull with Rebase</span>
                      <GitPullRequest className="h-3 w-3 text-amber-400" />
                    </button>
                    <div className="my-1 border-t border-border/60" />
                    <button
                      onClick={() => {
                        setShowPullMenu(false);
                        handleFetch();
                      }}
                      className="w-full text-left px-2 py-1.5 text-xs text-foreground hover:bg-accent rounded-md flex items-center justify-between"
                    >
                      <span>Fetch All (git fetch)</span>
                      <RefreshCw className="h-3 w-3 text-cyan-400" />
                    </button>
                  </div>
                )}
              </div>

              {/* Push */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={handlePush}
                    className={cn(
                      "flex flex-col items-center justify-center min-w-[42px] px-2 py-0.5 rounded transition-colors relative group",
                      aheadCount > 0
                        ? "text-amber-600 dark:text-amber-300 hover:text-amber-700 dark:hover:text-amber-200 hover:bg-amber-50 dark:hover:bg-amber-500/15 font-medium"
                        : "text-slate-700 hover:text-sky-600 hover:bg-sky-50 dark:text-sky-400 dark:hover:text-sky-300 dark:hover:bg-accent/50"
                    )}
                  >
                    <span className="text-[10px] leading-tight group-hover:underline">Push</span>
                    <ArrowUpToLine className="h-3.5 w-3.5 mt-0.5" />
                    {aheadCount > 0 && (
                      <span className="absolute -top-1 -right-0.5 bg-amber-500 text-black text-[8px] font-bold rounded-full h-3.5 w-3.5 flex items-center justify-center shadow-xs">
                        {aheadCount}
                      </span>
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">推送本地提交至远程 (git push)</TooltipContent>
              </Tooltip>

              {/* Branch */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => setCreateBranchModalOpen(true)}
                    className="flex flex-col items-center justify-center min-w-[44px] px-2 py-0.5 rounded text-slate-700 hover:text-sky-600 hover:bg-sky-50 dark:text-sky-400 dark:hover:text-sky-300 dark:hover:bg-accent/50 transition-colors group"
                  >
                    <span className="text-[10px] leading-tight group-hover:underline">Branch</span>
                    <GitBranchIcon className="h-3.5 w-3.5 mt-0.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">创建新分支 (git branch)</TooltipContent>
              </Tooltip>

              {/* Stash */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={handleQuickStash}
                    disabled={isStashing || !hasChanges}
                    className="flex flex-col items-center justify-center min-w-[42px] px-2 py-0.5 rounded text-slate-700 hover:text-sky-600 hover:bg-sky-50 dark:text-sky-400 dark:hover:text-sky-300 dark:hover:bg-accent/50 transition-colors disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed group"
                  >
                    <span className="text-[10px] leading-tight group-hover:underline">Stash</span>
                    <Archive className="h-3.5 w-3.5 mt-0.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  {hasChanges ? '贮藏当前未提交改动 (git stash)' : '当前工作区无改动可贮藏'}
                </TooltipContent>
              </Tooltip>

              {/* Pop */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={handleQuickPop}
                    disabled={stashes.length === 0}
                    className="flex flex-col items-center justify-center min-w-[42px] px-2 py-0.5 rounded text-slate-700 hover:text-sky-600 hover:bg-sky-50 dark:text-sky-400 dark:hover:text-sky-300 dark:hover:bg-accent/50 transition-colors disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed group"
                  >
                    <span className="text-[10px] leading-tight group-hover:underline">Pop</span>
                    <Inbox className="h-3.5 w-3.5 mt-0.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  {stashes.length > 0 ? `恢复最新贮藏 (${stashes.length} 个可用)` : '暂无贮藏可恢复'}
                </TooltipContent>
              </Tooltip>

              {/* Vertical Separator */}
              <div className="h-6 w-[1px] bg-border/60 mx-1" />

              {/* Terminal */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={handleOpenTerminal}
                    className="flex flex-col items-center justify-center min-w-[46px] px-2 py-0.5 rounded text-slate-700 hover:text-sky-600 hover:bg-sky-50 dark:text-sky-400 dark:hover:text-sky-300 dark:hover:bg-accent/50 transition-colors group"
                  >
                    <span className="text-[10px] leading-tight group-hover:underline">Terminal</span>
                    <Terminal className="h-3.5 w-3.5 mt-0.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">在仓库路径调起系统命令行终端</TooltipContent>
              </Tooltip>
            </div>
          )}

          {/* Right: Actions, Search, Controls */}
          <div className="flex items-center gap-1">
            {/* Actions (GitKraken style) */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setActiveTab('actions')}
                  className="flex flex-col items-center justify-center min-w-[42px] px-1.5 py-0.5 rounded text-slate-700 hover:text-sky-600 hover:bg-sky-50 dark:text-sky-400 dark:hover:text-sky-300 dark:hover:bg-accent/50 transition-colors group"
                >
                  <span className="text-[10px] leading-tight group-hover:underline">Actions</span>
                  <Workflow className="h-3.5 w-3.5 mt-0.5 text-emerald-500 dark:text-emerald-400" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">GitHub Actions CI 仪表盘</TooltipContent>
            </Tooltip>

            {/* Search (GitKraken style) */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={onOpenCommandPalette}
                  className="flex flex-col items-center justify-center min-w-[42px] px-1.5 py-0.5 rounded text-slate-700 hover:text-sky-600 hover:bg-sky-50 dark:text-sky-400 dark:hover:text-sky-300 dark:hover:bg-accent/50 transition-colors group"
                >
                  <span className="text-[10px] leading-tight group-hover:underline">Search</span>
                  <Search className="h-3.5 w-3.5 mt-0.5" />
                </button>
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
