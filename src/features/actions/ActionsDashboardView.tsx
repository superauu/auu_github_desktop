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
  Sparkles,
  Layers,
  ChevronRight,
  ShieldCheck,
  Terminal,
  FileCode,
  Play,
  RotateCcw,
  Ban,
} from 'lucide-react';
import { useGitHubStore } from '@/stores/githubStore';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { JobLogsViewerModal } from './JobLogsViewerModal';
import { WorkflowDispatchDialog } from './WorkflowDispatchDialog';
import { WorkflowYamlViewerModal } from './WorkflowYamlViewerModal';
import { cn } from '@/utils/cn';

interface ActionsDashboardViewProps {
  onOpenAuthDialog?: () => void;
}

export const ActionsDashboardView: React.FC<ActionsDashboardViewProps> = ({
  onOpenAuthDialog,
}) => {
  const {
    workflows,
    selectedWorkflow,
    workflowRuns,
    selectedRun,
    selectedRunJobs,
    selectWorkflow,
    selectRun,
    refreshActions,
    openJobLogs,
    openWorkflowYaml,
    openDispatchModal,
    rerunWorkflowRun,
    cancelWorkflowRun,
    isDemoMode,
    isAuthenticated,
    user,
    currentOwner,
    currentRepoName,
  } = useGitHubStore();

  const getStatusIcon = (conclusion: string | null, status: string) => {
    if (status === 'in_progress') {
      return <RotateCw className="h-3.5 w-3.5 text-amber-400 animate-spin shrink-0" />;
    }
    if (conclusion === 'success') {
      return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />;
    }
    if (conclusion === 'failure') {
      return <XCircle className="h-3.5 w-3.5 text-rose-400 shrink-0" />;
    }
    if (conclusion === 'cancelled') {
      return <Ban className="h-3.5 w-3.5 text-muted-foreground shrink-0" />;
    }
    return <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />;
  };

  return (
    <div className="flex-1 h-full flex flex-col overflow-hidden select-none bg-background">
      {/* Top Banner: Auth & Demo Mode Info */}
      <div className="h-10 px-4 border-b border-border bg-accent/20 flex items-center justify-between text-xs shrink-0">
        <div className="flex items-center gap-2">
          <Workflow className="h-4 w-4 text-primary" />
          <span className="font-semibold text-foreground">GitHub Actions 开发者仪表盘</span>
          {currentOwner && currentRepoName && (
            <Badge variant="outline" className="h-4 text-[9px] font-mono border-primary/40 text-primary">
              {currentOwner}/{currentRepoName}
            </Badge>
          )}
          {isDemoMode && (
            <Badge variant="warning" className="h-4 text-[9px] gap-1 font-normal">
              <Sparkles className="h-2.5 w-2.5 text-amber-400" />
              <span>演示模式 (Demo Mode)</span>
            </Badge>
          )}
          {isAuthenticated && user && (
            <Badge variant="success" className="h-4 text-[9px] gap-1 font-normal">
              <ShieldCheck className="h-2.5 w-2.5 text-emerald-400" />
              <span>已连接 @{user.login}</span>
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2">
          {!isAuthenticated && (
            <Button
              variant="outline"
              size="xs"
              onClick={onOpenAuthDialog}
              className="h-6 text-[10px] gap-1"
            >
              <span>连接真实 GitHub 账号</span>
            </Button>
          )}
          <Button
            variant="ghost"
            size="xs"
            onClick={() => refreshActions()}
            className="h-6 px-2 text-[10px] gap-1 text-muted-foreground hover:text-foreground"
          >
            <RotateCw className="h-3 w-3" />
            <span>刷新</span>
          </Button>
        </div>
      </div>

      {/* Main 2-Column Split: Workflows List (Left) + Runs & Jobs Explorer (Right) */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sub-column: Workflows Tree */}
        <div className="w-64 border-r border-border bg-sidebar/50 flex flex-col shrink-0 h-full overflow-hidden">
          <div className="h-8 px-3 border-b border-border flex items-center justify-between text-[11px] font-semibold text-muted-foreground uppercase tracking-wider bg-accent/10 shrink-0">
            <span>工作流 ({workflows.length})</span>
          </div>

          <ScrollArea className="flex-1 p-1.5">
            <div className="space-y-1">
              <button
                onClick={() => selectWorkflow(null)}
                className={cn(
                  "w-full text-left px-2.5 py-1.5 rounded-md text-xs font-medium flex items-center justify-between transition-colors",
                  selectedWorkflow === null
                    ? "bg-accent text-accent-foreground font-semibold"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/40"
                )}
              >
                <span>全部工作流 (All)</span>
                <Badge variant="secondary" className="h-4 text-[9px]">
                  {workflowRuns.length}
                </Badge>
              </button>

              {workflows.map((wf) => (
                <div
                  key={wf.id}
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
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 shrink-0">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openWorkflowYaml(wf);
                      }}
                      className="p-1 rounded hover:bg-accent hover:text-foreground text-muted-foreground"
                      title="查看 YAML 源码"
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
                      title="手动运行 (Dispatch)"
                    >
                      <Play className="h-3 w-3 fill-current" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>

        {/* Right Stage: Runs Table (Top) + Jobs Breakdown (Bottom) */}
        <div className="flex-1 flex flex-col h-full overflow-hidden">
          {/* Top Half: Workflow Runs List */}
          <div className="flex-1 flex flex-col border-b border-border overflow-hidden">
            <div className="h-8 px-3 border-b border-border flex items-center justify-between text-xs text-muted-foreground bg-accent/10 shrink-0">
              <span className="font-semibold text-foreground">
                运行历史记录 (Workflow Runs)
              </span>

              {/* Rerun / Cancel actions on selectedRun */}
              {selectedRun && (
                <div className="flex items-center gap-1.5">
                  {selectedRun.status === 'in_progress' ? (
                    <Button
                      variant="destructive"
                      size="xs"
                      onClick={() => cancelWorkflowRun(selectedRun.id)}
                      className="h-5 px-2 text-[10px] gap-1"
                    >
                      <Ban className="h-2.5 w-2.5" />
                      <span>取消运行</span>
                    </Button>
                  ) : (
                    <>
                      {selectedRun.conclusion === 'failure' && (
                        <Button
                          variant="outline"
                          size="xs"
                          onClick={() => rerunWorkflowRun(selectedRun.id, true)}
                          className="h-5 px-2 text-[10px] gap-1 text-amber-400 hover:text-amber-300"
                        >
                          <RotateCcw className="h-2.5 w-2.5" />
                          <span>重跑失败</span>
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="xs"
                        onClick={() => rerunWorkflowRun(selectedRun.id, false)}
                        className="h-5 px-2 text-[10px] gap-1"
                      >
                        <RotateCcw className="h-2.5 w-2.5" />
                        <span>重新运行全部</span>
                      </Button>
                    </>
                  )}
                </div>
              )}
            </div>

            <ScrollArea className="flex-1">
              <div className="divide-y divide-border/50">
                {workflowRuns.map((run) => {
                  const isSelected = selectedRun?.id === run.id;

                  return (
                    <div
                      key={run.id}
                      onClick={() => selectRun(run)}
                      className={cn(
                        "p-2.5 flex items-center justify-between gap-3 text-xs cursor-pointer transition-colors group",
                        isSelected
                          ? "bg-accent/60 border-l-2 border-primary"
                          : "hover:bg-accent/30 border-l-2 border-transparent"
                      )}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        {getStatusIcon(run.conclusion, run.status)}
                        <div className="min-w-0 space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-foreground group-hover:text-primary transition-colors">
                              {run.name}
                            </span>
                            <span className="text-[10px] text-muted-foreground font-mono">
                              #{run.run_number}
                            </span>
                            <Badge variant="outline" className="h-3.5 text-[9px] font-mono px-1">
                              {run.event}
                            </Badge>
                          </div>
                          <div className="text-[11px] text-muted-foreground truncate">
                            {run.head_commit?.message || '自动触发'}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0 text-[11px] text-muted-foreground font-mono">
                        <div className="flex items-center gap-1">
                          <GitBranch className="h-3 w-3 text-indigo-400" />
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
                        <ChevronRight className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
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
                  {selectedRun ? `Run #${selectedRun.run_number} 执行阶段与 Jobs (${selectedRunJobs.length})` : '选择运行记录以查看 Jobs'}
                </span>
              </div>
              {selectedRun && (
                <div className="flex items-center gap-2">
                  <Badge
                    variant={selectedRun.conclusion === 'success' ? 'success' : selectedRun.status === 'in_progress' ? 'warning' : 'destructive'}
                    className="h-4 text-[9px]"
                  >
                    {selectedRun.status === 'in_progress'
                      ? '正在构建中...'
                      : selectedRun.conclusion === 'success'
                      ? '全部成功 (Passed)'
                      : '执行失败 (Failed)'}
                  </Badge>
                </div>
              )}
            </div>

            <ScrollArea className="flex-1 p-3">
              {selectedRunJobs.length === 0 ? (
                <div className="py-12 text-center text-xs text-muted-foreground">
                  暂无阶段任务详情
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
                          <Badge variant="outline" className="h-3.5 text-[9px] font-mono px-1 shrink-0">
                            {job.status}
                          </Badge>
                        </div>

                        {/* Step lines */}
                        <div className="rounded border border-border/50 bg-background/50 divide-y divide-border/40 text-[11px] font-mono max-h-24 overflow-y-auto">
                          {job.steps.map((step) => (
                            <div
                              key={step.number}
                              className="px-2 py-1 flex items-center justify-between text-muted-foreground hover:text-foreground hover:bg-accent/20 transition-colors"
                            >
                              <div className="flex items-center gap-1.5 truncate">
                                {step.conclusion === 'success' ? (
                                  <CheckCircle2 className="h-2.5 w-2.5 text-emerald-400 shrink-0" />
                                ) : step.conclusion === 'failure' ? (
                                  <XCircle className="h-2.5 w-2.5 text-rose-400 shrink-0" />
                                ) : (
                                  <Clock className="h-2.5 w-2.5 text-muted-foreground shrink-0" />
                                )}
                                <span className="truncate text-[10px]">{step.name}</span>
                              </div>
                              <span className="text-[9px] opacity-60 shrink-0">#{step.number}</span>
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
                          className="h-6 px-2 text-[10px] gap-1 font-mono hover:text-emerald-400"
                        >
                          <Terminal className="h-3 w-3" />
                          <span>查看构建日志</span>
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
