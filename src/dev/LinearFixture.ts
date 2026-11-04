// Browser acceptance fixture for the Linear task plugin: the real LinearClient and
// task connection channel run against a synthetic GraphQL endpoint. Only HTTP is
// replaced; no real credentials or workspaces.
import type { RepositoryInfo } from '@/services/git/types';
import { startTaskService } from '@/services/integrations/taskService';
import { useTaskStore } from '@/stores/taskStore';
import { useRepoStore } from '@/stores/repoStore';

const GRAPHQL_URL = 'https://api.linear.app/graphql';
const STAMP = '2026-11-04T00:00:00.000Z';

export async function prepareLinearFixture(_repository: RepositoryInfo) {
  const disabledFetch = window.fetch;
  const stamp = STAMP;
  const person = { id: 'user-uuid-1', displayName: 'Alice', name: 'Alice', avatarUrl: '', email: 'alice@fixture' };
  const issue = (identifier: string, number: number, title: string, stateType: string) => ({
    id: `issue-uuid-${number}`, identifier, number, title,
    description: `Run the ${identifier} workflow without any hosting account.`, url: `https://linear.app/acme/issue/${identifier}`,
    createdAt: stamp, updatedAt: stamp, completedAt: stateType === 'completed' ? stamp : null, canceledAt: null,
    state: { type: stateType, name: stateType === 'started' ? 'In Progress' : stateType === 'unstarted' ? 'Todo' : 'Done' },
    creator: person,
    labels: { nodes: [{ id: 'label-uuid-1', name: 'bug', color: '#ff0000' }] },
    assignees: { nodes: [person] },
    comments: { nodes: [] },
  });
  const issues = [issue('ENG-12', 12, 'Linear task without hosting account', 'started'), issue('ENG-13', 13, 'Finished Linear task', 'completed')];
  const json = (data: unknown) => new Response(JSON.stringify({ data }), { headers: { 'content-type': 'application/json' } });
  window.fetch = async (input, init = {}) => {
    const target = input instanceof Request ? input.url : String(input);
    if (target !== GRAPHQL_URL) return disabledFetch(input, init);
    const body = typeof init.body === 'string' ? JSON.parse(init.body) : {};
    const query: string = body.query ?? '';
    const variables = body.variables ?? {};
    if (query.includes('viewer')) {
      // verifyToken 的凭证断言：错误的令牌在建立连接前就失败。
      if (init.headers && new Headers(init.headers).get('Authorization') !== 'Bearer lin_api_fixture') throw new Error('Wrong Linear credential');
      return json({ viewer: { ...person, url: 'https://linear.app/alice' } });
    }
    if (query.includes('issueLabels') && query.includes('color')) return json({ issueLabels: { nodes: [{ id: 'label-uuid-1', name: 'bug', color: '#ff0000', description: null }] } });
    if (query.includes('organization')) return json({ organization: { users: [person] } });
    if (query.includes('workflowStates')) return json({ workflowStates: { nodes: [{ id: 'state-done', type: 'completed', name: 'Done' }, { id: 'state-todo', type: 'unstarted', name: 'Todo' }] } });
    if (query.includes('issues(')) {
      const filter = variables.filter ?? {};
      const matchState = (type: string) => {
        const inTypes = filter.state?.type?.in as string[] | undefined, ninTypes = filter.state?.type?.nin as string[] | undefined;
        if (inTypes) return inTypes.includes(type);
        if (ninTypes) return !ninTypes.includes(type);
        return true;
      };
      const numberFilter = filter.number?.eq as number | undefined;
      const matches = issues.filter(item => matchState(item.state.type) && (numberFilter === undefined || item.number === numberFilter));
      return json({ issues: { nodes: numberFilter === undefined ? matches : matches.map(item => ({ ...item, comments: { nodes: [] } })), pageInfo: { hasNextPage: false } } });
    }
    if (query.includes('issueCreate')) return json({ issueCreate: { success: true, issue: issue('ENG-14', 14, variables.input?.title ?? 'Created', 'unstarted'), lastSyncId: 1 } });
    return json({});
  };
  // PAT 路径建立连接（真实 LinearClient verifyToken 走上面的 GraphQL 桩）。
  await useTaskStore.getState().connectWithToken({ providerId: 'linear', displayName: 'Acme Linear', token: 'lin_api_fixture' });
  // fixture 直接挂 AppLayout（不经 App），任务通道绑定需在此显式启动（同 GitLabFixture 的 startIntegrationRuntime）。
  startTaskService();
  // 建分支桩（同 GitLabFixture）：linear=1 不经过任何托管 fixture，真实 git 调用在 e2e 里被掐断。
  useRepoStore.setState({
    createBranch: async (name, _start, checkout) => {
      useRepoStore.setState(current => ({ branches: [...current.branches.map(branch => ({ ...branch, isCurrent: checkout ? false : branch.isCurrent })), { name, isCurrent: !!checkout, isRemote: false }],
        ...(checkout ? { currentRepo: current.currentRepo && { ...current.currentRepo, currentBranch: name }, status: current.status && { ...current.status, currentBranch: name } } : {}) }));
    },
  });
}
