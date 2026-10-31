import { useShallow } from 'zustand/react/shallow';
import React, { lazy, Suspense } from 'react';
import { useRepoStore } from '@/stores/repoStore';
import { WelcomeView } from '@/features/repository/WelcomeView';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
const RepositoryOverview = lazy(() => import('@/features/repository/RepositoryOverview').then(module => ({ default: module.RepositoryOverview })));
const WorkingChangesView = lazy(() => import('@/features/git/WorkingChangesView').then((module) => ({ default: module.WorkingChangesView })));
const CommitHistoryView = lazy(() => import('@/features/git/CommitHistoryView').then((module) => ({ default: module.CommitHistoryView })));
const ActionsDashboardView = lazy(() => import('@/features/actions/ActionsDashboardView').then((module) => ({ default: module.ActionsDashboardView })));
const PullRequestsView = lazy(() => import('@/features/pr/PullRequestsView').then((module) => ({ default: module.PullRequestsView })));
const IssuesView = lazy(() => import('@/features/issues/IssuesView').then(module => ({ default: module.IssuesView })));
const ForgeView = lazy(() => import('@/features/forge/ForgeView').then((module) => ({ default: module.ForgeView })));

import { useLayoutStore } from '@/stores/layoutStore';
import { useI18n } from '@/i18n';
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
  const { currentRepo, activeTab } = useRepoStore(useShallow(state => ({ currentRepo: state.currentRepo, activeTab: state.activeTab })));
  const { isEmbeddedTerminalOpen, setEmbeddedTerminalOpen } = useLayoutStore(useShallow(state => ({ isEmbeddedTerminalOpen: state.isEmbeddedTerminalOpen, setEmbeddedTerminalOpen: state.setEmbeddedTerminalOpen })));
  const { t } = useI18n();

  if (!currentRepo && activeTab !== 'overview') {
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
      case 'overview': return <RepositoryOverview onOpenGitHubAuth={onOpenGitHubAuth} />;
      case 'actions':
        return <ActionsDashboardView onOpenAuthDialog={onOpenGitHubAuth} />;
      case 'pullRequests':
        return <PullRequestsView />;
      case 'issues':
        return <IssuesView onOpenAuthDialog={onOpenGitHubAuth} />;
      case 'forge':
        return <ForgeView />;
      case 'changes':
        return <WorkingChangesView />;
      // Legacy review routes fall back to ordinary commit history.
      case 'review':
      case 'history':
      default:
        return <CommitHistoryView />;
    }
  };

  return (
    <div className="glass-surface glass-stage flex-1 min-w-0 h-full flex flex-col overflow-hidden relative">
      {/* Upper Main Git Graph / View Area */}
      <div className="flex-1 flex flex-col overflow-hidden min-h-0">
        {/* key 触发重挂载：切视图时轻微上浮淡入（200ms ease-out），reduced-motion 下自动禁用 */}
        <div
          key={activeTab === 'overview' ? 'overview' : `${currentRepo?.path}:${activeTab}`}
          className="flex-1 flex flex-col overflow-hidden min-h-0 animate-in fade-in duration-200 slide-in-from-bottom-2 ease-out"
        >
          <ErrorBoundary><Suspense fallback={<div role="status" aria-label={t('common.loading')} className="p-6 animate-pulse">…</div>}>{renderActiveView()}</Suspense></ErrorBoundary>
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

