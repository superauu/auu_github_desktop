// Development-only adapter. Every write stays in this browser tab's memory.
import { githubService } from '@/services/github/GitHubService';
import type { GitHubIssue, IssueInput } from '@/services/github/issueTypes';
import type { GitHubPullRequest } from '@/services/github/types';
import type { RepositoryInfo } from '@/services/git/types';
import { gitService } from '@/services/git/GitService';
import { useGitHubStore } from '@/stores/githubStore';
import { useRepoStore } from '@/stores/repoStore';
import { useIssueWorkflowStore } from '@/stores/issueWorkflowStore';
import { aiCommitService } from '@/services/ai/AiCommitService';
import { withIssueReferences } from '@/services/ai/issueContext';
import { parseDiffOutput } from '@/services/git/PorcelainParser';

export function prepareIssueFixture(repository: RepositoryInfo) {
  const diffText = 'diff --git a/task.ts b/task.ts\n--- a/task.ts\n+++ b/task.ts\n@@ -1 +1 @@\n-before\n+after\n';
  const disabledFetch = window.fetch;
  // Review evidence reads the bridge directly. Serve only its exact read shape
  // for this synthetic repository; every other bridge/external call stays blocked.
  window.fetch = async (input, init) => {
    if (input === '/api/git' && init?.method === 'POST' && typeof init.body === 'string') {
      const data = JSON.parse(init.body);
      if (data.cwd === repository.path && Array.isArray(data.args) && data.args[0] === '-c' && data.args[1] === 'core.quotepath=false'
        && data.args[2] === '--literal-pathspecs' && data.args[3] === 'diff' && data.args.includes('--full-index')) {
        return new Response(JSON.stringify({ stdout: diffText, stderr: '', code: 0 }), { headers: { 'Content-Type': 'application/json' } });
      }
    }
    return disabledFetch(input, init);
  };
  const stamp = '2026-10-30T00:00:00Z', user = { login: 'fixture-user', avatar_url: '' };
  const labels = [{ id: 1, name: 'bug', color: 'd73a4a' }, { id: 2, name: 'enhancement', color: 'a2eeef' }];
  const issue = (number: number, title: string, state: 'open' | 'closed' = 'open'): GitHubIssue => ({
    id: number, number, title, body: 'Keep issue details, comments and the pull request connected.', state, state_reason: state === 'closed' ? 'completed' : null,
    html_url: `https://github.com/fixture/project/issues/${number}`, user, labels: [labels[0]], assignees: [user], comments: 0, created_at: stamp, updated_at: stamp, closed_at: state === 'closed' ? stamp : null,
  });
  const issues = [issue(12, 'Connect issue and PR workflow'), issue(13, 'Completed keyboard navigation', 'closed')];
  const comments = new Map<number, { id: number; user: typeof user; body: string; created_at: string; updated_at: string }[]>();
  const prs: GitHubPullRequest[] = [];
  const writes: { kind: string; data: unknown }[] = [];
  const record = (kind: string, data: unknown) => { writes.push({ kind, data }); document.documentElement.dataset.issueFixtureWrites = JSON.stringify(writes); };
  document.documentElement.dataset.issueFixtureWrites = '[]';
  const clone = <T,>(data: T): T => structuredClone(data);
  githubService.searchIssues = async (_owner, _repo, options) => {
    const all = issues.filter(item => (options.state === 'all' || item.state === options.state)
      && (!options.query || `${item.title} ${item.body}`.toLowerCase().includes(options.query.toLowerCase()))
      && (!options.label || item.labels.some(label => label.name === options.label))
      && (!options.assignee || item.assignees.some(person => person.login === options.assignee)));
    return clone({ items: all.slice((options.page - 1) * 30, options.page * 30), total_count: all.length, incomplete_results: false });
  };
  githubService.getIssue = async (_owner, _repo, number) => { const found = issues.find(item => item.number === number); if (!found) throw new Error('Issue not found'); return clone(found); };
  githubService.getIssueLabels = async () => clone(labels);
  githubService.getIssueAssignees = async () => [user, { login: 'reviewer' }];
  const apply = (target: GitHubIssue, data: Partial<IssueInput> & { state?: 'open' | 'closed'; state_reason?: 'completed' | 'not_planned' | 'reopened' }) => {
    if (data.title !== undefined) target.title = data.title;
    if (data.body !== undefined) target.body = data.body;
    if (data.labels) target.labels = data.labels.map(name => labels.find(label => label.name === name)!);
    if (data.assignees) target.assignees = data.assignees.map(login => ({ login }));
    if (data.state) { target.state = data.state; target.closed_at = data.state === 'closed' ? stamp : null; }
    if (data.state_reason) target.state_reason = data.state_reason;
  };
  githubService.createIssue = async (_owner, _repo, data) => { const created = issue(Math.max(...issues.map(item => item.number)) + 1, data.title); apply(created, data); issues.unshift(created); record('create-issue', data); return clone(created); };
  githubService.updateIssue = async (_owner, _repo, number, data) => { const target = issues.find(item => item.number === number)!; apply(target, data); record('update-issue', { number, ...data }); return clone(target); };
  githubService.getIssueComments = async (_owner, _repo, number) => clone(comments.get(number) || []);
  githubService.createIssueComment = async (_owner, _repo, number, body) => { const entry = { id: writes.length + 1, body, user, created_at: stamp, updated_at: stamp }; comments.set(number, [...(comments.get(number) || []), entry]); record('comment', { number, body }); return clone(entry); };
  githubService.getIssueTimeline = async (_owner, _repo, number) => prs.filter(pr => pr.body?.includes(`fixture/project#${number}`)).map(pr => ({ event: 'cross-referenced', source: { issue: { number: pr.number, title: pr.title, state: pr.state, html_url: pr.html_url, pull_request: { merged_at: pr.merged_at } } } }));
  githubService.getRepositoryDefaultBranch = async () => 'main';
  githubService.getPullRequests = async () => clone(prs);
  githubService.getPullRequest = async (_owner, _repo, number) => clone(prs.find(pr => pr.number === number)!);
  const workflow = new URLSearchParams(location.search).get('workflow') === '1';
  githubService.getPullRequestReviews = async () => workflow ? [{ id: 1, user, state: 'APPROVED', body: 'Reviewed in fixture', submitted_at: stamp }] : [];
  githubService.getCommitChecks = async () => [];
  githubService.getWorkflowCheckRuns = async () => ({ total_count: 1, check_runs: [{ id: 1, name: 'Tests', head_sha: '1'.repeat(40), status: 'completed', conclusion: 'success', started_at: stamp, completed_at: stamp, html_url: 'https://github.com/fixture/project/actions/runs/1' }] });
  let failLegacyOnce = new URLSearchParams(location.search).get('failLegacy') === '1';
  githubService.getWorkflowCommitStatuses = async () => {
    if (failLegacyOnce) { failLegacyOnce = false; throw new Error('Legacy CI permission denied'); }
    return { total_count: 1, statuses: [{ id: 2, context: 'External CI', state: 'success' }] };
  };
  aiCommitService.generateCommitMessageResult = async options => {
    record('generate-commit', { issueContext: options.issueContext || [] });
    return { message: withIssueReferences('fix: update workflow', options.issueContext), source: 'builtin', fallback: false };
  };
  aiCommitService.generatePRDescriptionResult = async options => {
    record('generate-pr', { issueContext: options.issueContext || [] });
    return { message: withIssueReferences('Describe workflow changes.', options.issueContext), source: 'builtin', fallback: false };
  };
  githubService.createPullRequest = async (_owner, _repo, data) => {
    const created = { id: 100 + prs.length, number: 100 + prs.length, title: data.title, body: data.body || '', state: 'open', draft: false,
      html_url: `https://github.com/fixture/project/pull/${100 + prs.length}`, user, created_at: stamp, updated_at: stamp, merged_at: null,
      head: { ref: data.head, sha: '1'.repeat(40), label: `fixture:${data.head}` }, base: { ref: data.base, sha: '2'.repeat(40), label: `fixture:${data.base}` }, labels: [], } as GitHubPullRequest;
    prs.unshift(created); record('create-pr', data); return clone(created);
  };
  githubService.mergePullRequest = async (_owner, _repo, number) => {
    const target = prs.find(pr => pr.number === number)!;
    target.state = 'closed'; target.merged_at = stamp;
    if (target.base.ref === 'main') {
      for (const match of (target.body || '').matchAll(/Closes fixture\/project#(\d+)/g)) {
        const related = issues.find(item => item.number === Number(match[1]));
        if (related) { related.state = 'closed'; related.state_reason = 'completed'; related.closed_at = stamp; }
      }
    }
    record('merge-pr', { number });
    return { merged: true, message: 'Merged in fixture' };
  };
  gitService.getPushContext = async (_path, branch = repository.currentBranch) => ({ branch, remote: 'origin', targetBranch: branch, upstream: `origin/${branch}`, remotes: [{ name: 'origin', fetchUrl: 'https://github.com/fixture/project.git', pushUrl: 'https://github.com/fixture/project.git' }], ahead: 0, behind: 0 });
  gitService.getFileDiff = async () => parseDiffOutput(diffText);
  useIssueWorkflowStore.persist.setOptions({ storage: { getItem: () => null, setItem() {}, removeItem() {} } });
  useIssueWorkflowStore.setState({ branchIssues: {}, requestedIssue: null });
  if (workflow) {
    useIssueWorkflowStore.getState().linkBranch(repository.path, repository.currentBranch, { owner: 'fixture', repo: 'project', number: 12 });
    prs.push({ id: 90, number: 90, title: 'Implement linked workflow', body: 'Closes fixture/project#12', state: 'open', merged_at: null,
      html_url: 'https://github.com/fixture/project/pull/90', user, created_at: stamp, updated_at: stamp,
      head: { ref: repository.currentBranch, sha: '1'.repeat(40), label: `fixture:${repository.currentBranch}` }, base: { ref: 'main', sha: '2'.repeat(40) }, labels: [],
    });
  }
  useGitHubStore.setState({ currentOwner: 'fixture', currentRepoName: 'project', activeProfileId: 'issue-fixture', token: null, isAuthenticated: true, user: null,
    pullRequests: [], selectedPR: null, repoDetails: { id: 1, name: 'project', full_name: 'fixture/project', default_branch: 'main', private: false, html_url: 'https://github.com/fixture/project', description: null, stargazers_count: 0, forks_count: 0, open_issues_count: 1 },
  });
  useRepoStore.setState({ currentRepo: { ...repository, isGitHubRepo: true, gitHubRemote: 'origin' }, activeTab: 'issues',
    createBranch: async (name, startPoint, checkout) => {
      record('create-branch', { name, startPoint, checkout });
      useRepoStore.setState(state => ({ branches: [...state.branches.map(branch => ({ ...branch, isCurrent: checkout ? false : branch.isCurrent })), { name, isCurrent: !!checkout, isRemote: false }],
        ...(checkout ? { currentRepo: state.currentRepo && { ...state.currentRepo, currentBranch: name }, status: state.status && { ...state.status, currentBranch: name } } : {}),
      }));
    },
    checkoutBranch: async name => {
      useRepoStore.setState(state => ({ branches: state.branches.map(branch => ({ ...branch, isCurrent: branch.name === name })),
        currentRepo: state.currentRepo && { ...state.currentRepo, currentBranch: name }, status: state.status && { ...state.status, currentBranch: name },
      }));
    },
  });
}
