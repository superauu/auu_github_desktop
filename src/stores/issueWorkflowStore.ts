import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { IssueReference } from '@/services/github/issueTypes';
import { issueKey } from '@/features/issues/issueLogic';

const branchKey = (path: string, branch: string) => JSON.stringify([path, branch]);
const validReference = (value: unknown): value is IssueReference => {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<IssueReference>;
  return typeof item.owner === 'string' && /^[\w.-]+$/.test(item.owner) && typeof item.repo === 'string' && /^[\w.-]+$/.test(item.repo)
    && Number.isSafeInteger(item.number) && Number(item.number) > 0;
};
interface IssueWorkflowState {
  branchIssues: Record<string, IssueReference>;
  requestedIssue: IssueReference | null;
  revisions: Record<string, number>;
  linkBranch: (path: string, branch: string, issue: IssueReference) => void;
  issueForBranch: (path: string, branch: string) => IssueReference | undefined;
  unlinkBranch: (path: string, branch: string) => void;
  refreshIssues: (issues: IssueReference[]) => void;
  openIssue: (issue: IssueReference | null) => void;
}
export const useIssueWorkflowStore = create<IssueWorkflowState>()(persist((set, get) => ({
  branchIssues: {}, requestedIssue: null, revisions: {},
  linkBranch: (path, branch, issue) => set(state => ({ branchIssues: { ...state.branchIssues, [branchKey(path, branch)]: issue } })),
  issueForBranch: (path, branch) => {
    const issue = get().branchIssues[branchKey(path, branch)];
    return validReference(issue) ? issue : undefined;
  },
  unlinkBranch: (path, branch) => set(state => {
    const branchIssues = { ...state.branchIssues };
    delete branchIssues[branchKey(path, branch)];
    return { branchIssues };
  }),
  refreshIssues: issues => set(state => {
    const revisions = { ...state.revisions };
    for (const key of new Set(issues.filter(validReference).map(issueKey))) revisions[key] = (revisions[key] || 0) + 1;
    return { revisions };
  }),
  openIssue: issue => set({ requestedIssue: issue }),
}), {
  name: 'auugit-issue-branches', storage: createJSONStorage(() => localStorage), partialize: state => ({ branchIssues: state.branchIssues }),
  merge: (persisted, current) => {
    const raw = persisted && typeof persisted === 'object' ? (persisted as Partial<IssueWorkflowState>).branchIssues : null;
    const branchIssues = raw && typeof raw === 'object' && !Array.isArray(raw)
      ? Object.fromEntries(Object.entries(raw).filter(([, value]) => validReference(value))) : {};
    return { ...current, branchIssues };
  },
}));
