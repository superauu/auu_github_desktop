import React from 'react';
import { useRepoStore } from '@/stores/repoStore';
import { WelcomeView } from '@/features/repository/WelcomeView';
import { WorkingChangesView } from '@/features/git/WorkingChangesView';
import { CommitHistoryView } from '@/features/git/CommitHistoryView';

interface CenterStageProps {
  onOpenRepoDialog: () => void;
  onCloneRepoDialog: () => void;
  onInitRepoDialog: () => void;
}

export const CenterStage: React.FC<CenterStageProps> = ({
  onOpenRepoDialog,
  onCloneRepoDialog,
  onInitRepoDialog,
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
    case 'history':
      return <CommitHistoryView />;
    case 'changes':
    default:
      return <WorkingChangesView />;
  }
};
