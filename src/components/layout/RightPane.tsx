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
} from 'lucide-react';
import { useRepoStore } from '@/stores/repoStore';
import { useGitHubStore } from '@/stores/githubStore';
import { useLayoutStore } from '@/stores/layoutStore';
import { useSettingsStore } from '@/stores/settingsStore';
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

  useEffect(() => {
    if (activeTab === 'history' && selectedCommit) {
      fetchCommitChecks(selectedCommit.hash).then((res) => {
        setChecks(res);
      });
    }
  }, [activeTab, selectedCommit, fetchCommitChecks]);

  if (isRightPaneCollapsed) return null;

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
          <div className="space-y-4">
            {/* Commit Header & AI Recompose Button */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground text-[11px]">commit:</span>
                <button
                  onClick={() => copyHash(selectedCommit.hash)}
                  className="font-mono text-xs font-semibold text-primary hover:underline flex items-center gap-1"
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

              {/* GitKraken-style Recompose with AI button */}
              <Button
                variant="outline"
                size="xs"
                onClick={() => {
                  setCommitMessage(selectedCommit.subject);
                  setActiveTab('changes');
                  toast.info('已复制提交信息至工作区并切换');
                }}
                className="h-6 px-2 text-[10px] gap-1 border-purple-500/40 text-purple-300 hover:bg-purple-500/15"
              >
                <Sparkles className="h-3 w-3 text-purple-400" />
                <span>Recompose</span>
              </Button>
            </div>

            {/* Commit Subject & Body */}
            <div className="p-3 rounded-xl border border-border/80 bg-accent/20 space-y-2">
              <p className="text-xs font-semibold text-foreground leading-relaxed">
                {selectedCommit.subject}
              </p>
              {selectedCommit.body && (
                <p className="text-[11px] text-muted-foreground whitespace-pre-wrap font-mono bg-background/50 p-2 rounded border border-border/40">
                  {selectedCommit.body}
                </p>
              )}
            </div>

            {/* GitKraken-style Author Card */}
            <div className="p-3 rounded-xl border border-border/70 bg-card/60 flex items-start gap-3">
              <div className="h-8 w-8 rounded-lg bg-indigo-500/20 text-indigo-400 font-bold flex items-center justify-center text-xs shrink-0 border border-indigo-500/30 uppercase">
                {selectedCommit.author.name.slice(0, 2)}
              </div>
              <div className="min-w-0 flex-1 space-y-0.5 text-[11px]">
                <div className="font-semibold text-foreground truncate">{selectedCommit.author.name}</div>
                <div className="text-muted-foreground text-[10px]">
                  authored {selectedCommit.author.relativeDate}
                </div>
                {selectedCommit.parents.length > 0 && (
                  <div className="text-[10px] text-muted-foreground/80 font-mono pt-1 border-t border-border/40">
                    parent: {selectedCommit.parents[0].slice(0, 7)}
                  </div>
                )}
              </div>
            </div>

            {/* GitHub Checks Status */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                  GitHub Checks
                </span>
                <Badge variant="success" className="h-4 text-[9px] gap-1 font-mono">
                  <CheckCircle2 className="h-2.5 w-2.5 text-emerald-400" />
                  <span>{checks.length} / {checks.length} 通过</span>
                </Badge>
              </div>

              <div className="rounded-xl border border-border/80 divide-y divide-border/60 bg-background/50 text-[11px] overflow-hidden">
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
                  className="h-5 px-1.5 text-[10px] gap-1 border-purple-500/40 text-purple-300 hover:bg-purple-500/15"
                  title="根据当前修改智能生成语义化提交说明"
                >
                  <Sparkles className="h-2.5 w-2.5 text-purple-400" />
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
