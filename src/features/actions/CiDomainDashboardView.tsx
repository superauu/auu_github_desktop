import { useEffect, useState } from 'react';
import { Play, PlayCircle, Workflow, Layers, RefreshCw, Ban, Terminal, ExternalLink, Clock, GitBranch, GitCommit } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useLayoutStore, DEFAULT_LAYOUT } from '@/stores/layoutStore';
import { ResizeHandle } from '@/components/ui/ResizeHandle';
import { ScrollArea } from '@/components/ui/scroll-area';
import { PanelCount } from '@/components/ui/PanelCount';
import { WorkspaceError, WorkspaceLoading } from '@/components/ui/WorkspaceNotice';
import { ErrorNotice } from '@/components/ui/ErrorNotice';
import { createCiChannel, type CiChannel } from '@/services/integrations/ciService';
import type { CiConnection, CiBinding } from '@/stores/ciStore';
import type { CollaborationWorkflow, CollaborationWorkflowRun, CollaborationJob, JobLogsData } from '@/services/collaboration/types';
import { workflowInputValues, type WorkflowInput } from '@/services/collaboration/WorkflowInputs';
import { useI18n } from '@/i18n';
import { workflowStatus } from '@/utils/workflowStatus';
import { openExternalUrl } from '@/utils/openExternal';
import { ModalSurface } from '@/components/ui/ModalSurface';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/EmptyState';
import { confirmAction } from '@/stores/confirmStore';
import { toast } from '@/stores/toastStore';
import { cn } from '@/utils/cn';

