/** 错误追踪领域模型；公共集成定义移至 services/integrations。旧路径继续兼容。 */
export * from '../integrations/registry';

// ---------------------------------------------------------------------------
// 统一数据模型（§5）——所有字段允许缺失，缺失不影响基础渲染
// ---------------------------------------------------------------------------

export type NormalizedSeverity = 'critical' | 'error' | 'warning' | 'info';
export type NormalizedStatus = 'unresolved' | 'resolved' | 'ignored';

export interface StackFrame {
  file: string;
  line: number | null;
  col: number | null;
  func: string | null;
  /** 平台返回的上下文源码行（保持原文，不翻译——§7.5）。 */
  contextLines?: string[];
}

export interface CommitRef {
  sha: string;
  message?: string;
  author?: string;
  repository?: string;
}

export interface UnifiedErrorIssue {
  connectionId: string;
  providerId: string;
  externalProjectId: string;
  /** 平台聚合后的 issue/group 标识（非 event 级）。 */
  issueId: string;
  /** 平台短 ID（Sentry: `PROJ-ABC`），用于分支名与引用标记。 */
  shortId?: string;
  /** 平台聚合指纹，预留跨源去重（§7.3.4 只留口子）。 */
  fingerprint?: string;
  title: string;
  message?: string;
  severity: NormalizedSeverity;
  status: NormalizedStatus;
  /** 平台原始状态，详情页展示（reprocessing 等归一损失的语义在这里）。 */
  rawStatus?: string;
  /** ISO 8601。 */
  firstSeen?: string;
  lastSeen?: string;
  eventCount?: number;
  affectedUsers?: number;
  stacktrace?: StackFrame[];
  release?: string;
  suspectCommit?: CommitRef;
  environment?: string;
  externalUrl: string;
  /** 平台特有扩展数据，详情页折叠区展示。 */
  rawData?: unknown;
}

// ---------------------------------------------------------------------------
// 连接与映射（§6）
// ---------------------------------------------------------------------------

export interface ProjectMapping {
  connectionId: string;
  externalProjectId: string;
  externalProjectName: string;
  /** 堆栈路径 → 本地路径前缀映射（§8.4 高置信跳转）。 */
  sourcePathPrefixMap?: { from: string; to: string }[];
}

// ---------------------------------------------------------------------------
// Issue ↔ Git 持久化关联（§5.3）
// ---------------------------------------------------------------------------

export interface IssuePullRequestRef {
  provider: string;
  number: number;
  url: string;
}

export interface IssueGitLink {
  id: string;
  connectionId: string;
  providerId: string;
  externalProjectId: string;
  issueId: string;
  /** 平台短 ID（trailer/分支名引用它；缺失时消费方回落 issueId）。 */
  shortId?: string;
  /** 平台原始详情页（PR 引用块使用；记录链接时随 issue 快照）。 */
  externalUrl?: string;
  /** 仓库稳定标识：规范化 remote URL 优先，路径回退（repoIdentity.ts）。 */
  repoKey: string;
  branchNames: string[];
  commitShas: string[];
  pullRequests: IssuePullRequestRef[];
  createdAt: string;
  updatedAt: string;
}
