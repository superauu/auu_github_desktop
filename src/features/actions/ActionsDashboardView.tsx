import React from 'react';
import {
  PlayCircle,
  CheckCircle2,
  XCircle,
  Clock,
  RotateCw,
  GitCommit,
  GitBranch,
  Workflow,
  Layers,
  ChevronRight,
  ShieldCheck,
  Terminal,
  FileCode,
  Play,
  RotateCcw,
  Ban,
} from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useI18n } from '@/i18n';
import { useGitHubStore } from '@/stores/githubStore';
import { confirmAction } from '@/stores/confirmStore';
import { useLayoutStore, DEFAULT_LAYOUT } from '@/stores/layoutStore';
import { ResizeHandle } from '@/components/ui/ResizeHandle';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { JobLogsViewerModal } from './JobLogsViewerModal';
import { WorkflowDispatchDialog } from './WorkflowDispatchDialog';
import { WorkflowYamlViewerModal } from './WorkflowYamlViewerModal';
import { cn } from '@/utils/cn';
import { keyboardRowProps } from '@/utils/keyboardNavigation';
import { workflowStatus } from '@/utils/workflowStatus';
import { ErrorNotice } from '@/components/ui/ErrorNotice';

interface ActionsDashboardViewProps {
  onOpenAuthDialog?: () => void;
}

