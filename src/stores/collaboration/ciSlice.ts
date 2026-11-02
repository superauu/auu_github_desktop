import { collaborationService, hasCollaborationOperation } from '@/services/collaboration/CollaborationService';
import { getHostingPlugin } from '@/services/integrations/plugins';
import { activeProviderId } from './activeProvider';
import { toast } from '@/stores/toastStore';
import { tNow } from '@/i18n';
import type { CollaborationState } from '../collaborationStore';
import type { CollaborationSliceContext } from './sliceContext';
export function createCiSlice({ get, set, ticket, generation }: CollaborationSliceContext) {
  let pushWatchTimer: ReturnType<typeof setTimeout> | null = null;
  let pushWatchedSha: string | null = null;
  let pushWatchRevision = 0;
  const stopWatch = () => {
    pushWatchRevision++;
    if (pushWatchTimer) clearTimeout(pushWatchTimer);
    pushWatchTimer = null; pushWatchedSha = null;
  };
  const actions: Pick<CollaborationState, 'refreshActions' | 'selectWorkflow' | 'selectRun' | 'fetchCommitChecks' | 'openJobLogs' | 'closeJobLogs' | 'openWorkflowYaml' | 'closeWorkflowYaml' | 'openDispatchModal' | 'closeDispatchModal' | 'dispatchWorkflow' | 'rerunWorkflowRun' | 'cancelWorkflowRun' | 'watchPushChecks'> = {
    refreshActions: async () => {
      const { currentOwner: owner, currentRepoName: repo, selectedWorkflow } = get();
      if (!owner || !repo || !hasCollaborationOperation('getWorkflowRuns')) return;
      const valid = ticket('runs');
      const jobsValid = ticket('jobs');
      set({ isRefreshingActions: true, error: null });
      try {
        // A workflow-definition failure must not discard fresh runs or job progress.
        const workflowsRequest = collaborationService.getWorkflows(owner, repo).then(
          (workflows) => { if (valid()) set({ workflows }); },
          (error) => { if (valid()) set({ error: String(error?.message || error) }); },
        );
        const runs = await collaborationService.getWorkflowRuns(owner, repo, selectedWorkflow?.id);
        if (!valid()) return;
        set({ workflowRuns: runs, isLoadingRuns: false });
        if (jobsValid()) {
          const previous = get().selectedRun;
          const selectedRun = runs.find((run) => run.id === previous?.id)
            || (previous ? await collaborationService.getWorkflowRun(owner, repo, previous.id) : runs[0] || null);
          if (!valid() || !jobsValid()) return;
          set({ selectedRun, selectedRunJobs: [], isLoadingJobs: !!selectedRun });
          const jobs = selectedRun ? await collaborationService.getRunJobs(owner, repo, selectedRun.id) : [];
          if (valid() && jobsValid()) set({ selectedRunJobs: jobs });
        }
        await workflowsRequest;
      } catch (error: any) { if (valid()) set({ error: String(error?.message || error) }); }
      finally { if (valid()) set({ isRefreshingActions: false }); if (jobsValid()) set({ isLoadingJobs: false }); }
    },
    selectWorkflow: async (workflow) => {
      const valid = ticket('runs'); ticket('jobs'); ticket('repo');
      set({ isLoading: false, isRefreshingActions: false, isLoadingRuns: false, isLoadingJobs: false, error: null, selectedWorkflow: workflow, workflowRuns: [], selectedRun: null, selectedRunJobs: [] });
      const { currentOwner: owner, currentRepoName: repo } = get();
      if (!owner || !repo || !hasCollaborationOperation('getWorkflowRuns')) return;
      set({ isLoadingRuns: true });
      try {
        const runs = await collaborationService.getWorkflowRuns(owner, repo, workflow?.id);
        if (!valid()) return;
        set({ workflowRuns: runs, isLoadingRuns: false });
        await get().selectRun(runs[0] || null);
      } catch (error: any) { if (valid()) set({ error: error.message }); }
      finally { if (valid()) set({ isLoadingRuns: false }); }
    },
    selectRun: async (run) => {
      const valid = ticket('jobs'); ticket('repo');
      set({ isLoading: false, isLoadingJobs: false, selectedRun: run, selectedRunJobs: [] });
      const { currentOwner: owner, currentRepoName: repo } = get();
      if (!run || !owner || !repo) return;
      set({ isLoadingJobs: true });
      try {
        const jobs = await collaborationService.getRunJobs(owner, repo, run.id);
        if (valid()) set({ selectedRunJobs: jobs });
      } catch (error: any) { if (valid()) set({ error: error.message }); }
      finally { if (valid()) set({ isLoadingJobs: false }); }
    },
    fetchCommitChecks: async (sha) => {
      const { currentOwner: owner, currentRepoName: repo } = get();
      if (!owner || !repo || !hasCollaborationOperation('getCommitChecks')) return [];
      const cached = get().commitChecks[sha];
      if (cached?.length && cached.every((check) => check.status === 'completed')) return cached;
      const valid = ticket(`checks:${sha}`);
      try {
        const checks = await collaborationService.getCommitChecks(owner, repo, sha);
        if (!valid()) return [];
        set((state) => ({ commitChecks: { ...state.commitChecks, [sha]: checks }, commitCheckErrors: { ...state.commitCheckErrors, [sha]: '' } }));
        return checks;
      } catch (error) {
        if (valid()) set(state => ({ commitCheckErrors: { ...state.commitCheckErrors, [sha]: String(error) } }));
        return [];
      }
    },
    openJobLogs: async (jobId, jobName) => {
      const valid = ticket('logs');
      const { currentOwner: owner, currentRepoName: repo } = get();
      if (!owner || !repo || !hasCollaborationOperation('getWorkflowRuns')) return;
      const name = jobName || tNow('ci.jobFallback').replace('{id}', String(jobId));
      const knownJob = get().selectedRunJobs.find(job => job.id === jobId);
      let htmlUrl = knownJob?.html_url;
      const previous = get().activeJobLogs;
      set({ isLogsModalOpen: true, activeJobLogs: previous?.jobId === jobId && previous.live ? previous : { jobId, jobName: name, rawLogs: '', state: 'loading', htmlUrl } });
      try {
        const job = await collaborationService.getJob(owner, repo, jobId);
        if (!valid()) return;
        htmlUrl = job.html_url;
        if (job.status !== 'completed' && !getHostingPlugin(activeProviderId(get()) ?? '')?.supportsLiveJobLogs) {
          set({ activeJobLogs: { jobId, jobName: name, rawLogs: '', state: 'waiting', htmlUrl } });
          return;
        }
        const logs = await collaborationService.getJobLogs(owner, repo, jobId);
        if (valid()) set({ activeJobLogs: { ...logs, jobName: jobName || logs.jobName, state: 'ready', htmlUrl, live: job.status !== 'completed' } });
      } catch (error: any) {
        if (valid()) set({ activeJobLogs: { jobId, jobName: name, rawLogs: '', state: 'error', error: String(error?.message || error), htmlUrl } });
      }
    },
    closeJobLogs: () => { ticket('logs'); set({ isLogsModalOpen: false, activeJobLogs: null }); },
    openWorkflowYaml: async (workflow) => {
      const valid = ticket('yaml');
      const { currentOwner: owner, currentRepoName: repo } = get();
      if (!owner || !repo || !hasCollaborationOperation('getWorkflowRuns')) return;
      set({ isYamlModalOpen: true, activeWorkflowYaml: { path: workflow.path, content: 'Loading…' } });
      try {
        const yaml = await collaborationService.getWorkflowYaml(owner, repo, workflow.path);
        if (valid()) set({ activeWorkflowYaml: yaml });
      } catch (error: any) { if (valid()) set({ activeWorkflowYaml: { path: workflow.path, content: error.message } }); }
    },
    closeWorkflowYaml: () => { ticket('yaml'); set({ isYamlModalOpen: false, activeWorkflowYaml: null }); },
    openDispatchModal: (workflow) => { ticket('dispatch'); set({ isDispatchModalOpen: true, dispatchTargetWorkflow: workflow }); },
    closeDispatchModal: () => { ticket('dispatch'); set({ isDispatchModalOpen: false, dispatchTargetWorkflow: null }); },
    dispatchWorkflow: async (ref, inputs) => {
      const { currentOwner: owner, currentRepoName: repo, dispatchTargetWorkflow: workflow } = get();
      if (!owner || !repo || !workflow) return;
      const valid = ticket('dispatch');
      try {
        await collaborationService.dispatchWorkflow(owner, repo, workflow.id, { ref, inputs });
        if (!valid()) return;
        toast.success(tNow('ci.dispatchSubmitted')); get().closeDispatchModal();
        await get().refreshActions();
      } catch (error: any) { if (valid()) throw error; }
    },
    rerunWorkflowRun: async (runId, failedOnly = false) => {
      const { currentOwner: owner, currentRepoName: repo } = get();
      if (!owner || !repo || !hasCollaborationOperation('getWorkflowRuns')) return;
      const valid = ticket('rerun');
      try {
        await collaborationService.rerunWorkflow(owner, repo, runId, failedOnly);
        if (valid()) { toast.success(tNow('ci.rerunRequested')); await get().refreshActions(); }
      } catch (error: any) { if (valid()) toast.error(tNow('ci.rerunFailed'), error.message); }
    },
    cancelWorkflowRun: async (runId) => {
      const { currentOwner: owner, currentRepoName: repo } = get();
      if (!owner || !repo || !hasCollaborationOperation('getWorkflowRuns')) return;
      const valid = ticket('cancel');
      try {
        await collaborationService.cancelWorkflowRun(owner, repo, runId);
        if (valid()) { toast.info(tNow('ci.cancelRequested')); await get().refreshActions(); }
      } catch (error: any) { if (valid()) toast.error(tNow('ci.cancelFailed'), error.message); }
    },
    watchPushChecks: (sha) => {
      const { currentOwner: owner, currentRepoName: repo } = get();
      if (!hasCollaborationOperation('getCommitChecks') || !owner || !repo || !sha || (pushWatchedSha === sha && pushWatchTimer)) return;
      stopWatch(); pushWatchedSha = sha;
      const epoch = generation(), watch = pushWatchRevision;
      let polls = 0;
      const valid = () => epoch === generation() && watch === pushWatchRevision && pushWatchedSha === sha;
      const poll = async () => {
        if (!valid()) return;
        polls++;
        try {
          const checks = await collaborationService.getCommitChecks(owner, repo, sha);
          if (!valid()) return;
          // 写入 commitChecks：NotificationService 经外部订阅观察 running→completed
          // 迁移来弹系统通知（推送后失焦场景），也与 fetchCommitChecks 的缓存形状一致。
          set((state) => ({ commitChecks: { ...state.commitChecks, [sha]: checks }, commitCheckErrors: { ...state.commitCheckErrors, [sha]: '' } }));
          if (checks.length && checks.every((check) => check.status === 'completed' && check.conclusion !== null)) {
            const passed = checks.filter((check) => check.conclusion === 'success').length;
            const failed = checks.filter(check => !['success', 'neutral', 'skipped', 'cancelled'].includes(check.conclusion || ''));
            if (failed.length) toast.warning(tNow('ci.failed'), failed.map(check => `${check.name}: ${check.conclusion}`).join(', '));
            else if (passed) toast.success(tNow('ci.passed'), `${passed}/${checks.length}`);
            else toast.info(tNow('ci.completed'));
            stopWatch(); return;
          }
        } catch { /* retry transient failures without reporting a successful run */ }
        if (polls < 20) pushWatchTimer = setTimeout(poll, 15_000);
        else { toast.info(tNow('ci.stillRunning')); stopWatch(); }
      };
      toast.info(tNow('ci.watching'), `${owner}/${repo} @ ${sha.slice(0, 7)}`);
      pushWatchTimer = setTimeout(poll, 15_000);
    },
  };
  return { actions, stopWatch };
}
