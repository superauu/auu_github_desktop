// Browser acceptance fixture uses the real GitLab adapter and domain runtime.
// Only HTTP responses and local Git writes are replaced; no real credentials or repositories.
import type { RepositoryInfo } from '@/services/git/types';
import { gitService } from '@/services/git/GitService';
import { setPluginEnabled } from '@/services/integrations/plugins';
import { startIntegrationRuntime } from '@/services/integrations/runtime';
import { useCollaborationStore } from '@/stores/collaborationStore';
import { useRepoStore } from '@/stores/repoStore';
import { useIssueWorkflowStore } from '@/stores/issueWorkflowStore';

export async function prepareGitLabFixture(repository: RepositoryInfo) {
  const disabledFetch = window.fetch, writes: { path: string; body: any }[] = [];
  const prefix = new URLSearchParams(location.search).get('instancePrefix') === '1' ? '/gitlab' : '';
  const server = `https://gitlab.fixture${prefix}`;
  const stamp = '2026-11-01T00:00:00Z', base = `${server}/group/sub/project`;
  const person = { id: 1, username: 'alice', name: 'Alice', avatar_url: '', web_url: 'https://gitlab.fixture/alice' };
  const project = { id: 42, name: 'Project', path: 'project', path_with_namespace: 'group/sub/project', default_branch: 'main', visibility: 'private', web_url: base };
  const issues = [{ id: 120, iid: 12, title: 'GitLab primary workflow', state: 'opened', author: person, labels: ['bug'], assignees: [person],
    description: 'Run the complete workflow with the GitHub plugin disabled.', web_url: `${base}/-/issues/12`, created_at: stamp, updated_at: stamp }];
  const notes: any[] = [], pulls: any[] = [];
  const pipeline = { id: 10, iid: 2, name: 'GitLab pipeline', status: 'running', sha: 'a'.repeat(40), ref: repository.currentBranch,
    created_at: stamp, updated_at: stamp, web_url: `${base}/-/pipelines/10`, user: person };
  const job = { id: 20, name: 'GitLab tests', status: 'running', pipeline: { id: 10 }, web_url: `${base}/-/jobs/20` };
  const definition = 'spec:\n  inputs:\n    dry_run:\n      type: boolean\n      default: false\n---\ntest:\n  script: echo test\n';
  const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
  window.fetch = async (input, init = {}) => {
    const target = input instanceof Request ? input.url : String(input);
    if (!target.startsWith(`${server}/api/v4/`)) return disabledFetch(input, init);
    const url = new URL(target), method = init.method ?? 'GET', body = typeof init.body === 'string' ? JSON.parse(init.body) : {};
    if (new Headers(init.headers).get('PRIVATE-TOKEN') !== 'fixture-gitlab-pat') throw new Error('Wrong GitLab credential');
    const route = url.pathname.slice(prefix.length).replace('/api/v4/projects/group%2Fsub%2Fproject', '');
    if (method !== 'GET') { writes.push({ path: route, body }); document.documentElement.dataset.gitlabFixtureWrites = JSON.stringify(writes); }
    if (url.pathname === `${prefix}/api/v4/user`) return json(person);
    if (!route) return json(project);
    if (route === '/issues') {
      if (method === 'POST') { const created = { ...issues[0], id: 130, iid: 13, title: body.title, description: body.description, web_url: `${base}/-/issues/13` }; issues.push(created); return json(created); }
      return json(issues.filter(item => (url.searchParams.get('state') === 'all' || item.state === url.searchParams.get('state')) && item.title.toLowerCase().includes((url.searchParams.get('search') ?? '').toLowerCase())));
    }
    const issue = issues.find(item => route.startsWith(`/issues/${item.iid}`));
    if (issue && route.endsWith('/related_merge_requests')) return json(pulls);
    if (issue && route.endsWith('/notes')) {
      if (method === 'POST') { const note = { id: notes.length + 1, author: person, body: body.body, created_at: stamp, updated_at: stamp }; notes.push(note); return json(note); }
      return json(notes);
    }
    if (issue) { if (body.state_event) issue.state = body.state_event === 'close' ? 'closed' : 'opened'; if (body.title) issue.title = body.title; return json(issue); }
    if (route === '/labels') return json([{ id: 1, name: 'bug', color: '#ff0000' }]);
    if (route === '/members/all') return json([person]);
    if (route === '/merge_requests') {
      if (method === 'POST') {
        const mr = { id: 70, iid: 7, title: body.title, state: 'opened', sha: 'a'.repeat(40), source_branch: body.source_branch, target_branch: body.target_branch,
          author: person, web_url: `${base}/-/merge_requests/7`, description: body.description, created_at: stamp, updated_at: stamp,
          diff_refs: { base_sha: 'b'.repeat(40), head_sha: 'a'.repeat(40), start_sha: 'c'.repeat(40) } };
        pulls.push(mr); return json(mr);
      }
      return json(pulls.filter(item => url.searchParams.get('state') === 'all' || item.state === url.searchParams.get('state')));
    }
    if (route === '/merge_requests/7/merge') { pulls[0].state = 'merged'; pulls[0].merged_at = stamp; return json(pulls[0]); }
    if (route === '/merge_requests/7/approvals') return json({ approved_by: [] });
    if (route === '/merge_requests/7/approve') return json({ approved: true });
    if (route === '/merge_requests/7/notes' || route === '/merge_requests/7/discussions') return json(method === 'GET' ? [] : { id: 1 });
    if (route === '/merge_requests/7/diffs') return json([{ old_path: 'a.ts', new_path: 'a.ts', diff: '@@ -1 +1 @@\n-old\n+new' }]);
    if (route === '/merge_requests/7') return json(pulls[0]);
    if (route === '/pipelines') return json([pipeline]);
    if (route === '/pipelines/10') return json(pipeline);
    if (route === '/pipelines/10/jobs') return json([job]);
    if (route === '/jobs/20') return json(job);
    if (route === '/jobs/20/trace') return new Response('GitLab live trace: tests passed');
    if (route.includes('/repository/files/')) return new Response(definition);
    if (route === '/pipeline' || route === '/pipelines/10/retry' || route === '/pipelines/10/cancel') return json(pipeline);
    if (route.includes('/repository/commits/') && route.endsWith('/statuses')) return json([]);
    throw new Error(`Unexpected GitLab fixture route: ${method} ${route}`);
  };
  document.documentElement.dataset.gitlabFixtureWrites = '[]';
  // 夹具副作用只属于本次页面会话：离开时恢复原有插件启停，避免 ?gitlab=1 污染后续普通 dev 会话。
  const previousDisabledPlugins = localStorage.getItem('auu_git_disabled_plugins');
  window.addEventListener('pagehide', () => {
    if (previousDisabledPlugins === null) localStorage.removeItem('auu_git_disabled_plugins');
    else localStorage.setItem('auu_git_disabled_plugins', previousDisabledPlugins);
  }, { once: true });
  setPluginEnabled('github', false);
  const state = useCollaborationStore.getState();
  state.selectProvider('gitlab', server); await state.login('fixture-gitlab-pat');
  const remote = { name: 'origin', fetchUrl: 'git@gitlab.fixture:group/sub/project.git', pushUrl: 'git@gitlab.fixture:group/sub/project.git' };
  gitService.getOriginUrl = async () => remote.fetchUrl;
  gitService.getPushContext = async (_path, branch = useRepoStore.getState().currentRepo?.currentBranch ?? 'main') => ({ branch, remote: 'origin', targetBranch: branch, upstream: `origin/${branch}`, remotes: [remote], ahead: 0, behind: 0 });
  useIssueWorkflowStore.persist.setOptions({ storage: { getItem: () => null, setItem() {}, removeItem() {} } });
  useIssueWorkflowStore.setState({ branchIssues: {}, requestedIssue: null });
  useRepoStore.setState({ currentRepo: { ...repository, collaborationRemote: remote }, activeTab: 'issues',
    createBranch: async (name, _start, checkout) => {
      useRepoStore.setState(current => ({ branches: [...current.branches.map(branch => ({ ...branch, isCurrent: checkout ? false : branch.isCurrent })), { name, isCurrent: !!checkout, isRemote: false }],
        ...(checkout ? { currentRepo: current.currentRepo && { ...current.currentRepo, currentBranch: name }, status: current.status && { ...current.status, currentBranch: name } } : {}) }));
    },
  });
  startIntegrationRuntime();
}
