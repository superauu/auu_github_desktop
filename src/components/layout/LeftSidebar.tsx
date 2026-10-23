import { keyboardRowProps } from '@/utils/keyboardNavigation';
import { pushFromUi, remoteTagFromUi } from '@/services/git/RemoteActions';
import { gitService } from '@/services/git/GitService';
import { useShallow } from 'zustand/react/shallow';
import { useWorkspaceLayout } from '@/hooks/useWorkspaceLayout';
import { useLayoutStore } from '@/stores/layoutStore';
import { confirmAction } from '@/stores/confirmStore';
import React, { useState, useRef, useEffect } from 'react';
import {
  GitBranch as GitBranchIcon,
  Tag as TagIcon,
  Clock,
  FileCode2,
  Plus,
  ChevronRight,
  ChevronDown,
  Cloud,
  X,
  Trash2,
  GitPullRequest,
  Archive,
  GitMerge,
  UploadCloud,
  ArrowDownToLine,
  Folder,
  FolderOpen,
  Check,
  Search,
  Bot,
  ListFilter,
  Sparkles,
  Copy,
  Eye,
  MoreVertical,
  Pin,
  PinOff,
} from 'lucide-react';
import { useI18n } from '@/i18n';
import { useRepoStore } from '@/stores/repoStore';
import { useGitHubStore } from '@/stores/githubStore';
import { GitBranch, GitStash, GitTag } from '@/services/git/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ContextMenu, ContextMenuItem } from '@/components/ui/ContextMenu';
import { CreateBranchModal } from '@/features/git/CreateBranchModal';
import { StashPreviewModal } from '@/features/git/StashPreviewModal';
import { MergeBranchModal } from '@/features/git/MergeBranchModal';
import { RebaseBranchModal } from '@/features/git/RebaseBranchModal';
import { HealthDiagnosisModal } from '@/features/git/HealthDiagnosisModal';
import { DragDropActionModal } from '@/features/git/DragDropActionModal';
import { RecoveryCenterDialog } from '@/features/git/RecoveryCenterDialog';
import { toast } from '@/stores/toastStore';
import { cn } from '@/utils/cn';

