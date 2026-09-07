import React, { useState } from 'react';
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
} from 'lucide-react';
import { useRepoStore } from '@/stores/repoStore';
import { useGitHubStore } from '@/stores/githubStore';
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
    currentRepo,
    activeTab,
    setActiveTab,
    status,
    branches,
    tags,
    stashes,
    isLeftSidebarCollapsed,
    createBranch,
    deleteBranch,
    checkoutBranch,
    createTag,
    deleteTag,
    pushTag,
    pushAllTags,
    stashPush,
    stashPop,
    stashApply,
    stashDrop,
  } = useRepoStore();

  const { pullRequests } = useGitHubStore();

  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    localBranches: true,
    remoteBranches: true,
    tags: true,
    stashes: true,
    remotes: false,
  });

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

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  if (isLeftSidebarCollapsed) return null;

  const changesCount =
    (status?.staged.length || 0) +
    (status?.unstaged.length || 0) +
    (status?.untracked.length || 0);

  const localBranches = branches.filter((b) => !b.isRemote);
  const remoteBranches = branches.filter((b) => b.isRemote);

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
    <aside className="w-56 border-r border-border/80 bg-sidebar flex flex-col select-none shrink-0 h-full overflow-hidden text-xs">
      {/* Top Primary Navigation (Changes, History, Actions) */}
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

      {/* Scrollable Tree Navigator (Branches, Tags, Stashes, Remotes) */}
      <ScrollArea className="flex-1 px-1.5 py-2">
        <div className="space-y-3">
          {/* Local Branches Section */}
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
                <span>本地分支 ({localBranches.length})</span>
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
                <Button
                  variant="ghost"
                  size="xs"
                  className="h-4 w-4 p-0 hover:text-indigo-400"
                  title="合并分支 (Merge)"
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
                  className="h-4 w-4 p-0 hover:text-amber-400"
                  title="分支变基 (Rebase)"
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
                  className="h-4 w-4 p-0 hover:text-primary"
                  title="创建新分支"
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
                {localBranches.length > 0 ? (
                  localBranches.map((branch) => (
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
                          ? "bg-indigo-500/15 text-indigo-400 font-medium border border-indigo-500/20"
                          : "text-muted-foreground hover:text-foreground hover:bg-accent/40"
                      )}
                    >
                      <div className="flex items-center gap-1.5 truncate min-w-0">
                        <GitBranchIcon
                          className={cn(
                            "h-3 w-3 shrink-0",
                            branch.isCurrent ? "text-indigo-400" : "text-muted-foreground"
                          )}
                        />
                        <span className="truncate">{branch.name}</span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {branch.isCurrent ? (
                          <span className="text-[9px] uppercase px-1 py-0.2 rounded bg-indigo-500/25 text-indigo-300 font-semibold font-mono">
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
                            <button
                              onClick={async (e) => {
                                e.stopPropagation();
                                if (window.confirm(`确认删除本地分支 ${branch.name} 吗？`)) {
                                  try {
                                    await deleteBranch(branch.name);
                                    toast.info(`已删除分支: ${branch.name}`);
                                  } catch (err: any) {
                                    toast.error('删除分支失败', err.message);
                                  }
                                }
                              }}
                              className="p-1 hover:text-rose-400 rounded hover:bg-accent"
                              title="删除此本地分支"
                            >
                              <Trash2 className="h-2.5 w-2.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="px-2 py-1 text-[11px] text-muted-foreground/60 italic">
                    暂无本地分支
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Remote Branches Section */}
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
                <span>远程分支 ({remoteBranches.length})</span>
              </div>
            </div>

            {expandedSections.remoteBranches && (
              <div className="mt-0.5 space-y-0.5 pl-1">
                {remoteBranches.length > 0 ? (
                  remoteBranches.map((branch) => {
                    const localName = branch.name.replace(/^origin\//, '');
                    return (
                      <div
                        key={branch.name}
                        onClick={async () => {
                          try {
                            await checkoutBranch(localName);
                            toast.success(`已检出远程追踪分支: ${localName}`);
                          } catch {
                            // If local doesn't exist yet, create tracked
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
                  })
                ) : (
                  <div className="px-2 py-1 text-[11px] text-muted-foreground/60 italic">
                    暂无远程跟踪分支
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Tags Section */}
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
                <span>标签 Tags ({tags.length})</span>
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

            {/* Quick New Tag Form */}
            {newTagOpen && (
              <form onSubmit={handleCreateTag} className="p-2 bg-accent/50 border border-border/70 rounded-lg my-1 space-y-1.5 animate-in fade-in-50">
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
                {tags.length > 0 ? (
                  tags.map((tag) => (
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
                          className="h-4 w-4 p-0 opacity-0 group-hover:opacity-100 hover:text-emerald-400"
                          title="推送此 Tag 到远程"
                          onClick={async (e) => {
                            e.stopPropagation();
                            try {
                              toast.info(`正在推送 Tag ${tag.name}...`);
                              await pushTag(tag.name);
                              toast.success(`已成功推送 Tag`, tag.name);
                            } catch (err: any) {
                              toast.error(`推送 Tag 失败`, err.message);
                            }
                          }}
                        >
                          <UploadCloud className="h-2.5 w-2.5" />
                        </Button>
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
                  ))
                ) : (
                  <div className="px-2 py-1 text-[11px] text-muted-foreground/60 italic">
                    暂无 Tags
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Stashes Section */}
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
                <span>贮藏区 Stashes ({stashes.length})</span>
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

            {/* Inline Stash creation input */}
            {newStashOpen && (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  try {
                    await stashPush(stashMessageInput.trim() || undefined);
                    toast.success('已存入贮藏堆栈', stashMessageInput.trim() || 'WIP on stash');
                    setStashMessageInput('');
                    setNewStashOpen(false);
                  } catch (err: any) {
                    toast.error('贮藏修改失败', err.message);
                  }
                }}
                className="p-2 space-y-1.5 bg-accent/30 rounded-md border border-border/80 my-1 mx-1"
              >
                <div className="flex items-center justify-between text-[11px] font-medium text-foreground">
                  <span>贮藏当前改动</span>
                  <button type="button" onClick={() => setNewStashOpen(false)}>
                    <X className="h-3 w-3" />
                  </button>
                </div>
                <Input
                  value={stashMessageInput}
                  onChange={(e) => setStashMessageInput(e.target.value)}
                  placeholder="贮藏附注 (可选)"
                  className="h-6 text-[11px]"
                  autoFocus
                />
                <Button type="submit" size="xs" className="w-full h-5 text-[10px]">
                  保存至 Stash
                </Button>
              </form>
            )}

            {expandedSections.stashes && (
              <div className="mt-0.5 space-y-0.5 pl-1">
                {stashes.length > 0 ? (
                  stashes.map((s) => (
                    <div
                      key={s.index}
                      className="flex items-center justify-between px-2 py-1.5 rounded-md text-xs text-muted-foreground hover:bg-accent/40 cursor-pointer transition-colors group"
                    >
                      <div className="flex items-center gap-1.5 truncate min-w-0 pr-1">
                        <Archive className="h-3 w-3 text-cyan-400/80 shrink-0" />
                        <div className="truncate min-w-0">
                          <div className="truncate font-mono text-[11px] text-foreground">
                            {s.message}
                          </div>
                          <div className="text-[9px] font-mono text-muted-foreground/60">
                            stash@{`{${s.index}}`} • {s.date}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 shrink-0">
                        <Button
                          variant="ghost"
                          size="xs"
                          className="h-5 px-1.5 text-[9px] hover:text-emerald-400"
                          title="弹出并应用 (Pop)"
                          onClick={async (e) => {
                            e.stopPropagation();
                            try {
                              await stashPop(s.index);
                              toast.success(`已弹出贮藏 stash@{${s.index}}`);
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
                          className="h-5 px-1.5 text-[9px] hover:text-indigo-400"
                          title="仅应用此贮藏 (Apply)"
                          onClick={async (e) => {
                            e.stopPropagation();
                            try {
                              await stashApply(s.index);
                              toast.success(`已应用贮藏 stash@{${s.index}}`);
                            } catch (err: any) {
                              toast.error('Apply 失败', err.message);
                            }
                          }}
                        >
                          Apply
                        </Button>
                        <Button
                          variant="ghost"
                          size="xs"
                          className="h-5 w-5 p-0 hover:text-rose-400"
                          title="删除此贮藏 (Drop)"
                          onClick={async (e) => {
                            e.stopPropagation();
                            try {
                              await stashDrop(s.index);
                              toast.info(`已丢弃贮藏 stash@{${s.index}}`);
                            } catch (err: any) {
                              toast.error('Drop 失败', err.message);
                            }
                          }}
                        >
                          <Trash2 className="h-2.5 w-2.5" />
                        </Button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="px-2 py-1 text-[11px] text-muted-foreground/60 italic">
                    暂无贮藏内容
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </ScrollArea>

      {/* Bottom Repository Path Footnote */}
      {currentRepo && (
        <div className="p-2 border-t border-border/60 bg-accent/15">
          <div
            className="text-[10px] text-muted-foreground truncate font-mono"
            title={currentRepo.path}
          >
            {currentRepo.path}
          </div>
        </div>
      )}

      {/* Global Modals for Branching & Merging */}
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
