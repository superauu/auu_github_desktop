import React, { useEffect, useState } from 'react';
import {
  FolderOpen,
  GitFork,
  FolderPlus,
  X,
  Clock,
  ChevronRight,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  HardDrive,
  Trash2,
  Loader2,
  FolderSearch,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useRepoStore } from '@/stores/repoStore';
import { gitService } from '@/services/git/GitService';
import {
  pickFolderNative,
  validateDirectoryPath,
  DirectoryValidationResult,
} from '@/services/fs/DirectoryService';
import { InAppFolderBrowser } from './InAppFolderBrowser';
import { toast } from '@/stores/toastStore';
import { cn } from '@/utils/cn';

interface RepositoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialMode?: 'open' | 'clone' | 'init';
}

export const RepositoryDialog: React.FC<RepositoryDialogProps> = ({
  open,
  onOpenChange,
  initialMode = 'open',
}) => {
  const [mode, setMode] = useState<'open' | 'clone' | 'init'>(initialMode);
  const [repoPath, setRepoPath] = useState('');
  const [cloneUrl, setCloneUrl] = useState('');
  const [cloneTargetPath, setCloneTargetPath] = useState('');
  const [branchName, setBranchName] = useState('main');

  const [isProcessing, setIsProcessing] = useState(false);
  const [isPicking, setIsPicking] = useState(false);
  const [showInAppBrowser, setShowInAppBrowser] = useState(false);
  const [browserTarget, setBrowserTarget] = useState<'open' | 'clone' | 'init'>('open');

  const [pathValidation, setPathValidation] = useState<DirectoryValidationResult | null>(null);
  const [isValidating, setIsValidating] = useState(false);

  const { setCurrentRepo, addRecentRepo, removeRecentRepo, recentRepos } = useRepoStore();

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  // Debounced path validation
  useEffect(() => {
    if (!repoPath.trim()) {
      setPathValidation(null);
      return;
    }

    const timer = setTimeout(async () => {
      setIsValidating(true);
      const res = await validateDirectoryPath(repoPath.trim());
      setPathValidation(res);
      setIsValidating(false);
    }, 250);

    return () => clearTimeout(timer);
  }, [repoPath]);

  if (!open) return null;

  // 1. Pick folder using native Windows / Tauri dialog
  const handlePickFolder = async (target: 'open' | 'clone' | 'init') => {
    setIsPicking(true);
    try {
      const selected = await pickFolderNative();
      if (selected) {
        if (target === 'open') {
          setRepoPath(selected);
        } else if (target === 'clone') {
          setCloneTargetPath(selected);
        } else if (target === 'init') {
          setRepoPath(selected);
        }
      }
    } catch (err: any) {
      toast.error('选择文件夹失败', err.message);
    } finally {
      setIsPicking(false);
    }
  };

  // 2. Open Local Git Repository
  const handleOpenLocal = async (pathInput?: string) => {
    const targetPath = (pathInput || repoPath).trim();
    if (!targetPath) {
      toast.warning('请输入或浏览选择本地仓库目录');
      return;
    }

    setIsProcessing(true);
    try {
      const repoInfo = await gitService.openRepository(targetPath);
      setCurrentRepo(repoInfo);
      addRecentRepo(repoInfo);
      toast.success('已成功载入 Git 仓库', repoInfo.name);
      onOpenChange(false);
    } catch (err: any) {
      toast.error('打开仓库失败', err.message || '请确认该目录是有效的 Git 仓库');
    } finally {
      setIsProcessing(false);
    }
  };

  // 3. Clone Remote Repository
  const handleClone = async () => {
    if (!cloneUrl.trim()) {
      toast.warning('请输入远程仓库 URL');
      return;
    }
    if (!cloneTargetPath.trim()) {
      toast.warning('请指定克隆保存的目标目录');
      return;
    }

    setIsProcessing(true);
    toast.info('正在克隆远程仓库 (git clone)...', '耗时取决于网络与仓库大小，请稍候');

    try {
      await gitService.cloneRepository(
        cloneUrl.trim(),
        cloneTargetPath.trim(),
        branchName.trim() || undefined
      );
      const repoInfo = await gitService.openRepository(cloneTargetPath.trim());
      setCurrentRepo(repoInfo);
      addRecentRepo(repoInfo);
      toast.success('远程仓库克隆成功并已载入工作区', repoInfo.name);
      onOpenChange(false);
    } catch (err: any) {
      toast.error('克隆仓库失败', err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  // 4. Initialize New Git Repository
  const handleInit = async () => {
    if (!repoPath.trim()) {
      toast.warning('请输入新建仓库的目录路径');
      return;
    }

    setIsProcessing(true);
    try {
      await gitService.initRepository(repoPath.trim());
      const repoInfo = await gitService.openRepository(repoPath.trim());
      setCurrentRepo(repoInfo);
      addRecentRepo(repoInfo);
      toast.success('Git 仓库初始化成功', repoInfo.name);
      onOpenChange(false);
    } catch (err: any) {
      toast.error('初始化仓库失败', err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm animate-in fade-in-0 select-none p-4"
      onClick={() => onOpenChange(false)}
    >
      <div
        className="w-full max-w-xl rounded-xl border border-border bg-card shadow-2xl p-5 space-y-4 animate-in zoom-in-95"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-1 border-b border-border/50">
          <div className="flex items-center gap-2">
            {mode === 'open' && <FolderOpen className="h-4 w-4 text-primary" />}
            {mode === 'clone' && <GitFork className="h-4 w-4 text-purple-400" />}
            {mode === 'init' && <FolderPlus className="h-4 w-4 text-pink-400" />}
            <span className="font-semibold text-xs text-foreground">
              {mode === 'open' && '打开本地 Git 仓库'}
              {mode === 'clone' && '从远程克隆仓库 (Git Clone)'}
              {mode === 'init' && '初始化全新 Git 仓库 (Git Init)'}
            </span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-foreground"
            onClick={() => onOpenChange(false)}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Mode Selector Tabs */}
        <div className="grid grid-cols-3 gap-1 bg-secondary/50 p-1 rounded-lg text-xs border border-border/50">
          <button
            onClick={() => {
              setMode('open');
              setShowInAppBrowser(false);
            }}
            className={cn(
              "py-1.5 rounded text-xs font-medium transition-colors",
              mode === 'open' ? "bg-accent text-accent-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
            )}
          >
            打开现有
          </button>
          <button
            onClick={() => {
              setMode('clone');
              setShowInAppBrowser(false);
            }}
            className={cn(
              "py-1.5 rounded text-xs font-medium transition-colors",
              mode === 'clone' ? "bg-accent text-accent-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
            )}
          >
            克隆远程
          </button>
          <button
            onClick={() => {
              setMode('init');
              setShowInAppBrowser(false);
            }}
            className={cn(
              "py-1.5 rounded text-xs font-medium transition-colors",
              mode === 'init' ? "bg-accent text-accent-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
            )}
          >
            新建项目
          </button>
        </div>

        {/* 1. Mode: Open Local Repo */}
        {mode === 'open' && (
          <div className="space-y-3.5">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-foreground">
                  本地仓库路径
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setBrowserTarget('open');
                    setShowInAppBrowser(!showInAppBrowser);
                  }}
                  className="text-[11px] text-primary hover:underline flex items-center gap-1"
                >
                  <HardDrive className="h-3 w-3" />
                  <span>{showInAppBrowser ? '收起目录树' : '在应用内浏览目录'}</span>
                </button>
              </div>

              <div className="flex gap-2">
                <Input
                  value={repoPath}
                  onChange={(e) => setRepoPath(e.target.value)}
                  placeholder="例如: E:/code/auu_github_desktop"
                  className="font-mono text-xs flex-1"
                />
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => handlePickFolder('open')}
                  disabled={isPicking}
                  className="shrink-0 text-xs gap-1.5 bg-primary/90 hover:bg-primary text-primary-foreground font-medium"
                >
                  {isPicking ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <FolderSearch className="h-3.5 w-3.5" />
                  )}
                  <span>浏览文件夹...</span>
                </Button>
              </div>
            </div>

            {/* In-app folder browser */}
            {showInAppBrowser && browserTarget === 'open' && (
              <InAppFolderBrowser
                initialPath={repoPath || undefined}
                onSelectPath={(selected) => {
                  setRepoPath(selected);
                  setShowInAppBrowser(false);
                }}
              />
            )}

            {/* Path Validation Feedback */}
            {repoPath.trim() && (
              <div className="text-xs">
                {isValidating ? (
                  <div className="flex items-center gap-1.5 text-muted-foreground text-[11px]">
                    <Loader2 className="h-3 w-3 animate-spin text-primary" />
                    <span>正在检测目录...</span>
                  </div>
                ) : pathValidation?.isGitRepo ? (
                  <div className="flex items-center gap-1.5 text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1.5 rounded-lg text-[11px]">
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                    <span>检测到有效的 Git 仓库: {pathValidation.name}</span>
                  </div>
                ) : pathValidation?.exists && pathValidation?.isDirectory ? (
                  <div className="space-y-1.5 bg-amber-500/10 border border-amber-500/20 p-2.5 rounded-lg text-[11px]">
                    <div className="flex items-center gap-1.5 text-amber-400">
                      <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                      <span>该文件夹存在，但尚未初始化为 Git 仓库。</span>
                    </div>
                    <Button
                      variant="outline"
                      size="xs"
                      onClick={handleInit}
                      disabled={isProcessing}
                      className="text-[11px] h-6 border-amber-500/30 text-amber-300 hover:bg-amber-500/20"
                    >
                      在此文件夹一键初始化 Git (git init)
                    </Button>
                  </div>
                ) : pathValidation && !pathValidation.exists ? (
                  <div className="flex items-center gap-1.5 text-rose-400 bg-rose-500/10 border border-rose-500/20 px-2.5 py-1.5 rounded-lg text-[11px]">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                    <span>该目录路径不存在，请检查后重试</span>
                  </div>
                ) : null}
              </div>
            )}

            {/* Recent Repos quick list */}
            {recentRepos.length > 0 && (
              <div className="space-y-1.5 pt-1">
                <div className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  <span>近期打开过的仓库</span>
                </div>
                <div className="rounded-lg border border-border/60 bg-background/50 divide-y divide-border/40 max-h-36 overflow-y-auto">
                  {recentRepos.map((r) => (
                    <div
                      key={r.path}
                      onClick={() => handleOpenLocal(r.path)}
                      className="px-2.5 py-1.5 flex items-center justify-between text-xs cursor-pointer hover:bg-accent/40 transition-colors group"
                    >
                      <div className="min-w-0 pr-2 flex-1">
                        <div className="font-semibold text-foreground group-hover:text-primary transition-colors text-[11px]">
                          {r.name}
                        </div>
                        <div className="text-[10px] font-mono text-muted-foreground/80 truncate">
                          {r.path}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-rose-400 transition-opacity"
                          title="从最近列表中移除"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeRecentRepo(r.path);
                          }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                        <ChevronRight className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <Button
              onClick={() => handleOpenLocal()}
              disabled={isProcessing || !repoPath.trim()}
              className="w-full text-xs h-8 gap-1.5 font-medium"
            >
              {isProcessing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <FolderOpen className="h-3.5 w-3.5" />
              )}
              <span>{isProcessing ? '正在载入仓库...' : '打开此仓库'}</span>
            </Button>
          </div>
        )}

        {/* 2. Mode: Clone Remote */}
        {mode === 'clone' && (
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-foreground block mb-1">
                远程仓库 URL (HTTPS / SSH)
              </label>
              <Input
                value={cloneUrl}
                onChange={(e) => setCloneUrl(e.target.value)}
                placeholder="例如: https://github.com/superauu/auu_github_desktop.git"
                className="font-mono text-xs"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-foreground">
                  目标本地目录
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setBrowserTarget('clone');
                    setShowInAppBrowser(!showInAppBrowser);
                  }}
                  className="text-[11px] text-primary hover:underline flex items-center gap-1"
                >
                  <HardDrive className="h-3 w-3" />
                  <span>{showInAppBrowser ? '收起目录树' : '在应用内浏览目录'}</span>
                </button>
              </div>
              <div className="flex gap-2">
                <Input
                  value={cloneTargetPath}
                  onChange={(e) => setCloneTargetPath(e.target.value)}
                  placeholder="例如: E:/code/my-new-repo"
                  className="font-mono text-xs flex-1"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePickFolder('clone')}
                  disabled={isPicking}
                  className="shrink-0 text-xs gap-1.5"
                >
                  {isPicking ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <FolderSearch className="h-3.5 w-3.5" />
                  )}
                  <span>浏览...</span>
                </Button>
              </div>
            </div>

            {/* In-app browser for clone */}
            {showInAppBrowser && browserTarget === 'clone' && (
              <InAppFolderBrowser
                initialPath={cloneTargetPath || undefined}
                onSelectPath={(selected) => {
                  setCloneTargetPath(selected);
                  setShowInAppBrowser(false);
                }}
              />
            )}

            <div>
              <label className="text-xs font-medium text-foreground block mb-1">
                克隆指定分支 (可选，默认为远程默认分支)
              </label>
              <Input
                value={branchName}
                onChange={(e) => setBranchName(e.target.value)}
                placeholder="main"
                className="font-mono text-xs"
              />
            </div>

            <Button
              onClick={handleClone}
              disabled={isProcessing || !cloneUrl.trim() || !cloneTargetPath.trim()}
              className="w-full text-xs h-8 gap-1.5"
            >
              {isProcessing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              <span>{isProcessing ? '正在克隆仓库中，请稍候...' : '开始克隆 (Git Clone)'}</span>
            </Button>
          </div>
        )}

        {/* 3. Mode: Init Repo */}
        {mode === 'init' && (
          <div className="space-y-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-foreground">
                  新建仓库本地目录
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setBrowserTarget('init');
                    setShowInAppBrowser(!showInAppBrowser);
                  }}
                  className="text-[11px] text-primary hover:underline flex items-center gap-1"
                >
                  <HardDrive className="h-3 w-3" />
                  <span>{showInAppBrowser ? '收起目录树' : '在应用内浏览目录'}</span>
                </button>
              </div>
              <div className="flex gap-2">
                <Input
                  value={repoPath}
                  onChange={(e) => setRepoPath(e.target.value)}
                  placeholder="例如: E:/code/my-brand-new-project"
                  className="font-mono text-xs flex-1"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePickFolder('init')}
                  disabled={isPicking}
                  className="shrink-0 text-xs gap-1.5"
                >
                  {isPicking ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <FolderSearch className="h-3.5 w-3.5" />
                  )}
                  <span>浏览...</span>
                </Button>
              </div>
            </div>

            {/* In-app browser for init */}
            {showInAppBrowser && browserTarget === 'init' && (
              <InAppFolderBrowser
                initialPath={repoPath || undefined}
                onSelectPath={(selected) => {
                  setRepoPath(selected);
                  setShowInAppBrowser(false);
                }}
              />
            )}

            <div>
              <label className="text-xs font-medium text-foreground block mb-1">
                默认主分支名称
              </label>
              <Input
                value={branchName}
                onChange={(e) => setBranchName(e.target.value)}
                className="font-mono text-xs"
              />
            </div>
            <Button
              onClick={handleInit}
              disabled={isProcessing || !repoPath.trim()}
              className="w-full text-xs h-8 gap-1.5"
            >
              {isProcessing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <FolderPlus className="h-3.5 w-3.5" />
              )}
              <span>{isProcessing ? '正在初始化...' : '执行初始化 (Git Init)'}</span>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};
