import { useShallow } from 'zustand/react/shallow';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { confirmAction } from '@/stores/confirmStore';
import React, { useEffect, useState } from 'react';
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
  AlertTriangle,
  GitPullRequest,
  Archive,
  Inbox,
  Terminal,
  ChevronRight,
  Plus,
  X,
  MoreHorizontal,
  Shield,
} from 'lucide-react';
import { useRepoStore } from '@/stores/repoStore';
import { useI18n } from '@/i18n';
import { useLayoutStore } from '@/stores/layoutStore';
import { useThemeStore, ThemeMode } from '@/stores/themeStore';
import { useGitHubStore } from '@/stores/githubStore';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { CreateBranchModal } from '@/features/git/CreateBranchModal';
import { MergeBranchModal } from '@/features/git/MergeBranchModal';
import { IgnoreDialog } from '@/features/git/IgnoreDialog';
import { toast } from '@/stores/toastStore';
import { cn } from '@/utils/cn';

interface HeaderProps {
  navigationOverlay: boolean;
  inspectorOverlay: boolean;
  onToggleNavigation: () => void;
  onToggleInspector: () => void;
  onOpenCommandPalette?: () => void;
  onOpenSettings?: () => void;
  onOpenRepoDialog?: () => void;
  onOpenGitHubAuth?: () => void;
}

const EMPTY_IGNORE_PATHS: string[] = [];

