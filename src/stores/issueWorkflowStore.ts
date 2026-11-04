import { useIntegrationStore } from '@/stores/integrationStore';
import { useTaskStore } from '@/stores/taskStore';
import { getTaskPlugin, installedHostingPlugins } from '@/services/integrations/plugins';
import { scopeIssueReference } from '@/services/integrations/links';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { IssueReference } from '@/services/collaboration/issueTypes';
import { issueKey } from '@/features/issues/issueLogic';

const branchKey = (path: string, branch: string) => JSON.stringify([path, branch]);
const validReference = (value: unknown): value is IssueReference => {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<IssueReference>;
  return typeof item.owner === 'string' && /^[\w.-]+(?:\/[\w.-]+)*$/.test(item.owner) && typeof item.repo === 'string' && /^[\w.-]+$/.test(item.repo)
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
  linkBranch: (path, branch, issue) => set(state => ({ branchIssues: { ...state.branchIssues, [branchKey(path, branch)]: scopeIssueReference(issue) } })),
  issueForBranch: (path, branch) => {
    const issue = get().branchIssues[branchKey(path, branch)];
    // 独立任务系统引用按任务连接存在性校验——不套托管绑定（GitHub 仓库也能挂
    // Linear 任务）；托管引用维持绑定匹配，防串平台的陈旧关联复活。
    if (issue?.providerId && getTaskPlugin(issue.providerId)) {
      const connected = useTaskStore.getState().connections.some(connection =>
        connection.providerId === issue.providerId && connection.enabled && connection.domains.includes('task-tracking'));
      return connected && validReference(issue) ? issue : undefined;
    }
    const binding = useIntegrationStore.getState().binding;
    if (binding && issue?.providerId && (issue.providerId !== binding.providerId || issue.server !== binding.server)) return undefined;
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
      ? Object.fromEntries(Object.entries(raw).filter(([, value]) => validReference(value)).map(([key, value]) => [key, value.providerId ? value : installedHostingPlugins().find(plugin => plugin.migrateIssueReference)?.migrateIssueReference?.(value) ?? value])) : {};
    return { ...current, branchIssues };
  },
}));
