/** Deterministic, network-free fixture for the production ci-cd UI and Jenkins adapter. Dev entry only. */
import { useCiStore } from '@/stores/ciStore';
import { useCollaborationStore } from '@/stores/collaborationStore';
import { bindCollaborationClient } from '@/services/collaboration/CollaborationService';
import { GITHUB_PROVIDER } from '@/plugins/manifests';
import type { RepositoryInfo } from '@/services/git/types';

export async function prepareJenkinsFixture(repo: RepositoryInfo) {
  const origin = 'https://ci.fixture.test';
  const fixtureUser = new URLSearchParams(location.search).get('readonly') === '1' ? 'reader' : 'alice';
  const fallback = window.fetch;
  const requests: { method: string; path: string; scenario?: string }[] = [];
  const now = Date.now();
  const builds = [
    { number: 2, displayName: '#2 long', building: true, result: null as string | null, timestamp: now, duration: 1000 },
    { number: 1, displayName: '#1 success', building: false, result: 'SUCCESS', timestamp: now - 10000, duration: 2000 },
  ];
  let queued = true, offset = 0;
  const definitions = [
    { name: 'SCENARIO', type: 'ChoiceParameterDefinition', choices: ['success', 'failure', 'unstable', 'long', 'log-heavy'], defaultParameterValue: { value: 'success' } },
    { name: 'BRANCH', type: 'StringParameterDefinition', defaultParameterValue: { value: 'main' } },
  ];
  const json = (data: unknown, status = 200) => new Response(status === 204 ? null : JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
  window.fetch = async (input, options = {}) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.origin !== origin) return fallback(input, options);
    const method = options.method ?? 'GET';
    const params = new URLSearchParams(typeof options.body === 'string' ? options.body : '');
    requests.push({ method, path: url.pathname, scenario: params.get('SCENARIO') ?? undefined });
    document.documentElement.dataset.jenkinsRequests = JSON.stringify(requests);
    if (url.pathname === '/whoAmI/api/json') return json({ authenticated: true, name: fixtureUser });
    if (method === 'POST' && fixtureUser === 'reader') return json({ error: 'Forbidden' }, 403);
    if (url.pathname === '/queue/api/json') return json({ items: queued ? [{ id: 7, inQueueSince: now + 1000, task: { url: `${origin}/job/auugit-mock/`, name: 'auugit-mock' } }] : [] });
    if (url.pathname === '/queue/cancelItem' && method === 'POST') { queued = false; return json(null, 204); }
    if (url.pathname === '/job/auugit-mock/api/json') return json({ name: 'auugit-mock', fullName: 'auugit-mock', buildable: true, builds, property: [{ parameterDefinitions: definitions }] });
    if (url.pathname === '/job/auugit-mock/buildWithParameters' && method === 'POST') {
      const scenario = params.get('SCENARIO') ?? 'success';
      const number = Math.max(...builds.map(build => build.number)) + 1;
      builds.unshift({ number, displayName: `#${number} ${scenario}`, building: scenario === 'long', result: scenario === 'failure' ? 'FAILURE' : scenario === 'unstable' ? 'UNSTABLE' : scenario === 'long' ? null : 'SUCCESS', timestamp: Date.now(), duration: 1000 });
      return json({}, 201);
    }
    const buildMatch = url.pathname.match(/^\/job\/auugit-mock\/(\d+)\/(.*)$/);
    const build = buildMatch && builds.find(build => build.number === Number(buildMatch[1]));
    if (!build || !buildMatch) return json({ error: 'Not found' }, 404);
    const suffix = buildMatch[2];
    if (suffix === 'api/json') return json(build);
    if (suffix === 'stop' && method === 'POST') { build.building = false; build.result = 'ABORTED'; return json({}, 200); }
    if (suffix === 'wfapi/describe') return json({ stages: ['Prepare', 'Build', 'Test', 'Package'].map((name, index) => ({ id: String(index + 1), name,
      status: build.building && name === 'Build' ? 'IN_PROGRESS' : build.result === 'FAILURE' && name === 'Test' ? 'FAILED' : 'SUCCESS', startTimeMillis: now, durationMillis: 200 })) });
    if (suffix === 'logText/progressiveText') {
      const text = Number(url.searchParams.get('start')) === 0 ? 'Jenkins fixture 中文日志\nAUUGIT_HEARTBEAT\n' : 'next heartbeat\n';
      offset = Number(url.searchParams.get('start')) + new TextEncoder().encode(text).length;
      return new Response(text, { status: 200, headers: { 'x-text-size': String(offset), ...(build.building ? { 'x-more-data': 'true' } : {}) } });
    }
    return json({ error: 'Not found' }, 404);
  };
  if (new URLSearchParams(location.search).get('unconnected') !== '1') {
    await useCiStore.getState().connect({ providerId: 'jenkins', displayName: 'Local Jenkins', baseUrl: origin, username: fixtureUser, token: 'fixture-token', repoPath: repo.path, jobPaths: ['auugit-mock'] });
  }
  if (new URLSearchParams(location.search).get('hosting') === '1') {
    useCollaborationStore.setState({ providerId: 'github', currentOwner: 'acme', currentRepoName: 'demo', isAuthenticated: true,
      profiles: [{ id: 'fixture-github', label: 'GitHub', providerId: 'github', server: 'https://github.com' }] });
    bindCollaborationClient({ setToken() {}, verifyToken: async () => ({ login: 'alice', id: 1, name: 'Alice', avatar_url: '', email: null, bio: null, public_repos: 0, html_url: '' }),
      ciCd: { getWorkflows: async () => [{ id: 'github-ci', name: 'Existing GitHub Actions', path: '.github/workflows/ci.yml', state: 'active', html_url: '', badge_url: '' }],
      getWorkflowRuns: async () => [], getRunJobs: async () => [] } }, GITHUB_PROVIDER);
  }
}
