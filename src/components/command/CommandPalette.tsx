import { isRepositoryAccessCancelled } from '@/services/fs/RepositoryAccess';
import { pushFromUi } from '@/services/git/RemoteActions';
import { useShallow } from 'zustand/react/shallow';
import { ModalSurface } from '@/components/ui/ModalSurface';
import React, { useState } from 'react';
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
  FileText,
  GitPullRequest,
} from 'lucide-react';
import { useI18n } from '@/i18n';
import { useRepoStore } from '@/stores/repoStore';
import { useThemeStore } from '@/stores/themeStore';
import { toast } from '@/stores/toastStore';
import { ReleaseNotesDialog } from '@/features/git/ReleaseNotesDialog';

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
    branches,
    tags,
    checkoutBranch,
    selectAndLocateBranch,
    currentRepo,
  } = useRepoStore(useShallow(state => ({ setActiveTab: state.setActiveTab, fetchRemote: state.fetchRemote, pull: state.pull, branches: state.branches, tags: state.tags, checkoutBranch: state.checkoutBranch, selectAndLocateBranch: state.selectAndLocateBranch, currentRepo: state.currentRepo })));
  const { setTheme } = useThemeStore();
  const { t } = useI18n();
  const [releaseNotesOpen, setReleaseNotesOpen] = useState(false);

  // 挂在当前激活仓库上；命令面板关闭后对话框仍需保持挂载，所以渲染在提前返回之外。
  const releaseNotesDialog = releaseNotesOpen && currentRepo
    ? <ReleaseNotesDialog
        repoPath={currentRepo.path}
        onClose={() => setReleaseNotesOpen(false)}
        onOpenSettings={() => { setReleaseNotesOpen(false); onOpenSettings?.(); }}
      />
    : null;

  if (!open) return releaseNotesDialog;

  return (
    <>
      {releaseNotesDialog}
      <ModalSurface onDismiss={() => onOpenChange(false)} label={t('palette.placeholder')}
      className="fixed inset-0 z-50 flex items-start justify-center px-4 pb-4 pt-[min(12dvh,6rem)] bg-background/80 backdrop-blur-md animate-in fade-in-0 duration-150 select-none"
    >
      <div
        className="w-full max-w-xl rounded-2xl border border-border/80 bg-popover/95 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150 backdrop-blur-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <Command className="command-palette w-full min-h-0 overflow-hidden bg-transparent text-foreground flex flex-col">
          <div className="shrink-0 border-b border-border/60 p-2">
            <div className="command-search-field h-10 flex items-center gap-2 rounded-md border border-input bg-background px-3 focus-within:border-ring focus-within:ring-1 focus-within:ring-inset focus-within:ring-ring">
              <Search className="h-4 w-4 text-muted-foreground shrink-0" />
              <Command.Input
                aria-label={t('palette.placeholder')} placeholder={t('palette.placeholder')}
                className="h-8 min-w-0 flex-1 border-0 bg-transparent p-0 text-xs text-foreground placeholder:text-muted-foreground"
                autoFocus
              />
              <kbd className="pointer-events-none inline-flex h-5 shrink-0 select-none items-center rounded border border-border bg-muted/50 px-1.5 font-mono text-[12px] text-muted-foreground">
                ESC
              </kbd>
            </div>
          </div>

          <Command.List className="min-h-0 overflow-y-auto overscroll-contain p-2 text-xs">
            <Command.Empty className="py-8 text-center text-xs text-muted-foreground">
              {t('palette.noMatch')}
            </Command.Empty>

            {/* View Navigation */}
            <Command.Group heading={t('palette.group.nav')} className="px-2 py-1">
              <Command.Item
                onSelect={() => {
                  setActiveTab('changes');
                  onOpenChange(false);
                }}
                className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-accent cursor-pointer text-xs"
              >
                <FileCode2 className="h-3.5 w-3.5 text-primary" />
                <span>{t('sidebar.changes')}</span>
                <span className="ml-auto text-[12px] font-mono text-muted-foreground">Alt 1</span>
              </Command.Item>

              <Command.Item
                onSelect={() => {
                  setActiveTab('history');
                  onOpenChange(false);
                }}
                className="flex items-center gap-2.5 px-2.5 py-2 rounded-md hover:bg-accent cursor-pointer text-xs"
              >
                <Clock className="h-3.5 w-3.5 text-git-branch" />
                <span>{t('sidebar.history')}</span>
                <span className="ml-auto text-[12px] font-mono text-muted-foreground">Alt 2</span>
              </Command.Item>

              <Command.Item
                onSelect={() => {
                  setActiveTab('pullRequests');
                  onOpenChange(false);
                }}
                className="flex items-center gap-2.5 px-2.5 py-2 rounded-md hover:bg-accent cursor-pointer text-xs"
              >
                <GitPullRequest className="h-3.5 w-3.5 text-primary" />
                <span>{t('palette.prCenter')}</span>
                <span className="ml-auto text-[12px] font-mono text-muted-foreground">Alt 3</span>
              </Command.Item>

              <Command.Item
                onSelect={() => {
                  setActiveTab('actions');
                  onOpenChange(false);
                }}
                className="flex items-center gap-2.5 px-2.5 py-2 rounded-md hover:bg-accent cursor-pointer text-xs"
              >
                <Workflow className="h-3.5 w-3.5 text-git-added" />
                <span>{t('palette.actionsDash')}</span>
                <span className="ml-auto text-[12px] font-mono text-muted-foreground">Alt 4</span>
              </Command.Item>
            </Command.Group>

            {/* Git Core Actions */}
            <Command.Group heading={t('palette.group.git')} className="px-2 py-1 mt-2">
              <Command.Item
                disabled={!currentRepo}
                onSelect={() => {
                  if (!currentRepo) return;
                  onOpenChange(false);
                  setReleaseNotesOpen(true);
                }}
                className="flex items-center gap-2.5 px-2.5 py-2 rounded-md aria-disabled:opacity-40 hover:bg-accent cursor-pointer text-xs"
              >
                <FileText className="h-3.5 w-3.5 text-primary" />
                <span>{t('releaseNotes.command')}</span>
              </Command.Item>

              <Command.Item
                disabled={!currentRepo}
                onSelect={async () => {
                  if (!currentRepo) return;
                  onOpenChange(false);
                  toast.info(t('header.fetching'));
                  try {
                    await fetchRemote();
                    toast.success(t('header.fetchDone'));
                  } catch (err: any) {
                    toast.error(t('header.fetchFailed'), err.message);
                  }
                }}
                className="flex items-center gap-2.5 px-2.5 py-2 rounded-md aria-disabled:opacity-40 hover:bg-accent cursor-pointer text-xs"
              >
                <RefreshCw className="h-3.5 w-3.5 text-git-branch" />
                <span>{t('palette.gitFetch')}</span>
                <span className="ml-auto text-[12px] font-mono text-muted-foreground">Ctrl+Shift+F</span>
              </Command.Item>

              <Command.Item
                disabled={!currentRepo}
                onSelect={async () => {
                  if (!currentRepo) return;
                  onOpenChange(false);
                  toast.info(t('header.pulling'));
                  try {
                    await pull();
                    toast.success(t('header.pulled'));
                  } catch (err: any) {
                    toast.error(t('header.pullFailed'), err.message);
                  }
                }}
                className="flex items-center gap-2.5 px-2.5 py-2 rounded-md aria-disabled:opacity-40 hover:bg-accent cursor-pointer text-xs"
              >
                <ArrowDown className="h-3.5 w-3.5 text-primary" />
                <span>{t('palette.gitPull')}</span>
                <span className="ml-auto text-[12px] font-mono text-muted-foreground">Ctrl+L</span>
              </Command.Item>

              <Command.Item
                disabled={!currentRepo}
                onSelect={async () => {
                  if (!currentRepo) return;
                  onOpenChange(false);
                  try {
                    if (!await pushFromUi()) return;
                    toast.success(t('header.pushed'));
                  } catch (err: any) {
                    toast.error(t('header.pushFailed'), err.message);
                  }
                }}
                className="flex items-center gap-2.5 px-2.5 py-2 rounded-md aria-disabled:opacity-40 hover:bg-accent cursor-pointer text-xs"
              >
                <ArrowUp className="h-3.5 w-3.5 text-git-added" />
                <span>{t('palette.gitPush')}</span>
                <span className="ml-auto text-[12px] font-mono text-muted-foreground">Ctrl+P</span>
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
              <Command.Group heading={t('palette.group.branches')} className="px-2 py-1 mt-2">
                {branches.map((b) => (
                  <Command.Item
                    key={b.name}
                    onSelect={() => {
                      if (!b.isCurrent) {
                        checkoutBranch(b.name)
                          .then(() => toast.success(`${t('header.switchedToBranch')}: ${b.name}`))
                          .catch((err: any) =>
                            !isRepositoryAccessCancelled(err) && toast.error(`${t('header.switchBranchFailed')}: ${b.name}`, err?.message)
                          );
                      }
                      onOpenChange(false);
                    }}
                    className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-md hover:bg-accent cursor-pointer text-xs"
                  >
                    <GitBranch className="h-3.5 w-3.5 text-git-branch" />
                    <span>{b.name}</span>
                    {b.isCurrent && (
                      <span className="ml-auto text-[12px] px-1 rounded bg-accent text-git-branch">
                        {t('header.currentHead')}
                      </span>
                    )}
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {/* Quick Tags */}
            {tags.length > 0 && (
              <Command.Group heading={t('palette.group.tags')} className="px-2 py-1 mt-2">
                {tags.map((tag) => (
                  <Command.Item
                    key={tag.name}
                    onSelect={() => {
                      onOpenChange(false);
                      void selectAndLocateBranch(`refs/tags/${tag.name}`).catch((error: Error) => toast.error(error.message));
                    }}
                    className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-md hover:bg-accent cursor-pointer text-xs"
                  >
                    <Tag className="h-3.5 w-3.5 text-git-tag" />
                    <span className="font-mono">{tag.name}</span>
                    <span className="ml-auto text-[12px] font-mono text-muted-foreground">
                      {tag.commitHash.slice(0, 7)}
                    </span>
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {/* Themes & Preferences */}
            <Command.Group heading={t('palette.group.settings')} className="px-2 py-1 mt-2">
              <Command.Item
                onSelect={() => {
                  setTheme('dark');
                  onOpenChange(false);
                  toast.info(t('palette.switchedToDark'));
                }}
                className="flex items-center gap-2.5 px-2.5 py-2 rounded-md hover:bg-accent cursor-pointer text-xs"
              >
                <Moon className="h-3.5 w-3.5 text-git-branch" />
                <span>{t('palette.darkMode')}</span>
              </Command.Item>

              <Command.Item
                onSelect={() => {
                  setTheme('light');
                  onOpenChange(false);
                  toast.info(t('palette.switchedToLight'));
                }}
                className="flex items-center gap-2.5 px-2.5 py-2 rounded-md hover:bg-accent cursor-pointer text-xs"
              >
                <Sun className="h-3.5 w-3.5 text-git-tag" />
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
                <Workflow className="h-3.5 w-3.5 text-primary" />
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
    </ModalSurface>
    </>
  );
};
