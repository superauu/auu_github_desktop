import type { ProviderManifest } from '@/services/integrations/registry';
export const JENKINS_PROVIDER: ProviderManifest = {
  id: 'jenkins', name: 'Jenkins', primaryDomain: 'ci-cd', connectionKind: 'ci-server',
  domains: [{ domain: 'ci-cd', capabilities: [
    'ci-cd:list-pipelines', 'ci-cd:job-logs', 'ci-cd:dispatch', 'ci-cd:cancel',
  ] }],
};
export const LINEAR_PROVIDER: ProviderManifest = {
  // 独立任务系统（首个 task 装配档）：无自建实例，Linear 只此一家，故无 server 概念。
  // Linear 无「关闭原因」语义（完成/取消即状态类型），不声明 close-state-reason。
  id: 'linear', name: 'Linear', primaryDomain: 'task-tracking', connectionKind: 'task-account',
  domains: [{ domain: 'task-tracking', capabilities: [
    'task-tracking:list-issues', 'task-tracking:issue-detail', 'task-tracking:create-issue',
    'task-tracking:update-issue', 'task-tracking:comment',
  ] }],
};
export const SENTRY_PROVIDER: ProviderManifest = {
  id: 'sentry', name: 'Sentry', primaryDomain: 'error-tracking', connectionKind: 'error-token',
  domains: [{ domain: 'error-tracking', capabilities: [
    'error-tracking:list-issues', 'error-tracking:issue-detail', 'error-tracking:latest-event',
    'error-tracking:stacktrace', 'error-tracking:suspect-commits', 'error-tracking:resolve',
    'error-tracking:resolve-in-release', 'error-tracking:ignore',
  ] }],
};
export const GITHUB_PROVIDER: ProviderManifest = {
  id: 'github', name: 'GitHub', primaryDomain: 'code-hosting', connectionKind: 'hosting-account',
  domains: [
    { domain: 'code-hosting', capabilities: [
      'code-hosting:list-pull-requests', 'code-hosting:pull-request-detail', 'code-hosting:create-pull-request',
      'code-hosting:merge-pull-request', 'code-hosting:close-pull-request', 'code-hosting:review-pull-request',
    ] },
    { domain: 'task-tracking', capabilities: [
      'task-tracking:list-issues', 'task-tracking:issue-detail', 'task-tracking:create-issue',
      'task-tracking:update-issue', 'task-tracking:comment', 'task-tracking:close-state-reason',
    ] },
    { domain: 'ci-cd', capabilities: [
      'ci-cd:list-pipelines', 'ci-cd:commit-checks', 'ci-cd:job-logs',
      'ci-cd:workflow-source', 'ci-cd:dispatch', 'ci-cd:rerun', 'ci-cd:cancel',
    ] },
  ],
};
export const GITLAB_PROVIDER: ProviderManifest = {
  id: 'gitlab', name: 'GitLab', primaryDomain: 'code-hosting', connectionKind: 'hosting-account',
  domains: [
    { domain: 'code-hosting', capabilities: [
      'code-hosting:list-pull-requests', 'code-hosting:pull-request-detail', 'code-hosting:create-pull-request',
      'code-hosting:merge-pull-request', 'code-hosting:close-pull-request', 'code-hosting:review-pull-request',
    ] },
    { domain: 'task-tracking', capabilities: [
      'task-tracking:list-issues', 'task-tracking:issue-detail', 'task-tracking:create-issue',
      'task-tracking:update-issue', 'task-tracking:comment',
    ] },
    { domain: 'ci-cd', capabilities: [
      'ci-cd:list-pipelines', 'ci-cd:commit-checks', 'ci-cd:job-logs',
      'ci-cd:workflow-source', 'ci-cd:dispatch', 'ci-cd:rerun', 'ci-cd:cancel',
    ] },
  ],
};
export const GITEA_PROVIDER: ProviderManifest = {
  id: 'gitea', name: 'Gitea / Forgejo', primaryDomain: 'code-hosting', connectionKind: 'hosting-account',
  domains: [
    { domain: 'code-hosting', capabilities: [
      'code-hosting:list-pull-requests', 'code-hosting:pull-request-detail', 'code-hosting:create-pull-request',
      'code-hosting:merge-pull-request', 'code-hosting:close-pull-request', 'code-hosting:review-pull-request',
    ] },
    { domain: 'task-tracking', capabilities: [
      'task-tracking:list-issues', 'task-tracking:issue-detail', 'task-tracking:create-issue',
      'task-tracking:update-issue', 'task-tracking:comment',
    ] },
    { domain: 'ci-cd', capabilities: [
      'ci-cd:list-pipelines', 'ci-cd:commit-checks', 'ci-cd:job-logs',
      'ci-cd:workflow-source', 'ci-cd:dispatch', 'ci-cd:rerun',
    ] },
  ],
};