/** A ci-cd view for any independent CI contribution. No provider IDs, API paths or platform statuses here. */
export function CiDomainDashboardView({ connection, binding }: { connection: CiConnection; binding: CiBinding }) {
  const { t } = useI18n();
  const { actionsWorkflowsWidth, setActionsWorkflowsWidth } = useLayoutStore(useShallow(state => ({
    actionsWorkflowsWidth: state.actionsWorkflowsWidth, setActionsWorkflowsWidth: state.setActionsWorkflowsWidth,
  })));
  const [channel, setChannel] = useState<CiChannel | null>(null);
  const [workflows, setWorkflows] = useState<CollaborationWorkflow[]>([]);
  const [workflowId, setWorkflowId] = useState('');
  const [runs, setRuns] = useState<CollaborationWorkflowRun[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [jobs, setJobs] = useState<CollaborationJob[]>([]);
  const [logs, setLogs] = useState<JobLogsData | null>(null);
  const [logsOpen, setLogsOpen] = useState(false);
  const [error, setError] = useState(''), [detailError, setDetailError] = useState('');
  const [refresh, setRefresh] = useState(0), [loading, setLoading] = useState(true);
  const [dispatch, setDispatch] = useState<CollaborationWorkflow | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const selected = runs.find(run => run.id === selectedId);
  const selectedRunId = selected?.id, selectedStatus = selected?.status;
  useEffect(() => {
    let alive = true;
    void createCiChannel(connection, binding.jobPaths).then(value => { if (alive) setChannel(value); })
      .catch(cause => { if (alive) { setError(String(cause.message || cause)); setLoading(false); } });
    return () => { alive = false; };
  }, [connection, binding]);
  useEffect(() => {
    if (!channel) return;
    let alive = true, timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const [definitions, history] = await Promise.all([
          channel.client.getWorkflows('', ''), channel.client.getWorkflowRuns('', '', workflowId || undefined),
        ]);
        if (!alive) return;
        setWorkflows(definitions); setRuns(history); setError('');
        setSelectedId(current => history.some(run => run.id === current) ? current : history[0]?.id ?? null);
      } catch (cause) { if (alive) setError(cause instanceof Error ? cause.message : String(cause)); }
      finally { if (alive) { setLoading(false); timer = setTimeout(() => void poll(), 3000); } }
    };
    setLoading(true); void poll();
    return () => { alive = false; if (timer) clearTimeout(timer); };
  }, [channel, workflowId, refresh]);
  useEffect(() => { setJobs([]); setLogs(null); setLogsOpen(false); setDetailError(''); }, [selectedId]);
  useEffect(() => {
    if (!channel || selectedRunId === undefined || selectedStatus === 'queued') return;
    let alive = true, timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      const [stages, output] = await Promise.allSettled([
        Promise.resolve().then(() => channel.client.getRunJobs('', '', selectedRunId)),
        Promise.resolve().then(() => logsOpen && channel.has('getJobLogs') ? channel.client.getJobLogs('', '', selectedRunId) : null),
      ]);
      if (!alive) return;
      if (stages.status === 'fulfilled') setJobs(stages.value);
      if (output.status === 'fulfilled' && output.value) setLogs(output.value);
      setDetailError([stages, output].flatMap(result => result.status === 'rejected' ? [String(result.reason?.message || result.reason)] : []).join('\n'));
      // Serialize slow requests. Updating run timestamps must not invalidate a still-pending stage/log response.
      if (selectedStatus !== 'completed') timer = setTimeout(() => void poll(), 3000);
    };
    void poll();
    return () => { alive = false; if (timer) clearTimeout(timer); };
  }, [channel, selectedRunId, selectedStatus, logsOpen, refresh]);
  const status = (run: { status: string; conclusion: string | null }) => {
    const view = workflowStatus(run.status, run.conclusion);
    return <Badge variant={view.variant}>{t(view.key)}</Badge>;
  };
  return <div data-workspace-view="actions" data-ci-domain-provider={connection.providerId} className="flex-1 min-h-0 flex flex-col overflow-hidden select-none bg-background">
    <div className="app-toolbar justify-between">
      <div className="app-toolbar-group min-w-0"><Workflow className="h-3.5 w-3.5 shrink-0 text-primary" /><span className="font-semibold truncate">{connection.displayName}</span><span className="text-muted-foreground text-xs">{t('ciDomain.autoRefresh')}</span></div>
      <Button size="icon-sm" variant="ghost" aria-label={t('actions.refresh')} onClick={() => setRefresh(value => value + 1)}><RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} /></Button>
    </div>
    {error && <WorkspaceError><ErrorNotice compact error={error} /></WorkspaceError>}
    <div className="flex flex-1 min-h-0 overflow-hidden">
      <aside style={{ width: actionsWorkflowsWidth }} className="border-r border-border bg-sidebar/50 flex flex-col shrink-0 h-full overflow-hidden" aria-label={t('actions.workflows')}>
        <div className="workspace-panel-header gap-1 px-2 border-b border-border flex items-center justify-between text-xs text-foreground bg-accent/20 shrink-0">
          <div className="min-w-0 flex items-center gap-1.5"><span className="ui-panel-title block truncate">{t('actions.workflows')}</span><PanelCount count={workflows.length} /></div>
        </div>
        <ScrollArea className="flex-1 min-h-0 p-1.5">
          <div className="space-y-1">
            <button type="button" className={cn('w-full text-left px-2.5 py-1.5 text-xs font-medium flex items-center justify-between transition-colors border-l-2',
              !workflowId ? 'bg-primary/12 text-foreground border-l-primary font-semibold' : 'text-muted-foreground hover:text-foreground hover:bg-accent/40 border-l-transparent')}
              onClick={() => { setWorkflowId(''); setSelectedId(null); }}><span className="truncate">{t('actions.allWorkflows')}</span><PanelCount count={runs.length} /></button>
            {workflows.map(workflow => <div key={workflow.id} className={cn('group flex items-center gap-1 border-l-2 px-1 transition-colors',
              workflowId === workflow.id ? 'bg-primary/12 border-l-primary text-foreground' : 'border-l-transparent text-muted-foreground hover:text-foreground hover:bg-accent/40')}>
              <button type="button" title={workflow.name} className="flex-1 min-w-0 text-left px-1.5 py-1.5 text-xs font-medium flex items-center gap-1.5" onClick={() => { setWorkflowId(String(workflow.id)); setSelectedId(null); }}>
                <PlayCircle className="h-3.5 w-3.5 text-primary shrink-0" /><span className="truncate">{workflow.name}</span>
              </button>
              <Button size="icon-xs" variant="ghost" className="shrink-0 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100" aria-label={`${t('actions.dispatch')}: ${workflow.name}`} title={t('actions.dispatch')} disabled={!channel?.has('dispatchWorkflow') || workflow.state !== 'active'} onClick={() => setDispatch(workflow)}><Play className="h-3 w-3 fill-current" /></Button>
            </div>)}
          </div>
        </ScrollArea>
      </aside>
      <ResizeHandle currentSize={actionsWorkflowsWidth} onSizeChange={setActionsWorkflowsWidth} minSize={160} maxSize={480} defaultSize={DEFAULT_LAYOUT.actionsWorkflowsWidth} title={t('actions.resizeHint')} />
      <div className="flex-1 min-w-0 flex flex-col min-h-0 overflow-hidden bg-card/10">
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden" data-ci-panel="history">
          <div className="workspace-panel-header gap-1 px-2 border-b border-border flex items-center justify-between text-xs text-foreground bg-accent/20 shrink-0">
            <div className="min-w-0 flex items-center gap-1.5"><Clock className="h-3.5 w-3.5 text-primary shrink-0" /><span className="ui-panel-title block truncate">{t('actions.runHistory')}</span><PanelCount count={runs.length} /></div>
          </div>
          <ScrollArea className="flex-1 min-h-0">
          <div className="divide-y divide-border/50" role="list" aria-label={t('actions.runHistory')} aria-busy={loading}>
          {loading && !runs.length && <WorkspaceLoading>{t('common.loading')}</WorkspaceLoading>}
          {!loading && !error && !runs.length && <EmptyState title={t('ui.actions.empty')} />}
          {runs.map(run => <button key={run.id} role="listitem" type="button" aria-current={selectedId === run.id ? 'true' : undefined}
            className={cn('w-full text-left p-2.5 flex items-center justify-between gap-3 text-xs transition-colors border-l-2', selectedId === run.id ? 'bg-primary/12 border-l-primary' : 'hover:bg-accent/40 border-l-transparent')}
            onClick={() => setSelectedId(run.id)}>
            <span className="min-w-0 truncate font-medium">{run.name}</span>
            <span className="flex shrink-0 items-center gap-3"><span className="font-mono text-muted-foreground inline-flex items-center gap-1">{run.head_branch && <GitBranch className="h-3 w-3 text-git-branch" />}{run.head_branch}</span>
              {run.head_sha && <span className="font-mono text-muted-foreground inline-flex items-center gap-1"><GitCommit className="h-3 w-3" />{run.head_sha.slice(0, 7)}</span>}{status(run)}</span>
          </button>)}
          </div>
          </ScrollArea>
        </div>
        <div aria-hidden="true" className="h-2 shrink-0 border-y border-border bg-sidebar shadow-inner" />
        <section className="h-64 max-h-[45%] min-h-36 flex flex-col overflow-hidden shrink-0 bg-card/30" data-ci-panel="stages" aria-label={t('ciDomain.stages')}>
          <div className="workspace-panel-header flex items-center justify-between gap-2 px-2 border-b border-border bg-accent/40 shrink-0">
            <div className="min-w-0 flex items-center gap-1.5"><Layers className="h-3.5 w-3.5 text-primary shrink-0" /><span className="ui-panel-title block truncate">{t('ciDomain.stages')}</span>{selected && <Badge variant="outline" className="h-4 px-1 text-[10px] font-mono shrink-0">#{selected.run_number}</Badge>}</div>
            {selected && <div className="flex items-center gap-2">
              <Button size="icon-xs" variant="ghost" aria-label={t('ciDomain.openBuild')} title={t('ciDomain.openBuild')} onClick={() => void openExternalUrl(selected.html_url).catch(cause => toast.error(t('ciDomain.operationFailed'), String(cause)))}><ExternalLink className="h-3 w-3" /></Button>
              {selected.status !== 'queued' && <Button size="xs" variant="outline" disabled={!channel?.has('getJobLogs')} onClick={() => setLogsOpen(true)}><Terminal className="h-3 w-3" />{t('actions.viewLogs')}</Button>}
              {selected.status !== 'completed' && <Button size="xs" variant="destructive" disabled={!channel?.has('cancelWorkflowRun') || cancelling} onClick={async () => {
                const runId = selected.id;
                if (!channel || !await confirmAction({ title: t('actions.cancelRunConfirmTitle'), description: t('actions.cancelRunConfirmDesc'), confirmLabel: t('actions.cancelRun'), danger: true })) return;
                setCancelling(true);
                try { await channel.client.cancelWorkflowRun('', '', runId); toast.info(t('ciDomain.cancelled')); setRefresh(value => value + 1); }
                catch (cause) { toast.error(t('ciDomain.operationFailed'), cause instanceof Error ? cause.message : String(cause)); }
                finally { setCancelling(false); }
              }}><Ban className="h-3 w-3" />{t('actions.cancelRun')}</Button>}
            </div>}
          </div>
          <ScrollArea className="flex-1 min-h-0">
          {detailError && <WorkspaceError><ErrorNotice compact error={detailError} /></WorkspaceError>}
          {!selected ? <p className="p-3 text-xs text-muted-foreground">{t('ciDomain.selectBuild')}</p>
            : selected.status === 'queued' ? <p className="p-3 text-xs text-muted-foreground">{t('ciDomain.queueHint')}</p>
            : !jobs.flatMap(job => job.steps).length ? <p className="p-3 text-xs text-muted-foreground">{t('ciDomain.noStages')}</p>
            : jobs.flatMap(job => job.steps).map((step, index) => <div key={`${step.number}-${index}`} className="px-3 py-2 flex justify-between items-center border-b border-border/50 text-xs gap-3"><span className="truncate">{step.name}</span>{status(step)}</div>)}
          </ScrollArea>
        </section>
      </div>
    </div>
    {dispatch && channel && <CiDispatchForm channel={channel} workflow={dispatch} onClose={() => setDispatch(null)} onSubmitted={() => { setDispatch(null); setRefresh(value => value + 1); }} />}
    {logsOpen && selected && <ModalSurface label={t('actions.viewLogs')} onDismiss={() => setLogsOpen(false)} className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-xs">
      <div className="w-full max-w-5xl h-[80vh] flex flex-col rounded-xl border border-border bg-card overflow-hidden">
        <div className="flex justify-between items-center p-3 border-b border-border text-xs gap-2"><span className="truncate">{selected.name} · {t('actions.viewLogs')}</span><div className="flex gap-2"><Button size="xs" variant="outline" onClick={() => setRefresh(value => value + 1)}>{t('actions.refresh')}</Button><Button size="xs" variant="ghost" onClick={() => setLogsOpen(false)}>{t('common.close')}</Button></div></div>
        {detailError && <p role="alert" className="p-3 text-xs text-destructive">{detailError}</p>}
        <pre data-testid="ci-build-logs" className="flex-1 overflow-auto p-4 text-xs font-mono whitespace-pre-wrap break-all select-text">{logs?.rawLogs || t('logs.loading')}</pre>
      </div>
    </ModalSurface>}
  </div>;
}

