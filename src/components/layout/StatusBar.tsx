import { useShallow } from 'zustand/react/shallow';
import React from 'react';
import {
  GitBranch as GitBranchIcon,
  CheckCircle2,
  Loader2,
  Terminal,
  FolderGit2,
  History,
} from 'lucide-react';
import { useI18n } from '@/i18n';
import { useRepoStore } from '@/stores/repoStore';
import { useGitOperationStatus } from '@/hooks/useGitOperationStatus';
import { cancelQueuedGitWrites } from '@/services/git/GitQueue';
import { openUpdateDialog, useUpdateStore } from '@/services/updater/UpdateService';

export const StatusBar: React.FC<{ onOpenHistory?: () => void }> = ({ onOpenHistory }) => {
  const { currentRepo, status, branches } = useRepoStore(useShallow(state => ({ currentRepo: state.currentRepo, status: state.status, branches: state.branches })));
  const { t } = useI18n();
  const updatePhase = useUpdateStore(state => state.phase);
  const updateVersion = useUpdateStore(state => state.version);
  const { activity, elapsed, operationLabel, waitHint } = useGitOperationStatus(currentRepo?.path || '');

  const currentBranchName =
    branches.find((b) => b.isCurrent)?.name ||
    status?.currentBranch ||
    currentRepo?.currentBranch ||
    '';

  return (
    <footer aria-label={t('window.statusbar')} className="glass-surface glass-statusbar h-7 px-3 flex items-center justify-between gap-4 text-[12px] text-muted-foreground select-none shrink-0 z-20">
      {/* Left side info */}
      <div className="flex min-w-0 items-center gap-3 overflow-x-clip">
        {currentRepo ? (
          <>
            <div className="flex min-w-0 items-center gap-1 text-foreground font-medium" title={currentRepo.path}>
              <FolderGit2 className="h-3 w-3 shrink-0 text-primary" />
              <span className="max-w-48 truncate">{currentRepo.name}</span>
            </div>

            <div className="h-3 w-px bg-border" />

            <div className="flex min-w-0 items-center gap-1 text-foreground/80" title={currentBranchName}>
              <GitBranchIcon className="h-3 w-3 shrink-0" />
              <span className="max-w-36 truncate">{currentBranchName}</span>
            </div>

            {status && (
              <>
                <div className="h-3 w-px bg-border" />
                <div className="statusbar-tracking flex shrink-0 items-center gap-2 font-mono text-[12px]" title={t('remote.outgoingHint')}>
                  <span className="max-w-36 truncate">{status.trackingBranch || t('remote.noUpstream')}</span>
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
      <div className="flex shrink-0 items-center gap-3">
        {updateVersion && <button className="text-primary hover:underline" onClick={openUpdateDialog}>{t(['ready', 'installed'].includes(updatePhase) ? 'updates.downloaded' : 'updates.title')} · v{updateVersion}</button>}
        {onOpenHistory && <button className="flex items-center gap-1 hover:text-foreground" onClick={onOpenHistory} title={t('operationLog.title')}><History className="h-3 w-3" />{t('operationLog.title')}</button>}
        <div className="flex items-center gap-1 text-[12px]" title={waitHint || undefined}>
          {activity ? <Loader2 className="h-3 w-3 text-primary animate-spin" /> : <CheckCircle2 className="h-3 w-3 text-git-added" />}
          <span role="status">{activity ? operationLabel : t('status.gitReady')}</span>
          {activity?.startedAt != null && <span className="tabular-nums" aria-label={t('activity.elapsed')}>{elapsed}s</span>}
          {!!activity?.queued && <>
            <span>{t('activity.queued').replace('{n}', String(activity.queued))}</span>
            <button className="text-primary hover:underline" title={t('activity.cancelHint')}
              onClick={() => cancelQueuedGitWrites(currentRepo?.path || '', t('activity.cancelled'))}>{t('activity.cancelQueued')}</button>
          </>}
        </div>

        <div className="h-3 w-px bg-border" />

        <div className="flex items-center gap-1 text-[12px] text-muted-foreground/80 font-mono">
          <Terminal className="h-3 w-3" />
          <span>UTF-8</span>
        </div>
      </div>
    </footer>
  );
};
