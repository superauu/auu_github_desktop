import { useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useRepoStore } from '@/stores/repoStore';
import { useIssueWorkflowStore } from '@/stores/issueWorkflowStore';
import { collaborationService } from '@/services/collaboration/CollaborationService';
import type { CollaborationIssue } from '@/services/collaboration/issueTypes';
import { issueKey } from './issueLogic';
import { useCollaborationScope } from './useCollaborationScope';
import { useCollaborationCapabilities } from '@/features/integrations/useCollaborationCapabilities';

export function useCurrentBranchIssue() {
  const { path, branch } = useRepoStore(useShallow(state => ({ path: state.currentRepo?.path,
    // checkout updates the active repository before refs/status finish refreshing.
    branch: state.currentRepo?.currentBranch || state.status?.currentBranch || state.branches.find(item => item.isCurrent)?.name,
  })));
  const reference = useIssueWorkflowStore(state => path && branch ? state.issueForBranch(path, branch) : undefined);
  const revision = useIssueWorkflowStore(state => reference ? state.revisions[issueKey(reference)] || 0 : 0);
  const scope = useCollaborationScope();
  const { can } = useCollaborationCapabilities();
  const canRead = can('task-tracking:issue-detail');
  const key = JSON.stringify([scope.key, path, branch, reference && issueKey(reference)]);
  const [data, setData] = useState<{ key: string; issue?: CollaborationIssue; error?: string } | null>(null);
  useEffect(() => {
    let active = true;
    setData(null);
    if (!reference || !scope.isAuthenticated || !canRead) return;
    void collaborationService.getIssue(reference.owner, reference.repo, reference.number)
      .then(issue => { if (active && scope.isCurrent()) setData({ key, issue }); })
      .catch(reason => { if (active && scope.isCurrent()) setData({ key, error: String(reason?.message || reason) }); });
    return () => { active = false; };
  }, [key, reference, revision, scope, canRead]);
  return { path, branch, reference: canRead ? reference : undefined, scope, issue: data?.key === key ? data.issue : undefined,
    error: data?.key === key ? data.error : undefined, loading: !!reference && scope.isAuthenticated && data?.key !== key,
  };
}