function CiDispatchForm({ channel, workflow, onClose, onSubmitted }: { channel: CiChannel; workflow: CollaborationWorkflow; onClose(): void; onSubmitted(): void }) {
  const { t } = useI18n();
  const [inputs, setInputs] = useState<WorkflowInput[]>([]), [values, setValues] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    if (!channel.has('getWorkflowInputs')) { setLoaded(true); return; }
    void Promise.resolve().then(() => channel.client.getWorkflowInputs!('', '', workflow.id, controller.signal)).then(fields => {
      if (controller.signal.aborted) return;
      setInputs(fields); setValues(Object.fromEntries(fields.map(input => [input.name, input.defaultValue]))); setLoaded(true);
    }).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : String(cause)); });
    return () => controller.abort();
  }, [channel, workflow.id]);
  return <ModalSurface label={t('dispatch.title')} dismissible={!busy} onDismiss={onClose} className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-xs">
    <form className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-xl border border-border bg-card p-5 space-y-3 text-xs" onSubmit={async event => {
      event.preventDefault(); if (busy || !loaded) return;
      setBusy(true); setError('');
      try { await channel.client.dispatchWorkflow('', '', workflow.id, { ref: '', inputs: workflowInputValues(inputs, values) }); toast.success(t('ci.dispatchSubmitted')); onSubmitted(); }
      catch (cause) { const message = cause instanceof Error ? cause.message : String(cause); setError(message.startsWith('dispatch.') ? t(message) : message); }
      finally { setBusy(false); }
    }}>
      <h2 className="text-sm font-semibold">{t('dispatch.title')} · {workflow.name}</h2>
      {!loaded && !error && <p role="status">{t('dispatch.loadingInputs')}</p>}
      {inputs.map(input => <label key={input.name} className="block space-y-1"><span className="font-medium">{input.name}</span>
        {input.description && <span className="block text-muted-foreground whitespace-pre-wrap">{input.description}</span>}
        {input.type === 'choice' || input.type === 'boolean'
          ? <select className="h-8 w-full rounded border border-input bg-background px-2" value={values[input.name] ?? ''} disabled={busy} onChange={event => setValues(previous => ({ ...previous, [input.name]: event.target.value }))}>
            {(input.type === 'boolean' ? ['true', 'false'] : input.options).map(option => <option key={option} value={option}>{option}</option>)}
          </select>
          : <Input value={values[input.name] ?? ''} disabled={busy} onChange={event => setValues(previous => ({ ...previous, [input.name]: event.target.value }))} />}
      </label>)}
      {error && <p role="alert" className="text-destructive whitespace-pre-wrap select-text">{error}</p>}
      <div className="flex justify-end gap-2"><Button type="button" size="xs" variant="ghost" disabled={busy} onClick={onClose}>{t('common.cancel')}</Button><Button size="xs" disabled={busy || !loaded}>{t(busy ? 'dispatch.running' : 'dispatch.run')}</Button></div>
    </form>
  </ModalSurface>;
}
