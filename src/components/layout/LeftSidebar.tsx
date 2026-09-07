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
} from 'lucide-react';
import { useRepoStore } from '@/stores/repoStore';
import { useGitHubStore } from '@/stores/githubStore';
import { useLayoutStore } from '@/stores/layoutStore';
import { GitBranch } from '@/services/git/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { CreateBranchModal } from '@/features/git/CreateBranchModal';
import { MergeBranchModal } from '@/features/git/MergeBranchModal';
import { RebaseBranchModal } from '@/features/git/RebaseBranchModal';
import { toast } from '@/stores/toastStore';
import { cn } from '@/utils/cn';

export const LeftSidebar: React.FC = () => {
  const {
    activeTab,
    setActiveTab,
    status,
    branches,
    tags,
    stashes,
    isLeftSidebarCollapsed,
    createBranch,
    checkoutBranch,
    createTag,
    deleteTag,
    pushAllTags,
    stashPush,
    stashPop,
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
    remoteBranches: true,
    tags: true,
    stashes: true,
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
            <span>工作区变更</span>
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
            <span>提交历史 & Graph</span>
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
                activeTab === 'pullRequests' ? "text-purple-400" : "text-muted-foreground"
              )}
            />
            <span>Pull Requests</span>
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
            <span>GitHub Actions</span>
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
                toast.success('本地分支健康状况良好', '无未解决的代码冲突与悬空提交');
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
          {/* Quick Filter Box (Ctrl+Alt+F) */}
          <div className="px-2 py-1.5 border-b border-border/40">
            <div className="relative">
              <Search className="h-3 w-3 text-muted-foreground absolute left-2 top-2" />
              <Input
                ref={searchInputRef}
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                placeholder="Filter (Ctrl+Alt+F)..."
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
                    <span>LOCAL ({localGrouped.totalCount})</span>
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
                                return (
                                  <div
                                    key={branch.name}
                                    onClick={() => {
                                      if (!branch.isCurrent) {
                                        checkoutBranch(branch.name);
                                        toast.success(`已检出分支`, branch.name);
                                      }
                                    }}
                                    className={cn(
                                      "group flex items-center justify-between px-2 py-1 rounded-md text-xs transition-colors cursor-pointer",
                                      branch.isCurrent
                                        ? "bg-primary/15 text-primary font-medium border border-primary/30"
                                        : "text-muted-foreground hover:text-foreground hover:bg-accent/40"
                                    )}
                                  >
                                    <div className="flex items-center gap-1.5 truncate min-w-0">
                                      {branch.isCurrent ? (
                                        <Check className="h-3 w-3 text-emerald-400 shrink-0" />
                                      ) : (
                                        <GitBranchIcon className="h-3 w-3 text-muted-foreground shrink-0" />
                                      )}
                                      <span className="truncate">{leafName}</span>
                                    </div>
                                    {branch.isCurrent ? (
                                      <span className="text-[9px] uppercase px-1 rounded bg-primary/25 text-primary font-bold font-mono">
                                        HEAD
                                      </span>
                                    ) : (
                                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100">
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setMergeTargetBranch(branch.name);
                                            setMergeModalOpen(true);
                                          }}
                                          className="p-1 hover:text-indigo-400 rounded hover:bg-accent"
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
                    {localGrouped.rootBranches.map((branch) => (
                      <div
                        key={branch.name}
                        onClick={() => {
                          if (!branch.isCurrent) {
                            checkoutBranch(branch.name);
                            toast.success(`已检出分支`, branch.name);
                          }
                        }}
                        className={cn(
                          "group flex items-center justify-between px-2 py-1.5 rounded-md text-xs transition-colors cursor-pointer",
                          branch.isCurrent
                            ? "bg-primary/20 text-primary font-semibold border border-primary/40 shadow-xs"
                            : "text-muted-foreground hover:text-foreground hover:bg-accent/40"
                        )}
                      >
                        <div className="flex items-center gap-1.5 truncate min-w-0">
                          {branch.isCurrent ? (
                            <Check className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                          ) : (
                            <GitBranchIcon className="h-3 w-3 text-muted-foreground shrink-0" />
                          )}
                          <span className="truncate">{branch.name}</span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {branch.isCurrent ? (
                            <span className="text-[9px] uppercase px-1 py-0.2 rounded bg-primary/25 text-primary font-bold font-mono">
                              HEAD
                            </span>
                          ) : (
                            <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setMergeTargetBranch(branch.name);
                                  setMergeModalOpen(true);
                                }}
                                className="p-1 hover:text-indigo-400 rounded hover:bg-accent"
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
                                className="p-1 hover:text-amber-400 rounded hover:bg-accent"
                                title={`变基当前分支到 ${branch.name}`}
                              >
                                <GitPullRequest className="h-2.5 w-2.5" />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}

                    {localGrouped.totalCount === 0 && (
                      <div className="px-2 py-1 text-[11px] text-muted-foreground/60 italic">
                        {searchFilter ? '未匹配到本地分支' : '暂无本地分支'}
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
                    <span>REMOTE ({remoteGrouped.totalCount})</span>
                  </div>
                </div>

                {expandedSections.remoteBranches && (
                  <div className="mt-0.5 space-y-0.5 pl-1">
                    {remoteBranches.map((branch) => {
                      const localName = branch.name.replace(/^origin\//, '');
                      return (
                        <div
                          key={branch.name}
                          onClick={async () => {
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
                          className="group flex items-center justify-between px-2 py-1 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-accent/40 cursor-pointer transition-colors"
                          title={`点击检出此远程分支: ${branch.name}`}
                        >
                          <div className="flex items-center gap-1.5 truncate">
                            <Cloud className="h-3 w-3 text-muted-foreground/80 shrink-0" />
                            <span className="truncate">{branch.name}</span>
                          </div>
                          <Button
                            variant="ghost"
                            size="xs"
                            className="h-4 w-4 p-0 opacity-0 group-hover:opacity-100 hover:text-primary"
                            title="检出到本地"
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
                    <span>TAGS ({filteredTags.length})</span>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
                    {tags.length > 0 && (
                      <Button
                        variant="ghost"
                        size="xs"
                        className="h-4 w-4 p-0 hover:text-emerald-400"
                        title="推送所有 Tags 到远程 (git push --tags)"
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
                      title="新建标签"
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
                        className="flex items-center justify-between px-2 py-1 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-accent/40 cursor-pointer transition-colors group"
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
                    <span>STASHES ({stashes.length})</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="xs"
                    className="h-4 w-4 p-0 opacity-0 group-hover:opacity-100 hover:text-primary"
                    onClick={(e) => {
                      e.stopPropagation();
                      setNewStashOpen(!newStashOpen);
                    }}
                    title="暂存当前修改 (Stash Changes)"
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
                        className="flex items-center justify-between px-2 py-1 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-accent/40 cursor-pointer transition-colors group"
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
    </aside>
  );
};
