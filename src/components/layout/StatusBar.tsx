import { useShallow } from 'zustand/react/shallow';
import React from 'react';
import {
  GitBranch as GitBranchIcon,
  CheckCircle2,
  Terminal,
  FolderGit2,
} from 'lucide-react';
import { useI18n } from '@/i18n';
import { useRepoStore } from '@/stores/repoStore';
import { useGitActivity } from '@/hooks/useGitActivity';

export const StatusBar: React.FC = () => {
  const { currentRepo, status, branches } = useRepoStore(useShallow(state => ({ currentRepo: state.currentRepo, status: state.status, branches: state.branches })));
  const { t } = useI18n();
  const pending = useGitActivity(currentRepo?.path || '');

  const currentBranchName =
    branches.find((b) => b.isCurrent)?.name ||
    status?.currentBranch ||
    currentRepo?.currentBranch ||
    '';

  return (
    <footer className="h-6 border-t border-border bg-card/60 backdrop-blur-md px-3 flex items-center justify-between text-[12px] text-muted-foreground select-none shrink-0 z-20">
      {/* Left side info */}
      <div className="flex items-center gap-3">
        {currentRepo ? (
          <>
            <div className="flex items-center gap-1 text-foreground font-medium">
              <FolderGit2 className="h-3 w-3 text-primary" />
              <span>{currentRepo.name}</span>
            </div>

            <div className="h-3 w-[1px] bg-border" />

            <div className="flex items-center gap-1 text-indigo-600 dark:text-indigo-400">
              <GitBranchIcon className="h-3 w-3" />
              <span>{currentBranchName}</span>
            </div>

            {status && (
              <>
                <div className="h-3 w-[1px] bg-border" />
                <div className="flex items-center gap-2 font-mono text-[12px]">
                  <span className="text-git-added">↑ {status.ahead}</span>
                  <span className="text-primary">↓ {status.behind}</span>
                </div>
              </>
            )}
          </>
        ) : (
          <span>{t('status.ready')}</span>
        )}
      </div>

      {/* Right side status */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1 text-[12px]">
          <CheckCircle2 className="h-3 w-3 text-git-added" />
          <span role="status">{t(pending ? 'changes.processing' : 'status.gitReady')}</span>
        </div>

        <div className="h-3 w-[1px] bg-border" />

        <div className="flex items-center gap-1 text-[12px] text-muted-foreground/80 font-mono">
          <Terminal className="h-3 w-3" />
          <span>UTF-8</span>
        </div>
      </div>
    </footer>
  );
};
