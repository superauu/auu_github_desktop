import React from 'react';
import {
  GitBranch as GitBranchIcon,
  CheckCircle2,
  Terminal,
  FolderGit2,
} from 'lucide-react';
import { useRepoStore } from '@/stores/repoStore';

export const StatusBar: React.FC = () => {
  const { currentRepo, status } = useRepoStore();

  return (
    <footer className="h-6 border-t border-border bg-card/60 backdrop-blur-md px-3 flex items-center justify-between text-[11px] text-muted-foreground select-none shrink-0 z-20">
      {/* Left side info */}
      <div className="flex items-center gap-3">
        {currentRepo ? (
          <>
            <div className="flex items-center gap-1 text-foreground font-medium">
              <FolderGit2 className="h-3 w-3 text-primary" />
              <span>{currentRepo.name}</span>
            </div>

            <div className="h-3 w-[1px] bg-border" />

            <div className="flex items-center gap-1 text-indigo-400">
              <GitBranchIcon className="h-3 w-3" />
              <span>{currentRepo.currentBranch}</span>
            </div>

            {status && (
              <>
                <div className="h-3 w-[1px] bg-border" />
                <div className="flex items-center gap-2 font-mono text-[10px]">
                  <span className="text-emerald-400">↑ {status.ahead}</span>
                  <span className="text-cyan-400">↓ {status.behind}</span>
                </div>
              </>
            )}
          </>
        ) : (
          <span>就绪 - 暂未载入 Git 仓库</span>
        )}
      </div>

      {/* Right side status */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1 text-[10px]">
          <CheckCircle2 className="h-3 w-3 text-emerald-400" />
          <span>Git 2.50 就绪</span>
        </div>

        <div className="h-3 w-[1px] bg-border" />

        <div className="flex items-center gap-1 text-[10px] text-muted-foreground/80 font-mono">
          <Terminal className="h-3 w-3" />
          <span>UTF-8</span>
        </div>
      </div>
    </footer>
  );
};
