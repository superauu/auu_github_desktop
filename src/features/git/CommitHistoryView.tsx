import React from 'react';
import {
  GitCommit as GitCommitIcon,
  GitBranch as GitBranchIcon,
  Tag as TagIcon,
  Calendar,
  User,
} from 'lucide-react';
import { useRepoStore } from '@/stores/repoStore';
import { GitCommit } from '@/services/git/types';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/utils/cn';

export const CommitHistoryView: React.FC = () => {
  const { selectedCommit, setSelectedCommit } = useRepoStore();

  // High-fidelity sample commits for demonstration matching Section 12 & 13
  const sampleCommits: GitCommit[] = [
    {
      hash: '9a4f21b83e4c192d7f8841a54b39e2467d0281ba',
      shortHash: '9a4f21b',
      subject: 'feat(actions): 集成 GitHub Actions 工作流与实时 Checks 状态',
      author: {
        name: 'Alex Developer',
        email: 'alex@example.com',
        date: '2026-09-06T14:30:00Z',
        relativeDate: '10 分钟前',
      },
      parents: ['e71b29a'],
      refs: ['HEAD -> main', 'origin/main'],
      changedFilesCount: 4,
      insertions: 142,
      deletions: 18,
    },
    {
      hash: 'e71b29ac38d940e729a8f4201183c072b4923e11',
      shortHash: 'e71b29a',
      subject: 'feat(tag): 增强 Tag 管理支持 Lightweight 与 Annotated Tags 快速推送',
      author: {
        name: 'Alex Developer',
        email: 'alex@example.com',
        date: '2026-09-06T11:15:00Z',
        relativeDate: '3 小时前',
      },
      parents: ['3f8a901'],
      refs: ['tag: v1.0.0'],
      changedFilesCount: 6,
      insertions: 210,
      deletions: 34,
    },
    {
      hash: '3f8a901c82739a82810a9c802e83819da7382910',
      shortHash: '3f8a901',
      subject: 'perf(diff): 采用虚拟化 Unified & Split Diff 查看器提升大文件渲染性能',
      author: {
        name: 'Sarah Chen',
        email: 'sarah@example.com',
        date: '2026-09-05T18:40:00Z',
        relativeDate: '1 天前',
      },
      parents: ['c428190', 'b198273'],
      refs: [],
      changedFilesCount: 3,
      insertions: 98,
      deletions: 42,
    },
    {
      hash: 'c428190f84a821038e9182374981729384910283',
      shortHash: 'c428190',
      subject: 'feat(branch): 支持本地与远程分支新建、切换、重命名与变基',
      author: {
        name: 'Alex Developer',
        email: 'alex@example.com',
        date: '2026-09-05T09:20:00Z',
        relativeDate: '1 天前',
      },
      parents: ['a109283'],
      refs: ['feature/branch-ops'],
      changedFilesCount: 5,
      insertions: 165,
      deletions: 12,
    },
    {
      hash: 'a109283928172819284719283749281729384719',
      shortHash: 'a109283',
      subject: 'chore: 初始化 Tauri 2 + React + TypeScript + Tailwind 设计系统骨架',
      author: {
        name: 'Alex Developer',
        email: 'alex@example.com',
        date: '2026-09-04T16:00:00Z',
        relativeDate: '2 天前',
      },
      parents: [],
      refs: [],
      changedFilesCount: 12,
      insertions: 480,
      deletions: 0,
    },
  ];

  const activeCommit = selectedCommit || sampleCommits[0];

  return (
    <div className="flex-1 h-full flex flex-col overflow-hidden select-none bg-card/20">
      {/* Header bar */}
      <div className="h-9 px-4 border-b border-border flex items-center justify-between text-xs text-muted-foreground bg-card/40">
        <div className="flex items-center gap-2">
          <GitCommitIcon className="h-3.5 w-3.5 text-primary" />
          <span className="font-semibold text-foreground">提交历史 (Commit Log & Graph)</span>
          <Badge variant="outline" className="h-4 text-[10px] font-mono">
            {sampleCommits.length} 次提交
          </Badge>
        </div>
      </div>

      {/* Commit List Table */}
      <ScrollArea className="flex-1">
        <div className="divide-y divide-border/50">
          {sampleCommits.map((commit, index) => {
            const isSelected = activeCommit?.hash === commit.hash;

            return (
              <div
                key={commit.hash}
                onClick={() => setSelectedCommit(commit)}
                className={cn(
                  "p-3 flex items-start gap-3 cursor-pointer transition-all hover:bg-accent/40 group",
                  isSelected ? "bg-accent/60 border-l-2 border-primary" : "border-l-2 border-transparent"
                )}
              >
                {/* Visual Graph Node Representation */}
                <div className="flex flex-col items-center pt-0.5 shrink-0 w-5">
                  <div
                    className={cn(
                      "w-3 h-3 rounded-full border-2 transition-transform group-hover:scale-125",
                      index === 0
                        ? "border-primary bg-primary/20"
                        : index === 1
                        ? "border-amber-400 bg-amber-400/20"
                        : "border-indigo-400 bg-background"
                    )}
                  />
                  {index < sampleCommits.length - 1 && (
                    <div className="w-0.5 h-10 bg-border/80 my-0.5" />
                  )}
                </div>

                {/* Commit Main Info */}
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-xs text-foreground group-hover:text-primary transition-colors">
                      {commit.subject}
                    </span>

                    {/* Refs / Branches / Tags Badges */}
                    {commit.refs?.map((ref) => {
                      const isHead = ref.includes('HEAD');
                      const isTag = ref.startsWith('tag:');

                      return (
                        <Badge
                          key={ref}
                          variant={isTag ? "warning" : isHead ? "default" : "secondary"}
                          className="h-4 px-1.5 text-[9px] gap-1 font-mono"
                        >
                          {isTag ? (
                            <TagIcon className="h-2.5 w-2.5 text-amber-400" />
                          ) : (
                            <GitBranchIcon className="h-2.5 w-2.5" />
                          )}
                          <span>{ref.replace('tag: ', '')}</span>
                        </Badge>
                      );
                    })}
                  </div>

                  {/* Author, Date & Hash */}
                  <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <User className="h-3 w-3 text-muted-foreground/60" />
                      <span>{commit.author.name}</span>
                    </span>

                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3 text-muted-foreground/60" />
                      <span>{commit.author.relativeDate}</span>
                    </span>

                    <span className="font-mono text-[10px] text-muted-foreground/80 hover:text-foreground">
                      {commit.shortHash}
                    </span>
                  </div>
                </div>

                {/* Stats */}
                <div className="hidden sm:flex items-center gap-2 font-mono text-[10px] shrink-0 pt-0.5">
                  <span className="text-emerald-400">+{commit.insertions}</span>
                  <span className="text-rose-400">-{commit.deletions}</span>
                </div>
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
};