export const LeftSidebar: React.FC<{ inDrawer?: boolean; onNavigate?: () => void }> = ({ inDrawer = false, onNavigate }) => {
  const { t } = useI18n();
  const {
    currentRepo,
    activeTab,
    setActiveTab,
    status,
    branches,
    selectedBranch,
    selectAndLocateBranch,
    tags,
    stashes,
    isLeftSidebarCollapsed,
    checkoutBranch,
    deleteBranch,
    createTag,
    deleteTag,
    stashPush,
    stashPop,
    stashApply,
    stashDrop,
  } = useRepoStore(useShallow(state => ({ currentRepo: state.currentRepo, activeTab: state.activeTab, setActiveTab: state.setActiveTab, status: state.status, branches: state.branches, selectedBranch: state.selectedBranch, selectAndLocateBranch: state.selectAndLocateBranch, tags: state.tags, stashes: state.stashes, isLeftSidebarCollapsed: state.isLeftSidebarCollapsed, checkoutBranch: state.checkoutBranch, deleteBranch: state.deleteBranch, createTag: state.createTag, deleteTag: state.deleteTag, stashPush: state.stashPush, stashPop: state.stashPop, stashApply: state.stashApply, stashDrop: state.stashDrop })));

  const { pullRequests, selectPR } = useGitHubStore();
  const { panels } = useWorkspaceLayout();
  const { navigationPinned, setNavigationPinned } = useLayoutStore();

  // Mode: List vs Agents (GitKraken style)
  const [sidebarMode, setSidebarMode] = useState<'list' | 'agents'>('list');
  const [searchFilter, setSearchFilter] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Group sections expanded
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    localBranches: true,
    remoteBranches: false,
    pullRequests: false,
    tags: false,
    stashes: false,
  });

  // Branch folders expanded state (e.g. "feature", "backup")
  const [folderExpanded, setFolderExpanded] = useState<Record<string, boolean>>({});

  // Modal dialog states
  const [createBranchModalOpen, setCreateBranchModalOpen] = useState(false);
  const [mergeModalOpen, setMergeModalOpen] = useState(false);
  const [mergeTargetBranch, setMergeTargetBranch] = useState<string | undefined>(undefined);
  const [rebaseModalOpen, setRebaseModalOpen] = useState(false);
  const [rebaseUpstreamBranch, setRebaseUpstreamBranch] = useState<string | undefined>(undefined);

  // Stash dialog state
  const [newStashOpen, setNewStashOpen] = useState(false);
  const [previewStash, setPreviewStash] = useState<GitStash | null>(null);
  const [stashMessageInput, setStashMessageInput] = useState('');

  // Dialog states
  const [newTagOpen, setNewTagOpen] = useState(false);
  const [tagNameInput, setTagNameInput] = useState('');
  const [tagMessageInput, setTagMessageInput] = useState('');
  const [healthModalOpen, setHealthModalOpen] = useState(false);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [createBranchBase, setCreateBranchBase] = useState<string | undefined>(undefined);

  // Universal Context Menu state
  const [contextMenu, setContextMenu] = useState<{
    open: boolean;
    x: number;
    y: number;
    items: ContextMenuItem[];
  }>({
    open: false,
    x: 0,
    y: 0,
    items: [],
  });

  // Drag & Drop Branch states
  const [draggedBranch, setDraggedBranch] = useState<GitBranch | null>(null);
  const [dragOverBranchName, setDragOverBranchName] = useState<string | null>(null);
  const [dragDropModalOpen, setDragDropModalOpen] = useState(false);
  const [dragSource, setDragSource] = useState<GitBranch | null>(null);
  const [dragTarget, setDragTarget] = useState<GitBranch | null>(null);

  // Drag & Drop Handlers for branches
  const handleDragStart = (e: React.DragEvent, branch: GitBranch) => {
    setDraggedBranch(branch);
    e.dataTransfer.setData('text/plain', branch.name);
    e.dataTransfer.effectAllowed = 'copyMove';
  };

  const handleDragOver = (e: React.DragEvent, branch: GitBranch) => {
    if (!draggedBranch || draggedBranch.name === branch.name) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverBranchName !== branch.name) {
      setDragOverBranchName(branch.name);
    }
  };

  const handleDragLeave = (_e: React.DragEvent, branch: GitBranch) => {
    if (dragOverBranchName === branch.name) {
      setDragOverBranchName(null);
    }
  };

  const handleDrop = (e: React.DragEvent, targetBranch: GitBranch) => {
    e.preventDefault();
    setDragOverBranchName(null);
    if (!draggedBranch || draggedBranch.name === targetBranch.name) {
      return;
    }

    setDragSource(draggedBranch);
    setDragTarget(targetBranch);
    setDragDropModalOpen(true);
    setDraggedBranch(null);
  };

  const handleDragEnd = () => {
    setDraggedBranch(null);
    setDragOverBranchName(null);
  };

  // Local Branch Context Menu
  const handleBranchContextMenu = (e: React.MouseEvent, branch: GitBranch) => {
    e.preventDefault();
    e.stopPropagation();

    const currentBranchName =
      branches.find((b) => b.isCurrent)?.name ||
      status?.currentBranch ||
      currentRepo?.currentBranch ||
      '';
    const isCurrent = branch.isCurrent;

    const items: ContextMenuItem[] = [
      {
        id: 'preview-branch-operation',
        label: t('safety.preview'),
        icon: <Eye className="h-3.5 w-3.5 text-primary" />,
        disabled: isCurrent || !branches.some(item => item.isCurrent),
        onClick: () => {
          const current = branches.find(item => item.isCurrent);
          if (current) { setDragSource(branch); setDragTarget(current); setDragDropModalOpen(true); }
        },
      },
      {
        id: 'checkout',
        label: isCurrent ? `${t('sidebar.ctx.checkedOut')} (${branch.name})` : branch.worktreePath ? `${t('worktree.open')} (${branch.name})` : `${t('sidebar.ctx.checkout')} (${branch.name})`,
        icon: <GitBranchIcon className="h-3.5 w-3.5 text-git-branch" />,
        disabled: isCurrent,
        onClick: async () => {
          try {
            await checkoutBranch(branch.name);
            toast.success(t('header.switchedToBranch'), branch.name);
          } catch (err: any) {
            toast.error(t('sidebar.ctx.switchFailed'), err?.message);
          }
        },
      },
      {
        id: 'merge',
        label: `${t('sidebar.ctx.mergeIntoCurrent')} ${branch.name} → ${currentBranchName || t('sidebar.currentBranch')}...`,
        icon: <GitMerge className="h-3.5 w-3.5 text-git-branch" />,
        disabled: isCurrent,
        onClick: () => {
          setMergeTargetBranch(branch.name);
          setMergeModalOpen(true);
        },
      },
      {
        id: 'rebase',
        label: `${t('sidebar.ctx.rebaseCurrentOnto')} ${branch.name}...`,
        icon: <GitPullRequest className="h-3.5 w-3.5 text-git-tag" />,
        disabled: isCurrent,
        onClick: () => {
          setRebaseUpstreamBranch(branch.name);
          setRebaseModalOpen(true);
        },
      },
      { separator: true, id: 'sep-1' },
      {
        id: 'new-branch',
        label: t('sidebar.ctx.newBranchFromHere'),
        icon: <Plus className="h-3.5 w-3.5 text-git-added" />,
        onClick: () => {
          setCreateBranchBase(branch.name);
          setCreateBranchModalOpen(true);
        },
      },
      {
        id: 'push',
        label: `${t('sidebar.ctx.pushToRemote')} ${branch.name}…`,
        icon: <UploadCloud className="h-3.5 w-3.5 text-git-renamed" />,
        onClick: async () => {
          try {
            if (!await pushFromUi(branch.name)) return;
            toast.success(`${branch.name} ${t('sidebar.ctx.pushBranchDone')}`);
          } catch (err: any) {
            toast.error(t('sidebar.ctx.pushBranchFailed'), err?.message);
          }
        },
      },
      {
        id: 'copy-name',
        label: t('sidebar.ctx.copyBranchName'),
        icon: <Copy className="h-3.5 w-3.5" />,
        onClick: () => {
          navigator.clipboard.writeText(branch.name);
          toast.info(t('sidebar.ctx.branchCopied'), branch.name);
        },
      },
      { separator: true, id: 'sep-2' },
      {
        id: 'delete',
        label: isCurrent ? t('sidebar.ctx.cannotDeleteCurrent') : `${t('sidebar.ctx.deleteBranch')} ${branch.name}`,
        icon: <Trash2 className="h-3.5 w-3.5 text-rose-500" />,
        disabled: isCurrent || !!branch.worktreePath,
        danger: true,
        onClick: async () => {
          if (await confirmAction({ title: t('sidebar.ctx.deleteBranch'), description: t('composer.deleteBranchWarning'), detail: branch.name })) {
            try {
              await deleteBranch(branch.name);
              toast.success(`${t('sidebar.ctx.branchDeleted')}: ${branch.name}`);
            } catch (err: any) {
              toast.error(t('sidebar.ctx.deleteBranchFailed'), err?.message);
            }
          }
        },
      },
    ];

    setContextMenu({
      open: true,
      x: e.clientX,
      y: e.clientY,
      items,
    });
  };

  // Remote Branch Context Menu
  const handleRemoteBranchContextMenu = (e: React.MouseEvent, branch: GitBranch) => {
    e.preventDefault();
    e.stopPropagation();

    const localName = branch.remoteBranch || branch.name.slice(branch.name.indexOf('/') + 1);
    const currentBranchName =
      branches.find((b) => b.isCurrent)?.name ||
      status?.currentBranch ||
      currentRepo?.currentBranch ||
      '';

    const items: ContextMenuItem[] = [
      {
        id: 'checkout-remote',
        label: `${t('sidebar.ctx.checkoutTrackLocal')} (${localName})`,
        icon: <ArrowDownToLine className="h-3.5 w-3.5 text-primary" />,
        onClick: async () => {
          try {
            await checkoutBranch(`refs/remotes/${branch.name}`);
            toast.success(`${t('sidebar.ctx.remoteCheckedOut')}: ${localName}`);
          } catch (err: any) {
            toast.error(t('sidebar.ctx.remoteCheckoutFailed'), err.message);
          }
        },
      },
      {
        id: 'merge-remote',
        label: `${t('sidebar.ctx.mergeIntoCurrent')} ${branch.name} → ${currentBranchName || t('sidebar.currentBranch')}...`,
        icon: <GitMerge className="h-3.5 w-3.5 text-git-branch" />,
        onClick: () => {
          setMergeTargetBranch(branch.name);
          setMergeModalOpen(true);
        },
      },
      {
        id: 'rebase-remote',
        label: t('sidebar.ctx.rebaseCurrentOntoRemote'),
        icon: <GitPullRequest className="h-3.5 w-3.5 text-git-tag" />,
        onClick: () => {
          setRebaseUpstreamBranch(branch.name);
          setRebaseModalOpen(true);
        },
      },
      { separator: true, id: 'sep-1' },
      {
        id: 'new-branch-remote',
        label: t('sidebar.ctx.newBranchFromHere'),
        icon: <Plus className="h-3.5 w-3.5 text-git-added" />,
        onClick: () => {
          setCreateBranchBase(branch.name);
          setCreateBranchModalOpen(true);
        },
      },
      {
        id: 'copy-name-remote',
        label: t('sidebar.ctx.copyRemoteBranchName'),
        icon: <Copy className="h-3.5 w-3.5" />,
        onClick: () => {
          navigator.clipboard.writeText(branch.name);
          toast.info(t('sidebar.ctx.branchCopied'), branch.name);
        },
      },
      { separator: true, id: 'remote-delete-separator' },
      {
        id: 'delete-remote-branch',
        label: t('remote.deleteBranch'),
        icon: <Trash2 className="h-3.5 w-3.5 text-destructive" />,
        danger: true,
        onClick: async () => {
          const repoPath = currentRepo?.path;
          if (!repoPath) return;
          try {
            const remotes = await gitService.listRemotes(repoPath);
            const remote = remotes.sort((a, b) => b.name.length - a.name.length).find(item => branch.name.startsWith(`${item.name}/`));
            if (!remote) throw new Error(t('remote.invalid'));
            const name = branch.name.slice(remote.name.length + 1);
            if (!await confirmAction({ title: t('remote.deleteBranch'), description: t('remote.deleteWarning'), detail: `${remote.name}/${name}\n${remote.pushUrl || remote.fetchUrl}`, danger: true })) return;
            await gitService.deleteRemoteBranch(repoPath, remote.name, name);
            if (useRepoStore.getState().currentRepo?.path === repoPath) await useRepoStore.getState().refreshAll();
            toast.success(t('remote.deleted'), branch.name);
          } catch (error: any) { toast.error(t('remote.deleteFailed'), error?.message); }
        },
      },
    ];

    setContextMenu({
      open: true,
      x: e.clientX,
      y: e.clientY,
      items,
    });
  };

  // Tag Context Menu
  const handleTagContextMenu = (e: React.MouseEvent, tag: GitTag) => {
    e.preventDefault();
    e.stopPropagation();

    const items: ContextMenuItem[] = [
      {
        id: 'checkout-tag',
        label: `${t('sidebar.ctx.checkoutTag')} (${tag.name})`,
        icon: <TagIcon className="h-3.5 w-3.5 text-git-tag" />,
        onClick: async () => {
          try {
            await checkoutBranch(tag.name);
            toast.success(`${t('sidebar.ctx.tagCheckedOut')}: ${tag.name}`);
          } catch (err: any) {
            toast.error(t('sidebar.ctx.tagCheckoutFailed'), err?.message);
          }
        },
      },
      {
        id: 'new-branch-tag',
        label: t('sidebar.ctx.newBranchFromTag'),
        icon: <Plus className="h-3.5 w-3.5 text-git-added" />,
        onClick: () => {
          setCreateBranchBase(tag.name);
          setCreateBranchModalOpen(true);
        },
      },
      {
        id: 'push-tag',
        label: t('sidebar.ctx.pushTag'),
        icon: <UploadCloud className="h-3.5 w-3.5 text-git-renamed" />,
        onClick: async () => {
          try {
            if (!await remoteTagFromUi('tag', tag.name)) return;
            toast.success(`${t('sidebar.ctx.tagPushed')}: ${tag.name}`);
          } catch (err: any) {
            toast.error(t('sidebar.ctx.tagPushFailed'), err?.message);
          }
        },
      },
      {
        id: 'copy-tag-name',
        label: t('sidebar.ctx.copyTagName'),
        icon: <Copy className="h-3.5 w-3.5" />,
        onClick: () => {
          navigator.clipboard.writeText(tag.name);
          toast.info(t('sidebar.ctx.tagNameCopied'), tag.name);
        },
      },
      { separator: true, id: 'sep-tag' },
      {
        id: 'delete-tag',
        label: `${t('sidebar.ctx.deleteLocalTag')} ${tag.name}`,
        icon: <Trash2 className="h-3.5 w-3.5 text-rose-500" />,
        danger: true,
        onClick: async () => {
          if (await confirmAction({ title: t('sidebar.ctx.deleteLocalTag'), description: t('composer.deleteTagWarning'), detail: tag.name })) {
            try {
              await deleteTag(tag.name);
              toast.success(`${t('sidebar.ctx.tagDeleted')}: ${tag.name}`);
            } catch (err: any) {
              toast.error(t('sidebar.ctx.deleteTagFailed'), err?.message);
            }
          }
        },
      },
      {
        id: 'delete-remote-tag',
        label: `${t('sidebar.ctx.deleteRemoteTag')} ${tag.name}`,
        icon: <Trash2 className="h-3.5 w-3.5 text-rose-500" />,
        danger: true,
        onClick: async () => {
          try {
            if (!await remoteTagFromUi('deleteTag', tag.name)) return;
            toast.success(`${t('sidebar.ctx.remoteTagDeleted')}: ${tag.name}`);
          } catch (err: any) {
            toast.error(t('sidebar.ctx.deleteRemoteTagFailed'), err?.message);
          }
        },
      },
    ];

    setContextMenu({
      open: true,
      x: e.clientX,
      y: e.clientY,
      items,
    });
  };

  // Stash Context Menu
  const handleStashContextMenu = (e: React.MouseEvent, stash: any) => {
    e.preventDefault();
    e.stopPropagation();

    const items: ContextMenuItem[] = [
      {
        id: 'view-stash-patch',
        label: t('sidebar.viewStashPatch'),
        icon: <FileCode2 className="h-3.5 w-3.5" />,
        onClick: () => setPreviewStash(stash),
      },
      {
        id: 'apply-stash',
        label: t('sidebar.ctx.applyStash'),
        icon: <Archive className="h-3.5 w-3.5 text-primary" />,
        onClick: async () => {
          try {
            await stashApply(stash.index);
            toast.success(t('sidebar.ctx.stashApplied'));
          } catch (err: any) {
            toast.error(t('sidebar.ctx.stashApplyFailed'), err?.message);
          }
        },
      },
      {
        id: 'pop-stash',
        label: t('sidebar.ctx.popStash'),
        icon: <Archive className="h-3.5 w-3.5 text-git-added" />,
        onClick: async () => {
          try {
            await stashPop(stash.index);
            toast.success(t('sidebar.ctx.stashPopped'));
          } catch (err: any) {
            toast.error(t('sidebar.popFailedAlt'), err?.message);
          }
        },
      },
      { separator: true, id: 'sep-stash' },
      {
        id: 'drop-stash',
        label: t('sidebar.ctx.dropStash'),
        icon: <Trash2 className="h-3.5 w-3.5 text-rose-500" />,
        danger: true,
        onClick: async () => {
          if (await confirmAction({ title: t('sidebar.ctx.dropStash'), description: t('composer.dropStashWarning'), detail: `stash@{${stash.index}} · ${stash.message}` })) {
            try {
              await stashDrop(stash.index);
              toast.info(t('sidebar.ctx.stashDropped'));
            } catch (err: any) {
              toast.error(t('sidebar.ctx.dropFailed'), err?.message);
            }
          }
        },
      },
    ];

    setContextMenu({
      open: true,
      x: e.clientX,
      y: e.clientY,
      items,
    });
  };

  // Shortcut to focus search filter (Ctrl+Alt+F)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.altKey && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  const toggleFolder = (folderName: string) => {
    setFolderExpanded((prev) => ({
      ...prev,
      [folderName]: prev[folderName] === undefined ? false : !prev[folderName],
    }));
  };

  if (isLeftSidebarCollapsed && !inDrawer) return null;

  const changesCount =
    (status?.staged.length || 0) +
    (status?.unstaged.length || 0) +
    (status?.untracked.length || 0);

  const localBranches = branches.filter((b) => !b.isRemote);
  const remoteBranches = branches.filter((b) => b.isRemote);

  // GitKraken-style Folder Hierarchy grouping
  const groupBranches = (list: GitBranch[]) => {
    const filter = searchFilter.trim().toLowerCase();
    const filtered = list.filter((b) =>
      !filter || b.name.toLowerCase().includes(filter)
    );

    const folders: Record<string, GitBranch[]> = {};
    const rootBranches: GitBranch[] = [];

    for (const b of filtered) {
      const parts = b.name.split('/');
      if (parts.length > 1) {
        const folderName = parts[0];
        if (!folders[folderName]) folders[folderName] = [];
        folders[folderName].push(b);
      } else {
        rootBranches.push(b);
      }
    }

    return { folders, rootBranches, totalCount: filtered.length };
  };

  const localGrouped = groupBranches(localBranches);
  const remoteGrouped = groupBranches(remoteBranches);

  const filteredTags = tags.filter((t) =>
    !searchFilter.trim() || t.name.toLowerCase().includes(searchFilter.toLowerCase())
  );

  const handleCreateTag = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tagNameInput.trim()) return;
    try {
      await createTag(tagNameInput.trim(), undefined, tagMessageInput.trim() || undefined);
      toast.success(t('sidebar.tagCreated'), tagNameInput.trim());
      setTagNameInput('');
      setTagMessageInput('');
      setNewTagOpen(false);
    } catch (err: any) {
      toast.error(t('sidebar.tagCreateFailed'), err.message);
    }
  };

  const handleDeleteTag = async (name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await deleteTag(name);
      toast.info(t('sidebar.tagDeleted'), name);
    } catch (err: any) {
      toast.error(t('sidebar.tagDeleteFailed'), err.message);
    }
  };

  return (
    <aside
      style={{ width: inDrawer ? '100%' : panels.left }}
      className="glass-surface glass-navigation flex flex-col select-none shrink-0 h-full overflow-hidden text-xs"
    >
      <div className="h-10 px-3 border-b border-border flex items-center justify-between gap-2 shrink-0">
        <h2 className="text-[12px] font-semibold text-muted-foreground">{t('composer.navigation')}</h2>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className={cn('h-7 w-7', navigationPinned ? 'text-primary' : 'text-muted-foreground')}
            aria-label={t(navigationPinned ? 'layout.unpinNavigation' : 'layout.pinNavigation')}
            title={t(navigationPinned ? 'layout.unpinNavigation' : 'layout.pinNavigation')}
            aria-pressed={navigationPinned}
            onClick={() => {
              const pinned = !navigationPinned;
              setNavigationPinned(pinned);
              if (pinned) useRepoStore.setState({ isLeftSidebarCollapsed: false });
              onNavigate?.();
            }}>
            {navigationPinned ? <Pin className="h-3.5 w-3.5" /> : <PinOff className="h-3.5 w-3.5" />}
          </Button>
          {inDrawer && <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={t('common.close')} onClick={onNavigate}><X className="h-3.5 w-3.5" /></Button>}
        </div>
      </div>
      {/* Top Primary Navigation (Changes, History, PRs, Actions) */}
      <div className="glass-primary-nav p-2 space-y-1 border-b border-border/60">
        <button
          aria-current={activeTab === 'changes' ? 'page' : undefined}
          onClick={() => { setActiveTab('changes'); onNavigate?.(); }}
          className={cn(
            "w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg font-medium transition-all group",
            activeTab === 'changes'
              ? "bg-accent text-accent-foreground shadow-xs font-semibold"
              : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
          )}
        >
          <div className="flex items-center gap-2">
            <FileCode2
              className={cn(
                "h-3.5 w-3.5",
                activeTab === 'changes' ? "text-primary" : "text-muted-foreground"
              )}
            />
            <span>{t('sidebar.changes')}</span>
          </div>
          {changesCount > 0 ? (
            <Badge variant="warning" className="h-4 px-1.5 text-[12px] font-mono">
              {changesCount}
            </Badge>
          ) : (
            <span className="text-[12px] text-muted-foreground opacity-60">{t('sidebar.clean')}</span>
          )}
        </button>

        <button
          aria-current={activeTab === 'history' ? 'page' : undefined}
          onClick={() => { setActiveTab('history'); onNavigate?.(); }}
          className={cn(
            "w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg font-medium transition-all group",
            activeTab === 'history'
              ? "bg-accent text-accent-foreground shadow-xs font-semibold"
              : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
          )}
        >
          <div className="flex items-center gap-2">
            <Clock
              className={cn(
                "h-3.5 w-3.5",
                activeTab === 'history' ? "text-primary" : "text-muted-foreground"
              )}
            />
            <span>{t('sidebar.history')}</span>
          </div>
        </button>

        <button
          aria-current={activeTab === 'pullRequests' ? 'page' : undefined}
          onClick={() => { setActiveTab('pullRequests'); onNavigate?.(); }}
          className={cn(
            "w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg font-medium transition-all group",
            activeTab === 'pullRequests'
              ? "bg-accent text-accent-foreground shadow-xs font-semibold"
              : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
          )}
        >
          <div className="flex items-center gap-2">
            <GitPullRequest
              className={cn(
                "h-3.5 w-3.5",
                activeTab === 'pullRequests' ? "text-git-renamed" : "text-muted-foreground"
              )}
            />
            <span>{t('sidebar.pullRequests')}</span>
          </div>
          <Badge variant="outline" className="h-3.5 px-1 text-[12px] font-mono">
            {pullRequests.length}
          </Badge>
        </button>

        <button
          aria-current={activeTab === 'actions' ? 'page' : undefined}
          onClick={() => { setActiveTab('actions'); onNavigate?.(); }}
          className={cn(
            "w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg font-medium transition-all group",
            activeTab === 'actions'
              ? "bg-accent text-accent-foreground shadow-xs font-semibold"
              : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
          )}
        >
          <div className="flex items-center gap-2">
            <Cloud
              className={cn(
                "h-3.5 w-3.5",
                activeTab === 'actions' ? "text-git-added" : "text-muted-foreground"
              )}
            />
            <span>{t('sidebar.actions')}</span>
          </div>
          <Badge variant="success" className="h-3.5 px-1 text-[12px] font-mono">
            CI
          </Badge>
        </button>
      </div>

      {/* GitKraken-style [List] [Agents] Pill Switcher */}
      <div className="px-2 pt-2 pb-1.5 border-b border-border/40 flex items-center justify-between">
        <div className="glass-segmented flex items-center w-full">
          <button
            aria-pressed={sidebarMode === 'list'} onClick={() => setSidebarMode('list')}
            className={cn(
              "flex-1 py-1 rounded-md text-[12px] font-medium flex items-center justify-center gap-1 transition-all",
              sidebarMode === 'list'
                ? "bg-background text-foreground shadow-xs font-semibold"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <ListFilter className="h-3 w-3" />
            <span>{t('sidebar.mode.list')}</span>
          </button>
          <button
            aria-pressed={sidebarMode === 'agents'} onClick={() => setSidebarMode('agents')}
            className={cn(
              "flex-1 py-1 rounded-md text-[12px] font-medium flex items-center justify-center gap-1 transition-all",
              sidebarMode === 'agents'
                ? "bg-background text-foreground shadow-xs font-semibold"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Sparkles className="h-3 w-3 text-git-branch" />
            <span>{t('sidebar.mode.agents')}</span>
          </button>
        </div>
      </div>

      {sidebarMode === 'agents' ? (
        /* GitKraken-style AI Agents Assistant Panel */
        <div className="flex-1 p-3 space-y-3 overflow-y-auto">
          <button disabled={!currentRepo} onClick={() => setRecoveryOpen(true)} className="w-full rounded-md border border-border px-3 py-2 text-xs text-left hover:bg-accent">{t('recovery.title')}</button>
          <div className="p-2.5 rounded-xl border border-indigo-500/30 bg-indigo-500/10 space-y-1.5">
            <div className="flex items-center gap-1.5 text-git-branch font-semibold text-xs">
              <Bot className="h-4 w-4" />
              <span>{t('sidebar.gitAiAgent')}</span>
            </div>
            <p className="text-[12px] text-muted-foreground leading-relaxed">
              {t('sidebar.aiAssistant')}
            </p>
          </div>
          <div className="space-y-1 text-xs">
            <div className="text-[12px] uppercase font-semibold text-muted-foreground tracking-wider px-1">
              {t('sidebar.quickActions')}
            </div>
            <button
              onClick={() => {
                setActiveTab('changes');
                toast.info(t('sidebar.switchedToChanges'));
              }}
              className="w-full text-left p-2 rounded-lg bg-card/60 hover:bg-accent/60 border border-border/60 transition-colors space-y-0.5"
            >
              <div className="font-medium text-foreground">{t('sidebar.aiCommitTitle')}</div>
              <div className="text-[12px] text-muted-foreground">{t('sidebar.aiCommitDesc')}</div>
            </button>
            <button
              onClick={() => {
                setHealthModalOpen(true);
              }}
              className="w-full text-left p-2 rounded-lg bg-card/60 hover:bg-accent/60 border border-border/60 transition-colors space-y-0.5"
            >
              <div className="font-medium text-foreground">{t('sidebar.healthDiagnose')}</div>
              <div className="text-[12px] text-muted-foreground">{t('sidebar.healthDiagnoseDesc')}</div>
            </button>
          </div>
        </div>
      ) : (
        /* List Mode: Filter Input + Tree Navigator */
        <>
          {/* Quick Filter Box (Ctrl+Alt+F) */}
          <div className="px-2 py-1.5 border-b border-border/40">
            <div className="relative">
              <Search className="h-3 w-3 text-muted-foreground absolute left-2 top-2" />
              <Input
                ref={searchInputRef}
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                aria-label={t('sidebar.filterPlaceholder')} placeholder={t('sidebar.filterPlaceholder')}
                className="glass-control h-7 pl-6 pr-6 text-[12px] focus-visible:ring-1"
              />
              {searchFilter && (
                <button
                  aria-label={t('ui.clearSearch')} onClick={() => setSearchFilter('')}
                  className="absolute right-0 top-0 h-7 w-7 flex items-center justify-center text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>

          {/* Scrollable Tree Navigator (LOCAL, REMOTE, TAGS, STASHES) */}
          <ScrollArea className="flex-1 px-1.5 py-2">
            <div className="space-y-3" role="list" data-keyboard-list aria-label={t('sidebar.mode.list')}>
              {/* LOCAL Branches Section */}
              <div>
                <div
                  className="flex items-center justify-between px-2 py-1 text-[12px] font-semibold text-muted-foreground tracking-wider uppercase hover:text-foreground group"
                >
                  <button type="button" aria-expanded={expandedSections.localBranches} onClick={() => toggleSection('localBranches')} className="flex min-w-0 items-center gap-1 min-h-7 text-left">
                    {expandedSections.localBranches ? (
                      <ChevronDown className="h-3 w-3" />
                    ) : (
                      <ChevronRight className="h-3 w-3" />
                    )}
                    <span>{t('sidebar.local')} ({localGrouped.totalCount})</span>
                  </button>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="xs"
                      className="h-6 w-6 p-0 hover:text-git-branch hover:bg-indigo-500/10 text-muted-foreground"
                      title={t('sidebar.mergeBranchTitle')}
                      onClick={(e) => {
                        e.stopPropagation();
                        setMergeTargetBranch(undefined);
                        setMergeModalOpen(true);
                      }}
                    >
                      <GitMerge className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="xs"
                      className="h-6 w-6 p-0 hover:text-git-tag hover:bg-amber-500/10 text-muted-foreground"
                      title={t('sidebar.rebaseBranchTitle')}
                      onClick={(e) => {
                        e.stopPropagation();
                        setRebaseUpstreamBranch(undefined);
                        setRebaseModalOpen(true);
                      }}
                    >
                      <GitPullRequest className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="xs"
                      className="h-6 w-6 p-0 hover:text-primary hover:bg-primary/10 text-muted-foreground"
                      title={t('sidebar.newBranchTitle')}
                      onClick={(e) => {
                        e.stopPropagation();
                        setCreateBranchModalOpen(true);
                      }}
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                </div>

                {expandedSections.localBranches && (
                  <div className="mt-0.5 space-y-0.5 pl-1">
                    {/* Render Folder Groups (e.g. backup/, feature/) */}
                    {Object.entries(localGrouped.folders).map(([folderName, folderBranches]) => {
                      const isFolderOpen = folderExpanded[folderName] !== false; // 默认展开
                      return (
                        <div key={folderName} className="space-y-0.5">
                          <button type="button" aria-expanded={isFolderOpen}
                            onClick={() => toggleFolder(folderName)}
                            className="w-full flex items-center justify-between px-2 py-1 min-h-7 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-accent/40 font-medium"
                          >
                            <div className="flex items-center gap-1.5">
                              {isFolderOpen ? (
                                <FolderOpen className="h-3 w-3 text-git-tag" />
                              ) : (
                                <Folder className="h-3 w-3 text-git-tag" />
                              )}
                              <span>{folderName}</span>
                            </div>
                            <Badge variant="outline" className="h-3.5 px-1 text-[12px] font-mono opacity-70">
                              {folderBranches.length}
                            </Badge>
                          </button>

                           {/* Nested Branches inside folder */}
                          {isFolderOpen && (
                            <div className="pl-4 space-y-0.5 border-l border-border/40 ml-3">
                              {folderBranches.map((branch) => {
                                const leafName = branch.name.slice(folderName.length + 1);
                                const isSelected = selectedBranch === branch.name;

                                return (
                                  <div
                                    key={branch.name}
                                    {...keyboardRowProps(branch.name)}
                                    draggable={true}
                                    onDragStart={(e) => handleDragStart(e, branch)}
                                    onDragOver={(e) => handleDragOver(e, branch)}
                                    onDragLeave={(e) => handleDragLeave(e, branch)}
                                    onDrop={(e) => handleDrop(e, branch)}
                                    onDragEnd={handleDragEnd}
                                    onClick={() => {
                                      selectAndLocateBranch(branch.name);
                                      toast.info(`${t('sidebar.ctx.locatedCommit')}: ${branch.name}`);
                                    }}
                                    onContextMenu={(e) => handleBranchContextMenu(e, branch)}
                                    className={cn(
                                      "group flex items-center justify-between px-2 py-1 rounded-md text-xs transition-all cursor-pointer",
                                      dragOverBranchName === branch.name && "ring-2 ring-primary ring-offset-1 ring-offset-background bg-primary/25 shadow-md scale-[1.02]",
                                      draggedBranch?.name === branch.name && "opacity-40 border-dashed border-primary",
                                      branch.isCurrent
                                        ? "bg-primary/15 text-primary font-medium border border-primary/30"
                                        : isSelected
                                        ? "bg-accent text-foreground font-medium border border-border/80 shadow-xs"
                                        : "text-muted-foreground hover:text-foreground hover:bg-accent/40"
                                    )}
                                    title={branch.name}
                                  >
                                    <div className="flex items-center gap-1.5 truncate min-w-0">
                                      {branch.isCurrent ? (
                                        <Check className="h-3 w-3 text-git-added shrink-0" />
                                      ) : isSelected ? (
                                        <Eye className="h-3 w-3 text-git-added shrink-0" />
                                      ) : null}
                                      <GitBranchIcon className={cn("h-3 w-3 shrink-0", branch.isCurrent ? "text-primary" : isSelected ? "text-foreground" : "text-muted-foreground")} />
                                      <span className="truncate">{leafName}</span>
                                      {branch.worktreePath && !branch.isCurrent && <span className="text-[10px] text-primary shrink-0" title={branch.worktreePath}>Worktree</span>}
                                    </div>
                                    {branch.isCurrent ? (
                                      <span className="text-[12px] uppercase px-1 rounded bg-primary/25 text-primary font-bold font-mono">
                                        HEAD
                                      </span>
                                    ) : (
                                      <div className="flex items-center gap-0.5">
                                        {isSelected && (
                                          <span className="text-muted-foreground/60 p-0.5" title={branch.name}>
                                            <MoreVertical className="h-3 w-3" />
                                          </span>
                                        )}
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setMergeTargetBranch(branch.name);
                                            setMergeModalOpen(true);
                                          }}
                                          className="p-1 hover:text-git-branch rounded hover:bg-accent opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity"
                                          title={`${t('sidebar.ctx.mergeIntoCurrent')} ${branch.name}`}
                                        >
                                          <GitMerge className="h-2.5 w-2.5" />
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* Render Root Level Branches (e.g. main, master) */}
                    {localGrouped.rootBranches.map((branch) => {
                      const isSelected = selectedBranch === branch.name;

                      return (
                        <div
                          key={branch.name}
                                    {...keyboardRowProps(branch.name)}
                          draggable={true}
                          onDragStart={(e) => handleDragStart(e, branch)}
                          onDragOver={(e) => handleDragOver(e, branch)}
                          onDragLeave={(e) => handleDragLeave(e, branch)}
                          onDrop={(e) => handleDrop(e, branch)}
                          onDragEnd={handleDragEnd}
                          onClick={() => {
                            selectAndLocateBranch(branch.name);
                            toast.info(`${t('sidebar.ctx.locatedCommit')}: ${branch.name}`);
                          }}
                          onContextMenu={(e) => handleBranchContextMenu(e, branch)}
                          className={cn(
                            "group flex items-center justify-between px-2 py-1.5 rounded-md text-xs transition-all cursor-pointer",
                            dragOverBranchName === branch.name && "ring-2 ring-primary ring-offset-1 ring-offset-background bg-primary/25 shadow-md scale-[1.02]",
                            draggedBranch?.name === branch.name && "opacity-40 border-dashed border-primary",
                            branch.isCurrent
                              ? "bg-primary/20 text-primary font-semibold border border-primary/40 shadow-xs"
                              : isSelected
                              ? "bg-accent text-foreground font-medium border border-border/80 shadow-xs"
                              : "text-muted-foreground hover:text-foreground hover:bg-accent/40"
                          )}
                          title={branch.name}
                        >
                          <div className="flex items-center gap-1.5 truncate min-w-0">
                            {branch.isCurrent ? (
                              <Check className="h-3.5 w-3.5 text-git-added shrink-0" />
                            ) : isSelected ? (
                              <Eye className="h-3.5 w-3.5 text-git-added shrink-0" />
                            ) : null}
                            <GitBranchIcon className={cn("h-3 w-3 shrink-0", branch.isCurrent ? "text-primary" : isSelected ? "text-foreground" : "text-muted-foreground")} />
                            <span className="truncate">{branch.name}</span>
                            {branch.worktreePath && !branch.isCurrent && <span className="text-[10px] text-primary shrink-0" title={branch.worktreePath}>Worktree</span>}
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {branch.isCurrent ? (
                              <span className="text-[12px] uppercase px-1 py-0.2 rounded bg-primary/25 text-primary font-bold font-mono">
                                HEAD
                              </span>
                            ) : (
                              <div className="flex items-center gap-0.5">
                                {isSelected && (
                                  <span className="text-muted-foreground/60 p-0.5" title={branch.name}>
                                    <MoreVertical className="h-3 w-3" />
                                  </span>
                                )}
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setMergeTargetBranch(branch.name);
                                    setMergeModalOpen(true);
                                  }}
                                  className="p-1 hover:text-git-branch rounded hover:bg-accent opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity"
                                  title={`${t('sidebar.ctx.mergeIntoCurrent')} ${branch.name}`}
                                >
                                  <GitMerge className="h-2.5 w-2.5" />
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setRebaseUpstreamBranch(branch.name);
                                    setRebaseModalOpen(true);
                                  }}
                                  className="p-1 hover:text-git-tag rounded hover:bg-accent opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity"
                                  title={`${t('sidebar.rebaseOnto')} ${branch.name}`}
                                >
                                  <GitPullRequest className="h-2.5 w-2.5" />
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {localGrouped.totalCount === 0 && (
                      <div className="px-2 py-1 text-[12px] text-muted-foreground/60 italic">
                        {searchFilter ? t('sidebar.noMatchBranches') : t('sidebar.noLocalBranches')}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* REMOTE Branches Section */}
              <div>
                <div
                  className="flex items-center justify-between px-2 py-1 text-[12px] font-semibold text-muted-foreground tracking-wider uppercase hover:text-foreground group"
                >
                  <button type="button" aria-expanded={expandedSections.remoteBranches} onClick={() => toggleSection('remoteBranches')} className="flex min-w-0 items-center gap-1 min-h-7 text-left">
                    {expandedSections.remoteBranches ? (
                      <ChevronDown className="h-3 w-3" />
                    ) : (
                      <ChevronRight className="h-3 w-3" />
                    )}
                    <span>{t('sidebar.remote')} ({remoteGrouped.totalCount})</span>
                  </button>
                </div>

                {expandedSections.remoteBranches && (
                  <div className="mt-0.5 space-y-0.5 pl-1">
                    {remoteGrouped.rootBranches.map((branch) => {
                      const localName = branch.remoteBranch || branch.name.slice(branch.name.indexOf('/') + 1);
                      const isSelected = selectedBranch === branch.name;

                      return (
                        <div
                          key={branch.name}
                                    {...keyboardRowProps(branch.name)}
                          draggable={true}
                          onDragStart={(e) => handleDragStart(e, branch)}
                          onDragOver={(e) => handleDragOver(e, branch)}
                          onDragLeave={(e) => handleDragLeave(e, branch)}
                          onDrop={(e) => handleDrop(e, branch)}
                          onDragEnd={handleDragEnd}
                          onClick={() => {
                            selectAndLocateBranch(branch.name);
                            toast.info(`${t('sidebar.ctx.locatedRemoteCommit')}: ${branch.name}`);
                          }}
                          onContextMenu={(e) => handleRemoteBranchContextMenu(e, branch)}
                          className={cn(
                            "group flex items-center justify-between px-2 py-1 rounded-md text-xs cursor-pointer transition-all",
                            dragOverBranchName === branch.name && "ring-2 ring-primary ring-offset-1 ring-offset-background bg-primary/25 shadow-md scale-[1.02]",
                            draggedBranch?.name === branch.name && "opacity-40 border-dashed border-primary",
                            isSelected
                              ? "bg-accent text-foreground font-medium border border-border/80 shadow-xs"
                              : "text-muted-foreground hover:text-foreground hover:bg-accent/40"
                          )}
                          title={`${t('sidebar.viewRemoteBranch')}: ${branch.name} (${t('sidebar.viewRemoteHint')})`}
                        >
                          <div className="flex items-center gap-1.5 truncate">
                            {isSelected && <Eye className="h-3 w-3 text-git-added shrink-0" />}
                            <Cloud className="h-3 w-3 text-muted-foreground/80 shrink-0" />
                            <span className="truncate">{branch.name}</span>

                          </div>
                          <Button
                            variant="ghost"
                            size="xs"
                            className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 hover:text-primary"
                            title={t('sidebar.ctx.checkoutToLocal')}
                            onClick={async (e) => {
                              e.stopPropagation();
                              try {
                                await checkoutBranch(`refs/remotes/${branch.name}`);
                                toast.success(`${t('sidebar.ctx.remoteCheckedOut')}: ${localName}`);
                              } catch (err: any) {
                                toast.error(t('sidebar.ctx.remoteCheckoutFailed'), err.message);
                              }
                            }}
                          >
                            <ArrowDownToLine className="h-2.5 w-2.5" />
                          </Button>
                        </div>
                      );
                    })}

                    {/* Render remote branch folders */}
                    {Object.entries(remoteGrouped.folders).map(([folderName, folderBranches]) => (
                      <div key={folderName}>
                        <div className="flex items-center gap-1 px-2 py-0.5 text-[12px] font-semibold text-muted-foreground/70 uppercase tracking-wider">
                          <Cloud className="h-2.5 w-2.5" />
                          <span>{folderName}/</span>
                        </div>
                        {folderBranches.map((branch) => {
                          const localName = branch.remoteBranch || branch.name.slice(branch.name.indexOf('/') + 1);
                          const isSelected = selectedBranch === branch.name;

                          return (
                            <div
                              key={branch.name}
                                    {...keyboardRowProps(branch.name)}
                              draggable={true}
                              onDragStart={(e) => handleDragStart(e, branch)}
                              onDragOver={(e) => handleDragOver(e, branch)}
                              onDragLeave={(e) => handleDragLeave(e, branch)}
                              onDrop={(e) => handleDrop(e, branch)}
                              onDragEnd={handleDragEnd}
                              onClick={() => {
                                selectAndLocateBranch(branch.name);
                                toast.info(`${t('sidebar.ctx.locatedRemoteCommit')}: ${branch.name}`);
                              }}
                              onContextMenu={(e) => handleRemoteBranchContextMenu(e, branch)}
                              className={cn(
                                "group flex items-center justify-between px-2 py-1 rounded-md text-xs cursor-pointer transition-all",
                                dragOverBranchName === branch.name && "ring-2 ring-primary ring-offset-1 ring-offset-background bg-primary/25 shadow-md scale-[1.02]",
                                draggedBranch?.name === branch.name && "opacity-40 border-dashed border-primary",
                                isSelected
                                  ? "bg-accent text-foreground font-medium border border-border/80 shadow-xs"
                                  : "text-muted-foreground hover:text-foreground hover:bg-accent/40"
                              )}
                              title={`${t('sidebar.viewRemoteBranch')}: ${branch.name} (${t('sidebar.viewRemoteHint')})`}
                            >
                              <div className="flex items-center gap-1.5 truncate">
                                {isSelected && <Eye className="h-3 w-3 text-git-added shrink-0" />}
                                <Cloud className="h-3 w-3 text-muted-foreground/80 shrink-0" />
                                <span className="truncate">{branch.name}</span>

                              </div>
                              <Button
                                variant="ghost"
                                size="xs"
                                className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 hover:text-primary"
                                title={t('sidebar.ctx.checkoutToLocal')}
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  try {
                                    await checkoutBranch(`refs/remotes/${branch.name}`);
                                    toast.success(`${t('sidebar.ctx.remoteCheckedOut')}: ${localName}`);
                                  } catch (err: any) {
                                    toast.error(t('sidebar.ctx.remoteCheckoutFailed'), err.message);
                                  }
                                }}
                              >
                                <ArrowDownToLine className="h-2.5 w-2.5" />
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    ))}

                    {remoteGrouped.totalCount === 0 && (
                      <div className="px-2 py-1 text-[12px] text-muted-foreground/60 italic">
                        {searchFilter ? t('sidebar.noMatchBranches') : t('sidebar.ctx.noRemoteTracking')}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* PULL REQUESTS Section */}
              <div>
                <div
                  className="flex items-center justify-between px-2 py-1 text-[12px] font-semibold text-muted-foreground tracking-wider uppercase hover:text-foreground group"
                >
                  <button type="button" aria-expanded={expandedSections.pullRequests} onClick={() => toggleSection('pullRequests')} className="flex min-w-0 items-center gap-1 min-h-7 text-left">
                    {expandedSections.pullRequests ? (
                      <ChevronDown className="h-3 w-3" />
                    ) : (
                      <ChevronRight className="h-3 w-3" />
                    )}
                    <span>{t('sidebar.pullRequests')} ({pullRequests.length})</span>
                  </button>
                  <Button
                    variant="ghost"
                    size="xs"
                    className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 hover:text-primary"
                    title={t('sidebar.viewAllPrs')}
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveTab('pullRequests');
                    }}
                  >
                    <GitPullRequest className="h-3 w-3" />
                  </Button>
                </div>
                {expandedSections.pullRequests && (
                  <div className="mt-0.5 space-y-0.5 pl-1">
                    {pullRequests.length === 0 ? (
                      <div className="px-2 py-1 text-[12px] text-muted-foreground/60 italic">
                        {t('sidebar.noOpenPrs')}
                      </div>
                    ) : (
                      pullRequests.map((pr) => (
                        <div
                          key={pr.id}
                          {...keyboardRowProps(`#${pr.number} ${pr.title}`)}
                          onClick={() => {
                            selectPR(pr); setActiveTab('pullRequests'); onNavigate?.();
                          }}
                          className="px-2 py-1 rounded-md text-xs hover:bg-accent/50 cursor-pointer flex items-center justify-between text-muted-foreground hover:text-foreground"
                        >
                          <div className="flex items-center gap-1.5 truncate">
                            <GitPullRequest className="h-3 w-3 text-git-renamed shrink-0" />
                            <span className="truncate">#{pr.number} {pr.title}</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* TAGS Section */}
              <div>
                <div
                  className="flex items-center justify-between px-2 py-1 text-[12px] font-semibold text-muted-foreground tracking-wider uppercase hover:text-foreground group"
                >
                  <button type="button" aria-expanded={expandedSections.tags} onClick={() => toggleSection('tags')} className="flex min-w-0 items-center gap-1 min-h-7 text-left">
                    {expandedSections.tags ? (
                      <ChevronDown className="h-3 w-3" />
                    ) : (
                      <ChevronRight className="h-3 w-3" />
                    )}
                    <span>{t('sidebar.tags')} ({filteredTags.length})</span>
                  </button>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100">
                    {tags.length > 0 && (
                      <Button
                        variant="ghost"
                        size="xs"
                        className="h-7 w-7 p-0 hover:text-git-added"
                        title={t('sidebar.pushAllTags')}
                        onClick={async (e) => {
                          e.stopPropagation();
                          try {
                            if (!await remoteTagFromUi('tags')) return;
                            toast.success(t('sidebar.pushedAllTags'));
                          } catch (err: any) {
                            toast.error(t('sidebar.pushAllTagsFailed'), err.message);
                          }
                        }}
                      >
                        <UploadCloud className="h-3 w-3" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="xs"
                      className="h-7 w-7 p-0 hover:text-primary"
                      title={t('sidebar.newTag')}
                      onClick={(e) => {
                        e.stopPropagation();
                        setNewTagOpen(true);
                      }}
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                </div>

                {newTagOpen && (
                  <form onSubmit={handleCreateTag} className="p-2 bg-accent/50 border border-border/70 rounded-lg my-1 space-y-1.5">
                    <div className="flex items-center justify-between text-[12px] text-muted-foreground">
                      <span className="font-medium text-foreground">{t('sidebar.newTagTitle')}</span>
                      <button type="button" onClick={() => setNewTagOpen(false)}>
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                    <Input
                      value={tagNameInput}
                      onChange={(e) => setTagNameInput(e.target.value)}
                      aria-label={t('sidebar.tagNamePlaceholder')} placeholder={t('sidebar.tagNamePlaceholder')}
                      className="h-6 text-[12px] font-mono"
                      autoFocus
                    />
                    <Input
                      value={tagMessageInput}
                      onChange={(e) => setTagMessageInput(e.target.value)}
                      aria-label={t('sidebar.tagAnnotationPlaceholder')} placeholder={t('sidebar.tagAnnotationPlaceholder')}
                      className="h-6 text-[12px]"
                    />
                    <Button type="submit" size="xs" className="w-full h-5 text-[12px]">
                      {t('sidebar.createTag')}
                    </Button>
                  </form>
                )}

                {expandedSections.tags && (
                  <div className="mt-0.5 space-y-0.5 pl-1">
                    {filteredTags.map((tag) => (
                      <div
                        key={tag.name}
                        {...keyboardRowProps(tag.name)}
                        onClick={() => void selectAndLocateBranch(`refs/tags/${tag.name}`)}
                        onContextMenu={(e) => handleTagContextMenu(e, tag)}
                        className="flex items-center justify-between px-2 py-1 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-accent/40 cursor-pointer transition-colors group"
                        title={`${t('sidebar.viewTag')}: ${tag.name} (${t('sidebar.rightClickForActions')})`}
                      >
                        <div className="flex items-center gap-1.5 truncate">
                          <TagIcon className="h-3 w-3 text-amber-500/70 shrink-0" />
                          <span className="truncate font-mono text-[12px] text-foreground/90">{tag.name}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-[12px] font-mono text-muted-foreground/60 group-hover:text-muted-foreground">
                            {tag.commitHash.slice(0, 7)}
                          </span>
                          <Button
                            variant="ghost"
                            size="xs"
                            className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 hover:text-git-deleted"
                            title={t('sidebar.deleteTagTitle')}
                            onClick={(e) => handleDeleteTag(tag.name, e)}
                          >
                            <Trash2 className="h-2.5 w-2.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                    {filteredTags.length === 0 && (
                      <div className="px-2 py-1 text-[12px] text-muted-foreground/60 italic">
                        {t('sidebar.noTags')}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* STASHES Section */}
              <div>
                <div
                  className="flex items-center justify-between px-2 py-1 text-[12px] font-semibold text-muted-foreground tracking-wider uppercase hover:text-foreground group"
                >
                  <button type="button" aria-expanded={expandedSections.stashes} onClick={() => toggleSection('stashes')} className="flex min-w-0 items-center gap-1 min-h-7 text-left">
                    {expandedSections.stashes ? (
                      <ChevronDown className="h-3 w-3" />
                    ) : (
                      <ChevronRight className="h-3 w-3" />
                    )}
                    <span>{t('sidebar.stashes')} ({stashes.length})</span>
                  </button>
                  <Button
                    variant="ghost"
                    size="xs"
                    className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 hover:text-primary"
                    onClick={(e) => {
                      e.stopPropagation();
                      setNewStashOpen(!newStashOpen);
                    }}
                    title={t('sidebar.stashChanges')}
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>

                {newStashOpen && (
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      try {
                        await stashPush(stashMessageInput.trim() || undefined);
                        toast.success(t('sidebar.stashedToast'));
                        setStashMessageInput('');
                        setNewStashOpen(false);
                      } catch (err: any) {
                        toast.error(t('changes.stashFailed'), err.message);
                      }
                    }}
                    className="p-2 bg-accent/50 border border-border/70 rounded-lg my-1 space-y-1.5"
                  >
                    <div className="flex items-center justify-between text-[12px] text-muted-foreground">
                      <span className="font-medium text-foreground">{t('sidebar.stashWorkingChanges')}</span>
                      <button type="button" onClick={() => setNewStashOpen(false)}>
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                    <Input
                      value={stashMessageInput}
                      onChange={(e) => setStashMessageInput(e.target.value)}
                      aria-label={t('sidebar.stashNotePlaceholder')} placeholder={t('sidebar.stashNotePlaceholder')}
                      className="h-6 text-[12px]"
                      autoFocus
                    />
                    <Button type="submit" size="xs" className="w-full h-5 text-[12px]">
                      {t('sidebar.doStash')}
                    </Button>
                  </form>
                )}

                {expandedSections.stashes && (
                  <div className="mt-0.5 space-y-0.5 pl-1">
                    {stashes.map((stash) => (
                      <div
                        key={stash.index}
                        {...keyboardRowProps(stash.message)}
                        onContextMenu={(e) => handleStashContextMenu(e, stash)}
                        onClick={() => setPreviewStash(stash)}
                        className="flex items-center justify-between px-2 py-1 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-accent/40 cursor-pointer transition-colors group"
                        title={t('sidebar.rightClickMore')}
                      >
                        <div className="flex items-center gap-1.5 truncate">
                          <Archive className="h-3 w-3 text-primary shrink-0" />
                          <span className="truncate text-[12px]">{stash.message}</span>
                        </div>
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100">
                          <Button
                            variant="ghost"
                            size="xs"
                            className="min-h-7 px-2 text-[12px] hover:text-git-added"
                            title={t('sidebar.popHere')}
                            onClick={async () => {
                              try {
                                await stashPop(stash.index);
                                toast.success(t('sidebar.popApplied'));
                              } catch (err: any) {
                                toast.error(t('sidebar.popFailed'), err.message);
                              }
                            }}
                          >
                            Pop
                          </Button>
                          <Button
                            variant="ghost"
                            size="xs"
                            className="h-7 w-7 p-0 hover:text-git-deleted"
                            title={t('sidebar.dropTitle')}
                            onClick={async () => {
                              try {
                                await stashDrop(stash.index);
                                toast.info(t('sidebar.ctx.stashDropped'));
                              } catch (err: any) {
                                toast.error(t('sidebar.ctx.dropFailed'), err.message);
                              }
                            }}
                          >
                            <Trash2 className="h-2.5 w-2.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                    {stashes.length === 0 && (
                      <div className="px-2 py-1 text-[12px] text-muted-foreground/60 italic">
                        {t('sidebar.noStashes')}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </ScrollArea>
        </>
      )}

      {/* Modal Windows */}
      <StashPreviewModal stash={previewStash} onClose={() => setPreviewStash(null)} />
      <CreateBranchModal
        open={createBranchModalOpen}
        onOpenChange={setCreateBranchModalOpen}
        defaultBaseBranch={createBranchBase}
      />
      <MergeBranchModal
        open={mergeModalOpen}
        onOpenChange={setMergeModalOpen}
        targetBranch={mergeTargetBranch}
      />
      <RebaseBranchModal
        open={rebaseModalOpen}
        onOpenChange={setRebaseModalOpen}
        upstreamBranch={rebaseUpstreamBranch}
      />
      <HealthDiagnosisModal
        open={healthModalOpen}
        onOpenChange={setHealthModalOpen}
      />
      {recoveryOpen && currentRepo && <RecoveryCenterDialog key={currentRepo.path} repoPath={currentRepo.path} onClose={() => setRecoveryOpen(false)} />}
      <DragDropActionModal
        open={dragDropModalOpen}
        onOpenChange={setDragDropModalOpen}
        sourceBranch={dragSource}
        targetBranch={dragTarget}
      />

      {/* Universal Context Menu */}
      <ContextMenu
        open={contextMenu.open}
        x={contextMenu.x}
        y={contextMenu.y}
        items={contextMenu.items}
        onClose={() => setContextMenu((prev) => ({ ...prev, open: false }))}
      />
    </aside>
  );
};
