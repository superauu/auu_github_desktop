/**
 * 多平台托管（forge）的归一化领域模型。
 *
 * GitHub 保持既有 GitHubService 深度能力不动；GitLab / Gitea 走本层的轻量归一化
 * 模型（MR/PR 列表 + 基本详情 + 流水线状态），UI 按同一形状渲染。
 */
export type ForgeKind = 'github' | 'gitlab' | 'gitea';

export interface ForgeUser {
  login: string;
  name: string;
  avatarUrl?: string;
}

/** 归一化的 MR/PR 状态：GitLab 的 opened/closed/merged 与 Gitea 的 open/closed 映射到这里。 */
export type ForgePullState = 'open' | 'merged' | 'closed';

export interface ForgePullRequest {
  number: number;
  title: string;
  author: string;
  state: ForgePullState;
  draft: boolean;
  sourceBranch: string;
  targetBranch: string;
  createdAt: string;
  updatedAt: string;
  webUrl: string;
}

export type ForgePipelineStatus =
  | 'running'
  | 'success'
  | 'failed'
  | 'canceled'
  | 'pending';

export interface ForgePipeline {
  id: number;
  name: string;
  status: ForgePipelineStatus;
  ref: string;
  createdAt: string;
  webUrl: string;
}

/** MR 详情：列表字段 + 描述与讨论评论（时间线用）。 */
export interface ForgePullRequestDetail extends ForgePullRequest {
  description: string;
  comments: Array<{
    id: number;
    author: string;
    body: string;
    createdAt: string;
  }>;
}

export class ForgeApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ForgeApiError';
  }
}
