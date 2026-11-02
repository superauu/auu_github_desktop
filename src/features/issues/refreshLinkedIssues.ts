import type { CollaborationPullRequest } from '@/services/collaboration/types';
import { useIssueWorkflowStore } from '@/stores/issueWorkflowStore';
import { issueReferences } from './issueLogic';

/** The hosting platform may apply closing references shortly after the merge response. */
export function refreshLinkedIssues(pr: CollaborationPullRequest, owner: string, repo: string, isCurrent: () => boolean) {
  const issues = issueReferences(pr.body, owner, repo);
  if (!issues.length || !isCurrent()) return;
  const refresh = () => { if (isCurrent()) useIssueWorkflowStore.getState().refreshIssues(issues); };
  refresh();
  setTimeout(refresh, 1500);
  setTimeout(refresh, 5000);
}
