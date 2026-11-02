// Only bundled into the isolated native acceptance helper; never imported by App.
import { invoke } from '@tauri-apps/api/core';
import { useCollaborationStore } from '../src/stores/collaborationStore';
import { useRepoStore } from '../src/stores/repoStore';
import { startIntegrationRuntime } from '../src/services/integrations/runtime';
import { collaborationService } from '../src/services/collaboration/CollaborationService';
import { getHostingPlugin } from '../src/services/integrations/plugins';
import { providerHttpRequest } from '../src/services/http/providerHttp';

declare global { interface Window { __AUUGIT_SMOKE_CONFIG__: { server: string; token: string; profile: string } } }
async function run() {
  const checks: string[] = [], { server, token } = window.__AUUGIT_SMOKE_CONFIG__;
  const assert = (condition: unknown, name: string) => { if (!condition) throw new Error(name); checks.push(name); };
  let profile: string | null = null, cleanup: (() => void) | undefined;
  let failure = '';
  const plugin = getHostingPlugin('gitlab')!;
  try {
    const store = useCollaborationStore;
    profile = window.__AUUGIT_SMOKE_CONFIG__.profile;
    assert(profile.startsWith('native-smoke-') && profile !== plugin.defaultProfileId, 'isolated-credential-slot');
    store.setState({ profiles: [{ id: profile, label: 'Isolated native smoke', providerId: 'gitlab', server }], activeProfileId: profile, providerId: 'gitlab', server });
    await store.getState().login(token);
    assert(await plugin.credentials.read(profile) === token, 'native-keyring-round-trip');
    useRepoStore.setState({ currentRepo: { id: 'native-smoke', name: 'Native smoke', path: '/__native_smoke__', currentBranch: 'topic', lastOpenedAt: 0,
      collaborationRemote: { name: 'origin', fetchUrl: `${server}/group/sub/project.git`, pushUrl: `${server}/group/sub/project.git` } } });
    cleanup = startIntegrationRuntime();
    await store.getState().loadRepoData('group/sub', 'project');
    assert(store.getState().repoDetails?.default_branch === 'main' && store.getState().workflows.length === 1, 'native-domain-runtime');
    const owner = 'group/sub', repo = 'project';
    assert((await collaborationService.getIssue(owner, repo, 12)).number === 12, 'issue-read');
    await collaborationService.createIssueComment(owner, repo, 12, 'Native acceptance'); checks.push('issue-comment');
    await collaborationService.createPullRequest(owner, repo, { title: 'Native MR', head: 'topic', base: 'main' }); checks.push('merge-request-create');
    assert((await collaborationService.getPullRequestFiles(owner, repo, 7)).files.length === 1, 'merge-request-diff');
    await collaborationService.createPullRequestReview(owner, repo, 7, { event: 'APPROVE', body: 'Native approval' }); checks.push('review-approve');
    assert((await collaborationService.mergePullRequest(owner, repo, 7, { mergeMethod: 'squash', expectedHeadSha: 'a'.repeat(40) })).merged, 'merge-request-merge');
    await store.getState().openJobLogs(20);
    assert(store.getState().activeJobLogs?.rawLogs.includes('native live trace'), 'native-live-job-logs');
    await collaborationService.dispatchWorkflow(owner, repo, 0, { ref: 'topic', inputs: { dry_run: 'false' } });
    await collaborationService.rerunWorkflow(owner, repo, 10); await collaborationService.cancelWorkflowRun(owner, repo, 10); checks.push('pipeline-dispatch-retry-cancel');
    try { await collaborationService.updateIssue(owner, repo, 12, { title: 'forbidden' }); throw Error('403 unexpectedly accepted'); }
    catch (error) { assert(error instanceof Error && error.message.includes('403'), 'permission-error-visible'); }
    const redirect = await providerHttpRequest('GET', `${server}/redirect`, { 'PRIVATE-TOKEN': token }); assert(redirect.status === 302, 'native-redirect-stopped');
    try { await providerHttpRequest('GET', `${server}/large`, { 'PRIVATE-TOKEN': token }); throw Error('Oversized response accepted'); }
    // 原生路径的 Rust 错误以字符串 reject，浏览器路径才是 Error 实例。
    catch (error) { assert(/too large/i.test(error instanceof Error ? error.message : String(error)), 'native-response-limit'); }
    const controller = new AbortController();
    const pending = providerHttpRequest('GET', `${server}/slow`, {}, undefined, { signal: controller.signal });
    setTimeout(() => controller.abort(), 100);
    try { await pending; throw Error('Cancellation ignored'); } catch (error) { assert(error instanceof DOMException && error.name === 'AbortError', 'native-cancel-acknowledged'); }
  } catch (error) { failure = error instanceof Error ? error.message : String(error); }
  finally {
    cleanup?.();
    if (profile) {
      try { await plugin.credentials.remove(profile); assert(await plugin.credentials.read(profile) === null, 'native-keyring-cleanup'); }
      catch { failure ||= 'Credential cleanup failed'; }
    }
  }
  await invoke('report_integration_smoke', { report: { success: !failure, checks, ...(failure ? { error: failure } : {}) } });
}
// Separate storage from the user's AuuGit profile before persisted modules initialize.
// The runner prepends storage isolation to this bundle, before any imports execute.
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { void run(); }, { once: true });
else void run();
