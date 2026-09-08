import React, { useEffect } from 'react';
import { Command } from 'cmdk';
import {
  Search,
  GitBranch,
  Tag,
  ArrowUp,
  ArrowDown,
  RefreshCw,
  Sun,
  Moon,
  Laptop,
  Settings,
  FolderGit2,
  Workflow,
  Clock,
  FileCode2,
  GitPullRequest,
} from 'lucide-react';
import { useRepoStore } from '@/stores/repoStore';
import { useThemeStore } from '@/stores/themeStore';
import { toast } from '@/stores/toastStore';

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenSettings?: () => void;
  onOpenRepoDialog?: () => void;
  onOpenGitHubAuth?: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  open,
  onOpenChange,
  onOpenSettings,
  onOpenRepoDialog,
  onOpenGitHubAuth,
}) => {
  const {
    setActiveTab,
    fetchRemote,
    pull,
    push,
    branches,
    tags,
    checkoutBranch,
  } = useRepoStore();
  const { setTheme } = useThemeStore();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === 'p' && e.ctrlKey && e.shiftKey)) {
        e.preventDefault();
        onOpenChange(!open);
      }
    };

    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-24 bg-background/80 backdrop-blur-md animate-in fade-in-0 duration-150 select-none"
      onClick={() => onOpenChange(false)}
    >
      <div
        className="w-full max-w-xl rounded-2xl border border-border/80 bg-popover/95 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150 backdrop-blur-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <Command className="w-full bg-transparent text-foreground flex flex-col">
          <div className="flex items-center px-3.5 border-b border-border/60">
            <Search className="h-4 w-4 text-muted-foreground mr-2 shrink-0" />
            <Command.Input
              placeholder="输入命令、分支、Tag 或操作 (如 Commit, Push, CI)..."
              className="h-12 w-full bg-transparent text-xs text-foreground placeholder:text-muted-foreground outline-none"
              autoFocus
            />
            <kbd className="pointer-events-none inline-flex h-5 select-none items-center rounded border border-border bg-muted/50 px-1.5 font-mono text-[10px] text-muted-foreground">
              ESC
            </kbd>
          </div>

          <Command.List className="max-h-84 overflow-y-auto p-2 text-xs">
            <Command.Empty className="py-8 text-center text-xs text-muted-foreground">
              未找到匹配的命令或分支
            </Command.Empty>

            {/* View Navigation */}
            <Command.Group heading="视图导航" className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              <Command.Item
                onSelect={() => {
                  setActiveTab('changes');
                  onOpenChange(false);
                }}
                className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-accent cursor-pointer text-xs"
              >
                <FileCode2 className="h-3.5 w-3.5 text-primary" />
                <span>工作区变更与提交 (Working Changes)</span>
                <span className="ml-auto text-[10px] font-mono text-muted-foreground">Tab 1</span>
              </Command.Item>

              <Command.Item
                onSelect={() => {
                  setActiveTab('history');
                  onOpenChange(false);
                }}
                className="flex items-center gap-2.5 px-2.5 py-2 rounded-md hover:bg-accent cursor-pointer text-xs"
              >
                <Clock className="h-3.5 w-3.5 text-indigo-400" />
                <span>提交历史与 Git Graph</span>
                <span className="ml-auto text-[10px] font-mono text-muted-foreground">Tab 2</span>
              </Command.Item>

              <Command.Item
                onSelect={() => {
                  setActiveTab('pullRequests');
                  onOpenChange(false);
                }}
                className="flex items-center gap-2.5 px-2.5 py-2 rounded-md hover:bg-accent cursor-pointer text-xs"
              >
                <GitPullRequest className="h-3.5 w-3.5 text-sky-400" />
                <span>GitHub Pull Requests 审查中心</span>
                <span className="ml-auto text-[10px] font-mono text-muted-foreground">Tab 3</span>
              </Command.Item>

              <Command.Item
                onSelect={() => {
                  setActiveTab('actions');
                  onOpenChange(false);
                }}
                className="flex items-center gap-2.5 px-2.5 py-2 rounded-md hover:bg-accent cursor-pointer text-xs"
              >
                <Workflow className="h-3.5 w-3.5 text-emerald-400" />
                <span>GitHub Actions 开发者仪表盘</span>
                <span className="ml-auto text-[10px] font-mono text-muted-foreground">Tab 4</span>
              </Command.Item>
            </Command.Group>

            {/* Git Core Actions */}
            <Command.Group heading="Git 协同操作" className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mt-2">
              <Command.Item
                onSelect={async () => {
                  onOpenChange(false);
                  toast.info('正在获取远程更新 (git fetch)...');
                  try {
                    await fetchRemote();
                    toast.success('已同步获取远程最新变更 (Fetch completed)');
                  } catch (err: any) {
                    toast.error('Fetch 失败', err.message);
                  }
                }}
                className="flex items-center gap-2.5 px-2.5 py-2 rounded-md hover:bg-accent cursor-pointer text-xs"
              >
                <RefreshCw className="h-3.5 w-3.5 text-indigo-400" />
                <span>获取远程最新变更 (Git Fetch)</span>
                <span className="ml-auto text-[10px] font-mono text-muted-foreground">Ctrl+Shift+F</span>
              </Command.Item>

              <Command.Item
                onSelect={async () => {
                  onOpenChange(false);
                  toast.info('正在拉取远程更新 (Git Pull)...');
                  try {
                    await pull();
                    toast.success('已成功拉取最新提交');
                  } catch (err: any) {
                    toast.error('Pull 失败', err.message);
                  }
                }}
                className="flex items-center gap-2.5 px-2.5 py-2 rounded-md hover:bg-accent cursor-pointer text-xs"
              >
                <ArrowDown className="h-3.5 w-3.5 text-cyan-400" />
                <span>拉取远程分支 (Git Pull)</span>
                <span className="ml-auto text-[10px] font-mono text-muted-foreground">Ctrl+L</span>
              </Command.Item>

              <Command.Item
                onSelect={async () => {
                  onOpenChange(false);
                  toast.info('正在推送本地提交 (Git Push)...');
                  try {
                    await push();
                    toast.success('已成功推送到远程');
                  } catch (err: any) {
                    toast.error('Push 失败', err.message);
                  }
                }}
                className="flex items-center gap-2.5 px-2.5 py-2 rounded-md hover:bg-accent cursor-pointer text-xs"
              >
                <ArrowUp className="h-3.5 w-3.5 text-emerald-400" />
                <span>推送本地提交 (Git Push)</span>
                <span className="ml-auto text-[10px] font-mono text-muted-foreground">Ctrl+P</span>
              </Command.Item>

              <Command.Item
                onSelect={() => {
                  onOpenChange(false);
                  onOpenRepoDialog?.();
                }}
                className="flex items-center gap-2.5 px-2.5 py-2 rounded-md hover:bg-accent cursor-pointer text-xs"
              >
                <FolderGit2 className="h-3.5 w-3.5 text-primary" />
                <span>打开或切换其他仓库...</span>
              </Command.Item>
            </Command.Group>

            {/* Quick Switch Branches */}
            {branches.length > 0 && (
              <Command.Group heading="切换本地/远程分支" className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mt-2">
                {branches.map((b) => (
                  <Command.Item
                    key={b.name}
                    onSelect={() => {
                      if (!b.isCurrent) {
                        checkoutBranch(b.name);
                        toast.success(`已切换至分支: ${b.name}`);
                      }
                      onOpenChange(false);
                    }}
                    className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-md hover:bg-accent cursor-pointer text-xs"
                  >
                    <GitBranch className="h-3.5 w-3.5 text-indigo-400" />
                    <span>{b.name}</span>
                    {b.isCurrent && (
                      <span className="ml-auto text-[9px] px-1 rounded bg-indigo-500/20 text-indigo-300">
                        当前 HEAD
                      </span>
                    )}
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {/* Quick Tags */}
            {tags.length > 0 && (
              <Command.Group heading="查看标签 (Tags)" className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mt-2">
                {tags.map((t) => (
                  <Command.Item
                    key={t.name}
                    onSelect={() => {
                      setActiveTab('history');
                      onOpenChange(false);
                    }}
                    className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-md hover:bg-accent cursor-pointer text-xs"
                  >
                    <Tag className="h-3.5 w-3.5 text-amber-400" />
                    <span className="font-mono">{t.name}</span>
                    <span className="ml-auto text-[10px] font-mono text-muted-foreground">
                      {t.commitHash.slice(0, 7)}
                    </span>
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {/* Themes & Preferences */}
            <Command.Group heading="系统设置与主题" className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mt-2">
              <Command.Item
                onSelect={() => {
                  setTheme('dark');
                  onOpenChange(false);
                  toast.info('已切换为深色模式');
                }}
                className="flex items-center gap-2.5 px-2.5 py-2 rounded-md hover:bg-accent cursor-pointer text-xs"
              >
                <Moon className="h-3.5 w-3.5 text-indigo-400" />
                <span>切换为深色模式 (Dark Mode)</span>
              </Command.Item>

              <Command.Item
                onSelect={() => {
                  setTheme('light');
                  onOpenChange(false);
                  toast.info('已切换为浅色模式');
                }}
                className="flex items-center gap-2.5 px-2.5 py-2 rounded-md hover:bg-accent cursor-pointer text-xs"
              >
                <Sun className="h-3.5 w-3.5 text-amber-400" />
                <span>切换为浅色模式 (Light Mode)</span>
              </Command.Item>

              <Command.Item
                onSelect={() => {
                  setTheme('system');
                  onOpenChange(false);
                  toast.info('已恢复为跟随系统外观');
                }}
                className="flex items-center gap-2.5 px-2.5 py-2 rounded-md hover:bg-accent cursor-pointer text-xs"
              >
                <Laptop className="h-3.5 w-3.5 text-muted-foreground" />
                <span>跟随系统外观 (System Mode)</span>
              </Command.Item>

              <Command.Item
                onSelect={() => {
                  onOpenChange(false);
                  onOpenGitHubAuth?.();
                }}
                className="flex items-center gap-2.5 px-2.5 py-2 rounded-md hover:bg-accent cursor-pointer text-xs"
              >
                <Workflow className="h-3.5 w-3.5 text-sky-400" />
                <span>连接 / 配置 GitHub 账号与 Token...</span>
              </Command.Item>

              <Command.Item
                onSelect={() => {
                  onOpenChange(false);
                  onOpenSettings?.();
                }}
                className="flex items-center gap-2.5 px-2.5 py-2 rounded-md hover:bg-accent cursor-pointer text-xs"
              >
                <Settings className="h-3.5 w-3.5 text-muted-foreground" />
                <span>打开首选项设置 (Preferences)</span>
              </Command.Item>
            </Command.Group>
          </Command.List>
        </Command>
      </div>
    </div>
  );
};