export const ActionsDashboardView: React.FC<ActionsDashboardViewProps> = ({
  onOpenAuthDialog,
}) => {
  const { actionsWorkflowsWidth, setActionsWorkflowsWidth } = useLayoutStore();
  const {
    workflows,
    selectedWorkflow,
    workflowRuns,
    selectedRun,
    selectedRunJobs,
    selectWorkflow,
    selectRun,
    refreshActions,
    isRefreshingActions,
    isLoadingRuns,
    isLoadingJobs,
    openJobLogs,
    openWorkflowYaml,
    openDispatchModal,
    rerunWorkflowRun,
    cancelWorkflowRun,
    isAuthenticated,
    user,
    currentOwner,
    currentRepoName,
    error,
  } = useGitHubStore(useShallow(state => ({ workflows: state.workflows, selectedWorkflow: state.selectedWorkflow, workflowRuns: state.workflowRuns, selectedRun: state.selectedRun, selectedRunJobs: state.selectedRunJobs, selectWorkflow: state.selectWorkflow, selectRun: state.selectRun, refreshActions: state.refreshActions, isRefreshingActions: state.isRefreshingActions, isLoadingRuns: state.isLoadingRuns, isLoadingJobs: state.isLoadingJobs, openJobLogs: state.openJobLogs, openWorkflowYaml: state.openWorkflowYaml, openDispatchModal: state.openDispatchModal, rerunWorkflowRun: state.rerunWorkflowRun, cancelWorkflowRun: state.cancelWorkflowRun, isAuthenticated: state.isAuthenticated, user: state.user, currentOwner: state.currentOwner, currentRepoName: state.currentRepoName, error: state.error })));
  const { t } = useI18n();
  const selectedRunStatus = selectedRun ? workflowStatus(selectedRun.status, selectedRun.conclusion) : null;

  const getStatusIcon = (conclusion: string | null, status: string) => {
    const result = workflowStatus(status, conclusion);
    if (status === 'in_progress') {
      return <RotateCw className="h-3.5 w-3.5 text-git-tag animate-spin shrink-0" />;
    }
    if (result.variant === 'success') {
      return <CheckCircle2 className="h-3.5 w-3.5 text-git-added shrink-0" />;
    }
    if (result.variant === 'destructive') {
      return <XCircle className="h-3.5 w-3.5 text-git-deleted shrink-0" />;
    }
    if (conclusion === 'cancelled' || conclusion === 'skipped') {
      return <Ban className="h-3.5 w-3.5 text-muted-foreground shrink-0" />;
    }
    return <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />;
  };

  return (
    <div className="flex-1 h-full flex flex-col overflow-hidden select-none bg-background">
      {/* Top Banner: Auth Info */}
      <div className="h-10 px-4 border-b border-border bg-accent/20 flex items-center justify-between text-xs shrink-0">
        <div className="flex items-center gap-2">
          <Workflow className="h-4 w-4 text-primary" />
          <span className="font-semibold text-foreground">{t('actions.title')}</span>
          {currentOwner && currentRepoName && (
            <Badge variant="outline" className="h-4 text-[10px] font-mono border-primary/40 text-primary">
              {currentOwner}/{currentRepoName}
            </Badge>
          )}
          {isAuthenticated && user && (
            <Badge variant="success" className="h-4 text-[10px] gap-1 font-normal">
              <ShieldCheck className="h-2.5 w-2.5 text-git-added" />
              <span>{t('actions.connectedAs')} @{user.login}</span>
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2">
          {!isAuthenticated && (
            <Button
              variant="outline"
              size="xs"
              onClick={onOpenAuthDialog}
              className="h-6 text-[11px] gap-1"
            >
              <span>{t('actions.connectReal')}</span>
            </Button>
          )}
          <Button
            variant="ghost"
            size="xs"
            onClick={() => refreshActions()}
            disabled={isRefreshingActions || !currentOwner || !currentRepoName}
            aria-busy={isRefreshingActions}
            className="h-6 px-2 text-[11px] gap-1 text-muted-foreground hover:text-foreground"
          >
            <RotateCw className={cn('h-3 w-3', isRefreshingActions && 'animate-spin')} />
            <span>{t(isRefreshingActions ? 'actions.refreshing' : 'actions.refresh')}</span>
          </Button>
        </div>
      </div>

      {error && <div role="alert" className="px-4 py-2 border-b border-border"><ErrorNotice error={error} /></div>}

      {/* Main 2-Column Split: Workflows List (Left) + Runs & Jobs Explorer (Right) */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sub-column: Workflows Tree */}
        <div
          style={{ width: actionsWorkflowsWidth }}
          className="border-r border-border bg-sidebar/50 flex flex-col shrink-0 h-full overflow-hidden"
        >
          <div className="h-8 px-3 border-b border-border flex items-center justify-between text-[12px] font-semibold text-muted-foreground uppercase tracking-wider bg-accent/10 shrink-0">
            <span>{t('actions.workflows')} ({workflows.length})</span>
          </div>

          <ScrollArea className="flex-1 p-1.5">
            <div className="space-y-1" role="list" data-keyboard-list aria-label={t('actions.workflows')}>
              <button
                onClick={() => selectWorkflow(null)}
                className={cn(
                  "w-full text-left px-2.5 py-1.5 rounded-md text-xs font-medium flex items-center justify-between transition-colors",
                  selectedWorkflow === null
                    ? "bg-accent text-accent-foreground font-semibold"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/40"
                )}
              >
                <span>{t('actions.allWorkflows')}</span>
                <Badge variant="secondary" className="h-4 text-[10px]">
                  {workflowRuns.length}
                </Badge>
              </button>

              {workflows.map((wf) => (
                <div
                  key={wf.id}
                  {...keyboardRowProps(wf.name)}
                  aria-current={selectedWorkflow?.id === wf.id ? 'true' : undefined}
                  onClick={() => selectWorkflow(wf)}
                  className={cn(
                    "w-full text-left px-2.5 py-1.5 rounded-md text-xs font-medium flex items-center justify-between transition-colors group cursor-pointer",
                    selectedWorkflow?.id === wf.id
                      ? "bg-accent text-accent-foreground font-semibold"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent/40"
                  )}
                >
                  <div className="flex items-center gap-1.5 truncate min-w-0 pr-1">
                    <PlayCircle className="h-3.5 w-3.5 text-primary shrink-0" />
                    <span className="truncate">{wf.name}</span>
                  </div>

                  {/* Actions buttons on hover */}
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 shrink-0">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openWorkflowYaml(wf);
                      }}
                      className="p-1 rounded hover:bg-accent hover:text-foreground text-muted-foreground"
                      title={t('actions.viewYaml')}
                    >
                      <FileCode className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openDispatchModal(wf);
                      }}
                      className="p-1 rounded hover:bg-accent hover:text-primary text-muted-foreground"
                      title={t('actions.dispatch')}
                    >
                      <Play className="h-3 w-3 fill-current" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>

        <ResizeHandle
          currentSize={actionsWorkflowsWidth}
          onSizeChange={setActionsWorkflowsWidth}
          minSize={160}
          maxSize={480}
          defaultSize={DEFAULT_LAYOUT.actionsWorkflowsWidth}
          title={t('actions.resizeHint')}
        />

        {/* Right Stage: Runs Table (Top) + Jobs Breakdown (Bottom) */}
        <div className="flex-1 flex flex-col h-full overflow-hidden">
          {/* Top Half: Workflow Runs List */}
          <div className="flex-1 flex flex-col border-b border-border overflow-hidden">
            <div className="h-8 px-3 border-b border-border flex items-center justify-between text-xs text-muted-foreground bg-accent/10 shrink-0">
              <span className="font-semibold text-foreground">
                {t('actions.runHistory')}
              </span>

              {/* Rerun / Cancel actions on selectedRun */}
              {selectedRun && (
                <div className="flex items-center gap-1.5">
                  {selectedRun.status === 'in_progress' ? (
                    <Button
                      variant="destructive"
                      size="xs"
                      onClick={async () => {
                        if (await confirmAction({
                          title: t('actions.cancelRunConfirmTitle'),
                          description: t('actions.cancelRunConfirmDesc'),
                          confirmLabel: t('actions.cancelRun'),
                          danger: true,
                        })) cancelWorkflowRun(selectedRun.id);
                      }}
                      className="h-5 px-2 text-[11px] gap-1"
                    >
                      <Ban className="h-2.5 w-2.5" />
                      <span>{t('actions.cancelRun')}</span>
                    </Button>
                  ) : (
                    <>
                      {selectedRun.conclusion === 'failure' && (
                        <Button
                          variant="outline"
                          size="xs"
                          onClick={() => rerunWorkflowRun(selectedRun.id, true)}
                          className="h-5 px-2 text-[11px] gap-1 text-git-tag hover:text-git-tag"
                        >
                          <RotateCcw className="h-2.5 w-2.5" />
                          <span>{t('actions.rerunFailed')}</span>
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="xs"
                        onClick={() => rerunWorkflowRun(selectedRun.id, false)}
                        className="h-5 px-2 text-[11px] gap-1"
                      >
                        <RotateCcw className="h-2.5 w-2.5" />
                        <span>{t('actions.rerunAll')}</span>
                      </Button>
                    </>
                  )}
                </div>
              )}
            </div>

            <ScrollArea className="flex-1">
              <div className="divide-y divide-border/50" role="list" data-keyboard-list aria-label={t('actions.runHistory')} aria-busy={isRefreshingActions || isLoadingRuns}>
                {(isLoadingRuns || (isRefreshingActions && !workflowRuns.length)) && <p role="status" className="p-4 text-xs text-muted-foreground">{t('ui.actions.loading')}</p>}
                {!isLoadingRuns && !isRefreshingActions && !error && !workflowRuns.length && <p className="p-4 text-xs text-muted-foreground">{t('ui.actions.empty')}</p>}
                {workflowRuns.map((run) => {
                  const isSelected = selectedRun?.id === run.id;

                  return (
                    <div
                      key={run.id}
                      {...keyboardRowProps(`${run.name} #${run.run_number} · ${t(workflowStatus(run.status, run.conclusion).key)}`)}
                      aria-current={isSelected ? 'true' : undefined}
                      onClick={() => selectRun(run)}
                      className={cn(
                        "p-2.5 flex items-center justify-between gap-3 text-xs cursor-pointer transition-colors group",
                        isSelected
                          ? "bg-accent/60 border-l-2 border-primary"
                          : "hover:bg-accent/30 border-l-2 border-transparent"
                      )}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span title={t(workflowStatus(run.status, run.conclusion).key)}>{getStatusIcon(run.conclusion, run.status)}</span>
                        <div className="min-w-0 space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-foreground group-hover:text-primary transition-colors">
                              {run.name}
                            </span>
                            <span className="text-[11px] text-muted-foreground font-mono">
                              #{run.run_number}
                            </span>
                            <Badge variant="outline" className="h-3.5 text-[10px] font-mono px-1">
                              {run.event}
                            </Badge>
                          </div>
                          <div className="text-[12px] text-muted-foreground truncate">
                            {run.head_commit?.message || t('actions.autoTriggered')}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0 text-[12px] text-muted-foreground font-mono">
                        <div className="flex items-center gap-1">
                          <GitBranch className="h-3 w-3 text-git-branch" />
                          <span>{run.head_branch}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <GitCommit className="h-3 w-3 text-muted-foreground/60" />
                          <span>{run.head_sha.slice(0, 7)}</span>
                        </div>
                        {run.duration_ms && (
                          <div className="flex items-center gap-1">
                            <Clock className="h-3 w-3 text-muted-foreground/60" />
                            <span>{Math.round(run.duration_ms / 1000)}s</span>
                          </div>
                        )}
                        <ChevronRight className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity" />
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </div>

          {/* Bottom Half: Jobs Tree Explorer with Terminal Log Button */}
          <div className="h-64 flex flex-col bg-card/20 overflow-hidden shrink-0">
            <div className="h-8 px-3 border-b border-border flex items-center justify-between text-xs text-muted-foreground bg-accent/20 shrink-0">
              <div className="flex items-center gap-1.5">
                <Layers className="h-3.5 w-3.5 text-primary" />
                <span className="font-semibold text-foreground">
                  {selectedRun ? `Run #${selectedRun.run_number} ${t('actions.jobsTitle')} (${selectedRunJobs.length})` : t('actions.pickRun')}
                </span>
              </div>
              {selectedRun && (
                <div className="flex items-center gap-2">
                  <Badge
                    variant={selectedRunStatus!.variant}
                    className="h-4 text-[10px]"
                  >
                    {t(selectedRunStatus!.key)}
                  </Badge>
                </div>
              )}
            </div>

            <ScrollArea className="flex-1 p-3">
              {isLoadingJobs ? <p role="status" className="py-12 text-center text-xs text-muted-foreground">{t('ui.actions.jobsLoading')}</p> : selectedRunJobs.length === 0 ? (
                <div className="py-12 text-center text-xs text-muted-foreground">
                  {t(selectedRun ? 'actions.noJobs' : 'actions.pickRun')}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {selectedRunJobs.map((job) => (
                    <div
                      key={job.id}
                      className="rounded-lg border border-border bg-card/60 p-2.5 space-y-2 flex flex-col justify-between"
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 font-medium text-xs text-foreground truncate">
                            {getStatusIcon(job.conclusion, job.status)}
                            <span className="truncate">{job.name}</span>
                          </div>
                          <Badge variant="outline" className="h-3.5 text-[10px] font-mono px-1 shrink-0">
                            {job.status}
                          </Badge>
                        </div>

                        {/* Step lines */}
                        <div className="rounded border border-border/50 bg-background/50 divide-y divide-border/40 text-[12px] font-mono max-h-24 overflow-y-auto">
                          {job.steps.map((step) => (
                            <div
                              key={step.number}
                              className="px-2 py-1 flex items-center justify-between text-muted-foreground hover:text-foreground hover:bg-accent/20 transition-colors"
                            >
                              <div className="flex items-center gap-1.5 truncate">
                                {step.conclusion === 'success' ? (
                                  <CheckCircle2 className="h-2.5 w-2.5 text-git-added shrink-0" />
                                ) : step.conclusion === 'failure' ? (
                                  <XCircle className="h-2.5 w-2.5 text-git-deleted shrink-0" />
                                ) : (
                                  <Clock className="h-2.5 w-2.5 text-muted-foreground shrink-0" />
                                )}
                                <span className="truncate text-[11px]">{step.name}</span>
                              </div>
                              <span className="text-[10px] opacity-60 shrink-0">#{step.number}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Job footer: view logs button */}
                      <div className="pt-1 flex items-center justify-end">
                        <Button
                          variant="ghost"
                          size="xs"
                          onClick={() => openJobLogs(job.id, job.name)}
                          className="h-6 px-2 text-[11px] gap-1 font-mono hover:text-git-added"
                        >
                          <Terminal className="h-3 w-3" />
                          <span>{t('actions.viewLogs')}</span>
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        </div>
      </div>

      {/* Modals */}
      <JobLogsViewerModal />
      <WorkflowDispatchDialog />
      <WorkflowYamlViewerModal />
    </div>
  );
};
