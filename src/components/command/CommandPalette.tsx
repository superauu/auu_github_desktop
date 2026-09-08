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
import { useI18n } from '@/i18n';
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
  const { t, lang } = useI18n();

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
              placeholder={lang === 'zh' ? "输入命令、分支、Tag 或操作 (如 Commit, Push, CI)..." : "Type a command, branch, tag or action (e.g. Commit, Push, CI)..."}
              className="h-12 w-full bg-transparent text-xs text-foreground placeholder:text-muted-foreground outline-none"
              autoFocus
            />
            <kbd className="pointer-events-none inline-flex h-5 select-none items-center rounded border border-border bg-muted/50 px-1.5 font-mono text-[10px] text-muted-foreground">
              ESC
            </kbd>
          </div>

          <Command.List className="max-h-84 overflow-y-auto p-2 text-xs">
            <Command.Empty className="py-8 text-center text-xs text-muted-foreground">
              {lang === 'zh' ? '未找到匹配的命令或分支' : 'No matching commands'}
            </Command.Empty>

            {/* View Navigation */}
            <Command.Group heading={lang === 'zh' ? '视图导航' : 'Navigation'} className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              <Command.Item
                onSelect={() => {
                  setActiveTab('changes');
                  onOpenChange(false);
                }}
                className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-accent cursor-pointer text-xs"
              >
                <FileCode2 className="h-3.5 w-3.5 text-primary" />
                <span>{t('sidebar.changes')}</span>
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
                <span>{t('sidebar.history')}</span>
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
                <span>{lang === 'zh' ? 'GitHub Pull Requests 审查中心' : t('palette.prCenter')}</span>
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
                <span>{lang === 'zh' ? 'GitHub Actions 开发者仪表盘' : t('palette.actionsDash')}</span>
                <span className="ml-auto text-[10px] font-mono text-muted-foreground">Tab 4</span>
              </Command.Item>
            </Command.Group>

            {/* Git Core Actions */}
            <Command.Group heading={lang === 'zh' ? 'Git 协同操作' : t('palette.group.git')} className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mt-2">
              <Command.Item
                onSelect={async () => {
                  onOpenChange(false);
                  toast.info(t('header.fetching'));
                  try {
                    await fetchRemote();
                    toast.success(t('header.fetchDone'));
                  } catch (err: any) {
                    toast.error(t('header.fetchFailed'), err.message);
                  }
                }}
                className="flex items-center gap-2.5 px-2.5 py-2 rounded-md hover:bg-accent cursor-pointer text-xs"
              >
                <RefreshCw className="h-3.5 w-3.5 text-indigo-400" />
                <span>{t('palette.gitFetch')}</span>
                <span className="ml-auto text-[10px] font-mono text-muted-foreground">Ctrl+Shift+F</span>
              </Command.Item>

              <Command.Item
                onSelect={async () => {
                  onOpenChange(false);
                  toast.info(t('header.pulling'));
                  try {
                    await pull();
                    toast.success(t('header.pulled'));
                  } catch (err: any) {
                    toast.error(t('header.pullFailed'), err.message);
                  }
                }}
                className="flex items-center gap-2.5 px-2.5 py-2 rounded-md hover:bg-accent cursor-pointer text-xs"
              >
                <ArrowDown className="h-3.5 w-3.5 text-cyan-400" />
                <span>{t('palette.gitPull')}</span>
                <span className="ml-auto text-[10px] font-mono text-muted-foreground">Ctrl+L</span>
              </Command.Item>

              <Command.Item
                onSelect={async () => {
                  onOpenChange(false);
                  toast.info(t('header.pushing'));
                  try {
                    await push();
                    toast.success(t('header.pushed'));
                  } catch (err: any) {
                    toast.error(t('header.pushFailed'), err.message);
                  }
                }}
                className="flex items-center gap-2.5 px-2.5 py-2 rounded-md hover:bg-accent cursor-pointer text-xs"
              >
                <ArrowUp className="h-3.5 w-3.5 text-emerald-400" />
                <span>{t('palette.gitPush')}</span>
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
                <span>{t('header.repoMenu.openOther')}</span>
              </Command.Item>
            </Command.Group>

            {/* Quick Switch Branches */}
            {branches.length > 0 && (
              <Command.Group heading={lang === 'zh' ? '切换本地/远程分支' : t('palette.group.branches')} className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mt-2">
                {branches.map((b) => (
                  <Command.Item
                    key={b.name}
                    onSelect={() => {
                      if (!b.isCurrent) {
                        checkoutBranch(b.name)
                          .then(() => toast.success(`${t('header.switchedToBranch')}: ${b.name}`))
                          .catch((err: any) =>
                            toast.error(`${t('header.switchBranchFailed')}: ${b.name}`, err?.message)
                          );
                      }
                      onOpenChange(false);
                    }}
                    className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-md hover:bg-accent cursor-pointer text-xs"
                  >
                    <GitBranch className="h-3.5 w-3.5 text-indigo-400" />
                    <span>{b.name}</span>
                    {b.isCurrent && (
                      <span className="ml-auto text-[9px] px-1 rounded bg-indigo-500/20 text-indigo-300">
                        {t('header.currentHead')}
                      </span>
                    )}
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {/* Quick Tags */}
            {tags.length > 0 && (
              <Command.Group heading={lang === 'zh' ? '查看标签 (Tags)' : 'Tags'} className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mt-2">
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
            <Command.Group heading={lang === 'zh' ? '系统设置与主题' : t('palette.group.settings')} className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mt-2">
              <Command.Item
                onSelect={() => {
                  setTheme('dark');
                  onOpenChange(false);
                  toast.info(lang === 'zh' ? '已切换为深色模式' : t('palette.switchedToDark'));
                }}
                className="flex items-center gap-2.5 px-2.5 py-2 rounded-md hover:bg-accent cursor-pointer text-xs"
              >
                <Moon className="h-3.5 w-3.5 text-indigo-400" />
                <span>{t('palette.darkMode')}</span>
              </Command.Item>

              <Command.Item
                onSelect={() => {
                  setTheme('light');
                  onOpenChange(false);
                  toast.info(lang === 'zh' ? '已切换为浅色模式' : t('palette.switchedToLight'));
                }}
                className="flex items-center gap-2.5 px-2.5 py-2 rounded-md hover:bg-accent cursor-pointer text-xs"
              >
                <Sun className="h-3.5 w-3.5 text-amber-400" />
                <span>{t('palette.lightMode')}</span>
              </Command.Item>

              <Command.Item
                onSelect={() => {
                  setTheme('system');
                  onOpenChange(false);
                  toast.info(t('palette.systemModeRestored'));
                }}
                className="flex items-center gap-2.5 px-2.5 py-2 rounded-md hover:bg-accent cursor-pointer text-xs"
              >
                <Laptop className="h-3.5 w-3.5 text-muted-foreground" />
                <span>{t('palette.systemMode')}</span>
              </Command.Item>

              <Command.Item
                onSelect={() => {
                  onOpenChange(false);
                  onOpenGitHubAuth?.();
                }}
                className="flex items-center gap-2.5 px-2.5 py-2 rounded-md hover:bg-accent cursor-pointer text-xs"
              >
                <Workflow className="h-3.5 w-3.5 text-sky-400" />
                <span>{t('palette.connectGithub')}</span>
              </Command.Item>

              <Command.Item
                onSelect={() => {
                  onOpenChange(false);
                  onOpenSettings?.();
                }}
                className="flex items-center gap-2.5 px-2.5 py-2 rounded-md hover:bg-accent cursor-pointer text-xs"
              >
                <Settings className="h-3.5 w-3.5 text-muted-foreground" />
                <span>{t('palette.openPreferences')}</span>
              </Command.Item>
            </Command.Group>
          </Command.List>
        </Command>
      </div>
    </div>
  );
};
