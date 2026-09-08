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
  Users,
  CircleDot,
  Eye,
  MoreVertical,
} from 'lucide-react';
import { useI18n } from '@/i18n';
import { useRepoStore } from '@/stores/repoStore';
import { useGitHubStore } from '@/stores/githubStore';
import { useLayoutStore } from '@/stores/layoutStore';
import { GitBranch, GitTag } from '@/services/git/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ContextMenu, ContextMenuItem } from '@/components/ui/ContextMenu';
import { CreateBranchModal } from '@/features/git/CreateBranchModal';
import { MergeBranchModal } from '@/features/git/MergeBranchModal';
import { RebaseBranchModal } from '@/features/git/RebaseBranchModal';
import { HealthDiagnosisModal } from '@/features/git/HealthDiagnosisModal';
import { DragDropActionModal } from '@/features/git/DragDropActionModal';
import { toast } from '@/stores/toastStore';
import { cn } from '@/utils/cn';

export const LeftSidebar: React.FC = () => {
  const { t, lang } = useI18n();
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
    commits,
    isLeftSidebarCollapsed,
    createBranch,
    checkoutBranch,
    deleteBranch,
    createTag,
    deleteTag,
    pushTag,
    pushAllTags,
    deleteRemoteTag,
    push,
    stashPush,
    stashPop,
    stashApply,
    stashDrop,
  } = useRepoStore();

  const { pullRequests } = useGitHubStore();
  const { leftSidebarWidth } = useLayoutStore();

  // Mode: List vs Agents (GitKraken style)
  const [sidebarMode, setSidebarMode] = useState<'list' | 'agents'>('list');
  const [searchFilter, setSearchFilter] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Group sections expanded
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    localBranches: true,
    remoteBranches: false,
    cloudPatches: false,
    pullRequests: false,
    issues: false,
    teams: false,
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
  const [stashMessageInput, setStashMessageInput] = useState('');

  // Dialog states
  const [newTagOpen, setNewTagOpen] = useState(false);
  const [tagNameInput, setTagNameInput] = useState('');
  const [tagMessageInput, setTagMessageInput] = useState('');
  const [healthModalOpen, setHealthModalOpen] = useState(false);
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
        id: 'checkout',
        label: isCurrent ? `当前已检出 (${branch.name})` : `检出此分支 (${branch.name})`,
        icon: <GitBranchIcon className="h-3.5 w-3.5 text-indigo-400" />,
        disabled: isCurrent,
        onClick: async () => {
          try {
            await checkoutBranch(branch.name);
            toast.success('已切换至分支', branch.name);
          } catch (err: any) {
            toast.error('检出分支失败', err?.message);
          }
        },
      },
      {
        id: 'merge',
        label: `合并 ${branch.name} 到 ${currentBranchName || '当前分支'}...`,
        icon: <GitMerge className="h-3.5 w-3.5 text-indigo-400" />,
        disabled: isCurrent,
        onClick: () => {
          setMergeTargetBranch(branch.name);
          setMergeModalOpen(true);
        },
      },
      {
        id: 'rebase',
        label: `变基当前分支到 ${branch.name}...`,
        icon: <GitPullRequest className="h-3.5 w-3.5 text-amber-400" />,
        disabled: isCurrent,
        onClick: () => {
          setRebaseUpstreamBranch(branch.name);
          setRebaseModalOpen(true);
        },
      },
      { separator: true, id: 'sep-1' },
      {
        id: 'new-branch',
        label: '从此处创建新分支...',
        icon: <Plus className="h-3.5 w-3.5 text-emerald-400" />,
        onClick: () => {
          setCreateBranchBase(branch.name);
          setCreateBranchModalOpen(true);
        },
      },
      {
        id: 'push',
        label: `推送到远程 (git push origin ${branch.name})...`,
        icon: <UploadCloud className="h-3.5 w-3.5 text-sky-400" />,
        onClick: async () => {
          toast.info(`正在推送分支 ${branch.name} 到远程...`);
          try {
            await push('origin', branch.name);
            toast.success(`分支 ${branch.name} 推送成功`);
          } catch (err: any) {
            toast.error('推送失败', err?.message);
          }
        },
      },
      {
        id: 'copy-name',
        label: '复制分支名称',
        icon: <Copy className="h-3.5 w-3.5" />,
        onClick: () => {
          navigator.clipboard.writeText(branch.name);
          toast.info('已复制分支名称到剪贴板', branch.name);
        },
      },
      { separator: true, id: 'sep-2' },
      {
        id: 'delete',
        label: isCurrent ? '无法删除当前检出的分支' : `删除分支 ${branch.name}`,
        icon: <Trash2 className="h-3.5 w-3.5 text-rose-500" />,
        disabled: isCurrent,
        danger: true,
        onClick: async () => {
          if (confirm(`确认要删除本地分支 "${branch.name}" 吗？`)) {
            try {
              await deleteBranch(branch.name);
              toast.success(`已删除分支: ${branch.name}`);
            } catch (err: any) {
              toast.error('删除分支失败', err?.message);
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

    const localName = branch.name.replace(/^origin\//, '');
    const currentBranchName =
      branches.find((b) => b.isCurrent)?.name ||
      status?.currentBranch ||
      currentRepo?.currentBranch ||
      '';

    const items: ContextMenuItem[] = [
      {
        id: 'checkout-remote',
        label: `检出并追踪到本地 (${localName})`,
        icon: <ArrowDownToLine className="h-3.5 w-3.5 text-primary" />,
        onClick: async () => {
          try {
            await checkoutBranch(localName);
            toast.success(`已检出远程追踪分支: ${localName}`);
          } catch {
            try {
              await createBranch(localName, branch.name, true);
              toast.success(`已检出并追踪远程分支: ${localName}`);
            } catch (err: any) {
              toast.error('检出远程分支失败', err.message);
            }
          }
        },
      },
      {
        id: 'merge-remote',
        label: `合并 ${branch.name} 到 ${currentBranchName || '当前分支'}...`,
        icon: <GitMerge className="h-3.5 w-3.5 text-indigo-400" />,
        onClick: () => {
          setMergeTargetBranch(branch.name);
          setMergeModalOpen(true);
        },
      },
      {
        id: 'rebase-remote',
        label: `变基当前分支到此远程分支...`,
        icon: <GitPullRequest className="h-3.5 w-3.5 text-amber-400" />,
        onClick: () => {
          setRebaseUpstreamBranch(branch.name);
          setRebaseModalOpen(true);
        },
      },
      { separator: true, id: 'sep-1' },
      {
        id: 'new-branch-remote',
        label: '从此处创建新分支...',
        icon: <Plus className="h-3.5 w-3.5 text-emerald-400" />,
        onClick: () => {
          setCreateBranchBase(branch.name);
          setCreateBranchModalOpen(true);
        },
      },
      {
        id: 'copy-name-remote',
        label: '复制远程分支名称',
        icon: <Copy className="h-3.5 w-3.5" />,
        onClick: () => {
          navigator.clipboard.writeText(branch.name);
          toast.info('已复制远程分支名称到剪贴板', branch.name);
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
        label: `检出此标签 (${tag.name})`,
        icon: <TagIcon className="h-3.5 w-3.5 text-amber-400" />,
        onClick: async () => {
          try {
            await checkoutBranch(tag.name);
            toast.success(`已检出至标签: ${tag.name}`);
          } catch (err: any) {
            toast.error('检出标签失败', err?.message);
          }
        },
      },
      {
        id: 'new-branch-tag',
        label: '从标签创建新分支...',
        icon: <Plus className="h-3.5 w-3.5 text-emerald-400" />,
        onClick: () => {
          setCreateBranchBase(tag.name);
          setCreateBranchModalOpen(true);
        },
      },
      {
        id: 'push-tag',
        label: '推送此标签到远程...',
        icon: <UploadCloud className="h-3.5 w-3.5 text-sky-400" />,
        onClick: async () => {
          try {
            await pushTag(tag.name);
            toast.success(`已推送标签到远程: ${tag.name}`);
          } catch (err: any) {
            toast.error('推送标签失败', err?.message);
          }
        },
      },
      {
        id: 'copy-tag-name',
        label: '复制标签名称',
        icon: <Copy className="h-3.5 w-3.5" />,
        onClick: () => {
          navigator.clipboard.writeText(tag.name);
          toast.info('已复制标签名称', tag.name);
        },
      },
      { separator: true, id: 'sep-tag' },
      {
        id: 'delete-tag',
        label: `删除本地标签 ${tag.name}`,
        icon: <Trash2 className="h-3.5 w-3.5 text-rose-500" />,
        danger: true,
        onClick: async () => {
          if (confirm(`确认要删除标签 "${tag.name}" 吗？`)) {
            try {
              await deleteTag(tag.name);
              toast.success(`已删除标签: ${tag.name}`);
            } catch (err: any) {
              toast.error('删除标签失败', err?.message);
            }
          }
        },
      },
      {
        id: 'delete-remote-tag',
        label: `删除远程标签 ${tag.name}`,
        icon: <Trash2 className="h-3.5 w-3.5 text-rose-500" />,
        danger: true,
        onClick: async () => {
          if (confirm(`确认要从远程仓库删除标签 "${tag.name}" 吗？此操作不可逆！`)) {
            try {
              await deleteRemoteTag(tag.name);
              toast.success(`已删除远程标签: ${tag.name}`);
            } catch (err: any) {
              toast.error('删除远程标签失败', err?.message);
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

  // Stash Context Menu
  const handleStashContextMenu = (e: React.MouseEvent, stash: any) => {
    e.preventDefault();
    e.stopPropagation();

    const items: ContextMenuItem[] = [
      {
        id: 'apply-stash',
        label: '应用贮藏 (Apply Stash)',
        icon: <Archive className="h-3.5 w-3.5 text-primary" />,
        onClick: async () => {
          try {
            await stashApply(stash.index);
            toast.success('已应用贮藏修改');
          } catch (err: any) {
            toast.error('应用贮藏失败', err?.message);
          }
        },
      },
      {
        id: 'pop-stash',
        label: '弹出并移除贮藏 (Pop Stash)',
        icon: <Archive className="h-3.5 w-3.5 text-emerald-400" />,
        onClick: async () => {
          try {
            await stashPop(stash.index);
            toast.success('已应用并弹出贮藏');
          } catch (err: any) {
            toast.error('弹出贮藏失败', err?.message);
          }
        },
      },
      { separator: true, id: 'sep-stash' },
      {
        id: 'drop-stash',
        label: '删除此贮藏 (Drop Stash)',
        icon: <Trash2 className="h-3.5 w-3.5 text-rose-500" />,
        danger: true,
        onClick: async () => {
          if (confirm(`确认清除此贮藏 stash@{${stash.index}} 吗？`)) {
            try {
              await stashDrop(stash.index);
              toast.info('已清除该贮藏');
            } catch (err: any) {
              toast.error('Drop 失败', err?.message);
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

  if (isLeftSidebarCollapsed) return null;

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
      toast.success(`新 Tag 创建成功`, tagNameInput.trim());
      setTagNameInput('');
      setTagMessageInput('');
      setNewTagOpen(false);
    } catch (err: any) {
      toast.error('创建 Tag 失败', err.message);
    }
  };

  const handleDeleteTag = async (name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await deleteTag(name);
      toast.info(`已删除 Tag`, name);
    } catch (err: any) {
      toast.error('删除 Tag 失败', err.message);
    }
  };

  return (
    <aside
      style={{ width: leftSidebarWidth }}
      className="border-r border-border/80 bg-sidebar/95 flex flex-col select-none shrink-0 h-full overflow-hidden text-xs"
    >
      {/* Top Primary Navigation (Changes, History, PRs, Actions) */}
      <div className="p-2 space-y-1 border-b border-border/60">
        <button
          onClick={() => setActiveTab('changes')}
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
            <Badge variant="warning" className="h-4 px-1.5 text-[10px] font-mono">
              {changesCount}
            </Badge>
          ) : (
            <span className="text-[10px] text-muted-foreground opacity-60">干净</span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('history')}
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
          onClick={() => setActiveTab('pullRequests')}
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
                activeTab === 'pullRequests' ? "text-sky-400" : "text-muted-foreground"
              )}
            />
            <span>{t('sidebar.pullRequests')}</span>
          </div>
          <Badge variant="outline" className="h-3.5 px-1 text-[9px] font-mono">
            {pullRequests.length}
          </Badge>
        </button>

        <button
          onClick={() => setActiveTab('actions')}
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
                activeTab === 'actions' ? "text-emerald-400" : "text-muted-foreground"
              )}
            />
            <span>{t('sidebar.actions')}</span>
          </div>
          <Badge variant="success" className="h-3.5 px-1 text-[9px] font-mono">
            CI
          </Badge>
        </button>
      </div>

      {/* GitKraken-style [List] [Agents] Pill Switcher */}
      <div className="px-2 pt-2 pb-1.5 border-b border-border/40 flex items-center justify-between">
        <div className="flex items-center bg-secondary/60 rounded-lg p-0.5 border border-border/40 w-full">
          <button
            onClick={() => setSidebarMode('list')}
            className={cn(
              "flex-1 py-1 rounded-md text-[11px] font-medium flex items-center justify-center gap-1 transition-all",
              sidebarMode === 'list'
                ? "bg-background text-foreground shadow-xs font-semibold"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <ListFilter className="h-3 w-3" />
            <span>List</span>
          </button>
          <button
            onClick={() => setSidebarMode('agents')}
            className={cn(
              "flex-1 py-1 rounded-md text-[11px] font-medium flex items-center justify-center gap-1 transition-all",
              sidebarMode === 'agents'
                ? "bg-background text-foreground shadow-xs font-semibold"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Sparkles className="h-3 w-3 text-indigo-400" />
            <span>Agents</span>
          </button>
        </div>
      </div>

      {sidebarMode === 'agents' ? (
        /* GitKraken-style AI Agents Assistant Panel */
        <div className="flex-1 p-3 space-y-3 overflow-y-auto">
          <div className="p-2.5 rounded-xl border border-indigo-500/30 bg-indigo-500/10 space-y-1.5">
            <div className="flex items-center gap-1.5 text-indigo-400 font-semibold text-xs">
              <Bot className="h-4 w-4" />
              <span>Git AI Agent</span>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              智能代码审查与 Git 助手，随时分析代码差异或自动编写 Commit。
            </p>
          </div>
          <div className="space-y-1 text-xs">
            <div className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider px-1">
              快捷指令
            </div>
            <button
              onClick={() => {
                setActiveTab('changes');
                toast.info('已切换到工作区变更面板，可使用 AI 生成提交说明');
              }}
              className="w-full text-left p-2 rounded-lg bg-card/60 hover:bg-accent/60 border border-border/60 transition-colors space-y-0.5"
            >
              <div className="font-medium text-foreground">生成提交说明 (Commit with AI)</div>
              <div className="text-[10px] text-muted-foreground">根据已暂存的修改自动生成语义化提交</div>
            </button>
            <button
              onClick={() => {
                setHealthModalOpen(true);
              }}
              className="w-full text-left p-2 rounded-lg bg-card/60 hover:bg-accent/60 border border-border/60 transition-colors space-y-0.5"
            >
              <div className="font-medium text-foreground">仓库健康度诊断</div>
              <div className="text-[10px] text-muted-foreground">检测未推送分支与潜在冲突</div>
            </button>
          </div>
        </div>
      ) : (
        /* List Mode: Filter Input + Tree Navigator */
        <>
          {/* GitKraken-style Commit View Count Indicator */}
          <div className="px-2.5 py-1.5 bg-secondary/50 dark:bg-[#101013] border-b border-border/50 flex items-center justify-between text-[11px]">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <span className="text-foreground/90 font-medium">{t('sidebar.viewing')}</span>
              <Badge variant="outline" className="h-4 px-1.5 text-[10px] font-mono border-primary/40 text-primary">
                {commits.length || 50}
              </Badge>
              <span className="text-[10px] opacity-70">{t('sidebar.commits')}</span>
            </div>
            <button
              onClick={() => setHealthModalOpen(true)}
              className="text-[10px] text-sky-600 dark:text-cyan-400 hover:text-sky-700 dark:hover:text-cyan-300 hover:underline flex items-center gap-1"
              title="仓库健康度诊断"
            >
              <Sparkles className="h-2.5 w-2.5" />
              <span>{t('sidebar.diagnose')}</span>
            </button>
          </div>

          {/* Quick Filter Box (Ctrl+Alt+F) */}
          <div className="px-2 py-1.5 border-b border-border/40">
            <div className="relative">
              <Search className="h-3 w-3 text-muted-foreground absolute left-2 top-2" />
              <Input
                ref={searchInputRef}
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                placeholder={t('sidebar.filterPlaceholder')}
                className="h-7 pl-6 pr-6 text-[11px] bg-secondary/30 border-border/50 focus-visible:ring-1"
              />
              {searchFilter && (
                <button
                  onClick={() => setSearchFilter('')}
                  className="absolute right-2 top-2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>

          {/* Scrollable Tree Navigator (LOCAL, REMOTE, TAGS, STASHES) */}
          <ScrollArea className="flex-1 px-1.5 py-2">
            <div className="space-y-3">
              {/* LOCAL Branches Section */}
              <div>
                <div
                  onClick={() => toggleSection('localBranches')}
                  className="flex items-center justify-between px-2 py-1 text-[10px] font-semibold text-muted-foreground tracking-wider uppercase cursor-pointer hover:text-foreground group"
                >
                  <div className="flex items-center gap-1">
                    {expandedSections.localBranches ? (
                      <ChevronDown className="h-3 w-3" />
                    ) : (
                      <ChevronRight className="h-3 w-3" />
                    )}
                    <span>{t('sidebar.local')} ({localGrouped.totalCount})</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="xs"
                      className="h-5 px-1 hover:text-indigo-400 hover:bg-indigo-500/10 text-muted-foreground"
                      title="合并分支 (Merge Branch)"
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
                      className="h-5 px-1 hover:text-amber-400 hover:bg-amber-500/10 text-muted-foreground"
                      title="分支变基 (Rebase Branch)"
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
                      className="h-5 px-1 hover:text-primary hover:bg-primary/10 text-muted-foreground"
                      title="创建新分支 (New Branch)"
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
                          <div
                            onClick={() => toggleFolder(folderName)}
                            className="flex items-center justify-between px-2 py-1 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-accent/40 cursor-pointer font-medium"
                          >
                            <div className="flex items-center gap-1.5">
                              {isFolderOpen ? (
                                <FolderOpen className="h-3 w-3 text-amber-400" />
                              ) : (
                                <Folder className="h-3 w-3 text-amber-400" />
                              )}
                              <span>{folderName}</span>
                            </div>
                            <Badge variant="outline" className="h-3.5 px-1 text-[9px] font-mono opacity-70">
                              {folderBranches.length}
                            </Badge>
                          </div>

                           {/* Nested Branches inside folder */}
                          {isFolderOpen && (
                            <div className="pl-4 space-y-0.5 border-l border-border/40 ml-3">
                              {folderBranches.map((branch) => {
                                const leafName = branch.name.slice(folderName.length + 1);
                                const isSelected = selectedBranch === branch.name;

                                return (
                                  <div
                                    key={branch.name}
                                    draggable={true}
                                    onDragStart={(e) => handleDragStart(e, branch)}
                                    onDragOver={(e) => handleDragOver(e, branch)}
                                    onDragLeave={(e) => handleDragLeave(e, branch)}
                                    onDrop={(e) => handleDrop(e, branch)}
                                    onDragEnd={handleDragEnd}
                                    onClick={() => {
                                      selectAndLocateBranch(branch.name);
                                      toast.info(`已定位分支提交: ${branch.name}`);
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
                                        <Check className="h-3 w-3 text-emerald-400 shrink-0" />
                                      ) : isSelected ? (
                                        <Eye className="h-3 w-3 text-emerald-400 shrink-0" />
                                      ) : null}
                                      <GitBranchIcon className={cn("h-3 w-3 shrink-0", branch.isCurrent ? "text-primary" : isSelected ? "text-foreground" : "text-muted-foreground")} />
                                      <span className="truncate">{leafName}</span>
                                    </div>
                                    {branch.isCurrent ? (
                                      <span className="text-[9px] uppercase px-1 rounded bg-primary/25 text-primary font-bold font-mono">
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
                                          className="p-1 hover:text-indigo-400 rounded hover:bg-accent opacity-0 group-hover:opacity-100 transition-opacity"
                                          title={`合并 ${branch.name} 到当前分支`}
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
                          draggable={true}
                          onDragStart={(e) => handleDragStart(e, branch)}
                          onDragOver={(e) => handleDragOver(e, branch)}
                          onDragLeave={(e) => handleDragLeave(e, branch)}
                          onDrop={(e) => handleDrop(e, branch)}
                          onDragEnd={handleDragEnd}
                          onClick={() => {
                            selectAndLocateBranch(branch.name);
                            toast.info(`已定位分支提交: ${branch.name}`);
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
                              <Check className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                            ) : isSelected ? (
                              <Eye className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                            ) : null}
                            <GitBranchIcon className={cn("h-3 w-3 shrink-0", branch.isCurrent ? "text-primary" : isSelected ? "text-foreground" : "text-muted-foreground")} />
                            <span className="truncate">{branch.name}</span>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {branch.isCurrent ? (
                              <span className="text-[9px] uppercase px-1 py-0.2 rounded bg-primary/25 text-primary font-bold font-mono">
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
                                  className="p-1 hover:text-indigo-400 rounded hover:bg-accent opacity-0 group-hover:opacity-100 transition-opacity"
                                  title={`合并 ${branch.name} 到当前分支`}
                                >
                                  <GitMerge className="h-2.5 w-2.5" />
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setRebaseUpstreamBranch(branch.name);
                                    setRebaseModalOpen(true);
                                  }}
                                  className="p-1 hover:text-amber-400 rounded hover:bg-accent opacity-0 group-hover:opacity-100 transition-opacity"
                                  title={`变基当前分支到 ${branch.name}`}
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
                      <div className="px-2 py-1 text-[11px] text-muted-foreground/60 italic">
                        {searchFilter ? (lang === 'zh' ? '未匹配到本地分支' : 'No matching branches') : t('sidebar.noLocalBranches')}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* REMOTE Branches Section */}
              <div>
                <div
                  onClick={() => toggleSection('remoteBranches')}
                  className="flex items-center justify-between px-2 py-1 text-[10px] font-semibold text-muted-foreground tracking-wider uppercase cursor-pointer hover:text-foreground group"
                >
                  <div className="flex items-center gap-1">
                    {expandedSections.remoteBranches ? (
                      <ChevronDown className="h-3 w-3" />
                    ) : (
                      <ChevronRight className="h-3 w-3" />
                    )}
                    <span>{t('sidebar.remote')} ({remoteGrouped.totalCount})</span>
                  </div>
                </div>

                {expandedSections.remoteBranches && (
                  <div className="mt-0.5 space-y-0.5 pl-1">
                    {remoteBranches.map((branch) => {
                      const localName = branch.name.replace(/^origin\//, '');
                      const isSelected = selectedBranch === branch.name;

                      return (
                        <div
                          key={branch.name}
                          draggable={true}
                          onDragStart={(e) => handleDragStart(e, branch)}
                          onDragOver={(e) => handleDragOver(e, branch)}
                          onDragLeave={(e) => handleDragLeave(e, branch)}
                          onDrop={(e) => handleDrop(e, branch)}
                          onDragEnd={handleDragEnd}
                          onClick={() => {
                            selectAndLocateBranch(branch.name);
                            toast.info(`已定位远程分支提交: ${branch.name}`);
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
                          title={`查看此远程分支: ${branch.name} (支持拖拽到其它分支合并/变基，右键查看操作)`}
                        >
                          <div className="flex items-center gap-1.5 truncate">
                            {isSelected && <Eye className="h-3 w-3 text-emerald-400 shrink-0" />}
                            <Cloud className="h-3 w-3 text-muted-foreground/80 shrink-0" />
                            <span className="truncate">{branch.name}</span>
                          </div>
                          <Button
                            variant="ghost"
                            size="xs"
                            className="h-4 w-4 p-0 opacity-0 group-hover:opacity-100 hover:text-primary"
                            title="检出到本地"
                            onClick={async (e) => {
                              e.stopPropagation();
                              try {
                                await checkoutBranch(localName);
                                toast.success(`已检出远程追踪分支: ${localName}`);
                              } catch {
                                try {
                                  await createBranch(localName, branch.name, true);
                                  toast.success(`已检出并追踪远程分支: ${localName}`);
                                } catch (err: any) {
                                  toast.error('检出远程分支失败', err.message);
                                }
                              }
                            }}
                          >
                            <ArrowDownToLine className="h-2.5 w-2.5" />
                          </Button>
                        </div>
                      );
                    })}
                    {remoteBranches.length === 0 && (
                      <div className="px-2 py-1 text-[11px] text-muted-foreground/60 italic">
                        暂无远程跟踪分支
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* CLOUD PATCHES Section */}
              <div>
                <div
                  onClick={() => toggleSection('cloudPatches')}
                  className="flex items-center justify-between px-2 py-1 text-[10px] font-semibold text-muted-foreground tracking-wider uppercase cursor-pointer hover:text-foreground group"
                >
                  <div className="flex items-center gap-1">
                    {expandedSections.cloudPatches ? (
                      <ChevronDown className="h-3 w-3" />
                    ) : (
                      <ChevronRight className="h-3 w-3" />
                    )}
                    <span>{t('sidebar.cloudPatches')}</span>
                  </div>
                  <Badge variant="outline" className="h-3 px-1 text-[8px] opacity-60 font-mono">
                    0
                  </Badge>
                </div>
                {expandedSections.cloudPatches && (
                  <div className="mt-0.5 space-y-0.5 pl-3 text-[11px] text-muted-foreground/70 py-1">
                    <p>暂无云端补丁包 (Cloud Patches)。可通过工作区变更生成共享补丁。</p>
                  </div>
                )}
              </div>

              {/* PULL REQUESTS Section */}
              <div>
                <div
                  onClick={() => toggleSection('pullRequests')}
                  className="flex items-center justify-between px-2 py-1 text-[10px] font-semibold text-muted-foreground tracking-wider uppercase cursor-pointer hover:text-foreground group"
                >
                  <div className="flex items-center gap-1">
                    {expandedSections.pullRequests ? (
                      <ChevronDown className="h-3 w-3" />
                    ) : (
                      <ChevronRight className="h-3 w-3" />
                    )}
                    <span>PULL REQUESTS ({pullRequests.length})</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="xs"
                    className="h-4 w-4 p-0 opacity-0 group-hover:opacity-100 hover:text-primary"
                    title="在 GitHub 查看全部 PR"
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
                      <div className="px-2 py-1 text-[11px] text-muted-foreground/60 italic">
                        暂无开启的 Pull Requests
                      </div>
                    ) : (
                      pullRequests.map((pr) => (
                        <div
                          key={pr.id}
                          onClick={() => {
                            setActiveTab('pullRequests');
                          }}
                          className="px-2 py-1 rounded-md text-xs hover:bg-accent/50 cursor-pointer flex items-center justify-between text-muted-foreground hover:text-foreground"
                        >
                          <div className="flex items-center gap-1.5 truncate">
                            <GitPullRequest className="h-3 w-3 text-sky-400 shrink-0" />
                            <span className="truncate">#{pr.number} {pr.title}</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* ISSUES Section */}
              <div>
                <div
                  onClick={() => toggleSection('issues')}
                  className="flex items-center justify-between px-2 py-1 text-[10px] font-semibold text-muted-foreground tracking-wider uppercase cursor-pointer hover:text-foreground group"
                >
                  <div className="flex items-center gap-1">
                    {expandedSections.issues ? (
                      <ChevronDown className="h-3 w-3" />
                    ) : (
                      <ChevronRight className="h-3 w-3" />
                    )}
                    <span>{t('sidebar.issues')}</span>
                  </div>
                  <CircleDot className="h-3 w-3 text-emerald-400/70" />
                </div>
                {expandedSections.issues && (
                  <div className="mt-0.5 space-y-0.5 pl-3 text-[11px] text-muted-foreground/70 py-1">
                    <p>暂无关联的 GitHub / GitLab Issues。</p>
                  </div>
                )}
              </div>

              {/* TEAMS Section */}
              <div>
                <div
                  onClick={() => toggleSection('teams')}
                  className="flex items-center justify-between px-2 py-1 text-[10px] font-semibold text-muted-foreground tracking-wider uppercase cursor-pointer hover:text-foreground group"
                >
                  <div className="flex items-center gap-1">
                    {expandedSections.teams ? (
                      <ChevronDown className="h-3 w-3" />
                    ) : (
                      <ChevronRight className="h-3 w-3" />
                    )}
                    <span>{t('sidebar.teams')}</span>
                  </div>
                  <Users className="h-3 w-3 text-muted-foreground opacity-60" />
                </div>
                {expandedSections.teams && (
                  <div className="mt-0.5 space-y-0.5 pl-3 text-[11px] text-muted-foreground/70 py-1">
                    <p>团队成员协作状态已同步至本地。</p>
                  </div>
                )}
              </div>

              {/* TAGS Section */}
              <div>
                <div
                  onClick={() => toggleSection('tags')}
                  className="flex items-center justify-between px-2 py-1 text-[10px] font-semibold text-muted-foreground tracking-wider uppercase cursor-pointer hover:text-foreground group"
                >
                  <div className="flex items-center gap-1">
                    {expandedSections.tags ? (
                      <ChevronDown className="h-3 w-3" />
                    ) : (
                      <ChevronRight className="h-3 w-3" />
                    )}
                    <span>{t('sidebar.tags')} ({filteredTags.length})</span>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
                    {tags.length > 0 && (
                      <Button
                        variant="ghost"
                        size="xs"
                        className="h-4 w-4 p-0 hover:text-emerald-400"
                        title={t('sidebar.pushAllTags')}
                        onClick={async (e) => {
                          e.stopPropagation();
                          try {
                            toast.info('正在推送所有标签到远程...');
                            await pushAllTags();
                            toast.success('已成功推送全部 Tags 到远程');
                          } catch (err: any) {
                            toast.error('推送所有 Tags 失败', err.message);
                          }
                        }}
                      >
                        <UploadCloud className="h-3 w-3" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="xs"
                      className="h-4 w-4 p-0 hover:text-primary"
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
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                      <span className="font-medium text-foreground">新建 Tag (如 v1.0.0)</span>
                      <button type="button" onClick={() => setNewTagOpen(false)}>
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                    <Input
                      value={tagNameInput}
                      onChange={(e) => setTagNameInput(e.target.value)}
                      placeholder="标签名 (如 v1.0.0)"
                      className="h-6 text-[11px] font-mono"
                      autoFocus
                    />
                    <Input
                      value={tagMessageInput}
                      onChange={(e) => setTagMessageInput(e.target.value)}
                      placeholder="附注信息 (可选)"
                      className="h-6 text-[11px]"
                    />
                    <Button type="submit" size="xs" className="w-full h-5 text-[10px]">
                      创建 Tag
                    </Button>
                  </form>
                )}

                {expandedSections.tags && (
                  <div className="mt-0.5 space-y-0.5 pl-1">
                    {filteredTags.map((tag) => (
                      <div
                        key={tag.name}
                        onContextMenu={(e) => handleTagContextMenu(e, tag)}
                        className="flex items-center justify-between px-2 py-1 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-accent/40 cursor-pointer transition-colors group"
                        title={`Tag: ${tag.name} (右键查看操作)`}
                      >
                        <div className="flex items-center gap-1.5 truncate">
                          <TagIcon className="h-3 w-3 text-amber-500/70 shrink-0" />
                          <span className="truncate font-mono text-[11px] text-foreground/90">{tag.name}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-[9px] font-mono text-muted-foreground/60 group-hover:text-muted-foreground">
                            {tag.commitHash.slice(0, 7)}
                          </span>
                          <Button
                            variant="ghost"
                            size="xs"
                            className="h-4 w-4 p-0 opacity-0 group-hover:opacity-100 hover:text-rose-400"
                            title="删除此 Tag"
                            onClick={(e) => handleDeleteTag(tag.name, e)}
                          >
                            <Trash2 className="h-2.5 w-2.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                    {filteredTags.length === 0 && (
                      <div className="px-2 py-1 text-[11px] text-muted-foreground/60 italic">
                        暂无 Tags
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* STASHES Section */}
              <div>
                <div
                  onClick={() => toggleSection('stashes')}
                  className="flex items-center justify-between px-2 py-1 text-[10px] font-semibold text-muted-foreground tracking-wider uppercase cursor-pointer hover:text-foreground group"
                >
                  <div className="flex items-center gap-1">
                    {expandedSections.stashes ? (
                      <ChevronDown className="h-3 w-3" />
                    ) : (
                      <ChevronRight className="h-3 w-3" />
                    )}
                    <span>{t('sidebar.stashes')} ({stashes.length})</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="xs"
                    className="h-4 w-4 p-0 opacity-0 group-hover:opacity-100 hover:text-primary"
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
                        toast.success('已将当前修改暂存至 Stash');
                        setStashMessageInput('');
                        setNewStashOpen(false);
                      } catch (err: any) {
                        toast.error('贮藏失败', err.message);
                      }
                    }}
                    className="p-2 bg-accent/50 border border-border/70 rounded-lg my-1 space-y-1.5"
                  >
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                      <span className="font-medium text-foreground">贮藏当前工作区修改</span>
                      <button type="button" onClick={() => setNewStashOpen(false)}>
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                    <Input
                      value={stashMessageInput}
                      onChange={(e) => setStashMessageInput(e.target.value)}
                      placeholder="贮藏备注信息 (可选)"
                      className="h-6 text-[11px]"
                      autoFocus
                    />
                    <Button type="submit" size="xs" className="w-full h-5 text-[10px]">
                      执行 Stash
                    </Button>
                  </form>
                )}

                {expandedSections.stashes && (
                  <div className="mt-0.5 space-y-0.5 pl-1">
                    {stashes.map((stash) => (
                      <div
                        key={stash.index}
                        onContextMenu={(e) => handleStashContextMenu(e, stash)}
                        className="flex items-center justify-between px-2 py-1 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-accent/40 cursor-pointer transition-colors group"
                        title="右键查看更多操作"
                      >
                        <div className="flex items-center gap-1.5 truncate">
                          <Archive className="h-3 w-3 text-cyan-400 shrink-0" />
                          <span className="truncate text-[11px]">{stash.message}</span>
                        </div>
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100">
                          <Button
                            variant="ghost"
                            size="xs"
                            className="h-4 px-1 text-[10px] hover:text-emerald-400"
                            title="弹出并应用 (Pop)"
                            onClick={async () => {
                              try {
                                await stashPop(stash.index);
                                toast.success('已弹出贮藏并应用到工作区');
                              } catch (err: any) {
                                toast.error('Pop 失败', err.message);
                              }
                            }}
                          >
                            Pop
                          </Button>
                          <Button
                            variant="ghost"
                            size="xs"
                            className="h-4 w-4 p-0 hover:text-rose-400"
                            title="删除此贮藏 (Drop)"
                            onClick={async () => {
                              try {
                                await stashDrop(stash.index);
                                toast.info('已清除该贮藏');
                              } catch (err: any) {
                                toast.error('Drop 失败', err.message);
                              }
                            }}
                          >
                            <Trash2 className="h-2.5 w-2.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                    {stashes.length === 0 && (
                      <div className="px-2 py-1 text-[11px] text-muted-foreground/60 italic">
                        暂无贮藏内容
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
