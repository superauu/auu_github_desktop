import React from 'react';
import { useRepoStore } from '@/stores/repoStore';
import { WelcomeView } from '@/features/repository/WelcomeView';
import { WorkingChangesView } from '@/features/git/WorkingChangesView';
import { CommitHistoryView } from '@/features/git/CommitHistoryView';
import { ActionsDashboardView } from '@/features/actions/ActionsDashboardView';
import { PullRequestsView } from '@/features/pr/PullRequestsView';

import { useLayoutStore } from '@/stores/layoutStore';
import { EmbeddedTerminalPanel } from './EmbeddedTerminalPanel';

interface CenterStageProps {
  onOpenRepoDialog: () => void;
  onCloneRepoDialog: () => void;
  onInitRepoDialog: () => void;
  onOpenGitHubAuth?: () => void;
}

export const CenterStage: React.FC<CenterStageProps> = ({
  onOpenRepoDialog,
  onCloneRepoDialog,
  onInitRepoDialog,
  onOpenGitHubAuth,
}) => {
  const { currentRepo, activeTab } = useRepoStore();
  const { isEmbeddedTerminalOpen, setEmbeddedTerminalOpen } = useLayoutStore();

  if (!currentRepo) {
    return (
      <WelcomeView
        onOpenRepo={onOpenRepoDialog}
        onCloneRepo={onCloneRepoDialog}
        onInitRepo={onInitRepoDialog}
      />
    );
  }

  const renderActiveView = () => {
    switch (activeTab) {
      case 'actions':
        return <ActionsDashboardView onOpenAuthDialog={onOpenGitHubAuth} />;
      case 'pullRequests':
        return <PullRequestsView />;
      case 'changes':
        return <WorkingChangesView />;
      case 'history':
      default:
        return <CommitHistoryView />;
    }
  };

  return (
    <div className="flex-1 min-w-0 h-full flex flex-col overflow-hidden relative bg-background">
      {/* Upper Main Git Graph / View Area */}
      <div className="flex-1 flex flex-col overflow-hidden min-h-0">
        {/* key 触发重挂载：切视图时轻微上浮淡入（200ms ease-out），reduced-motion 下自动禁用 */}
        <div
          key={activeTab}
          className="flex-1 flex flex-col overflow-hidden min-h-0 animate-in fade-in duration-200 slide-in-from-bottom-2 ease-out"
        >
          {renderActiveView()}
        </div>
      </div>

      {/* Embedded Terminal Bottom Drawer (GitKraken style) */}
      <EmbeddedTerminalPanel
        open={isEmbeddedTerminalOpen}
        onClose={() => setEmbeddedTerminalOpen(false)}
      />
    </div>
  );
};

