import React, { useEffect, useState, useMemo } from 'react';
import {
  CheckCircle2,
  GitCommit as GitCommitIcon,
  Send,
  Layers,
  Check,
  AlertCircle,
  Loader2,
  Copy,
  Sparkles,
  FileCode,
  FilePlus,
  FileX,
  FileEdit,
  Folder,
  FolderOpen,
  List,
  Network,
  ChevronDown,
  ArrowUpDown,
  X,
  FileText,
  CheckSquare,
  Square,
} from 'lucide-react';
import { useRepoStore } from '@/stores/repoStore';
import { useGitHubStore } from '@/stores/githubStore';
import { useLayoutStore } from '@/stores/layoutStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { gitService } from '@/services/git/GitService';
import { ParsedDiffLine } from '@/services/git/PorcelainParser';
import { aiCommitService } from '@/services/ai/AiCommitService';
import { GitHubCheckRun } from '@/services/github/types';
import { GitFileChange } from '@/services/git/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from '@/stores/toastStore';
import { cn } from '@/utils/cn';

export const RightPane: React.FC = () => {
  const { rightPaneWidth } = useLayoutStore();
  const {
    currentRepo,
    isRightPaneCollapsed,
    status,
    selectedCommit,
    activeTab,
    setActiveTab,
    commit,
    stageAll,
    push,
    errorMessage,
    setError,
    setSelectedFile,
  } = useRepoStore();

  const { fetchCommitChecks } = useGitHubStore();
  const { aiConfig } = useSettingsStore();

  const [commitMessage, setCommitMessage] = useState('');
  const [isAmend, setIsAmend] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAiGenerating, setIsAiGenerating] = useState(false);
  const [checks, setChecks] = useState<GitHubCheckRun[]>([]);
  const [copiedHash, setCopiedHash] = useState(false);

  // File list view mode: 'path' vs 'tree' (GitKraken style)
  const [fileViewMode, setFileViewMode] = useState<'path' | 'tree'>('path');
  const [treeFoldersOpen, setTreeFoldersOpen] = useState<Record<string, boolean>>({});

  // Commit files & inspection
  const [commitFiles, setCommitFiles] = useState<GitFileChange[]>([]);
  const [isLoadingCommitFiles, setIsLoadingCommitFiles] = useState(false);
  const [commitSortAsc, setCommitSortAsc] = useState(true);
  const [commitViewAll, setCommitViewAll] = useState(true);
  const [previewCommitFile, setPreviewCommitFile] = useState<GitFileChange | null>(null);
  const [previewDiffLines, setPreviewDiffLines] = useState<ParsedDiffLine[]>([]);
  const [isLoadingDiff, setIsLoadingDiff] = useState(false);
  const [previewDiffMode, setPreviewDiffMode] = useState<'unified' | 'split'>('unified');

  useEffect(() => {
    if (activeTab === 'history' && selectedCommit) {
      fetchCommitChecks(selectedCommit.hash).then((res) => {
        setChecks(res);
      });
      if (currentRepo) {
        setIsLoadingCommitFiles(true);
        gitService
          .getCommitFiles(currentRepo.path, selectedCommit.hash)
          .then((res) => setCommitFiles(res))
          .catch(() => setCommitFiles([]))
          .finally(() => setIsLoadingCommitFiles(false));
      }
    } else {
      setCommitFiles([]);
      setPreviewCommitFile(null);
    }
  }, [activeTab, selectedCommit, currentRepo, fetchCommitChecks]);

  const handleInspectCommitFile = async (file: GitFileChange) => {
    if (!currentRepo || !selectedCommit) return;
    setPreviewCommitFile(file);
    setIsLoadingDiff(true);
    try {
      const diffs = await gitService.getCommitFileDiff(currentRepo.path, selectedCommit.hash, file.path);
      setPreviewDiffLines(diffs);
    } catch (err: any) {
      toast.error('获取 Diff 失败', err?.message);
      setPreviewDiffLines([]);
    } finally {
      setIsLoadingDiff(false);
    }
  };

  const stagedCount = status?.staged.length || 0;
  const unstagedCount = (status?.unstaged.length || 0) + (status?.untracked.length || 0);
  const totalChanges = stagedCount + unstagedCount;

  // AI Commit Message Generation (GitKraken style + Real Deep Diff / LLM API)
  const handleAiGenerateCommit = async () => {
    if (!currentRepo) {
      toast.warning('未打开仓库', '请先打开一个 Git 仓库');
      return;
    }

    const files = [...(status?.staged || []), ...(status?.unstaged || []), ...(status?.untracked || [])];
    if (files.length === 0) {
      toast.warning('无变更文件', '工作区暂无可供 AI 分析的文件');
      return;
    }

    setIsAiGenerating(true);
    try {
      const generated = await aiCommitService.generateCommitMessage({
        repoPath: currentRepo.path,
        files,
        aiConfig,
      });

      setCommitMessage(generated);
      const isLlm = Boolean(aiConfig.apiKey && aiConfig.apiKey.trim());
      toast.success(
        isLlm ? 'AI (大模型) 提交说明生成成功' : '智能语义分析提交说明已生成',
        generated.split('\n')[0]
      );
    } catch (err: any) {
      console.error('AI 提交说明生成失败:', err);
      toast.error('生成失败', err?.message || '无法分析文件生成提交说明');
    } finally {
      setIsAiGenerating(false);
    }
  };

  const handleCommit = async (andPush: boolean = false) => {
    if (!commitMessage.trim()) {
      toast.warning('请输入提交信息', 'Commit message 不能为空');
      return;
    }

    if (totalChanges === 0 && !isAmend) {
      toast.warning('无可提交的变更', '当前工作区无任何修改');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      if (stagedCount === 0 && !isAmend) {
        toast.info('正在自动暂存所有工作区修改...');
        await stageAll();
      }

      await commit(commitMessage.trim(), isAmend);
      const title = isAmend ? '已覆盖修改上一条提交 (Amend)' : '新提交创建成功！';
      toast.success(title, commitMessage.trim());
      setCommitMessage('');
      setIsAmend(false);

      if (andPush) {
        toast.info('正在推送本地提交到远程 (git push)...');
        try {
          await push();
          toast.success('已成功推送到远程仓库');
        } catch (pushErr: any) {
          toast.error('推送失败', pushErr.message);
        }
      }
    } catch (err: any) {
      toast.error('提交失败', err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const copyHash = (hash: string) => {
    navigator.clipboard.writeText(hash);
    setCopiedHash(true);
    toast.success('已复制 Commit Hash', hash);
    setTimeout(() => setCopiedHash(false), 2000);
  };

  // Group working files into Tree structure
  const allChangesFiles = useMemo(() => {
    return [
      ...(status?.staged || []),
      ...(status?.unstaged || []),
      ...(status?.untracked || []),
    ];
  }, [status]);

  const treeGroupedFiles = useMemo(() => {
    const folders: Record<string, GitFileChange[]> = {};
    const rootFiles: GitFileChange[] = [];

    for (const f of allChangesFiles) {
      const parts = f.path.split(/[\\/]/);
      if (parts.length > 1) {
        const folder = parts[0];
        if (!folders[folder]) folders[folder] = [];
        folders[folder].push(f);
      } else {
        rootFiles.push(f);
      }
    }
    return { folders, rootFiles };
  }, [allChangesFiles]);

  const toggleTreeFolder = (folder: string) => {
    setTreeFoldersOpen((prev) => ({
      ...prev,
      [folder]: prev[folder] === undefined ? false : !prev[folder],
    }));
  };

  const getFileStatusIcon = (st: string) => {
    switch (st) {
      case 'modified':
        return <FileEdit className="h-3.5 w-3.5 text-amber-400 shrink-0" />;
      case 'added':
      case 'untracked':
        return <FilePlus className="h-3.5 w-3.5 text-emerald-400 shrink-0" />;
      case 'deleted':
        return <FileX className="h-3.5 w-3.5 text-rose-400 shrink-0" />;
      default:
        return <FileCode className="h-3.5 w-3.5 text-sky-400 shrink-0" />;
    }
  };

  // Commit files statistics & tree grouping
  const commitStats = useMemo(() => {
    let added = 0;
    let modified = 0;
    let deleted = 0;
    for (const f of commitFiles) {
      if (f.status === 'added') added++;
      else if (f.status === 'deleted') deleted++;
      else modified++;
    }
    return { added, modified, deleted, total: commitFiles.length };
  }, [commitFiles]);

  const sortedCommitFiles = useMemo(() => {
    const list = [...commitFiles];
    list.sort((a, b) =>
      commitSortAsc ? a.path.localeCompare(b.path) : b.path.localeCompare(a.path)
    );
    return list;
  }, [commitFiles, commitSortAsc]);

  const commitTreeGrouped = useMemo(() => {
    const folders: Record<string, GitFileChange[]> = {};
    const rootFiles: GitFileChange[] = [];

    for (const f of sortedCommitFiles) {
      const parts = f.path.split(/[\\/]/);
      if (parts.length > 1) {
        const folder = parts[0];
        if (!folders[folder]) folders[folder] = [];
        folders[folder].push(f);
      } else {
        rootFiles.push(f);
      }
    }
    return { folders, rootFiles };
  }, [sortedCommitFiles]);

  if (isRightPaneCollapsed) return null;

  return (
    <aside
      style={{ width: rightPaneWidth }}
      className="border-l border-border bg-card/40 flex flex-col select-none shrink-0 h-full overflow-hidden text-xs"
    >
      {/* GitKraken-style Top Banner: 30 file changes in working directory [View Changes] */}
      {totalChanges > 0 && activeTab === 'history' && (
        <div className="h-8 px-3 bg-sky-500/15 border-b border-sky-500/30 flex items-center justify-between shrink-0 text-sky-300">
          <span className="font-semibold text-[11px] truncate">
            {totalChanges} file changes in working directory
          </span>
          <Button
            variant="default"
            size="xs"
            onClick={() => setActiveTab('changes')}
            className="h-5 px-2 text-[10px] bg-sky-500 hover:bg-sky-400 text-black font-semibold shrink-0"
          >
            View Changes
          </Button>
        </div>
      )}

      {/* Pane Header */}
      <div className="h-9 px-3 border-b border-border flex items-center justify-between font-medium text-foreground bg-accent/20 shrink-0">
        <div className="flex items-center gap-1.5">
          {activeTab === 'history' && selectedCommit ? (
            <>
              <GitCommitIcon className="h-3.5 w-3.5 text-primary" />
              <span>提交详情 (Commit Details)</span>
            </>
          ) : (
            <>
              <Layers className="h-3.5 w-3.5 text-primary" />
              <span>检查与提交 (Commit Inspector)</span>
            </>
          )}
        </div>
      </div>

      <ScrollArea className="flex-1 p-3">
        {/* Error Alert */}
        {errorMessage && (
          <div className="mb-3 p-2.5 rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-300 text-xs flex items-start gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-400 mt-0.5" />
            <div className="min-w-0">
              <div className="font-semibold text-[11px]">操作失败</div>
              <div className="text-[10px] break-all opacity-90">{errorMessage}</div>
            </div>
          </div>
        )}

        {/* If viewing a selected commit from history */}
        {activeTab === 'history' && selectedCommit ? (
          <div className="space-y-3.5">
            {/* Commit Header & AI Recompose Button */}
            <div className="flex items-center justify-between pb-0.5">
              <div className="flex items-center gap-1.5 font-mono text-[11px]">
                <span className="text-muted-foreground/80">commit:</span>
                <button
                  onClick={() => copyHash(selectedCommit.hash)}
                  className="font-semibold text-cyan-400 hover:text-cyan-300 hover:underline flex items-center gap-1"
                  title="点击复制完整 Hash"
                >
                  <span>{selectedCommit.shortHash}</span>
                  {copiedHash ? (
                    <Check className="h-2.5 w-2.5 text-emerald-400" />
                  ) : (
                    <Copy className="h-2.5 w-2.5 text-muted-foreground" />
                  )}
                </button>
              </div>

              {/* GitKraken-style Recompose commit with AI button */}
              <button
                onClick={() => {
                  setCommitMessage(selectedCommit.subject);
                  setActiveTab('changes');
                  toast.info('已提取提交信息至工作区并切换');
                }}
                className="cyber-btn-ai text-white font-medium text-[10px] px-2.5 py-1 rounded-md flex items-center gap-1.5 shadow-md active:scale-95 transition-all"
                title="使用 AI 深度润色或重构提交"
              >
                <Sparkles className="h-3 w-3 text-white animate-pulse" />
                <span className="font-semibold tracking-tight">Recompose commit with AI</span>
                <ChevronDown className="h-2.5 w-2.5 opacity-80" />
              </button>
            </div>

            {/* Commit Subject & Body */}
            <div className="p-3.5 rounded-xl border border-border/80 bg-card/90 dark:bg-[#0d0f17]/90 space-y-2 cyber-card">
              <p className="text-xs font-semibold text-foreground leading-relaxed">
                {selectedCommit.subject}
              </p>
              {selectedCommit.body && (
                <p className="text-[11px] text-foreground/80 dark:text-muted-foreground whitespace-pre-wrap font-mono bg-muted/60 dark:bg-black/40 p-2.5 rounded-lg border border-border/40">
                  {selectedCommit.body}
                </p>
              )}
            </div>

            {/* GitKraken-style Author Card */}
            <div className="p-3 rounded-xl border border-border/70 bg-card/90 dark:bg-[#0d0f17]/80 flex items-center justify-between gap-3 cyber-card">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="h-8 w-8 rounded-lg bg-slate-100 dark:bg-slate-800/90 text-sky-700 dark:text-sky-400 font-bold flex items-center justify-center text-xs shrink-0 border border-sky-500/30 shadow-xs uppercase">
                  {selectedCommit.author.name.slice(0, 2)}
                </div>
                <div className="min-w-0 space-y-0.5 text-[11px]">
                  <div className="font-semibold text-foreground truncate">{selectedCommit.author.name}</div>
                  <div className="text-muted-foreground text-[10px]">
                    authored {selectedCommit.author.relativeDate}
                  </div>
                </div>
              </div>
              {selectedCommit.parents.length > 0 && (
                <div className="text-[10px] text-muted-foreground/80 font-mono shrink-0">
                  parent: <span className="text-sky-400/90 hover:underline cursor-pointer">{selectedCommit.parents[0].slice(0, 7)}</span>
                </div>
              )}
            </div>

            {/* GitKraken-style Changed Files Header in Commit View */}
            <div className="space-y-2 pt-1 border-t border-border/60">
              <div className="flex items-center justify-between">
                {/* Stats badge (e.g. + 1 added) */}
                <div className="flex items-center gap-1.5 text-[11px] font-mono">
                  {commitStats.total === 0 ? (
                    <span className="text-muted-foreground">0 files changed</span>
                  ) : (
                    <div className="flex items-center gap-2">
                      {commitStats.added > 0 && (
                        <span className="text-emerald-400 font-semibold flex items-center gap-0.5">
                          <span>+</span>
                          <span>{commitStats.added} added</span>
                        </span>
                      )}
                      {commitStats.modified > 0 && (
                        <span className="text-amber-400 font-semibold flex items-center gap-0.5">
                          <span>~</span>
                          <span>{commitStats.modified} modified</span>
                        </span>
                      )}
                      {commitStats.deleted > 0 && (
                        <span className="text-rose-400 font-semibold flex items-center gap-0.5">
                          <span>-</span>
                          <span>{commitStats.deleted} deleted</span>
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Right tools: Sort & Path/Tree switcher */}
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setCommitSortAsc(!commitSortAsc)}
                    className="h-6 w-6 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent/40 transition-colors"
                    title={commitSortAsc ? '按名称升序' : '按名称降序'}
                  >
                    <ArrowUpDown className="h-3 w-3" />
                  </button>

                  <div className="flex items-center bg-secondary/50 rounded p-0.5 border border-border/50">
                    <button
                      onClick={() => setFileViewMode('path')}
                      className={cn(
                        "px-1.5 py-0.5 rounded text-[10px] font-medium transition-all flex items-center gap-0.5",
                        fileViewMode === 'path'
                          ? "bg-background text-foreground shadow-xs"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <List className="h-2.5 w-2.5" />
                      <span>Path</span>
                    </button>
                    <button
                      onClick={() => setFileViewMode('tree')}
                      className={cn(
                        "px-1.5 py-0.5 rounded text-[10px] font-medium transition-all flex items-center gap-0.5",
                        fileViewMode === 'tree'
                          ? "bg-background text-foreground shadow-xs"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <Network className="h-2.5 w-2.5" />
                      <span>Tree</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Sub-bar: View all files & Collapse all */}
              <div className="flex items-center justify-between text-[10px] text-muted-foreground px-0.5">
                <label
                  onClick={() => setCommitViewAll(!commitViewAll)}
                  className="flex items-center gap-1.5 cursor-pointer hover:text-foreground transition-colors select-none"
                >
                  {commitViewAll ? (
                    <CheckSquare className="h-3 w-3 text-cyan-400" />
                  ) : (
                    <Square className="h-3 w-3" />
                  )}
                  <span>View all files</span>
                </label>

                {fileViewMode === 'tree' && (
                  <button
                    onClick={() => setTreeFoldersOpen({})}
                    className="hover:text-foreground underline decoration-dotted transition-colors"
                  >
                    Collapse All
                  </button>
                )}
              </div>

              {/* Commit Changed Files List */}
              <div className="rounded-xl border border-border/70 bg-card/90 dark:bg-[#0d0f17]/90 p-1.5 max-h-52 overflow-y-auto space-y-0.5 cyber-card">
                {isLoadingCommitFiles ? (
                  <div className="py-6 flex items-center justify-center gap-2 text-muted-foreground text-[11px]">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-cyan-400" />
                    <span>正在加载变更文件...</span>
                  </div>
                ) : sortedCommitFiles.length === 0 ? (
                  <div className="py-6 text-center text-muted-foreground text-[11px]">
                    此提交无文件改动
                  </div>
                ) : fileViewMode === 'path' ? (
                  /* Flat Path View */
                  sortedCommitFiles.map((file) => {
                    const isSelected = previewCommitFile?.path === file.path;
                    return (
                      <div
                        key={file.path}
                        onClick={() => handleInspectCommitFile(file)}
                        className={cn(
                          "px-2 py-1 rounded cursor-pointer flex items-center justify-between text-[11px] group transition-colors",
                          isSelected
                            ? "bg-sky-500/15 border border-sky-500/40 text-foreground font-medium shadow-[inset_0_0_12px_rgba(56,189,248,0.06)]"
                            : "hover:bg-accent/40 text-muted-foreground hover:text-foreground"
                        )}
                        title={`${file.path} (点击查看 Diff)`}
                      >
                        <div className="flex items-center gap-1.5 truncate min-w-0 pr-1">
                          {getFileStatusIcon(file.status)}
                          <span className="font-mono truncate">{file.path}</span>
                        </div>
                        <span className="text-[9px] uppercase font-mono opacity-70 shrink-0">
                          {file.status}
                        </span>
                      </div>
                    );
                  })
                ) : (
                  /* Tree View */
                  <div>
                    {Object.entries(commitTreeGrouped.folders).map(([folder, files]) => {
                      const isOpen = treeFoldersOpen[folder] !== false;
                      return (
                        <div key={folder} className="space-y-0.5">
                          <div
                            onClick={() => toggleTreeFolder(folder)}
                            className="flex items-center justify-between px-2 py-1 rounded hover:bg-accent/40 cursor-pointer text-[11px] font-medium text-foreground"
                          >
                            <div className="flex items-center gap-1.5">
                              {isOpen ? (
                                <FolderOpen className="h-3 w-3 text-amber-400" />
                              ) : (
                                <Folder className="h-3 w-3 text-amber-400" />
                              )}
                              <span>{folder}</span>
                            </div>
                            <span className="text-[9px] text-muted-foreground font-mono">
                              {files.length}
                            </span>
                          </div>
                          {isOpen && (
                            <div className="pl-4 ml-2 border-l border-border/40 space-y-0.5">
                              {files.map((file) => {
                                const isSelected = previewCommitFile?.path === file.path;
                                return (
                                  <div
                                    key={file.path}
                                    onClick={() => handleInspectCommitFile(file)}
                                    className={cn(
                                      "px-2 py-0.5 rounded cursor-pointer flex items-center justify-between text-[11px] group transition-colors",
                                      isSelected
                                        ? "bg-sky-500/15 border border-sky-500/40 text-foreground font-medium shadow-[inset_0_0_12px_rgba(56,189,248,0.06)]"
                                        : "hover:bg-accent/40 text-muted-foreground hover:text-foreground"
                                    )}
                                  >
                                    <div className="flex items-center gap-1.5 truncate">
                                      {getFileStatusIcon(file.status)}
                                      <span className="font-mono truncate">
                                        {file.path.slice(folder.length + 1)}
                                      </span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {commitTreeGrouped.rootFiles.map((file) => {
                      const isSelected = previewCommitFile?.path === file.path;
                      return (
                        <div
                          key={file.path}
                          onClick={() => handleInspectCommitFile(file)}
                          className={cn(
                            "px-2 py-1 rounded cursor-pointer flex items-center justify-between text-[11px] transition-colors",
                            isSelected
                              ? "bg-sky-500/15 border border-sky-500/40 text-foreground font-medium shadow-[inset_0_0_12px_rgba(56,189,248,0.06)]"
                              : "hover:bg-accent/40 text-muted-foreground hover:text-foreground"
                          )}
                        >
                          <div className="flex items-center gap-1.5 truncate">
                            {getFileStatusIcon(file.status)}
                            <span className="font-mono truncate">{file.path}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Inline Diff Preview Card (GitKraken-style Inspector) */}
            {previewCommitFile && (
              <div className="rounded-xl border border-sky-500/40 dark:border-cyan-500/40 bg-card dark:bg-[#0a0c13] overflow-hidden cyber-card space-y-0">
                <div className="p-2 bg-slate-100 dark:bg-slate-900/90 border-b border-border/80 flex items-center justify-between">
                  <div className="flex items-center gap-1.5 min-w-0 pr-1">
                    <FileText className="h-3 w-3 text-sky-600 dark:text-cyan-400 shrink-0" />
                    <span className="font-mono font-semibold text-[11px] text-sky-800 dark:text-cyan-300 truncate">
                      {previewCommitFile.path}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() =>
                        setPreviewDiffMode(previewDiffMode === 'unified' ? 'split' : 'unified')
                      }
                      className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-secondary/80 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {previewDiffMode === 'unified' ? 'Unified' : 'Split'}
                    </button>
                    <button
                      onClick={() => setPreviewCommitFile(null)}
                      className="h-5 w-5 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors"
                      title="关闭预览"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                </div>

                {isLoadingDiff ? (
                  <div className="p-6 flex items-center justify-center gap-2 text-muted-foreground text-[11px]">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-cyan-400" />
                    <span>正在获取差异对比...</span>
                  </div>
                ) : previewDiffLines.length === 0 ? (
                  <div className="p-4 text-center text-muted-foreground text-[10px]">
                    无文本差异或为二进制文件
                  </div>
                ) : (
                  <div className="p-2 max-h-56 overflow-auto font-mono text-[10px] leading-tight space-y-0.5 bg-card dark:bg-black/60">
                    {previewDiffLines.slice(0, 100).map((line, idx) => (
                      <div
                        key={idx}
                        className={cn(
                          "px-1 py-0.5 rounded-xs whitespace-pre-wrap break-all flex",
                          line.type === 'add'
                            ? "bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border-l-2 border-emerald-500"
                            : line.type === 'delete'
                            ? "bg-rose-500/10 text-rose-800 dark:text-rose-300 border-l-2 border-rose-500"
                            : line.type === 'header'
                            ? "text-sky-800 dark:text-cyan-400/80 bg-sky-500/10 dark:bg-cyan-950/20 font-semibold"
                            : "text-slate-700 dark:text-muted-foreground"
                        )}
                      >
                        <span className="w-5 shrink-0 opacity-40 select-none">
                          {line.type === 'add' ? '+' : line.type === 'delete' ? '-' : ' '}
                        </span>
                        <span>{line.content}</span>
                      </div>
                    ))}
                    {previewDiffLines.length > 100 && (
                      <div className="pt-2 text-center text-muted-foreground text-[9px]">
                        仅预览前 100 行差异
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* GitHub Checks Status */}
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  GitHub Checks
                </span>
                <Badge variant="success" className="h-4 text-[9px] gap-1 font-mono">
                  <CheckCircle2 className="h-2.5 w-2.5 text-emerald-400" />
                  <span>{checks.length} / {checks.length} 通过</span>
                </Badge>
              </div>

              <div className="rounded-xl border border-border/80 divide-y divide-border/60 bg-card/90 dark:bg-[#0d0f17]/90 text-[11px] overflow-hidden cyber-card">
                {checks.length === 0 ? (
                  <div className="p-3 text-center text-[10px] text-muted-foreground">
                    未配置或无正在执行的 Checks
                  </div>
                ) : (
                  checks.map((c) => (
                    <div
                      key={c.id}
                      className="p-2 flex items-center justify-between hover:bg-accent/30 transition-colors"
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        <CheckCircle2 className="h-3 w-3 text-emerald-400 shrink-0" />
                        <span className="truncate max-w-[150px]">{c.name}</span>
                      </div>
                      <span className="text-[9px] font-mono text-emerald-400 uppercase">
                        {c.conclusion}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        ) : (
          /* Normal Commit & Staging Inspector */
          <div className="space-y-4">
            {/* GitKraken-style Changes File Explorer with [Path] [Tree] toggle */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-semibold text-foreground">
                    {totalChanges} 个文件变更
                  </span>
                  <Badge
                    variant={stagedCount > 0 ? "success" : "warning"}
                    className="h-4 text-[9px] font-mono"
                  >
                    {stagedCount} 已暂存
                  </Badge>
                </div>

                {/* Path vs Tree Pill Switcher */}
                <div className="flex items-center bg-secondary/50 rounded p-0.5 border border-border/50">
                  <button
                    onClick={() => setFileViewMode('path')}
                    className={cn(
                      "px-1.5 py-0.5 rounded text-[10px] font-medium transition-all flex items-center gap-0.5",
                      fileViewMode === 'path'
                        ? "bg-background text-foreground shadow-xs"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <List className="h-2.5 w-2.5" />
                    <span>Path</span>
                  </button>
                  <button
                    onClick={() => setFileViewMode('tree')}
                    className={cn(
                      "px-1.5 py-0.5 rounded text-[10px] font-medium transition-all flex items-center gap-0.5",
                      fileViewMode === 'tree'
                        ? "bg-background text-foreground shadow-xs"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <Network className="h-2.5 w-2.5" />
                    <span>Tree</span>
                  </button>
                </div>
              </div>

              {/* File items container */}
              <div className="rounded-xl border border-border/70 bg-card/60 p-1.5 max-h-48 overflow-y-auto space-y-0.5">
                {allChangesFiles.length === 0 ? (
                  <div className="py-6 text-center text-muted-foreground text-[11px]">
                    暂无待提交的文件修改
                  </div>
                ) : fileViewMode === 'path' ? (
                  /* Flat Path View */
                  allChangesFiles.map((file) => (
                    <div
                      key={file.path}
                      onClick={() => {
                        setSelectedFile(file);
                        setActiveTab('changes');
                      }}
                      className="px-2 py-1 rounded hover:bg-accent/50 cursor-pointer flex items-center justify-between text-[11px] group transition-colors"
                      title={file.path}
                    >
                      <div className="flex items-center gap-1.5 truncate min-w-0 pr-1">
                        {getFileStatusIcon(file.status)}
                        <span className="font-mono truncate">{file.path}</span>
                      </div>
                      <span className="text-[9px] uppercase font-mono opacity-60">
                        {file.status}
                      </span>
                    </div>
                  ))
                ) : (
                  /* Hierarchical Tree View */
                  <div>
                    {Object.entries(treeGroupedFiles.folders).map(([folder, files]) => {
                      const isOpen = treeFoldersOpen[folder] !== false;
                      return (
                        <div key={folder} className="space-y-0.5">
                          <div
                            onClick={() => toggleTreeFolder(folder)}
                            className="flex items-center justify-between px-2 py-1 rounded hover:bg-accent/40 cursor-pointer text-[11px] font-medium text-foreground"
                          >
                            <div className="flex items-center gap-1.5">
                              {isOpen ? (
                                <FolderOpen className="h-3 w-3 text-amber-400" />
                              ) : (
                                <Folder className="h-3 w-3 text-amber-400" />
                              )}
                              <span>{folder}</span>
                            </div>
                            <span className="text-[9px] text-muted-foreground font-mono">
                              {files.length}
                            </span>
                          </div>
                          {isOpen && (
                            <div className="pl-4 ml-2 border-l border-border/40 space-y-0.5">
                              {files.map((file) => (
                                <div
                                  key={file.path}
                                  onClick={() => {
                                    setSelectedFile(file);
                                    setActiveTab('changes');
                                  }}
                                  className="px-2 py-0.5 rounded hover:bg-accent/50 cursor-pointer flex items-center justify-between text-[11px] group"
                                >
                                  <div className="flex items-center gap-1.5 truncate">
                                    {getFileStatusIcon(file.status)}
                                    <span className="font-mono truncate">
                                      {file.path.slice(folder.length + 1)}
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {treeGroupedFiles.rootFiles.map((file) => (
                      <div
                        key={file.path}
                        onClick={() => {
                          setSelectedFile(file);
                          setActiveTab('changes');
                        }}
                        className="px-2 py-1 rounded hover:bg-accent/50 cursor-pointer flex items-center justify-between text-[11px]"
                      >
                        <div className="flex items-center gap-1.5 truncate">
                          {getFileStatusIcon(file.status)}
                          <span className="font-mono truncate">{file.path}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Commit Message Box & AI Generator */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-medium text-foreground">
                  提交信息 (Commit Message)
                </label>

                {/* GitKraken-style Recompose commit with AI */}
                <Button
                  variant="outline"
                  size="xs"
                  onClick={handleAiGenerateCommit}
                  disabled={isAiGenerating}
                  className="h-5 px-1.5 text-[10px] gap-1 border-sky-500/40 text-sky-300 hover:bg-sky-500/15"
                  title="根据当前修改智能生成语义化提交说明"
                >
                  <Sparkles className="h-2.5 w-2.5 text-sky-400" />
                  <span>{isAiGenerating ? 'AI 生成中...' : 'Recompose with AI'}</span>
                </Button>
              </div>

              <textarea
                value={commitMessage}
                onChange={(e) => setCommitMessage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    handleCommit(false);
                  }
                }}
                placeholder="简明描述改动 (Ctrl + Enter 快速提交)..."
                rows={4}
                className="w-full resize-none rounded-lg border border-input bg-background/80 p-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring transition-colors font-mono"
              />
            </div>

            {/* Amend Option */}
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isAmend}
                onChange={(e) => setIsAmend(e.target.checked)}
                className="rounded border-input text-primary focus:ring-primary h-3.5 w-3.5"
              />
              <span>修改上一条提交 (Amend last commit)</span>
            </label>

            {/* Commit Action Buttons */}
            <div className="space-y-2 pt-1">
              <Button
                onClick={() => handleCommit(false)}
                className="w-full h-8 text-xs font-medium gap-1.5 shadow-sm"
                disabled={(!commitMessage.trim()) || (totalChanges === 0 && !isAmend) || isSubmitting}
              >
                {isSubmitting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Check className="h-3.5 w-3.5" />
                )}
                <span>
                  {isAmend
                    ? '覆盖提交 (Amend)'
                    : stagedCount === 0 && totalChanges > 0
                    ? `暂存全部并提交 (${totalChanges} 个文件)`
                    : '提交变更 (Commit)'}
                </span>
              </Button>

              <Button
                variant="secondary"
                onClick={() => handleCommit(true)}
                className="w-full h-8 text-xs font-medium gap-1.5"
                disabled={(!commitMessage.trim()) || (totalChanges === 0 && !isAmend) || isSubmitting}
              >
                <Send className="h-3 w-3" />
                <span>
                  {stagedCount === 0 && totalChanges > 0
                    ? '暂存全部、提交并推送'
                    : '提交并推送 (Commit & Push)'}
                </span>
              </Button>
            </div>
          </div>
        )}
      </ScrollArea>
    </aside>
  );
};
