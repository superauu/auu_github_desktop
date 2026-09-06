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
  Check,
  Plus,
  FolderGit2,
} from 'lucide-react';
import { useRepoStore } from '@/stores/repoStore';
import { useThemeStore } from '@/stores/themeStore';

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenSettings?: () => void;
  onOpenRepoDialog?: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  open,
  onOpenChange,
  onOpenSettings,
  onOpenRepoDialog,
}) => {
  const { setActiveTab } = useRepoStore();
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
      className="fixed inset-0 z-50 flex items-start justify-center pt-24 bg-background/80 backdrop-blur-sm animate-in fade-in-0 duration-150"
      onClick={() => onOpenChange(false)}
    >
      <div
        className="w-full max-w-lg rounded-xl border border-border bg-popover shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <Command className="w-full bg-transparent text-foreground flex flex-col">
          <div className="flex items-center px-3 border-b border-border">
            <Search className="h-4 w-4 text-muted-foreground mr-2 shrink-0" />
            <Command.Input
              placeholder="输入命令或搜索分支、操作 (如 Commit, Push, Tag)..."
              className="h-11 w-full bg-transparent text-xs text-foreground placeholder:text-muted-foreground outline-none"
              autoFocus
            />
            <kbd className="pointer-events-none inline-flex h-5 select-none items-center rounded border border-border bg-muted/50 px-1.5 font-mono text-[10px] text-muted-foreground">
              ESC
            </kbd>
          </div>

          <Command.List className="max-h-80 overflow-y-auto p-1.5 text-xs">
            <Command.Empty className="py-6 text-center text-xs text-muted-foreground">
              未找到相关命令
            </Command.Empty>

            {/* Git Core Actions */}
            <Command.Group heading="Git 核心操作" className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              <Command.Item
                onSelect={() => {
                  setActiveTab('changes');
                  onOpenChange(false);
                }}
                className="flex items-center gap-2.5 px-2 py-2 rounded-md hover:bg-accent cursor-pointer text-xs"
              >
                <Check className="h-3.5 w-3.5 text-primary" />
                <span>工作区变更与提交 (Commit)</span>
              </Command.Item>

              <Command.Item
                onSelect={() => {
                  onOpenChange(false);
                  onOpenRepoDialog?.();
                }}
                className="flex items-center gap-2.5 px-2 py-2 rounded-md hover:bg-accent cursor-pointer text-xs"
              >
                <FolderGit2 className="h-3.5 w-3.5 text-indigo-400" />
                <span>打开或切换仓库 (Open Repository)</span>
              </Command.Item>

              <Command.Item
                onSelect={() => {
                  onOpenChange(false);
                }}
                className="flex items-center gap-2.5 px-2 py-2 rounded-md hover:bg-accent cursor-pointer text-xs"
              >
                <ArrowUp className="h-3.5 w-3.5 text-emerald-400" />
                <span>推送本地提交 (Push)</span>
                <span className="ml-auto text-[10px] font-mono text-muted-foreground">Ctrl+P</span>
              </Command.Item>

              <Command.Item
                onSelect={() => {
                  onOpenChange(false);
                }}
                className="flex items-center gap-2.5 px-2 py-2 rounded-md hover:bg-accent cursor-pointer text-xs"
              >
                <ArrowDown className="h-3.5 w-3.5 text-cyan-400" />
                <span>拉取远程分支 (Pull)</span>
                <span className="ml-auto text-[10px] font-mono text-muted-foreground">Ctrl+L</span>
              </Command.Item>

              <Command.Item
                onSelect={() => {
                  onOpenChange(false);
                }}
                className="flex items-center gap-2.5 px-2 py-2 rounded-md hover:bg-accent cursor-pointer text-xs"
              >
                <RefreshCw className="h-3.5 w-3.5 text-indigo-400" />
                <span>获取远程更新 (Fetch)</span>
                <span className="ml-auto text-[10px] font-mono text-muted-foreground">Ctrl+Shift+F</span>
              </Command.Item>
            </Command.Group>

            {/* Branch & Tag Actions */}
            <Command.Group heading="分支与标签" className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mt-2">
              <Command.Item
                onSelect={() => {
                  onOpenChange(false);
                }}
                className="flex items-center gap-2.5 px-2 py-2 rounded-md hover:bg-accent cursor-pointer text-xs"
              >
                <Plus className="h-3.5 w-3.5 text-indigo-400" />
                <span>创建新分支 (New Branch)</span>
                <span className="ml-auto text-[10px] font-mono text-muted-foreground">Ctrl+B</span>
              </Command.Item>

              <Command.Item
                onSelect={() => {
                  onOpenChange(false);
                }}
                className="flex items-center gap-2.5 px-2 py-2 rounded-md hover:bg-accent cursor-pointer text-xs"
              >
                <Tag className="h-3.5 w-3.5 text-amber-400" />
                <span>创建新标签 (New Tag)</span>
                <span className="ml-auto text-[10px] font-mono text-muted-foreground">Ctrl+T</span>
              </Command.Item>

              <Command.Item
                onSelect={() => {
                  setActiveTab('history');
                  onOpenChange(false);
                }}
                className="flex items-center gap-2.5 px-2 py-2 rounded-md hover:bg-accent cursor-pointer text-xs"
              >
                <GitBranch className="h-3.5 w-3.5 text-purple-400" />
                <span>查看提交历史与 Graph</span>
              </Command.Item>
            </Command.Group>

            {/* Preferences & Themes */}
            <Command.Group heading="外观与首选项" className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mt-2">
              <Command.Item
                onSelect={() => {
                  setTheme('dark');
                  onOpenChange(false);
                }}
                className="flex items-center gap-2.5 px-2 py-2 rounded-md hover:bg-accent cursor-pointer text-xs"
              >
                <Moon className="h-3.5 w-3.5 text-indigo-400" />
                <span>切换为深色模式 (Dark Theme)</span>
              </Command.Item>

              <Command.Item
                onSelect={() => {
                  setTheme('light');
                  onOpenChange(false);
                }}
                className="flex items-center gap-2.5 px-2 py-2 rounded-md hover:bg-accent cursor-pointer text-xs"
              >
                <Sun className="h-3.5 w-3.5 text-amber-400" />
                <span>切换为浅色模式 (Light Theme)</span>
              </Command.Item>

              <Command.Item
                onSelect={() => {
                  setTheme('system');
                  onOpenChange(false);
                }}
                className="flex items-center gap-2.5 px-2 py-2 rounded-md hover:bg-accent cursor-pointer text-xs"
              >
                <Laptop className="h-3.5 w-3.5 text-muted-foreground" />
                <span>跟随系统外观 (System Theme)</span>
              </Command.Item>

              <Command.Item
                onSelect={() => {
                  onOpenChange(false);
                  onOpenSettings?.();
                }}
                className="flex items-center gap-2.5 px-2 py-2 rounded-md hover:bg-accent cursor-pointer text-xs"
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
