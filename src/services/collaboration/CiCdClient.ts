import type { CollaborationWorkflow, CollaborationWorkflowRun, CollaborationJob, CollaborationCheckRun, JobLogsData, WorkflowDispatchParams, WorkflowYamlContent } from './types';
import type { CollaborationCommitStatus } from './issueTypes';
import type { WorkflowInput } from './WorkflowInputs';
export interface CiCdClient {
  /** Native parameter schemas, independent of workflow YAML (e.g. server-side Pipeline parameters). */
  getWorkflowInputs?(owner: string, repo: string, workflowId: number | string, signal?: AbortSignal): Promise<WorkflowInput[]>;
  getWorkflowCheckRuns(owner: string, repo: string, sha: string): Promise<{ total_count: number; check_runs: CollaborationCheckRun[] }>;
  getWorkflowCommitStatuses(owner: string, repo: string, sha: string): Promise<{ total_count: number; statuses: CollaborationCommitStatus[] }>;
  getWorkflows(owner: string, repo: string): Promise<CollaborationWorkflow[]>;
  getWorkflowRuns(owner: string, repo: string, workflowId?: number | string, branch?: string): Promise<CollaborationWorkflowRun[]>;
  getRunJobs(owner: string, repo: string, runId: number): Promise<CollaborationJob[]>;
  getWorkflowRun(owner: string, repo: string, runId: number): Promise<CollaborationWorkflowRun>;
  getJob(owner: string, repo: string, jobId: number): Promise<CollaborationJob>;
  getCommitChecks(owner: string, repo: string, sha: string): Promise<CollaborationCheckRun[]>;
  dispatchWorkflow(owner: string, repo: string, workflowId: number | string, params: WorkflowDispatchParams): Promise<void>;
  rerunWorkflow(owner: string, repo: string, runId: number, failedOnly?: boolean): Promise<void>;
  cancelWorkflowRun(owner: string, repo: string, runId: number): Promise<void>;
  getJobLogs(owner: string, repo: string, jobId: number): Promise<JobLogsData>;
  getWorkflowYaml(owner: string, repo: string, path: string, ref?: string, signal?: AbortSignal): Promise<WorkflowYamlContent>;
}
