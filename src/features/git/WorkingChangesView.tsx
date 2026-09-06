import React, { useState } from 'react';
import {
  CheckSquare,
} from 'lucide-react';
import { useRepoStore } from '@/stores/repoStore';
import { GitFileChange } from '@/services/git/types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/utils/cn';

export const WorkingChangesView: React.FC = () => {
  const { status, selectedFile, setSelectedFile } = useRepoStore();
  const [diffMode, setDiffMode] = useState<'unified' | 'split'>('unified');

  // Fallback demo files if status is empty (for rich initial presentation)
  const stagedFiles: GitFileChange[] = status?.staged.length
    ? status.staged
    : [
        { path: 'src/services/git/GitService.ts', status: 'modified', staged: true, insertions: 42, deletions: 8 },
        { path: 'src/features/tag/TagManager.tsx', status: 'added', staged: true, insertions: 120, deletions: 0 },
      ];

  const unstagedFiles: GitFileChange[] = status?.unstaged.length
    ? status.unstaged
    : [
        { path: 'src/components/layout/AppLayout.tsx', status: 'modified', staged: false, insertions: 18, deletions: 4 },
        { path: 'src/index.css', status: 'modified', staged: false, insertions: 25, deletions: 2 },
      ];

  const untrackedFiles: GitFileChange[] = status?.untracked.length
    ? status.untracked
    : [
        { path: 'src/features/actions/WorkflowDashboard.tsx', status: 'untracked', staged: false, insertions: 85, deletions: 0 },
      ];

  // Active file for diff
  const activeFile = selectedFile || stagedFiles[0] || unstagedFiles[0];

  const getStatusBadge = (statusType: string) => {
    switch (statusType) {
      case 'modified':
        return <span className="text-[10px] font-mono font-bold text-amber-400">M</span>;
      case 'added':
        return <span className="text-[10px] font-mono font-bold text-emerald-400">A</span>;
      case 'deleted':
        return <span className="text-[10px] font-mono font-bold text-red-400">D</span>;
      case 'untracked':
        return <span className="text-[10px] font-mono font-bold text-purple-400">U</span>;
      default:
        return <span className="text-[10px] font-mono font-bold text-blue-400">?</span>;
    }
  };

  // Sample diff lines for preview
  const sampleDiffLines = [
    { type: 'header', content: '@@ -14,8 +14,14 @@ export class GitService implements IGitService {' },
    { type: 'context', oldNo: 14, newNo: 14, content: '  private repoPath: string;' },
    { type: 'context', oldNo: 15, newNo: 15, content: '  constructor(repoPath: string) {' },
    { type: 'context', oldNo: 16, newNo: 16, content: '    this.repoPath = repoPath;' },
    { type: 'delete', oldNo: 17, newNo: null, content: '-   console.log("GitService initialized");' },
    { type: 'add', oldNo: null, newNo: 17, content: '+   // Use porcelain v2 machine readable formats for maximum stability' },
    { type: 'add', oldNo: null, newNo: 18, content: '+   this.logger = createLogger("GitService");' },
    { type: 'add', oldNo: null, newNo: 19, content: '+   this.initPorcelainParser();' },
    { type: 'context', oldNo: 18, newNo: 20, content: '  }' },
    { type: 'context', oldNo: 19, newNo: 21, content: '' },
    { type: 'header', content: '@@ -32,6 +38,12 @@ export class GitService implements IGitService {' },
    { type: 'context', oldNo: 32, newNo: 38, content: '  async getStatus(): Promise<GitStatusResult> {' },
    { type: 'delete', oldNo: 33, newNo: null, content: '-   return this.execSimpleStatus();' },
    { type: 'add', oldNo: null, newNo: 39, content: '+   const output = await this.execGit(["status", "--porcelain=v2", "--branch"]);' },
    { type: 'add', oldNo: null, newNo: 40, content: '+   return parsePorcelainV2(output);' },
    { type: 'context', oldNo: 34, newNo: 41, content: '  }' },
  ];

  return (
    <div className="flex-1 h-full flex overflow-hidden select-none">
      {/* Changes File List Sub-panel */}
      <div className="w-64 border-r border-border bg-sidebar/50 flex flex-col shrink-0 h-full overflow-hidden">
        <div className="h-9 px-3 border-b border-border flex items-center justify-between font-medium text-xs text-foreground bg-accent/20">
          <span>改动文件列表</span>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="xs" className="h-6 px-1.5 text-[10px] text-muted-foreground hover:text-foreground">
              暂存全部
            </Button>
          </div>
        </div>

        <ScrollArea className="flex-1 p-2">
          <div className="space-y-3">
            {/* Staged Section */}
            <div>
              <div className="flex items-center justify-between px-1.5 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                <span>已暂存改动 ({stagedFiles.length})</span>
                <span className="text-emerald-400 font-mono text-[9px]">READY</span>
              </div>
              <div className="space-y-0.5">
                {stagedFiles.map((file) => (
                  <div
                    key={file.path}
                    onClick={() => setSelectedFile(file)}
                    className={cn(
                      "flex items-center justify-between px-2 py-1.5 rounded-md text-xs cursor-pointer transition-colors group",
                      activeFile?.path === file.path
                        ? "bg-accent text-accent-foreground font-medium"
                        : "text-muted-foreground hover:text-foreground hover:bg-accent/40"
                    )}
                  >
                    <div className="flex items-center gap-2 truncate min-w-0">
                      {getStatusBadge(file.status)}
                      <span className="truncate text-[11px] font-mono">{file.path}</span>
                    </div>
                    <div className="flex items-center gap-1 font-mono text-[9px] text-muted-foreground shrink-0">
                      {file.insertions !== undefined && <span className="text-emerald-400">+{file.insertions}</span>}
                      {file.deletions !== undefined && <span className="text-red-400">-{file.deletions}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Unstaged Section */}
            <div>
              <div className="flex items-center justify-between px-1.5 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                <span>未暂存改动 ({unstagedFiles.length})</span>
              </div>
              <div className="space-y-0.5">
                {unstagedFiles.map((file) => (
                  <div
                    key={file.path}
                    onClick={() => setSelectedFile(file)}
                    className={cn(
                      "flex items-center justify-between px-2 py-1.5 rounded-md text-xs cursor-pointer transition-colors group",
                      activeFile?.path === file.path
                        ? "bg-accent text-accent-foreground font-medium"
                        : "text-muted-foreground hover:text-foreground hover:bg-accent/40"
                    )}
                  >
                    <div className="flex items-center gap-2 truncate min-w-0">
                      {getStatusBadge(file.status)}
                      <span className="truncate text-[11px] font-mono">{file.path}</span>
                    </div>
                    <div className="flex items-center gap-1 font-mono text-[9px] text-muted-foreground shrink-0">
                      {file.insertions !== undefined && <span className="text-emerald-400">+{file.insertions}</span>}
                      {file.deletions !== undefined && <span className="text-red-400">-{file.deletions}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Untracked Section */}
            <div>
              <div className="flex items-center justify-between px-1.5 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                <span>未跟踪文件 ({untrackedFiles.length})</span>
              </div>
              <div className="space-y-0.5">
                {untrackedFiles.map((file) => (
                  <div
                    key={file.path}
                    onClick={() => setSelectedFile(file)}
                    className={cn(
                      "flex items-center justify-between px-2 py-1.5 rounded-md text-xs cursor-pointer transition-colors group",
                      activeFile?.path === file.path
                        ? "bg-accent text-accent-foreground font-medium"
                        : "text-muted-foreground hover:text-foreground hover:bg-accent/40"
                    )}
                  >
                    <div className="flex items-center gap-2 truncate min-w-0">
                      {getStatusBadge(file.status)}
                      <span className="truncate text-[11px] font-mono">{file.path}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </ScrollArea>
      </div>

      {/* Diff Viewer Pane (Section 11) */}
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-card/10">
        {/* Diff Toolbar */}
        <div className="h-9 px-3 border-b border-border flex items-center justify-between text-xs bg-card/40">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-mono text-xs font-semibold text-foreground truncate">
              {activeFile?.path || '未选择文件'}
            </span>
            {activeFile && (
              <Badge variant="outline" className="h-4 px-1.5 text-[9px] uppercase font-mono">
                {activeFile.status}
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Unified / Split Toggle */}
            <div className="flex items-center bg-secondary/50 rounded-md p-0.5 border border-border/60">
              <button
                onClick={() => setDiffMode('unified')}
                className={cn(
                  "px-2 py-0.5 rounded text-[10px] font-medium transition-colors",
                  diffMode === 'unified' ? "bg-accent text-accent-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
                )}
              >
                Unified
              </button>
              <button
                onClick={() => setDiffMode('split')}
                className={cn(
                  "px-2 py-0.5 rounded text-[10px] font-medium transition-colors",
                  diffMode === 'split' ? "bg-accent text-accent-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
                )}
              >
                Split
              </button>
            </div>

            {/* Quick Stage/Unstage button */}
            <Button variant="outline" size="xs" className="h-6 text-[10px] gap-1">
              <CheckSquare className="h-3 w-3" />
              <span>{activeFile?.staged ? '取消暂存' : '暂存此文件'}</span>
            </Button>
          </div>
        </div>

        {/* Diff Content View */}
        <div className="flex-1 overflow-auto font-mono text-[11px] leading-relaxed bg-[#0b0f17]/80 select-text">
          {sampleDiffLines.map((line, idx) => {
            if (line.type === 'header') {
              return (
                <div key={idx} className="bg-indigo-950/40 text-indigo-300/80 px-4 py-1 border-y border-indigo-900/30 font-semibold select-none">
                  {line.content}
                </div>
              );
            }

            const isAdd = line.type === 'add';
            const isDel = line.type === 'delete';

            return (
              <div
                key={idx}
                className={cn(
                  "flex items-stretch hover:bg-white/[0.02] transition-colors border-l-2",
                  isAdd
                    ? "bg-emerald-500/10 text-emerald-300 border-emerald-500"
                    : isDel
                    ? "bg-rose-500/10 text-rose-300 border-rose-500"
                    : "border-transparent text-foreground/80"
                )}
              >
                {/* Line Numbers */}
                <div className="w-10 px-2 text-right text-muted-foreground/40 select-none shrink-0 font-mono text-[10px]">
                  {line.oldNo ?? ''}
                </div>
                <div className="w-10 px-2 text-right text-muted-foreground/40 select-none shrink-0 font-mono text-[10px] border-r border-border/30">
                  {line.newNo ?? ''}
                </div>
                {/* Content */}
                <div className="px-3 whitespace-pre font-mono flex-1 overflow-x-auto">
                  {line.content}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
