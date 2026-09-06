import React, { useState } from 'react';
import {
  FolderOpen,
  GitFork,
  FolderPlus,
  X,
  Folder,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useRepoStore } from '@/stores/repoStore';
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

  const { setCurrentRepo, addRecentRepo } = useRepoStore();

  if (!open) return null;

  const handleOpen = () => {
    const path = repoPath.trim() || 'e:/code/auu_github_desktop';
    const name = path.split(/[/\\]/).filter(Boolean).pop() || 'project';
    const newRepo = {
      id: String(Date.now()),
      name,
      path,
      currentBranch: 'main',
      lastOpenedAt: Date.now(),
    };
    setCurrentRepo(newRepo);
    addRecentRepo(newRepo);
    onOpenChange(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm animate-in fade-in-0 select-none"
      onClick={() => onOpenChange(false)}
    >
      <div
        className="w-full max-w-md rounded-xl border border-border bg-card shadow-2xl p-5 space-y-4 animate-in zoom-in-95"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
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
          <div className="space-y-3">
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
                <Button variant="outline" size="sm" className="shrink-0 text-xs">
                  <Folder className="h-3.5 w-3.5 mr-1" />
                  浏览
                </Button>
              </div>
            </div>
            <Button onClick={handleOpen} className="w-full text-xs h-8">
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
                placeholder="https://github.com/user/repository.git"
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
                placeholder="选择存储克隆项目的本地文件夹"
                className="font-mono text-xs"
              />
            </div>
            <Button onClick={handleOpen} className="w-full text-xs h-8">
              开始克隆
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
                默认分支名称
              </label>
              <Input
                value={branchName}
                onChange={(e) => setBranchName(e.target.value)}
                className="font-mono text-xs"
              />
            </div>
            <Button onClick={handleOpen} className="w-full text-xs h-8">
              执行 Git Init
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};