export const Header: React.FC<HeaderProps> = ({
  navigationOverlay, inspectorOverlay, onToggleNavigation, onToggleInspector,
  onOpenCommandPalette,
  onOpenSettings,
  onOpenRepoDialog,
  onOpenGitHubAuth,
}) => {
  const [ignoreRepoPath, setIgnoreRepoPath] = useState<string | null>(null);
  const {
    currentRepo,
    status,
    isLeftSidebarCollapsed,
    isRightPaneCollapsed,
    recentRepos,
    setCurrentRepo,
    openTabs,
    closeTab,
    switchTab,
    fetchRemote,
    refreshAll,
    pull,
    push,
    undoLastCommit,
    redoStack,
    redoLastCommit,
    commits,
    stashPush,
    stashPop,
    activeTab,
    stashes,
    branches,
    checkoutBranch,
  } = useRepoStore(useShallow(state => ({ currentRepo: state.currentRepo, status: state.status, isLeftSidebarCollapsed: state.isLeftSidebarCollapsed, isRightPaneCollapsed: state.isRightPaneCollapsed, recentRepos: state.recentRepos, setCurrentRepo: state.setCurrentRepo, openTabs: state.openTabs, closeTab: state.closeTab, switchTab: state.switchTab, fetchRemote: state.fetchRemote, refreshAll: state.refreshAll, pull: state.pull, push: state.push, undoLastCommit: state.undoLastCommit, redoStack: state.redoStack, redoLastCommit: state.redoLastCommit, commits: state.commits, stashPush: state.stashPush, stashPop: state.stashPop, activeTab: state.activeTab, stashes: state.stashes, branches: state.branches, checkoutBranch: state.checkoutBranch })));

  const { toggleEmbeddedTerminal, isEmbeddedTerminalOpen } = useLayoutStore();
  const { resolvedTheme, setTheme } = useThemeStore();
  const { user, isAuthenticated } = useGitHubStore();
  const { t } = useI18n();
  useEffect(() => { setIgnoreRepoPath(null); }, [currentRepo?.path]);
  const [showRepoMenu, setShowRepoMenu] = useState(false);
  const [showBranchMenu, setShowBranchMenu] = useState(false);
  const [branchFilter, setBranchFilter] = useState('');
  const [createBranchModalOpen, setCreateBranchModalOpen] = useState(false);
  const [mergeModalOpen, setMergeModalOpen] = useState(false);
  const [isUndoing, setIsUndoing] = useState(false);
  const [isRedoing, setIsRedoing] = useState(false);
  const [isStashing, setIsStashing] = useState(false);

  const cycleTheme = () => {
    const nextTheme: ThemeMode = resolvedTheme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    toast.info(
      nextTheme === 'dark' ? t('header.themeSwitchedDark') : t('header.themeSwitchedLight')
    );
  };

  const handleFetch = async () => {
    toast.info(t('header.fetching'));
    try {
      await fetchRemote();
      toast.success(t('header.fetchQuietDone'), t('header.fetchQuietDesc'));
    } catch (err: any) {
      toast.error(t('header.fetchFailed'), err.message);
    }
  };

  const handlePull = async () => {
    toast.info(t('header.pulling'));
    try {
      await pull();
      toast.success(t('header.pulled'));
    } catch (err: any) {
      toast.error(t('header.pullFailed'), err.message);
    }
  };

  const handlePush = async () => {
    toast.info(t('header.pushing'));
    try {
      await push();
      toast.success(t('header.pushed'));
    } catch (err: any) {
      toast.error(t('header.pushFailed'), err.message);
    }
  };

  const handleForcePush = async () => {
    if (!await confirmAction({ title: t('header.forcePush'), description: t('header.forcePushConfirm') })) return;
    toast.info(t('header.pushing'));
    try {
      await push(undefined, undefined, { forceWithLease: true });
      toast.success(t('header.pushed'));
    } catch (err: any) {
      toast.error(t('header.pushFailed'), err.message);
    }
  };

  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      await refreshAll();
      toast.success(t('header.refreshed'));
    } catch (err: any) {
      toast.error(t('header.refreshFailed'), err?.message);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleUndo = async () => {
    if (isUndoing) return;
    setIsUndoing(true);
    toast.info(t('header.undoing'));
    try {
      await undoLastCommit();
      toast.success(t('header.undone'), t('header.undoneDesc'));
    } catch (err: any) {
      toast.error(t('header.undoFailed'), err.message);
    } finally {
      setIsUndoing(false);
    }
  };

  const handleRedo = async () => {
    if (isRedoing || redoStack.length === 0) return;
    const targetItem = redoStack[0];
    if (targetItem.branch !== currentBranchName) {
      toast.warning(t('header.redoCannot'), `${t('header.redoBelongsTo')}: ${targetItem.branch}`);
      return;
    }

    setIsRedoing(true);
    toast.info(`${t('header.redoing')}: ${targetItem.commitSubject}...`);
    try {
      await redoLastCommit();
      toast.success(t('header.redone'), `${targetItem.commitSubject} (${targetItem.commitHash.slice(0, 7)})`);
    } catch (err: any) {
      toast.error(t('header.redoFailed'), err?.message);
    } finally {
      setIsRedoing(false);
    }
  };

  const handleQuickStash = async () => {
    if (isStashing) return;
    setIsStashing(true);
    try {
      await stashPush(t('changes.quickStashMsg'));
      toast.success(t('header.stashed'));
    } catch (err: any) {
      toast.error(t('changes.stashFailed'), err.message);
    } finally {
      setIsStashing(false);
    }
  };

  const handleQuickPop = async () => {
    try {
      await stashPop(0);
      toast.success(t('header.popDone'));
    } catch (err: any) {
      toast.error(t('header.popFailed'), err.message);
    }
  };

  const handleOpenTerminal = async () => {
    toggleEmbeddedTerminal();
    toast.info(!isEmbeddedTerminalOpen ? t('header.terminalOpened') : t('header.terminalClosed'));
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

  return (
    <TooltipProvider delayDuration={300}>
      <header className="flex flex-col border-b border-border/80 select-none z-30 shrink-0 bg-background/95 dark:bg-[#121215]/95 backdrop-blur-md">
        {/* Tier 1: Multi-Repository Workspace Tabs */}
        <div className="h-8 bg-card/60 dark:bg-[#0b0b0d] border-b border-border/50 px-2 flex items-center justify-between text-xs overflow-x-auto no-scrollbar">
          {/* Left: Branding + Open Repo Tabs + Add Tab (+) */}
          <div className="flex items-center gap-1 min-w-0 flex-1 overflow-x-auto no-scrollbar">
            {/* Logo */}
            <div className="flex items-center gap-1.5 px-2 mr-1 shrink-0 select-none">
              <img src="/logo.svg" alt="AuuGit" className="h-4 w-4 rounded drop-shadow-sm" />
              <span className="font-display font-bold text-[12px] tracking-[0.14em] bg-gradient-to-r from-cyan-600 to-sky-400 dark:from-cyan-200 dark:to-sky-300 bg-clip-text text-transparent hidden sm:inline-block">
                AuuGit
              </span>
            </div>

            {/* Vertical divider */}
            <div className="h-4 w-[1px] bg-border/60 mx-1 shrink-0" />

            {/* Repo Tabs Container */}
            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5">
              {openTabs.map((repo) => {
                const isActive = currentRepo?.path === repo.path;
                return (
                  <div
                    key={repo.path}
                    onClick={() => switchTab(repo.path)}
                    className={cn(
                      "h-6 px-2.5 rounded-t-md border-t border-x flex items-center gap-1.5 cursor-pointer text-xs transition-all group shrink-0 select-none",
                      isActive
                        ? "bg-background dark:bg-[#16161a] border-border text-foreground font-semibold shadow-xs border-t-primary"
                        : "bg-muted/30 dark:bg-muted/15 border-transparent text-muted-foreground hover:bg-muted/60 dark:hover:bg-muted/30 hover:text-foreground"
                    )}
                    title={repo.path}
                  >
                    <FolderGit2 className={cn("h-3 w-3 shrink-0", isActive ? "text-primary" : "text-muted-foreground")} />
                    <span className="truncate max-w-[130px] text-[12px]">{repo.name}</span>
                    {repo.currentBranch && (
                      <span className={cn(
                        "text-[12px] font-mono px-1 py-0.2 rounded hidden sm:inline-block truncate max-w-[70px]",
                        isActive ? "bg-primary/10 text-primary font-medium" : "bg-muted text-muted-foreground"
                      )}>
                        {repo.currentBranch}
                      </span>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        closeTab(repo.path);
                      }}
                      className={cn(
                        "p-0.5 rounded hover:bg-destructive/20 hover:text-destructive text-muted-foreground transition-all ml-0.5",
                        isActive ? "opacity-70 hover:opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
                      )}
                      title={t('header.closeRepoTab')}
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </div>
                );
              })}

              {/* New Repo Tab Button (+) */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => onOpenRepoDialog?.()}
                    aria-label={t('header.openCloneTooltip')}
                    className="h-6 w-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent/60 transition-colors shrink-0"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">{t('header.openCloneTooltip')}</TooltipContent>
              </Tooltip>
            </div>
          </div>

          {/* Right: Theme Toggle, GitHub Auth, Settings */}
          <div className="flex items-center gap-1 shrink-0 pl-2">
            {/* Theme Toggle */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-muted-foreground hover:text-foreground"
                  onClick={cycleTheme}
                  aria-label={t('header.toggleThemeTooltip')}
                >
                  {resolvedTheme === 'dark' ? <Sun className="h-3.5 w-3.5 text-git-tag" /> : <Moon className="h-3.5 w-3.5 text-indigo-500 dark:text-indigo-400" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">{t('header.toggleThemeTooltip')}</TooltipContent>
            </Tooltip>

            {/* GitHub Auth Profile */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={onOpenGitHubAuth}
                  aria-label={t('header.manageGithubCreds')}
                  className="flex items-center gap-1.5 px-1.5 py-0.5 rounded text-xs hover:bg-accent transition-colors border border-border/40 text-foreground"
                >
                  {user?.avatar_url ? (
                    <img src={user.avatar_url} alt={user.login} className="h-3.5 w-3.5 rounded-full border border-border" />
                  ) : (
                    <Github className="h-3 w-3 text-foreground" />
                  )}
                  <span className="font-medium text-[12px] max-w-[60px] truncate hidden xl:inline-block">
                    {isAuthenticated ? user?.login : t('header.login')}
                  </span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {isAuthenticated ? `${t('header.loggedInAs')}: ${user?.login}` : t('header.manageGithubCreds')}
              </TooltipContent>
            </Tooltip>

            {/* Settings Dialog */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-muted-foreground hover:text-foreground"
                  onClick={onOpenSettings}
                  aria-label={t('header.openSettingsTooltip')}
                >
                  <SettingsIcon className="h-3 w-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">{t('header.openSettingsTooltip')}</TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* Tier 2: Main Git Action Ribbon & Breadcrumb Toolbar */}
        <div className="h-12 px-3 flex items-center justify-between gap-2 text-xs bg-background/80 ">
          {/* Left: Sidebar Toggle + Repo/Branch Dropdowns */}
          <div className="flex items-center gap-2 min-w-0">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-foreground"
                  onClick={onToggleNavigation}
                  aria-label={t(isLeftSidebarCollapsed || navigationOverlay ? 'header.expandLeftSidebar' : 'header.collapseLeftSidebar')}
                >
                  {isLeftSidebarCollapsed || navigationOverlay ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {isLeftSidebarCollapsed || navigationOverlay ? t('header.expandLeftSidebar') : t('header.collapseLeftSidebar')}
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
                  <span className="text-[12px] text-muted-foreground font-mono">{t('header.repository')}</span>
                  <span className="font-semibold text-foreground text-xs truncate max-w-[100px] xl:max-w-[160px]">
                    {currentRepo ? currentRepo.name : t('common.notOpen')}
                  </span>
                  <ChevronDown className="h-3 w-3 text-muted-foreground group-hover:text-foreground transition-transform ml-0.5" />
                </button>

                {/* Repo Dropdown Menu */}
                {showRepoMenu && (
                  <div
                    className="absolute left-0 top-full mt-1 w-64 rounded-xl border border-border bg-popover/95 p-1.5 shadow-2xl z-50 animate-in fade-in-50 zoom-in-95 backdrop-blur-xl"
                    onMouseLeave={() => setShowRepoMenu(false)}
                  >
                    <div className="px-2 py-1 text-[12px] font-semibold text-muted-foreground uppercase tracking-wider">
                      {t('header.repoMenu.current')}
                    </div>
                    <div className="px-2 py-1.5 text-xs font-medium text-foreground bg-accent/40 rounded-lg flex items-center justify-between">
                      <span className="truncate">{currentRepo?.name || t('common.none')}</span>
                      {currentRepo && <Badge variant="success" className="h-4 text-[12px]">{t('common.loaded')}</Badge>}
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
                      <span>{t('header.repoMenu.openOther')}</span>
                    </button>

                    {recentRepos.length > 0 && (
                      <>
                        <div className="px-2 pt-2 pb-1 text-[12px] font-semibold text-muted-foreground uppercase tracking-wider">
                          {t('header.repoMenu.recent')}
                        </div>
                        <div className="max-h-36 overflow-y-auto space-y-0.5">
                          {recentRepos.map((repo) => (
                            <button
                              key={repo.path}
                              onClick={() => {
                                setCurrentRepo(repo);
                                setShowRepoMenu(false);
                                toast.success(`${t('header.repoMenu.switchedToast')}: ${repo.name}`);
                              }}
                              className="w-full text-left px-2 py-1 text-xs text-foreground/80 hover:text-foreground hover:bg-accent rounded-md flex items-center justify-between"
                            >
                              <span className="truncate max-w-[170px]">{repo.name}</span>
                              <span className="text-[12px] text-muted-foreground font-mono">{repo.currentBranch}</span>
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
                  <span className="text-[12px] text-muted-foreground font-mono">{t('header.branch')}</span>
                  <Badge variant="outline" className="h-4.5 px-1.5 text-[12px] font-mono gap-1 bg-accent/40 text-foreground border-border/70 group-hover:border-primary/40">
                    <GitBranchIcon className="h-2.5 w-2.5 text-indigo-400 shrink-0" />
                    <span className="max-w-[100px] xl:max-w-[140px] truncate">{currentBranchName}</span>
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
                        placeholder={t('header.branchMenu.searchPlaceholder')}
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
                    <div className="px-2 py-1 text-[12px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center justify-between">
                      <span>{t('header.localBranches')}</span>
                      <span className="font-mono text-[12px]">{branches.filter((b) => !b.isRemote).length}</span>
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
                                  toast.success(t('header.switchedToBranch'), branch.name);
                                } catch (err: any) {
                                  toast.error(t('header.switchBranchFailed'), err?.message);
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
                                <span className="text-[12px] uppercase px-1 rounded bg-primary/20 text-primary font-bold font-mono shrink-0">
                                  HEAD
                                </span>
                              )}
                            </button>
                          );
                        })}
                      {branches.filter((b) => !b.isRemote).filter((b) => !branchFilter || b.name.toLowerCase().includes(branchFilter.toLowerCase())).length === 0 && (
                        <div className="px-2 py-2 text-center text-xs text-muted-foreground/60 italic">
                          {t('header.noMatchBranches')}
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
                        <span>{t('header.createBranchShort')}</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {currentRepo && <div className="flex items-center gap-2 ml-auto shrink-0">
            <Button variant="ghost" onClick={handleFetch} title={t('header.fetchAll')}><RefreshCw className="h-4 w-4" /><span className="hidden lg:inline">{t('composer.fetch')}</span></Button>
            <Button variant="outline" onClick={handlePull} title={t('header.pullTooltip')}><ArrowDownToLine className="h-4 w-4" />{t('header.pull')}{behindCount > 0 && <span className="font-mono">{behindCount}</span>}</Button>
            <Button variant={aheadCount > 0 ? 'secondary' : 'ghost'} onClick={handlePush} title={t('header.pushTooltip')}><ArrowUpToLine className="h-4 w-4" />{t('header.push')}{aheadCount > 0 && <span className="font-mono">{aheadCount}</span>}</Button>
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild><Button variant="ghost" size="icon" aria-label={t('composer.moreActions')}><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenu.Trigger>
              <DropdownMenu.Portal><DropdownMenu.Content align="end" sideOffset={8} className="z-50 w-64 rounded-lg border border-border bg-popover text-popover-foreground p-1 shadow-xl max-h-[80vh] overflow-y-auto">
                <DropdownMenu.Label className="px-3 py-2 text-[12px] text-muted-foreground">{t('composer.repositoryActions')}</DropdownMenu.Label>
                <DropdownMenu.Item className="menu-item" onSelect={() => setCreateBranchModalOpen(true)}><GitBranchIcon className="h-4 w-4" />{t('header.branchAction')}</DropdownMenu.Item>
                <DropdownMenu.Item className="menu-item" disabled={isRefreshing} onSelect={() => void handleRefresh()}><RefreshCw className="h-4 w-4" />{t('header.refresh')}</DropdownMenu.Item>
                <DropdownMenu.Item className="menu-item" onSelect={() => void handleOpenTerminal()}><Terminal className="h-4 w-4" />{t('header.terminal')}</DropdownMenu.Item>
                <DropdownMenu.Item className="menu-item" onSelect={() => setIgnoreRepoPath(currentRepo.path)}><Shield className="h-4 w-4" />{t('ignore.manage')}</DropdownMenu.Item>
                <DropdownMenu.Separator className="my-1 border-t border-border" />
                <DropdownMenu.Item className="menu-item" disabled={isStashing || !hasChanges} onSelect={() => void handleQuickStash()}><Archive className="h-4 w-4" />{t('header.stash')}</DropdownMenu.Item>
                <DropdownMenu.Item className="menu-item" disabled={!stashes.length} onSelect={() => void handleQuickPop()}><Inbox className="h-4 w-4" />{t('header.pop')}</DropdownMenu.Item>
                <DropdownMenu.Separator className="my-1 border-t border-border" />
                <DropdownMenu.Label className="px-3 py-2 text-[12px] text-muted-foreground">{t('composer.historyActions')}</DropdownMenu.Label>
                <DropdownMenu.Item className="menu-item" disabled={isUndoing || !canUndo} onSelect={() => void handleUndo()}><RotateCcw className="h-4 w-4" />{t('header.undo')}</DropdownMenu.Item>
                <DropdownMenu.Item className="menu-item" disabled={isRedoing || !canRedo} onSelect={() => void handleRedo()}><RotateCw className="h-4 w-4" />{t('header.redo')}</DropdownMenu.Item>
                <DropdownMenu.Separator className="my-1 border-t border-border" />
                <DropdownMenu.Item className="menu-item" onSelect={async () => { try { await pull(true); toast.success(t('header.rebasePulled')); } catch (error: any) { toast.error(t('header.rebasePullFailed'), error?.message); } }}><GitPullRequest className="h-4 w-4" />{t('header.pullRebase')}</DropdownMenu.Item>
                <DropdownMenu.Item className="menu-item text-destructive" onSelect={() => void handleForcePush()}><AlertTriangle className="h-4 w-4" />{t('header.forcePush')}</DropdownMenu.Item>
              </DropdownMenu.Content></DropdownMenu.Portal>
            </DropdownMenu.Root>
          </div>}
          <div className="flex items-center gap-1 shrink-0 border-l border-border pl-2">
            <Button variant="ghost" size="icon" aria-label={t('header.searchTooltip')} onClick={onOpenCommandPalette}><Search className="h-4 w-4" /></Button>
            <Button variant="ghost" disabled={!currentRepo || !['changes', 'history'].includes(activeTab)} aria-label={isRightPaneCollapsed || inspectorOverlay ? t('header.expandRightPane') : t('header.collapseRightPane')} onClick={onToggleInspector}>
              {isRightPaneCollapsed || inspectorOverlay ? <PanelRightOpen className="h-4 w-4" /> : <PanelRightClose className="h-4 w-4" />}
              {inspectorOverlay && <span>{t(activeTab === 'history' ? 'rightPane.commitDetails' : 'rightPane.commit')}</span>}
            </Button>
          </div>
        </div>
      </header>

      {/* Modals */}
      {ignoreRepoPath && ignoreRepoPath === currentRepo?.path && <IgnoreDialog repoPath={ignoreRepoPath} paths={EMPTY_IGNORE_PATHS} onClose={() => setIgnoreRepoPath(null)} />}
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
