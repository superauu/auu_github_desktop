import React, { useState } from 'react';
import {
  FolderOpen,
  GitFork,
  FolderPlus,
  X,
  Folder,
  Clock,
  ChevronRight,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useRepoStore } from '@/stores/repoStore';
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

  const { setCurrentRepo, addRecentRepo, recentRepos } = useRepoStore();

  if (!open) return null;

  const handleOpenLocal = (pathInput?: string) => {
    const path = (pathInput || repoPath).trim() || 'e:/code/auu_github_desktop';
    const name = path.split(/[/\\]/).filter(Boolean).pop() || 'project';
    const newRepo = {
      id: String(Date.now()),
      name,
      path,
      currentBranch: 'master',
      lastOpenedAt: Date.now(),
    };
    setCurrentRepo(newRepo);
    addRecentRepo(newRepo);
    toast.success('已切换仓库', path);
    onOpenChange(false);
  };

  const handleClone = async () => {
    if (!cloneUrl.trim()) {
      toast.warning('请输入远程仓库 URL');
      return;
    }
    setIsProcessing(true);
    toast.info('正在克隆远程仓库...', cloneUrl);

    setTimeout(() => {
      const repoName = cloneUrl.split('/').pop()?.replace('.git', '') || 'cloned-repo';
      const target = cloneTargetPath.trim() || `e:/code/${repoName}`;
      const newRepo = {
        id: String(Date.now()),
        name: repoName,
        path: target,
        currentBranch: 'main',
        lastOpenedAt: Date.now(),
      };
      setCurrentRepo(newRepo);
      addRecentRepo(newRepo);
      setIsProcessing(false);
      toast.success('克隆完成并已载入工作区', target);
      onOpenChange(false);
    }, 1500);
  };

  const handleInit = async () => {
    if (!repoPath.trim()) {
      toast.warning('请输入新项目完整目录路径');
      return;
    }
    setIsProcessing(true);
    toast.info('正在初始化新仓库...', repoPath);

    setTimeout(() => {
      const name = repoPath.split(/[/\\]/).filter(Boolean).pop() || 'new-repo';
      const newRepo = {
        id: String(Date.now()),
        name,
        path: repoPath.trim(),
        currentBranch: branchName.trim() || 'main',
        lastOpenedAt: Date.now(),
      };
      setCurrentRepo(newRepo);
      addRecentRepo(newRepo);
      setIsProcessing(false);
      toast.success('仓库初始化成功', repoPath);
      onOpenChange(false);
    }, 1000);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm animate-in fade-in-0 select-none"
      onClick={() => onOpenChange(false)}
    >
      <div
        className="w-full max-w-lg rounded-xl border border-border bg-card shadow-2xl p-5 space-y-4 animate-in zoom-in-95"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-1 border-b border-border/50">
          <div className="flex items-center gap-2">
            {mode === 'open' && <FolderOpen className="h-4 w-4 text-primary" />}
            {mode === 'clone' && <GitFork className="h-4 w-4 text-purple-400" />}
            {mode === 'init' && <FolderPlus className="h-4 w-4 text-pink-400" />}
            <span className="font-semibold text-xs text-foreground">
              {mode === 'open' && '打开本地仓库'}
              {mode === 'clone' && '从远程克隆仓库 (Clone)'}
              {mode === 'init' && '初始化全新 Git 仓库'}
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
            onClick={() => setMode('open')}
            className={cn(
              "py-1 rounded text-[11px] font-medium transition-colors",
              mode === 'open' ? "bg-accent text-accent-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
            )}
          >
            打开现有
          </button>
          <button
            onClick={() => setMode('clone')}
            className={cn(
              "py-1 rounded text-[11px] font-medium transition-colors",
              mode === 'clone' ? "bg-accent text-accent-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
            )}
          >
            克隆远程
          </button>
          <button
            onClick={() => setMode('init')}
            className={cn(
              "py-1 rounded text-[11px] font-medium transition-colors",
              mode === 'init' ? "bg-accent text-accent-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
            )}
          >
            新建项目
          </button>
        </div>

        {/* Form contents */}
        {mode === 'open' && (
          <div className="space-y-3.5">
            <div>
              <label className="text-[11px] font-medium text-foreground block mb-1">
                本地仓库路径
              </label>
              <div className="flex gap-2">
                <Input
                  value={repoPath}
                  onChange={(e) => setRepoPath(e.target.value)}
                  placeholder="例如: e:/code/auu_github_desktop"
                  className="font-mono text-xs"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleOpenLocal()}
                  className="shrink-0 text-xs"
                >
                  <Folder className="h-3.5 w-3.5 mr-1" />
                  载入
                </Button>
              </div>
            </div>

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
                      <div className="min-w-0 pr-2">
                        <div className="font-semibold text-foreground group-hover:text-primary transition-colors text-[11px]">
                          {r.name}
                        </div>
                        <div className="text-[10px] font-mono text-muted-foreground/80 truncate">
                          {r.path}
                        </div>
                      </div>
                      <ChevronRight className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                    </div>
                  ))}
                </div>
              </div>
            )}

            <Button onClick={() => handleOpenLocal()} className="w-full text-xs h-8">
              打开此仓库
            </Button>
          </div>
        )}

        {mode === 'clone' && (
          <div className="space-y-3">
            <div>
              <label className="text-[11px] font-medium text-foreground block mb-1">
                远程仓库 URL (HTTPS / SSH)
              </label>
              <Input
                value={cloneUrl}
                onChange={(e) => setCloneUrl(e.target.value)}
                placeholder="https://github.com/superauu/auu_github_desktop.git"
                className="font-mono text-xs"
              />
            </div>
            <div>
              <label className="text-[11px] font-medium text-foreground block mb-1">
                目标本地目录
              </label>
              <Input
                value={cloneTargetPath}
                onChange={(e) => setCloneTargetPath(e.target.value)}
                placeholder="例如: e:/code/auu_github_desktop"
                className="font-mono text-xs"
              />
            </div>
            <Button
              onClick={handleClone}
              disabled={isProcessing}
              className="w-full text-xs h-8 gap-1.5"
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>{isProcessing ? '正在克隆仓库中...' : '开始克隆 (Git Clone)'}</span>
            </Button>
          </div>
        )}

        {mode === 'init' && (
          <div className="space-y-3">
            <div>
              <label className="text-[11px] font-medium text-foreground block mb-1">
                新建目录路径
              </label>
              <Input
                value={repoPath}
                onChange={(e) => setRepoPath(e.target.value)}
                placeholder="输入想要初始化的本地文件夹完整路径"
                className="font-mono text-xs"
              />
            </div>
            <div>
              <label className="text-[11px] font-medium text-foreground block mb-1">
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
              disabled={isProcessing}
              className="w-full text-xs h-8"
            >
              {isProcessing ? '正在初始化...' : '执行初始化 (Git Init)'}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};
