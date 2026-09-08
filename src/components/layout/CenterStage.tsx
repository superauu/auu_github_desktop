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
    <div className="flex-1 h-full flex flex-col overflow-hidden relative bg-background">
      {/* Upper Main Git Graph / View Area */}
      <div className="flex-1 flex flex-col overflow-hidden min-h-0">
        {renderActiveView()}
      </div>

      {/* Embedded Terminal Bottom Drawer (GitKraken style) */}
      <EmbeddedTerminalPanel
        open={isEmbeddedTerminalOpen}
        onClose={() => setEmbeddedTerminalOpen(false)}
      />
    </div>
  );
};

