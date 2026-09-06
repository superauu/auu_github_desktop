import React from 'react';
import { useRepoStore } from '@/stores/repoStore';
import { WelcomeView } from '@/features/repository/WelcomeView';
import { WorkingChangesView } from '@/features/git/WorkingChangesView';
import { CommitHistoryView } from '@/features/git/CommitHistoryView';
import { ActionsDashboardView } from '@/features/actions/ActionsDashboardView';
import { PullRequestsView } from '@/features/pr/PullRequestsView';

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

  if (!currentRepo) {
    return (
      <WelcomeView
        onOpenRepo={onOpenRepoDialog}
        onCloneRepo={onCloneRepoDialog}
        onInitRepo={onInitRepoDialog}
      />
    );
  }

  switch (activeTab) {
    case 'actions':
      return <ActionsDashboardView onOpenAuthDialog={onOpenGitHubAuth} />;
    case 'pullRequests':
      return <PullRequestsView />;
    case 'history':
      return <CommitHistoryView />;
    case 'changes':
    default:
      return <WorkingChangesView />;
  }
};

